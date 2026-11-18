/**
 * #64 POST /api/practice/story — generates one validated practice story. STAGING ONLY, and OFF unless ALL of:
 *   1. an `AI` (Workers AI) binding exists            — owner approval required to add it to wrangler.jsonc;
 *   2. the var `AI_STORIES` is exactly "on";
 *   3. the `ai_usage` D1 table exists (migration 0004) — owner approval required to apply it.
 * Without any of them the endpoint answers 503 {code:'off'} and nothing is sent anywhere.
 *
 * Guards, in order: same-origin (index.ts) → kill switch → per-IP edge rate limit → 10 KB body → strict request
 * schema → per-isolate concurrency cap → per-user and global DAILY quotas (fail closed) → provider call with a hard
 * timeout and client cancellation → strict output validation → at most ONE repair call → safe error codes.
 * Cost: a hard daily NEURON budget (AI_NEURON_DAILY, default 8,000, never above 9,000 — Cloudflare's free allocation is
 * 10,000/day, reset 00:00 UTC). Every model call first RESERVES its worst case (input estimate + max_tokens output) in
 * D1 atomically; the call is refused if the reservation does not fit, then the reservation is settled to the real usage.
 * Privacy: the vocabulary is never stored or logged. D1 holds only (day, salted daily hash of the Access identity or
 * IP, count). Logs carry error codes only.
 */
import {buildRepairPrompt,buildStoryPrompt,parseModelJson,validateStory,STORY_JSON_SCHEMA,STORY_PROMPT_VERSION,validateStoryRequest,type StoryIssue,type StoryRequest} from '../src/story.ts';
import type {D1Database} from './reminders.ts';

type Ai={run:(model:string,input:Record<string,unknown>)=>Promise<unknown>};
type RateLimiter={limit:(args:{key:string;delta?:number})=>Promise<{success:boolean}>};
export type StoryEnv={AI?:Ai;AI_STORIES?:string;AI_STORY_MODEL?:string;AI_USER_DAILY?:string;AI_GLOBAL_DAILY?:string;AI_NEURON_DAILY?:string;PUSH_DB?:D1Database;PUSH_LIMIT?:RateLimiter};
type Msg={role:'system'|'user'|'assistant';content:string};

/* ───────── provider abstraction: Practice never knows which model answered ───────── */
export type Usage={prompt_tokens?:number;completion_tokens?:number;neurons?:number}|null;
export interface StoryProvider{readonly id:string;complete(messages:Msg[],signal:AbortSignal):Promise<{out:unknown;usage:Usage}>}
/** Models this endpoint may use, with Cloudflare's NEURONS per million input / output tokens (pricing page, verified
 *  2026-11-18: gemma-4 9,091 / 27,273; the others are their $ price ÷ $0.011 per 1,000 neurons). */
export const STORY_MODELS:Record<string,{jsonMode:boolean;inM:number;outM:number;noThinking?:boolean}>={
  // Reasoning ON by default would spend the whole output budget on hidden thinking and return empty content
  // (measured 2026-11-18: finish_reason=length, content ''); the schema's chat_template_kwargs.enable_thinking turns it off.
  '@cf/google/gemma-4-26b-a4b-it':{jsonMode:false,inM:9091,outM:27273,noThinking:true},
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast':{jsonMode:true,inM:26637,outM:204819},
  '@cf/mistralai/mistral-small-3.1-24b-instruct':{jsonMode:false,inM:31910,outM:50455},
};
/** Owner-approved for testing (2026-11-18): Gemma 4 26B. Switch with AI_STORY_MODEL, no code change. */
export const DEFAULT_STORY_MODEL='@cf/google/gemma-4-26b-a4b-it';
export const MAX_OUTPUT_TOKENS=1600;
/** The text of a Workers AI answer: `{response}` (classic) or OpenAI-style `{choices:[{message:{content}}]}`. Reasoning is ignored. */
export function modelText(out:unknown):unknown{
  if(!isObj(out))return out;
  if('response' in out&&out.response!=null)return out.response;
  const c=Array.isArray(out.choices)?out.choices[0]:null;
  if(isObj(c)&&isObj(c.message)&&c.message.content!=null)return c.message.content;
  return out;
}
/** The exact model input (shared by the Worker and the eval script, so the eval measures what production would send). */
export function modelInput(model:string,messages:Msg[]):Record<string,unknown>{
  const spec=STORY_MODELS[model];if(!spec)throw Error('model not allowed');
  const input:Record<string,unknown>={messages,max_tokens:MAX_OUTPUT_TOKENS,temperature:0.7};
  if(spec.jsonMode)input.response_format={type:'json_schema',json_schema:STORY_JSON_SCHEMA};
  if(spec.noThinking)input.chat_template_kwargs={enable_thinking:false};
  return input;
}
export function workersAiProvider(ai:Ai,model:string):StoryProvider{
  const spec=STORY_MODELS[model];if(!spec)throw Error('model not allowed');
  return {id:model,async complete(messages,signal){
    const out=await raceAbort(ai.run(model,modelInput(model,messages)),signal);
    return {out:modelText(out),usage:isObj(out)&&isObj(out.usage)?out.usage as Usage:null};
  }};
}

/* ───────── helpers ───────── */
const isObj=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export type StoryErrorCode='off'|'rate'|'request'|'busy'|'quota'|'timeout'|'provider'|'invalid'|'cancelled';
const fail=(code:StoryErrorCode,status:number)=>json({error:code,code},status);
class Abort extends Error{why:'timeout'|'cancelled';constructor(why:'timeout'|'cancelled'){super(why);this.why=why;}}
function raceAbort<T>(p:Promise<T>,signal:AbortSignal):Promise<T>{
  if(signal.aborted)return Promise.reject(new Abort(signal.reason==='timeout'?'timeout':'cancelled'));
  return new Promise((resolve,reject)=>{
    const on=()=>reject(new Abort(signal.reason==='timeout'?'timeout':'cancelled'));
    signal.addEventListener('abort',on,{once:true});
    p.then(v=>{signal.removeEventListener('abort',on);resolve(v);},e=>{signal.removeEventListener('abort',on);reject(e);});
  });
}
async function sha(s:string){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return Array.from(new Uint8Array(d),b=>b.toString(16).padStart(2,'0')).join('');}
const int=(v:string|undefined,dflt:number,max:number)=>{const n=Number(v);return Number.isInteger(n)&&n>=0?Math.min(n,max):dflt;};

/* ───────── quotas: D1 counters only, fail CLOSED ───────── */
export async function takeQuota(db:D1Database,who:string,day:string,userMax:number,globalMax:number):Promise<'ok'|'quota'|'off'>{
  try{
    const key=await sha(`wordloop-ai|${day}|${who}`);
    const g=await db.prepare("SELECT COALESCE(SUM(n),0) AS n FROM ai_usage WHERE day=?1 AND who<>'neurons'").bind(day).first<{n:number}>();
    if((g?.n??0)>=globalMax)return 'quota';
    const u=await db.prepare('SELECT n FROM ai_usage WHERE day=?1 AND who=?2').bind(day,key).first<{n:number}>();
    if((u?.n??0)>=userMax)return 'quota';
    await db.prepare('INSERT INTO ai_usage (day,who,n) VALUES (?1,?2,1) ON CONFLICT(day,who) DO UPDATE SET n=n+1').bind(day,key).run();
    return 'ok';
  }catch{return 'off';} // table missing / D1 error → no generation (never unmetered)
}

/* ───────── neuron budget: reserve the worst case BEFORE each call, settle to the real usage after ───────── */
export const NEURON_CEILING=9000; // below the 10,000/day free allocation even if the var is set higher
export interface NeuronMeter{reserve(messages:Msg[]):Promise<number|'over'|'off'>;settle(reserved:number,usage:Usage):Promise<void>}
/** Conservative input estimate: 1 token per 2 characters (real tokenisers average ~3–4 for EN/ES). */
export const worstCaseNeurons=(messages:Msg[],rate:{inM:number;outM:number})=>
  Math.ceil((Math.ceil(messages.reduce((n,m)=>n+m.content.length,0)/2)+16*messages.length)*rate.inM/1e6+MAX_OUTPUT_TOKENS*rate.outM/1e6);
export const usageNeurons=(u:Usage,rate:{inM:number;outM:number})=>
  u&&Number.isFinite(u.neurons)?Math.ceil(u.neurons!): // Workers AI reports neurons directly
  u&&Number.isFinite(u.prompt_tokens)&&Number.isFinite(u.completion_tokens)?Math.ceil(u.prompt_tokens!*rate.inM/1e6+u.completion_tokens!*rate.outM/1e6):null;
export const RESERVE_SQL="INSERT INTO ai_usage (day,who,n) SELECT ?1,'neurons',?2 WHERE ?2<=?3 ON CONFLICT(day,who) DO UPDATE SET n=n+excluded.n WHERE ai_usage.n+excluded.n<=?3";
export const SETTLE_SQL="UPDATE ai_usage SET n=MAX(0,n-?2+?3) WHERE day=?1 AND who='neurons'";
export function d1Meter(db:D1Database,day:string,budget:number,rate:{inM:number;outM:number}):NeuronMeter{
  return {
    async reserve(messages){
      const w=worstCaseNeurons(messages,rate);
      try{const r=await db.prepare(RESERVE_SQL).bind(day,w,budget).run();return r?.meta?.changes===1?w:'over';}catch{return 'off';}
    },
    async settle(reserved,usage){
      const real=usageNeurons(usage,rate);if(real===null||real>=reserved)return; // unknown usage → keep the worst case
      try{await db.prepare(SETTLE_SQL).bind(day,reserved,real).run();}catch{/* keeping the reservation is the safe side */}
    },
  };
}

let inFlight=0;
export const MAX_IN_FLIGHT=4;
// Measured 2026-11-18 (Gemma 4, 20 cases): median 14.5 s, max 30.1 s for a story that needed its one repair.
export const STORY_TIMEOUT_MS=45000;

/** GET /api/practice/story/status — lets the app say «AI is off» BEFORE the learner presses Start (no request, no consent).
 *  Reports only on/off: no model, quota or account detail. «on» still needs the quota table at generation time. */
export function storyStatus(env:StoryEnv):Response{
  const on=env.AI_STORIES==='on'&&!!env.AI&&!!env.PUSH_DB&&!!env.PUSH_LIMIT&&!!STORY_MODELS[env.AI_STORY_MODEL||DEFAULT_STORY_MODEL];
  return json({ai:on?'on':'off'});
}

export type ReadBody=(request:Request)=>Promise<Record<string,unknown>|null>;
export async function storyEndpoint(request:Request,env:StoryEnv,readBody:ReadBody,provider?:StoryProvider,now=new Date()):Promise<Response>{
  if(request.method!=='POST')return json({error:'method'},405);
  const model=env.AI_STORY_MODEL||DEFAULT_STORY_MODEL;
  if(env.AI_STORIES!=='on'||(!provider&&!env.AI)||!env.PUSH_DB||!STORY_MODELS[model])return fail('off',503);
  if(!env.PUSH_LIMIT)return fail('off',503);
  const ip=request.headers.get('CF-Connecting-IP')||'unknown';
  if(!(await env.PUSH_LIMIT.limit({key:'story:'+ip,delta:10})).success)return fail('rate',429); // ≈6 per minute per IP
  const raw=await readBody(request);
  const parsed=validateStoryRequest(raw);
  if(!parsed.ok)return json({error:'request',code:'request',problem:parsed.problem},400);
  if(inFlight>=MAX_IN_FLIGHT)return fail('busy',503);
  inFlight++;
  try{
    // Behind Cloudflare Access the verified identity header is the best key; the IP is the fallback. Hashed per day.
    const who=request.headers.get('Cf-Access-Authenticated-User-Email')?.toLowerCase()||'ip:'+ip;
    const q=await takeQuota(env.PUSH_DB,who,now.toISOString().slice(0,10),int(env.AI_USER_DAILY,10,100),int(env.AI_GLOBAL_DAILY,200,5000));
    if(q!=='ok')return fail(q,q==='quota'?429:503);
    const meter=d1Meter(env.PUSH_DB,now.toISOString().slice(0,10),int(env.AI_NEURON_DAILY,8000,NEURON_CEILING),STORY_MODELS[model]);
    return await generate(parsed.request,provider??workersAiProvider(env.AI!,model),request.signal,meter);
  }finally{inFlight--;}
}

export async function generate(req:StoryRequest,provider:StoryProvider,clientSignal?:AbortSignal,meter?:NeuronMeter):Promise<Response>{
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort('timeout'),STORY_TIMEOUT_MS);
  const onClient=()=>ctl.abort('cancelled');clientSignal?.addEventListener('abort',onClient,{once:true});
  try{
    const {system,user}=buildStoryPrompt(req);
    const messages:Msg[]=[{role:'system',content:system},{role:'user',content:user}];
    let issues:StoryIssue[]=[];
    for(let attempt=0;attempt<2;attempt++){ // the first answer + at most ONE repair
      // The repair is metered too: if today's budget can't cover it, stop here rather than spend.
      const held=meter?await meter.reserve(messages):0;
      if(held==='over')return fail('quota',429);
      if(held==='off')return fail('off',503);
      const res=await provider.complete(messages,ctl.signal); // if it throws, the reservation is kept (the safe side)
      if(meter)await meter.settle(held,res.usage);
      const out=res.out;
      const v=validateStory(parseModelJson(out),req);
      if(v.ok)return json({story:v.story,used:v.used,missing:v.missing,model:provider.id,promptVersion:STORY_PROMPT_VERSION,repaired:attempt>0});
      issues=v.issues;
      messages.push({role:'assistant',content:typeof out==='string'?out.slice(0,6000):JSON.stringify(out).slice(0,6000)},{role:'user',content:buildRepairPrompt(issues)});
    }
    console.warn('story: rejected after repair',[...new Set(issues.map(i=>i.code))].join(',')); // codes only, never content
    return json({error:'invalid',code:'invalid',issues:[...new Set(issues.map(i=>i.code))]},422);
  }catch(e){
    const why=e instanceof Abort?e.why:ctl.signal.aborted?(ctl.signal.reason==='timeout'?'timeout':'cancelled'):null;
    if(why)return fail(why,why==='timeout'?504:499);
    console.warn('story: provider error'); // no message: it could echo the prompt
    return fail('provider',502);
  }finally{clearTimeout(timer);clientSignal?.removeEventListener('abort',onClient);}
}

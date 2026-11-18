#!/usr/bin/env node
// #64 — 20-case story quality evaluation against REAL Workers AI. Run ONLY with the owner's approval.
//
//   node scripts/eval-stories.mjs --dry-run                       # no network: prints the plan + worst-case neurons
//   CF_ACCOUNT_ID=… CF_API_TOKEN=… node scripts/eval-stories.mjs   # default model: Gemma 4 26B (owner-approved)
//   EVAL_NEURON_BUDGET=3000 (default; hard max 4000) stops the run BEFORE any call whose worst case would not fit.
//
// Least privilege: an ACCOUNT API token limited to this one account with exactly «Workers AI Read» + «Workers AI Edit»
// (Cloudflare's REST docs require both to run a model), a 1-day TTL, optionally an IP filter; revoke it after the run.
// No Workers, D1, DNS, Access or billing permissions. The token is read from the environment, never printed or written.
// Output: docs/eval/STORY_EVAL_<date>.md with every story for HUMAN review (CEFR fit, naturalness), plus the automatic
// PASS/FAIL of the same validator the Worker uses, coverage, latency and token usage per case.
import {writeFileSync,mkdirSync} from 'node:fs';
import {buildRepairPrompt,buildStoryPrompt,parseModelJson,validateStory,STORY_JSON_SCHEMA,STORY_PROMPT_VERSION} from '../src/story.ts';
import {STORY_MODELS,DEFAULT_STORY_MODEL,MAX_OUTPUT_TOKENS,modelText,usageNeurons,worstCaseNeurons} from '../worker/story.ts';
import {CASES} from './story-cases.mjs';

const args=process.argv.slice(2),dry=args.includes('--dry-run'),named=args.filter(a=>!a.startsWith('--'));
const models=named.length?named:[DEFAULT_STORY_MODEL];
for(const m of models)if(!STORY_MODELS[m]){console.error('Not an allowed model: '+m);process.exit(2);}
const budget=Math.min(Number(process.env.EVAL_NEURON_BUDGET)||3000,4000);
const firstCall=c=>{const {system,user}=buildStoryPrompt(c.request);return [{role:'system',content:system},{role:'user',content:user}];};
if(dry){
  for(const m of models){const w=CASES.reduce((n,c)=>n+worstCaseNeurons(firstCall(c),STORY_MODELS[m]),0);
    console.log(`${m}: ${CASES.length} cases · worst case ≈${w} neurons without repairs, ≈${2*w} if every case needed one repair · budget ${budget} · max_tokens ${MAX_OUTPUT_TOKENS}`);}
  console.log('Dry run: nothing was sent.');process.exit(0);
}
const {CF_ACCOUNT_ID:acct,CF_API_TOKEN:token}=process.env;
if(!acct||!token){console.error('Set CF_ACCOUNT_ID and CF_API_TOKEN (owner-approved: Workers AI Read + Edit on this account only).');process.exit(2);}
let spent=0; // real usage when reported, else the call's worst case

async function run(model,messages){
  const worst=worstCaseNeurons(messages,STORY_MODELS[model]);
  if(spent+worst>budget)throw Error(`BUDGET: stopped before a call (spent ≈${spent}, next worst case ${worst}, budget ${budget})`);
  spent+=worst; // reserved until the answer reports real usage
  const input={messages,max_tokens:MAX_OUTPUT_TOKENS,temperature:0.7};
  if(STORY_MODELS[model].jsonMode)input.response_format={type:'json_schema',json_schema:STORY_JSON_SCHEMA};
  const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/${model}`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(input)});
  const j=await r.json().catch(()=>null);
  if(!r.ok||!j?.success)throw Error(`HTTP ${r.status} ${(j?.errors??[]).map(e=>e.message).join('; ').slice(0,200)}`);
  const usage=j.result?.usage??null,real=usageNeurons(usage,STORY_MODELS[model]);
  if(real!==null)spent+=real-worst;
  return {out:modelText(j.result),usage};
}

const rows=[],detail=[];let stopped='';
for(const model of models)for(const c of CASES){
  if(stopped)break;
  const {system,user}=buildStoryPrompt(c.request),messages=[{role:'system',content:system},{role:'user',content:user}];
  const t=Date.now();let v=null,attempts=0,usage=[],error='';
  try{
    for(;attempts<2;){attempts++;const {out,usage:u}=await run(model,messages);usage.push(u);
      v=validateStory(parseModelJson(out),c.request);if(v.ok)break;
      messages.push({role:'assistant',content:typeof out==='string'?out:JSON.stringify(out)},{role:'user',content:buildRepairPrompt(v.issues)});}
  }catch(e){error=String(e.message||e);if(error.startsWith('BUDGET'))stopped=error;}
  const ms=Date.now()-t,ok=!!v?.ok;
  rows.push({model,id:c.id,lang:c.request.contentLanguage,level:c.request.level,genre:c.request.genre,n:c.request.words.length,ok,attempts,ms,
    coverage:ok?`${v.used.length}/${c.request.words.length}`:'-',issues:ok?'':error||[...new Set(v.issues.map(i=>i.code))].join(','),
    tokens:usage.filter(Boolean).map(u=>`${u.prompt_tokens??'?'}→${u.completion_tokens??'?'}`).join(' + ')});
  if(ok)detail.push(`### ${model} · case ${c.id} · ${c.request.contentLanguage} ${c.request.level} ${c.request.genre}\n**${v.story.title}**\n\n${v.story.story}\n\n- used: ${v.used.join(', ')}\n- missing: ${v.missing.join(', ')||'—'}\n${v.story.questions.map(q=>`- Q: ${q.question} → **${q.answer}** («${q.quote}»)`).join('\n')}\n\nHuman review: CEFR fit ☐ natural ☐ coherent ☐ grammar ☐\n`);
  console.log(`${ok?'PASS':'FAIL'} ${model} #${c.id} ${c.request.contentLanguage} ${c.request.level} ${ms}ms ${rows.at(-1).issues}`);
}
const day=new Date().toISOString().slice(0,10),sum=m=>{const r=rows.filter(x=>x.model===m);return `${m}: ${r.filter(x=>x.ok).length}/${r.length} PASS, repaired ${r.filter(x=>x.ok&&x.attempts>1).length}, median ${r.map(x=>x.ms).sort((a,b)=>a-b)[r.length>>1]} ms`;};
mkdirSync('docs/eval',{recursive:true});
writeFileSync(`docs/eval/STORY_EVAL_${day}.md`,`# Story evaluation ${day} (${STORY_PROMPT_VERSION})\n\nNeurons used ≈${spent} (budget ${budget})${stopped?' — '+stopped:''}\n\n${models.map(sum).join('\n\n')}\n\n| model | # | lang | level | genre | words | result | tries | ms | coverage | tokens | issues |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n${rows.map(r=>`| ${r.model} | ${r.id} | ${r.lang} | ${r.level} | ${r.genre} | ${r.n} | ${r.ok?'PASS':'FAIL'} | ${r.attempts} | ${r.ms} | ${r.coverage} | ${r.tokens} | ${r.issues} |`).join('\n')}\n\n## Stories for human review\n\n${detail.join('\n')}`);
console.log('\n'+models.map(sum).join('\n')+`\nNeurons used ≈${spent} of budget ${budget}${stopped?'\n'+stopped:''}`);

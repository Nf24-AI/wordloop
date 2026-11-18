#!/usr/bin/env node
// #64 — 20-case story quality evaluation against REAL Workers AI. Run ONLY with the owner's approval.
//
//   node scripts/eval-stories.mjs --dry-run            # no network: the plan + worst-case neurons
//   node scripts/eval-stories.mjs --confirm            # the real run (Gemma 4 26B by default)
//
// Secrets: CF_API_TOKEN_FILE = a file OUTSIDE this repository that holds only the token (or CF_API_TOKEN). The token is
// never printed, logged or written; CF_ACCOUNT_ID is the account id (not a secret).
// Least privilege: an ACCOUNT API token on this one account with exactly «Workers AI Read» + «Workers AI Edit»
// (Cloudflare's REST docs require both to run a model), a short TTL; revoke it after the run.
// Safety rails (in code, not just in the token):
//   - the only URLs this script can call are  GET  …/accounts/<id>/tokens/verify  (or /user/tokens/verify)
//     and  POST …/accounts/<id>/ai/run/<allow-listed model>  — no Workers, D1, bindings, Gateway or settings endpoints;
//   - the token must be ACTIVE and EXPIRE within 72 h, or nothing is sent;
//   - EVAL_NEURON_BUDGET (default 3000, hard max 4000) stops the run BEFORE any call whose worst case would not fit.
// Output (local files): docs/eval/STORY_EVAL_<date>.md (report + every story for human review) and .json (raw results).
import {writeFileSync,mkdirSync,readFileSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
import {storyCast,buildRepairPrompt,buildStoryPrompt,parseModelJson,validateStory,termsIn,LENGTH_BAND,STORY_JSON_SCHEMA,STORY_PROMPT_VERSION} from '../src/story.ts';
import {STORY_MODELS,DEFAULT_STORY_MODEL,MAX_OUTPUT_TOKENS,modelInput,modelText,usageNeurons,worstCaseNeurons} from '../worker/story.ts';
import {CASES} from './story-cases.mjs';

const args=process.argv.slice(2),dry=args.includes('--dry-run'),named=args.filter(a=>!a.startsWith('--'));
const models=named.length?named:[DEFAULT_STORY_MODEL];
for(const m of models)if(!STORY_MODELS[m]){console.error('Not an allowed model: '+m);process.exit(2);}
const budget=Math.min(Number(process.env.EVAL_NEURON_BUDGET)||3000,4000);
// A fixed seed per case: the eval is reproducible while each case still gets its own cast + setting.
const seedOf=c=>c.id*7919+13;
const firstCall=c=>{const {system,user}=buildStoryPrompt(c.request,seedOf(c));return [{role:'system',content:system},{role:'user',content:user}];};
if(dry||!args.includes('--confirm')){
  for(const m of models){const w=CASES.reduce((n,c)=>n+worstCaseNeurons(firstCall(c),STORY_MODELS[m]),0);
    console.log(`${m}: ${CASES.length} cases · worst case ≈${w} neurons without repairs, ≈${2*w} if every case needed one repair · budget ${budget} · max_tokens ${MAX_OUTPUT_TOKENS}`);}
  console.log(`Dry run: nothing was sent.${dry?'':' (add --confirm for the real run)'}`);process.exit(0);
}

/* ───────── secrets: from a file outside the repo, never echoed ───────── */
const acct=(process.env.CF_ACCOUNT_ID||'').trim();
let token=(process.env.CF_API_TOKEN||'').trim();
if(!token&&process.env.CF_API_TOKEN_FILE){
  const f=resolve(process.env.CF_API_TOKEN_FILE),rel=relative(resolve('.'),f);
  if(!rel.startsWith('..')&&!isAbsolute(rel)){console.error('Refused: the token file must be OUTSIDE the repository.');process.exit(2);}
  try{token=readFileSync(f,'utf8').trim();}catch{console.error('Cannot read CF_API_TOKEN_FILE.');process.exit(2);}
}
if(!/^[0-9a-f]{32}$/.test(acct)||!token){console.error('Set CF_ACCOUNT_ID and CF_API_TOKEN_FILE (owner-approved: Workers AI Read + Edit on this account only).');process.exit(2);}
const redact=s=>String(s).split(token).join('[token]');

/* ───────── the only two kinds of request this script can make ───────── */
const API='https://api.cloudflare.com/client/v4';
function allowed(method,url){
  if(method==='GET'&&(url===`${API}/accounts/${acct}/tokens/verify`||url===`${API}/user/tokens/verify`))return true;
  const m=url.startsWith(`${API}/accounts/${acct}/ai/run/`)?url.slice(`${API}/accounts/${acct}/ai/run/`.length):null;
  return method==='POST'&&m!==null&&!!STORY_MODELS[m];
}
async function call(method,url,body){
  if(!allowed(method,url))throw Error('Refused URL (not on the allow-list)');
  // No AI Gateway headers: plain Workers AI only (a Gateway request could create a gateway / use other billing).
  return fetch(url,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
}

/* ───────── preflight: the token must be active and short-lived ───────── */
async function verify(){
  for(const url of [`${API}/accounts/${acct}/tokens/verify`,`${API}/user/tokens/verify`]){
    const r=await call('GET',url).catch(()=>null);const j=await r?.json().catch(()=>null);
    if(j?.success&&j.result)return j.result;
  }
  return null;
}
const v=await verify();
if(!v||v.status!=='active'){console.error('Token not verified as active — nothing was sent to the model.');process.exit(3);}
const exp=v.expires_on?Date.parse(v.expires_on):NaN;
if(!Number.isFinite(exp)||exp-Date.now()>72*3600e3){console.error(`Refused: the token must expire within 72 hours (its expiry: ${v.expires_on||'none set'}). Nothing was sent to the model.`);process.exit(3);}
console.log(`Token: active, expires ${new Date(exp).toISOString()} (value not shown).`);

let spent=0; // real usage when reported, else the call's worst case
async function run(model,messages){
  const worst=worstCaseNeurons(messages,STORY_MODELS[model]);
  if(spent+worst>budget)throw Error(`BUDGET: stopped before a call (spent ≈${spent}, next worst case ${worst}, budget ${budget})`);
  spent+=worst; // reserved until the answer reports real usage
  const r=await call('POST',`${API}/accounts/${acct}/ai/run/${model}`,modelInput(model,messages));
  const j=await r.json().catch(()=>null);
  if(!r.ok||!j?.success)throw Error(redact(`HTTP ${r.status} ${(j?.errors??[]).map(e=>`${e.code??''} ${e.message??''}`).join('; ').slice(0,240)}`));
  const usage=j.result?.usage??null,real=usageNeurons(usage,STORY_MODELS[model]);
  if(real!==null)spent+=real-worst;
  return {out:modelText(j.result),usage,neurons:real??worst,estimated:real===null,finish:j.result?.choices?.[0]?.finish_reason??null};
}

const words=s=>s.split(/\s+/).filter(Boolean).length;
const results=[];let stopped='';
const PRIORITY=[5,7,10,13,14,15,17,18,20,1,2,12];
const ORDERED=[...CASES].sort((a,b)=>(PRIORITY.indexOf(a.id)+1||99)-(PRIORITY.indexOf(b.id)+1||99));
for(const model of models)for(const c of ORDERED){
  if(stopped)break;
  const messages=firstCall(c);
  const t=Date.now(),calls=[];let val=null,error='',lastOut='',firstIssues=[];
  try{
    for(let attempt=0;attempt<2;attempt++){
      const t0=Date.now(),res=await run(model,messages);
      calls.push({ms:Date.now()-t0,finish:res.finish,usage:res.usage,neurons:res.neurons,estimated:res.estimated});
      lastOut=typeof res.out==='string'?res.out:JSON.stringify(res.out);
      val=validateStory(parseModelJson(res.out),c.request);if(attempt===0&&!val.ok)firstIssues=[...new Set(val.issues.map(i=>i.code))];if(val.ok)break;
      messages.push({role:'assistant',content:lastOut.slice(0,6000)},{role:'user',content:buildRepairPrompt(val.issues)});
    }
  }catch(e){error=redact(e.message||e);if(error.startsWith('BUDGET'))stopped=error;}
  const ok=!!val?.ok,st=ok?val.story:null;
  results.push({model,id:c.id,lang:c.request.contentLanguage,level:c.request.level,genre:c.request.genre,
    requested:c.request.words.map(w=>w.term),used:ok?val.used:[],missing:ok?val.missing:c.request.words.map(w=>w.term),
    ok,firstIssues,attempts:calls.length,ms:Date.now()-t,calls,neurons:calls.reduce((n,x)=>n+x.neurons,0),
    issues:ok?[]:error?[error]:[...new Set(val?.issues?.map(i=>i.code)??[])],
    story:st,storyWords:st?words(st.story):null,band:LENGTH_BAND[c.request.level],
    inBand:st?words(st.story)>=LENGTH_BAND[c.request.level][0]&&words(st.story)<=LENGTH_BAND[c.request.level][1]:null,
    ...storyCast(seedOf(c),c.request.contentLanguage),castUsed:st?storyCast(seedOf(c),c.request.contentLanguage).cast.filter(n=>st.story.includes(n)).length:0,
    questions:st?st.questions.map(q=>({...q,quoteInStory:st.story.includes(q.quote),answerInQuote:q.quote.toLowerCase().includes(q.answer.toLowerCase()),
      answerTermsFromBatch:termsIn(q.quote,c.request.words.map(w=>w.term),c.request.contentLanguage)})):[],
    rejected:ok?null:lastOut.slice(0,1500)});
  const r=results.at(-1);
  console.log(`${ok?'PASS':'FAIL'} #${c.id} ${c.request.contentLanguage} ${c.request.level} ${c.request.genre} · ${r.attempts} call(s) · ${r.ms} ms · ${r.neurons} neurons · ${ok?`${r.used.length}/${r.requested.length} words`:r.issues.join(',')}`);
}

/* ───────── report ───────── */
results.sort((a,b)=>a.id-b.id);
const day=(process.env.EVAL_TAG?process.env.EVAL_TAG+'_':'')+new Date().toISOString().slice(0,10),pass=results.filter(r=>r.ok),med=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[s.length>>1]:0;};
const tok=r=>r.calls.map(x=>x.usage?`${x.usage.prompt_tokens??'?'}→${x.usage.completion_tokens??'?'}`:'n/a').join(' + ');
const head=`# Story evaluation ${day} · ${models.join(', ')} · prompt ${STORY_PROMPT_VERSION}

- Automatic gate: **${pass.length}/${results.length} PASS** (${pass.filter(r=>r.attempts>1).length} after one repair).
- Word coverage in passing stories: ${pass.reduce((n,r)=>n+r.used.length,0)}/${pass.reduce((n,r)=>n+r.requested.length,0)}.
- Latency per case: median ${med(results.map(r=>r.ms))} ms, max ${Math.max(0,...results.map(r=>r.ms))} ms.
- **Neurons used ≈ ${spent}** (budget ${budget}; ${results.some(r=>r.calls.some(x=>x.estimated))?'some calls had no usage report and were counted at their worst case':'all from the usage the model reported'}).${stopped?`\n- ⚠ ${stopped}`:''}
- Length inside the level band: ${pass.filter(r=>r.inBand).length}/${pass.length}. Distinct titles: ${new Set(pass.map(r=>r.story.title.toLowerCase())).size}/${pass.length}. Stories using their assigned cast: ${pass.filter(r=>r.castUsed===2).length}/${pass.length}.
- The token was verified active with an expiry; only Workers AI was called. Nothing in Staging, Production, D1 or bindings was touched.

| # | lang | CEFR | type | result | calls | ms | neurons | tokens (in→out) | words used | missing | length (band) | cast · setting | issues |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
${results.map(r=>`| ${r.id} | ${r.lang} | ${r.level} | ${r.genre} | ${r.ok?'PASS':'FAIL'} | ${r.attempts} | ${r.ms} | ${r.neurons} | ${tok(r)} | ${r.used.length}/${r.requested.length} | ${r.missing.join(', ')||'—'} | ${r.storyWords??'-'} (${r.band.join('–')}) | ${r.cast.join(' & ')} · ${r.setting} | ${r.issues.join(', ')||'—'} |`).join('\n')}
`;
const body=results.map(r=>r.ok?`### #${r.id} · ${r.lang} ${r.level} ${r.genre} — ${r.story.title}

${r.story.story}

- Used: ${r.used.join(', ')} · Missing: ${r.missing.join(', ')||'—'}
${r.questions.map((q,i)=>`- Q${i+1}: ${q.question} → **${q.answer}** — quote «${q.quote}» (${q.quoteInStory?'in story':'NOT in story'}, ${q.answerInQuote?'answer in quote':'answer NOT in quote'})`).join('\n')}
`:`### #${r.id} · ${r.lang} ${r.level} ${r.genre} — FAIL (${r.issues.join(', ')})

\`\`\`
${(r.rejected||'(no output)').replace(/```/g,"'''")}
\`\`\`
`).join('\n');
mkdirSync('docs/eval',{recursive:true});
writeFileSync(`docs/eval/STORY_EVAL_${day}.md`,head+'\n## Stories\n\n'+body);
writeFileSync(`docs/eval/STORY_EVAL_${day}.json`,JSON.stringify({day,models,promptVersion:STORY_PROMPT_VERSION,neurons:spent,budget,stopped,results},null,1));
console.log(`\n${pass.length}/${results.length} PASS · neurons ≈${spent}/${budget} · docs/eval/STORY_EVAL_${day}.md`);

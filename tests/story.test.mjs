// #64 Practice 2.0 — the AI story contract, the staging endpoint (with FAKE providers only), batches and selection.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildStoryPrompt,completeBatch,minCoverage,nextBatch,parseModelJson,planBatches,planFinished,startPlan,termsIn,validateStory,validateStoryRequest,BATCH_SIZE,STORY_MAX_WORDS,STORY_PROMPT_VERSION} from '../src/story.ts';
import {storyEndpoint,generate,takeQuota,STORY_MODELS,DEFAULT_STORY_MODEL,MAX_IN_FLIGHT} from '../worker/story.ts';
import {buildStoryRequest,defaultSelection,eligibleWords,keepEligible,requestStory,selectState,newPlan,recordStory,batchToGenerate} from '../src/practicePlan.ts';
import worker from '../worker/index.ts';
import {EN_STORY,EN_WORDS,ES_STORY,ES_WORDS} from './fixtures/stories.mjs';

const enReq={v:1,contentLanguage:'en-US',meaningLanguage:'ar-SA',level:'A2',genre:'story',words:EN_WORDS};
const esReq={v:1,contentLanguage:'es-ES',meaningLanguage:'ar-SA',level:'A2',genre:'story',words:ES_WORDS};
const clone=v=>JSON.parse(JSON.stringify(v));

/* ───────── request ───────── */
test('STORY-REQ-01: a valid request passes; anything extra or out of range is refused, never trimmed',()=>{
  assert.equal(validateStoryRequest(enReq).ok,true);
  const bad=[
    [{...enReq,deviceId:'x'},'shape'],[{...enReq,v:2},'shape'],[{...enReq,contentLanguage:'fr-FR'},'language'],[{...enReq,contentLanguage:'en US'},'language'],
    [{...enReq,level:'C2'},'level'],[{...enReq,genre:'poem'},'genre'],[{...enReq,words:[]},'noWords'],
    [{...enReq,words:Array.from({length:STORY_MAX_WORDS+1},(_,i)=>({term:'w'+i,meaning:'m'}))},'tooMany'],
    [{...enReq,words:[{term:'bus',meaning:'حافلة',fsrsState:{}}]},'word'],[{...enReq,words:[{term:'<b>',meaning:'x'}]},'word'],
    [{...enReq,words:[{term:'x'.repeat(61),meaning:'m'}]},'word'],[{...enReq,words:[{term:'Bus',meaning:'a'},{term:'bus',meaning:'b'}]},'duplicate'],
    [null,'shape'],['{}','shape'],
  ];
  for(const [r,problem] of bad)assert.deepEqual(validateStoryRequest(r),{ok:false,problem},JSON.stringify(r).slice(0,80));
});

test('STORY-REQ-02: the prompt is versioned and carries only languages, level, length and the term+meaning pairs',()=>{
  const {system,user}=buildStoryPrompt(enReq);
  assert.match(system,new RegExp(STORY_PROMPT_VERSION));
  assert.match(system,/ONE JSON object only/);
  const u=JSON.parse(user);
  assert.deepEqual(Object.keys(u).sort(),['cefrLevel','contentLanguage','lengthInWords','meaningLanguage','questionCount','style','targetWords','task']);
  assert.deepEqual(u.targetWords,EN_WORDS.map(w=>({word:w.term,meaning:w.meaning})));
  assert.equal(u.contentLanguage,'English');assert.equal(u.questionCount,3);
  assert.match(JSON.parse(buildStoryPrompt({...enReq,genre:'conversation'}).user).task,/conversation/);
});

/* ───────── output ───────── */
test('STORY-OUT-01: grounded English and Spanish fixtures pass; coverage is measured on the text, not the claim',()=>{
  const en=validateStory(EN_STORY,enReq);assert.equal(en.ok,true,JSON.stringify(en.issues));
  assert.deepEqual(en.used,['wake up','breakfast','bus','umbrella','late']);assert.deepEqual(en.missing,[]);
  const es=validateStory({...ES_STORY,usedWords:['mercado','manzana','barato','abuela']},esReq);
  assert.equal(es.ok,true,JSON.stringify(es.issues));
  assert.deepEqual(es.missing,['barato'],'«baratas» is not «barato»: the false claim is ignored, the word is reported missing');
  assert.deepEqual(es.story.usedWords,['mercado','manzana','abuela']);
});

test('STORY-OUT-02: malformed, ungrounded, leaking, wrong-language, unsafe or off-length output is rejected',()=>{
  const cases=[
    [null,'shape'],[{...EN_STORY,story:42},'shape'],[{...EN_STORY,questions:'x'},'shape'],
    [{...EN_STORY,questions:EN_STORY.questions.slice(0,2)},'count'],
    [{...EN_STORY,questions:[{...EN_STORY.questions[0],quote:'We eat rice.'},...EN_STORY.questions.slice(1)]},'quoteNotInStory'],
    [{...EN_STORY,questions:[{...EN_STORY.questions[0],answer:'pizza'},...EN_STORY.questions.slice(1)]},'answerNotInQuote'],
    [{...EN_STORY,questions:[{...EN_STORY.questions[0],question:'Do they eat bread with cheese?'},...EN_STORY.questions.slice(1)]},'answerInQuestion'],
    [{...EN_STORY,questions:[EN_STORY.questions[0],EN_STORY.questions[0],EN_STORY.questions[2]]},'duplicateQuestion'],
    [{...EN_STORY,story:EN_STORY.story+' Visit https://example.com today.'},'unsafe'],
    [{...EN_STORY,title:''},'title'],
    [{...EN_STORY,story:'I wake up. I eat breakfast. The bus is late.',questions:[]},'tooShort'],
    [{...EN_STORY,story:(EN_STORY.story+' ').repeat(5)},'tooLong'],
  ];
  for(const [raw,code] of cases){const v=validateStory(raw,enReq);assert.equal(v.ok,false,code);assert.ok(v.issues.some(i=>i.code===code),`${code}: ${JSON.stringify(v.issues)}`);}
  // The Spanish story offered for an English deck.
  const v=validateStory(ES_STORY,{...enReq,words:ES_WORDS});assert.ok(!v.ok&&v.issues.some(i=>i.code==='language'));
  // Fewer than half of the batch really used.
  const low=validateStory(EN_STORY,{...enReq,words:[...EN_WORDS.slice(0,1),{term:'tiger',meaning:'نمر'},{term:'castle',meaning:'قلعة'},{term:'violin',meaning:'كمان'}]});
  assert.ok(!low.ok&&low.issues.some(i=>i.code==='lowCoverage'));
  assert.equal(minCoverage(1),1);assert.equal(minCoverage(5),3);
});

test('STORY-OUT-03: Unicode-aware coverage (NFD accents, multi-word terms, no partial-word hits)',()=>{
  assert.deepEqual(termsIn('La niña come una manzana.'.normalize('NFD'),['niña','manzana','come una','man'],'es'),['niña','manzana','come una']);
  assert.deepEqual(termsIn('I wake up at seven.',['wake','wake up','up at'],'en'),['wake','wake up','up at']);
  assert.deepEqual(termsIn('Busy buses.',['bus'],'en'),[]);
});

test('STORY-OUT-04: model JSON is extracted from a plain or fenced reply; anything else is null',()=>{
  assert.deepEqual(parseModelJson('```json\n{"a":1}\n```'),{a:1});
  assert.deepEqual(parseModelJson('Here: {"a":1}'),{a:1});
  assert.deepEqual(parseModelJson({a:1}),{a:1});
  assert.equal(parseModelJson('no json'),null);assert.equal(parseModelJson('{broken'),null);assert.equal(parseModelJson(7),null);
});

/* ───────── batches (1, 5, 10, 30, 100+) ───────── */
test('STORY-BATCH-01: every selected word lands in exactly one batch, in order, at every size',()=>{
  for(const n of [0,1,5,8,10,30,100,250])for(const level of ['A1','A2','B1','B2','C1']){
    const ids=Array.from({length:n},(_,i)=>'w'+i),b=planBatches([...ids,...ids.slice(0,3)],level);
    assert.deepEqual(b.flatMap(x=>x.ids),ids,`${n} ${level}`);
    assert.ok(b.every(x=>x.ids.length<=BATCH_SIZE[level]&&x.ids.length<=STORY_MAX_WORDS));
    assert.equal(b.length,Math.ceil(n/BATCH_SIZE[level]));
  }
});

test('STORY-BATCH-02: unused words are carried into a later batch once, then reported — never dropped',()=>{
  const ids=Array.from({length:30},(_,i)=>'w'+i);let s=startPlan(ids,'A2'),guard=0;
  while(!planFinished(s)&&guard++<50){const b=nextBatch(s);s=completeBatch(s,b,b.filter(id=>id!=='w3'&&id!=='w17'));}
  assert.equal(planFinished(s),true);
  assert.deepEqual([...s.done].sort(),ids.filter(id=>id!=='w3'&&id!=='w17').sort());
  assert.deepEqual(s.missedTwice.sort(),['w17','w3']);
  assert.equal(s.done.length+s.missedTwice.length,ids.length,'every selected word is accounted for');
  assert.equal(s.batch,6,'30 words at A2 = 5 batches + 1 for the two carried words');
});

/* ───────── selection ───────── */
const W=(id,term,o={})=>({id,deckId:'d',term,meaning:'m'+id,meanings:['m'+id],archived:false,contentType:'vocabulary',dueAt:'2026-01-0'+(o.d??1),createdAt:'2026-01-01',fsrsState:{},...o});
test('STORY-SEL-01: archived, Q&A, other-deck, meaningless and duplicate cards are not selectable; select-all state stays in sync',()=>{
  const words=[W('1','uno'),W('2','dos',{archived:true}),W('3','¿Qué?',{contentType:'question_answer'}),W('4','tres',{deckId:'e'}),W('5','cuatro',{meanings:[],meaning:''}),W('6','Uno'),W('7','cinco')];
  const el=eligibleWords(words,'d');assert.deepEqual(el.map(w=>w.id),['1','7']);
  assert.equal(selectState(new Set(),el),'none');assert.equal(selectState(new Set(['1']),el),'some');assert.equal(selectState(new Set(['1','7','2']),el),'all');
  assert.deepEqual(keepEligible(['7','2','7','x'],el),['7']);
});
test('STORY-SEL-02: the default subset is the level\'s batch size, soonest due first; 100+ words stay fast',()=>{
  const many=Array.from({length:1200},(_,i)=>W('w'+i,'word'+i,{dueAt:new Date(Date.UTC(2026,0,1)+((i*7919)%1200)*3600e3).toISOString()}));
  const t=performance.now(),el=eligibleWords(many,'d'),sel=defaultSelection(el,'A2');
  assert.ok(performance.now()-t<200,'1,200 cards in < 200 ms');
  assert.equal(sel.length,BATCH_SIZE.A2);
  const due=sel.map(id=>many.find(w=>w.id===id).dueAt);assert.deepEqual(due,[...due].sort());
});
test('STORY-SEL-03: the request built from cards has no ids, FSRS, dates, notes or examples',()=>{
  const cards=[W('1','bus',{note:'secret',example:'ex',fsrsState:{s:9}})];
  const r=buildStoryRequest({contentLanguage:'en-US',meaningLanguage:'ar-SA'},cards,'A1','story');
  assert.deepEqual(r,{v:1,contentLanguage:'en-US',meaningLanguage:'ar-SA',level:'A1',genre:'story',words:[{term:'bus',meaning:'m1'}]});
  assert.throws(()=>buildStoryRequest({contentLanguage:'fr-FR',meaningLanguage:'ar-SA'},cards,'A1','story'),/language/);
});
test('STORY-PLAN-01: a plan records which story covered which words, and resumes a pending batch',()=>{
  let p=newPlan('d',['a','b','c','d','e','f','g'],'A1','story');
  assert.deepEqual(batchToGenerate(p),['a','b','c','d','e']);
  p=recordStory(p,'p1',['a','b','c','d','e'],['a','b','d']);
  assert.deepEqual(p.stories,[{passageId:'p1',batch:['a','b','c','d','e'],used:['a','b','d']}]);
  assert.deepEqual(batchToGenerate(p),['f','g','c','e']);
});

/* ───────── the endpoint (FAKE providers; no network, no AI binding) ───────── */
const base='https://wordloop-staging.nf24-wordloop.workers.dev';
const post=(body,headers={})=>new Request(base+'/api/practice/story',{method:'POST',headers:{Origin:base,'Content-Type':'application/json','CF-Connecting-IP':'203.0.113.9',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
function fakeDb({table=true}={}){
  const rows=new Map(),calls=[];
  return {rows,calls,prepare(sql){return {bind(...a){return {
    async first(){calls.push(sql);if(!table)throw Error('no such table: ai_usage');if(sql.includes('SUM'))return {n:[...rows].filter(([k])=>k.startsWith(a[0]+'|')).reduce((n,[,v])=>n+v,0)};return rows.has(a[0]+'|'+a[1])?{n:rows.get(a[0]+'|'+a[1])}:null;},
    async run(){calls.push(sql);if(!table)throw Error('no such table');const k=a[0]+'|'+a[1];rows.set(k,(rows.get(k)??0)+1);return {};}};}};}};
}
const limiter=(ok=true)=>({limit:async()=>({success:ok})});
const provider=(...outs)=>{const p={id:'fake',calls:[],async complete(m){p.calls.push(m.map(x=>x.role));const o=outs[Math.min(p.calls.length-1,outs.length-1)];if(o instanceof Error)throw o;return typeof o==='function'?o():o;}};return p;};
const onEnv=(o={})=>({AI_STORIES:'on',PUSH_DB:fakeDb(),PUSH_LIMIT:limiter(),...o});
const readBody=async r=>{try{return JSON.parse(await r.text());}catch{return null;}};

test('STORY-API-01: OFF by default — no AI binding, no switch, no quota table or an unknown model → 503 off, provider untouched',async()=>{
  const p=provider(JSON.stringify(EN_STORY));
  for(const env of [{},{AI_STORIES:'on'},onEnv({AI_STORIES:'yes'}),onEnv({AI_STORY_MODEL:'@cf/evil/model'})]){
    const r=await storyEndpoint(post(enReq),env,readBody,env.AI_STORIES==='on'&&env.PUSH_DB?undefined:p);
    assert.equal(r.status,503);assert.equal((await r.json()).code,'off');
  }
  // Through the real Worker entry point with the repo's env shape (no AI binding): off.
  const r=await worker.fetch(post(enReq),{PUSH_DB:fakeDb(),PUSH_LIMIT:limiter()});
  assert.equal(r.status,503);assert.equal((await r.json()).code,'off');
  // Missing quota table fails CLOSED.
  const closed=await storyEndpoint(post(enReq),onEnv({PUSH_DB:fakeDb({table:false})}),readBody,p);
  assert.equal(closed.status,503);assert.equal(p.calls.length,0);
  // Cross-origin is refused before anything else.
  assert.equal((await worker.fetch(post(enReq,{Origin:'https://attacker.example'}),onEnv())).status,403);
});

test('STORY-API-02: a valid request returns a validated story; the bad request, rate limit and quotas stop BEFORE the provider',async()=>{
  const p=provider(JSON.stringify(EN_STORY)),env=onEnv();
  const ok=await storyEndpoint(post(enReq),env,readBody,p);
  assert.equal(ok.status,200);const data=await ok.json();
  assert.equal(data.story.title,'A Busy Morning');assert.deepEqual(data.missing,[]);assert.equal(data.promptVersion,STORY_PROMPT_VERSION);assert.equal(data.repaired,false);
  assert.equal(ok.headers.get('cache-control'),'no-store');
  assert.deepEqual(p.calls,[['system','user']]);
  const q=provider(JSON.stringify(EN_STORY));
  assert.equal((await storyEndpoint(post({...enReq,extra:1}),onEnv(),readBody,q)).status,400);
  assert.equal((await storyEndpoint(post('{bad'),onEnv(),readBody,q)).status,400);
  assert.equal((await storyEndpoint(post(enReq),onEnv({PUSH_LIMIT:limiter(false)}),readBody,q)).status,429);
  // Per-user daily quota: 2 allowed, the third refused.
  const env2=onEnv({AI_USER_DAILY:'2'});
  for(let i=0;i<2;i++)assert.equal((await storyEndpoint(post(enReq),env2,readBody,provider(JSON.stringify(EN_STORY)))).status,200);
  const third=await storyEndpoint(post(enReq),env2,readBody,q);assert.equal(third.status,429);assert.equal((await third.json()).code,'quota');
  // Global daily budget.
  const env3=onEnv({AI_GLOBAL_DAILY:'1'});
  assert.equal((await storyEndpoint(post(enReq),env3,readBody,provider(JSON.stringify(EN_STORY)))).status,200);
  assert.equal((await storyEndpoint(post(enReq,{'CF-Connecting-IP':'198.51.100.1'}),env3,readBody,q)).status,429);
  assert.equal(q.calls.length,0,'nothing reached the provider');
});

test('STORY-API-03: D1 holds only a daily salted hash and a count — never words, emails or IPs',async()=>{
  const db=fakeDb();
  await storyEndpoint(post(enReq,{'Cf-Access-Authenticated-User-Email':'Owner@Example.com'}),onEnv({PUSH_DB:db}),readBody,provider(JSON.stringify(EN_STORY)));
  const dump=JSON.stringify([...db.rows])+db.calls.join(' ');
  for(const leak of ['owner@example.com','203.0.113.9','breakfast','umbrella'])assert.ok(!dump.toLowerCase().includes(leak),leak);
  const [[k]]=[...db.rows];assert.match(k,/^\d{4}-\d{2}-\d{2}\|[0-9a-f]{64}$/);
  assert.equal(await takeQuota(fakeDb({table:false}),'x','2026-11-18',10,10),'off');
});

test('STORY-API-04: exactly one bounded repair, then a clear 422 — never a loop; content never logged',async()=>{
  const logs=[];const warn=console.warn,err=console.error;console.warn=console.error=(...a)=>logs.push(a.join(' '));
  try{
    const bad=JSON.stringify({...EN_STORY,questions:EN_STORY.questions.slice(0,2)});
    const fixed=provider(bad,JSON.stringify(EN_STORY));
    const r=await generate(enReq,fixed);assert.equal(r.status,200);assert.equal((await r.json()).repaired,true);
    assert.deepEqual(fixed.calls,[['system','user'],['system','user','assistant','user']]);
    const never=provider(bad,'not json at all');
    const r2=await generate(enReq,never);assert.equal(r2.status,422);
    assert.deepEqual((await r2.json()).issues,['shape']);assert.equal(never.calls.length,2,'one try + one repair, no more');
    const boom=provider(new Error('provider said: '+EN_STORY.story));
    const r3=await generate(enReq,boom);assert.equal(r3.status,502);assert.equal((await r3.json()).code,'provider');
    assert.ok(!logs.join('\n').includes('breakfast')&&!logs.join('\n').includes('umbrella'),'no vocabulary or story text in logs');
  }finally{console.warn=warn;console.error=err;}
});

test('STORY-API-05: client cancellation and the concurrency cap',async()=>{
  const ctl=new AbortController(),slow={id:'slow',complete:(_m,signal)=>new Promise((_r,rej)=>signal.addEventListener('abort',()=>rej(Object.assign(Error('x'),{name:'AbortError'})))) };
  const pending=generate(enReq,slow,ctl.signal);ctl.abort();
  const r=await pending;assert.equal((await r.json()).code,'cancelled');
  // MAX_IN_FLIGHT concurrent requests are served; one more is told «busy» without touching the provider.
  let release;const gate=new Promise(r=>release=r);
  const held={id:'held',calls:0,async complete(){this.calls++;await gate;return JSON.stringify(EN_STORY);}};
  const env=onEnv({AI_USER_DAILY:'100'});
  const running=Array.from({length:MAX_IN_FLIGHT},()=>storyEndpoint(post(enReq),env,readBody,held));
  await new Promise(r=>setTimeout(r,20));
  const busy=await storyEndpoint(post(enReq),env,readBody,held);
  assert.equal(busy.status,503);assert.equal((await busy.json()).code,'busy');
  release();for(const r of await Promise.all(running))assert.equal(r.status,200);
  assert.equal(held.calls,MAX_IN_FLIGHT);
});

test('STORY-API-06: only catalog-verified models are allowed; the default supports JSON mode',()=>{
  assert.equal(STORY_MODELS[DEFAULT_STORY_MODEL].jsonMode,true);
  assert.ok(Object.keys(STORY_MODELS).every(m=>m.startsWith('@cf/')));
  assert.ok(!Object.keys(STORY_MODELS).some(m=>m.includes('qwen3-30b')),'qwen3-30b-a3b is scheduled for deprecation on 2026-11-20');
});

/* ───────── the client call (fake fetch) ───────── */
test('STORY-CLIENT-01: offline, expired sign-in, quota and a tampered reply each give one clear reason; no retries',async()=>{
  const sig=new AbortController().signal;let calls=0;
  const reply=(status,body)=>async()=>{calls++;return new Response(JSON.stringify(body),{status});};
  assert.deepEqual(await requestStory(enReq,sig,'ar',reply(200,{story:EN_STORY})),{ok:true,story:validateStory(EN_STORY,enReq).story,used:EN_WORDS.map(w=>w.term),missing:[]});
  assert.deepEqual(await requestStory(enReq,sig,'ar',reply(429,{code:'quota'})),{ok:false,reason:'quota'});
  assert.deepEqual(await requestStory(enReq,sig,'ar',reply(503,{code:'off'})),{ok:false,reason:'off'});
  assert.deepEqual(await requestStory(enReq,sig,'ar',reply(404,{})),{ok:false,reason:'off'});
  assert.deepEqual(await requestStory(enReq,sig,'ar',reply(200,{story:{...EN_STORY,questions:[]}})),{ok:false,reason:'invalid'},'the client re-validates');
  const {PushNetworkError}=await import('../src/net.ts');
  assert.deepEqual(await requestStory(enReq,sig,'en',async()=>{throw new PushNetworkError('signin','x');}),{ok:false,reason:'signin'});
  assert.deepEqual(await requestStory(enReq,sig,'en',async()=>{throw new TypeError('Load failed');}),{ok:false,reason:'offline'});
  assert.equal(calls,5,'one fetch per request');
});

test('STORY-HL-01: highlighting marks whole target words (longest first), keeps every character',async()=>{
  const {highlightParts}=await import('../src/story.ts');
  const parts=highlightParts('I Wake up early. Busy buses wake me.',['wake','wake up','bus']);
  assert.equal(parts.map(p=>p.text).join(''),'I Wake up early. Busy buses wake me.');
  assert.deepEqual(parts.filter(p=>p.term).map(p=>[p.text,p.term]),[['Wake up','wake up'],['wake','wake']]);
  assert.deepEqual(highlightParts('abc',[]),[{text:'abc'}]);
});

test('STORY-EVAL-01: the 20 evaluation cases cover EN+ES, A1–C1, both genres, and are all valid requests',async()=>{
  const {CASES}=await import('../scripts/story-cases.mjs');
  assert.equal(CASES.length,20);
  for(const c of CASES)assert.equal(validateStoryRequest(c.request).ok,true,`case ${c.id}`);
  assert.deepEqual([...new Set(CASES.map(c=>c.request.level))].sort(),['A1','A2','B1','B2','C1']);
  assert.deepEqual([...new Set(CASES.map(c=>c.request.contentLanguage))].sort(),['en-US','es-ES']);
  assert.deepEqual([...new Set(CASES.map(c=>c.request.genre))].sort(),['conversation','story']);
});

// Issue #24 — AI lesson UI (architecture only). No provider exists: a MOCK generator is registered from this test only.
// The flagged UI needs a build-time flag, so this file starts its own local Vite server with VITE_AI_LESSONS=on
// (127.0.0.1 only; nothing leaves the machine). The default server proves the entry point is hidden without the flag.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {ENGINES,startServer,freshPage} from './harness.mjs';

let server,flagged;
async function startFlagged(){
  const port=4800+Math.floor(Math.random()*150);
  const child=spawn(process.execPath,['node_modules/vite/bin/vite.js','dev','--mode','staging','--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:'ignore',env:{...process.env,VITE_AI_LESSONS:'on'}});
  const base=`http://127.0.0.1:${port}`;
  for(let i=0;i<90;i++){try{if((await fetch(base+'/api/health')).ok)return {base,stop:async()=>{child.kill();}};}catch{/* not up yet */}await new Promise(r=>setTimeout(r,500));}
  child.kill();throw new Error('Flagged server did not start');
}
before(async()=>{server=await startServer();flagged=await startFlagged();});
after(async()=>{await server?.stop();await flagged?.stop();});

async function spanishDeck(page){
  return page.evaluate(async()=>{const m=await import('/src/data.ts');const f=await m.createFolder('الإسبانية');const d=await m.createDeck({folderId:f.id,name:'Spanish A1',contentLanguage:'es-ES'});
    for(const [t,mn] of [['hola','مرحبا'],['casa','بيت'],['amigo','صديق']])await m.addWord({contentType:'vocabulary',term:t,meanings:[mn],example:'',translation:'',tag:'',deckId:d.id});return d.id;});
}
/** Test-only mock: records the request it receives; `window.__mockMode` picks good / invalid / offline output. */
async function registerMock(page){
  await page.evaluate(async()=>{const m=await import('/src/lessons.ts');m.registerLessonGenerator({id:'mock',label:'Mock AI',costNote:'Mock: no cost.',
    generate:async req=>{window.__lessonRequests=(window.__lessonRequests||[]).concat([JSON.parse(JSON.stringify(req))]);
      if(window.__mockMode==='offline')throw new TypeError('Failed to fetch');
      const qs=[{question:'¿Cómo se llama ella?',answer:'Ana',quote:'me llamo Ana'},{question:'¿Dónde vive?',answer:'una casa grande',quote:'Vivo en una casa grande.'},{question:'¿Qué dice primero?',answer:'Hola',quote:'Hola, me llamo Ana.'}];
      if(window.__mockMode==='invalid')qs[1]={...qs[1],answer:'un piso'};
      return {title:'La casa de Ana',text:'Hola, me llamo Ana. Vivo en una casa grande.',translation:'',questions:qs.slice(0,req.questionCount)};}});});
}
const passages=page=>page.evaluate(async()=>{const m=await import('/src/data.ts');return m.listPassages();});
const wordsJson=page=>page.evaluate(async()=>{const m=await import('/src/data.ts');return JSON.stringify(await m.listWords());});

for(const [name,engine] of Object.entries(ENGINES)){
  test(`[${name}] issue #24 AI lesson (mock only)`,async t=>{
    const browser=await engine.launch();
    t.after(()=>browser.close());

    await t.test('AI-E1: without the build flag the entry point is hidden, even with a generator registered',async()=>{
      const {context,page}=await freshPage(browser,server.base);
      const d=await spanishDeck(page);await registerMock(page);
      await page.goto(server.base+'/#/words/d/'+d);await page.waitForSelector('.deck-actions');
      assert.equal(await page.getByRole('button',{name:/أنشئ درسًا/}).count(),0);
      await context.close();
    });

    await t.test('AI-E2: flag on but no generator configured → still hidden',async()=>{
      const {context,page}=await freshPage(browser,flagged.base);
      const d=await spanishDeck(page);
      await page.goto(flagged.base+'/#/words/d/'+d);await page.reload();await page.waitForSelector('.deck-actions');
      assert.equal(await page.getByRole('button',{name:/أنشئ درسًا/}).count(),0);
      await context.close();
    });

    await t.test('AI-E3: setup → exact preview + explicit consent → validated lesson → edit → saved as a text; FSRS untouched',async()=>{
      const {context,page,errors}=await freshPage(browser,flagged.base);
      const d=await spanishDeck(page);await registerMock(page);
      const before=await wordsJson(page);
      await page.goto(flagged.base+'/#/words/d/'+d);await page.waitForSelector('.deck-actions');
      await page.getByRole('button',{name:/أنشئ درسًا/}).click();
      await page.waitForFunction(()=>location.hash.endsWith('/lesson'));
      await page.getByRole('group',{name:'كم سؤال؟'}).getByRole('button',{name:'3'}).click();
      await page.getByRole('checkbox',{name:/amigo/}).uncheck();
      await page.getByRole('button',{name:'راجع اللي بيتم إرساله'}).click();
      const payload=await page.locator('.lesson-payload').textContent();
      assert.match(payload,/hola/);assert.match(payload,/casa/);assert.doesNotMatch(payload,/amigo/);
      const go=page.getByRole('button',{name:'أنشئ الدرس'});
      assert.equal(await go.isDisabled(),true,'no consent → nothing can be sent');
      await page.getByRole('checkbox',{name:/أوافق/}).check();
      await go.click();
      await page.locator('#lesson-title').waitFor();
      const reqs=await page.evaluate(()=>window.__lessonRequests);
      assert.equal(reqs.length,1);
      assert.deepEqual(reqs[0],{contentLanguage:'es-ES',meaningLanguage:'ar-SA',level:'A1',mode:'both',questionCount:3,vocabulary:[{term:'hola',meanings:['مرحبا']},{term:'casa',meanings:['بيت']}]},'the mock received exactly the previewed payload');
      await page.fill('#lesson-title','Ana en casa');
      await page.getByRole('button',{name:'احفظه كنص'}).click();
      await page.waitForFunction(()=>/\/texts\/[^/]+$/.test(location.hash));
      const ps=await passages(page);
      assert.equal(ps.length,1);assert.equal(ps[0].title,'Ana en casa');assert.equal(ps[0].questions.length,3);assert.equal(ps[0].deckId,d);
      assert.equal(await wordsJson(page),before,'no card added or rescheduled');
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('AI-E4: invalid output and a failed call are refused clearly; rejecting writes nothing',async()=>{
      const {context,page}=await freshPage(browser,flagged.base);
      const d=await spanishDeck(page);await registerMock(page);
      const consent=async()=>{
        // A hash change, not page.goto: WebKit reloads on a goto to the same URL, which would drop the test-only mock.
        await page.evaluate(h=>{location.hash=h;},'#/words/d/'+d+'/lesson');await page.waitForSelector('.lesson-page');
        await page.getByRole('group',{name:'كم سؤال؟'}).getByRole('button',{name:'3'}).click();
        await page.getByRole('button',{name:'راجع اللي بيتم إرساله'}).click();
        await page.getByRole('checkbox',{name:/أوافق/}).check();await page.getByRole('button',{name:'أنشئ الدرس'}).click();
      };
      await page.evaluate(()=>{window.__mockMode='invalid';});await consent();
      await page.locator('.lesson-page .inline-error[role=alert]').waitFor();
      assert.equal((await passages(page)).length,0);
      await page.evaluate(()=>{window.__mockMode='offline';});await consent();
      await page.locator('.lesson-page .inline-error[role=alert]',{hasText:'إنترنت'}).waitFor();
      assert.equal((await passages(page)).length,0);
      await page.evaluate(()=>{window.__mockMode='good';});await consent();
      await page.locator('#lesson-title').waitFor();
      await page.getByRole('button',{name:'ارفضه'}).click();
      await page.waitForFunction(id=>location.hash==='#/words/d/'+id,d);
      assert.equal((await passages(page)).length,0,'reject = no database change');
      await context.close();
    });
  });
}

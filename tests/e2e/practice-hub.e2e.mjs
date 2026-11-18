// Issues #61 + #64 — Practice 2.0 end to end: Practice → deck → words (select all / none) → Start → consent → AI story
// → Reading / Listening → result → next story. The story endpoint is MOCKED with page.route (hand-written fixtures);
// no AI provider is contacted. Chromium + WebKit at iPhone width; AR + EN; FSRS untouched; stories survive backup.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {ENGINES,startServer,freshPage} from './harness.mjs';
import {EN_STORY,EN_STORY_2,EN_WORDS} from '../fixtures/stories.mjs';

let server;
before(async()=>{server=await startServer();});
after(async()=>{await server?.stop();});

const data=(page,fn,arg)=>page.evaluate(async([src,arg])=>{const m=await import('/src/data.ts');return new Function('m','arg',`return (${src})(m,arg)`)(m,arg);},[fn.toString(),arg]);
const fsrsSnapshot=page=>data(page,async m=>JSON.stringify([(await m.listWords()).map(w=>[w.id,w.dueAt,w.fsrsState,w.revision]),await m.listReviews()]));
const hashOf=page=>page.evaluate(()=>location.hash);
const EXTRA=[{term:'tiger',meaning:'نمر'},{term:'castle',meaning:'قلعة'},{term:'violin',meaning:'كمان'}];

async function seed(page,{words=[...EN_WORDS,...EXTRA],lang='en-US',passage=false,archived=[],folder='Languages'}={}){
  return data(page,async(m,{words,lang,passage,archived,folder})=>{
    const f=await m.createFolder(folder),d=await m.createDeck({folderId:f.id,name:'English',contentLanguage:lang,meaningLanguage:'ar-SA'});
    for(const w of words){const c=await m.addWord({term:w.term,meanings:[w.meaning],example:'',translation:'',tag:'',contentType:'vocabulary',deckId:d.id});
      if(archived.includes(w.term))await m.archiveWord(c.id);}
    let p=null;
    if(passage)p=await m.createPassage({deckId:d.id,title:'Lucía',body:'Lucía vive en Madrid. Estudia español todos los días.',questions:[{question:'Where does Lucía live?',answer:'Madrid',quote:'Lucía vive en Madrid.'}]});
    return {deck:d.id,passage:p?.id??null};
  },{words,lang,passage,archived,folder});
}
/** Mocks the story endpoint; records every request body. `reply` may be a function of the parsed body. */
async function mockStory(page,reply=b=>({status:200,body:{story:b.words.some(w=>w.term==='wake up')?EN_STORY:EN_STORY_2}})){
  const calls=[];
  await page.route('**/api/practice/story/status',route=>route.fulfill({status:200,contentType:'application/json',body:'{"ai":"on"}'}));
  await page.route('**/api/practice/story',async route=>{
    const body=JSON.parse(route.request().postData()||'null');calls.push(body);
    const r=await reply(body);
    if(r==='hang')return; // never answers (cancel test)
    await route.fulfill({status:r.status,contentType:'application/json',body:JSON.stringify(r.body)});
  });
  return calls;
}
function fakeSpeech(){
  const voices=[{name:'Samantha',lang:'en-US',localService:true,default:true,voiceURI:'s'}];
  const log=[];let cur=null;
  const synth={paused:false,getVoices:()=>voices,addEventListener(){},removeEventListener(){},
    speak(u){cur=u;log.push(u.text);setTimeout(()=>{if(cur===u){cur=null;u.onend?.();}},30);},
    cancel(){const u=cur;cur=null;u?.onerror?.({error:'interrupted'});},pause(){},resume(){}};
  Object.defineProperty(window,'speechSynthesis',{value:synth,configurable:true});window.SpeechSynthesisUtterance=class{constructor(t){this.text=t;}};window.__spoken=log;
}
async function answerAll(page,{type}={}){
  let n=0;
  while(await page.locator('.practice-q').count()){
    const q=page.locator('.practice-q');
    if(await q.locator('.practice-options').count())await q.locator('.practice-option').first().click();
    else if(await q.locator('#practice-input').count()){
      if(type){await page.fill('#practice-input',type(n));await q.getByRole('button',{name:'تحقق'}).click();}
      else await q.getByRole('button',{name:'اعرض الإجابة'}).click();
    }
    else{await q.getByRole('button',{name:'اعرض المعنى'}).click();await q.getByRole('button',{name:'عرفتها'}).click();}
    n++;await page.locator('.practice-next').click();
    assert.ok(n<60,'the session ends');
  }
  return n;
}
// Reload first (re-reads the seeded IndexedDB), THEN open Practice: no status request is cut off by a reload.
async function openPractice(page,base){await page.reload();await page.waitForSelector('main h1');await page.goto(base+'/#/words/practice');await page.locator('.practice-hub').waitFor();}

for(const [name,engine] of Object.entries(ENGINES)){
  test(`[${name}] issues #61 #64 practice 2.0`,async t=>{
    const browser=await engine.launch();
    t.after(()=>browser.close());
    const base=()=>server.base;

    await t.test('P2-01: a deck with no active words → honest empty state with «add words»; archived cards never count',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      const {deck}=await seed(page,{words:[{term:'gone',meaning:'راح'}],archived:['gone']});
      await page.reload();await page.waitForSelector('main h1');await page.goto(base()+`/#/words/practice/${encodeURIComponent(deck)}`);await page.locator('.practice-hub').waitFor();
      assert.match(await page.locator('.practice-hub .empty').innerText(),/ما فيها كلمات للتمرين/);
      await page.locator('.practice-hub .empty').getByRole('button',{name:'أضف كلمات'}).click();
      assert.equal(await hashOf(page),`#/add/${encodeURIComponent(deck)}`);
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('P2-02: + → Practice → Start → consent → story → Reading → result → next story; only term+meaning sent; FSRS untouched',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      const {deck}=await seed(page);
      const calls=await mockStory(page);
      await page.reload();await page.waitForSelector('main h1');
      const before=await fsrsSnapshot(page);
      await page.click('.tab-add');await page.locator('[data-action=practice]').click();
      await page.locator('.story-start').waitFor();
      assert.equal(await hashOf(page),'#/words/practice');
      assert.match(await page.locator('.word-summary').innerText(),/6 من 8 كلمة مختارة/,'default subset = A2 batch');
      const go=page.locator('.story-go');
      assert.ok((await go.boundingBox()).height>=44);
      await go.click();
      // Consent: nothing has been sent yet; the screen lists exactly the words that will be.
      await page.locator('.story-consent').waitFor();
      assert.equal(calls.length,0,'nothing leaves the device before consent');
      assert.equal(await page.locator('.consent-words li').count(),6);
      await page.getByRole('button',{name:'موافق، اكتب القصة'}).click();
      await page.locator('.story-view').waitFor();
      assert.equal(calls.length,1);
      const req=calls[0];
      assert.deepEqual(Object.keys(req).sort(),['contentLanguage','genre','level','meaningLanguage','v','words']);
      assert.equal(req.level,'A2');assert.equal(req.words.length,6);
      assert.ok(req.words.every(w=>Object.keys(w).sort().join()==='meaning,term'),'term + meaning only');
      // The story: highlighted words, tap → saved meaning, translation, coverage.
      assert.match(await hashOf(page),new RegExp(`^#/words/practice/${encodeURIComponent(deck)}/s/`));
      assert.equal(await page.locator('main h1').innerText(),'A Busy Morning');
      assert.match(await page.locator('.page-head .lead').innerText(),/القصة 1 من 2/);
      await page.locator('.story-word',{hasText:'breakfast'}).click();
      assert.match(await page.locator('.word-pop').innerText(),/فطور/);
      await page.getByRole('button',{name:'اعرض الترجمة'}).click();
      assert.match(await page.locator('.passage-translation').innerText(),/أستيقظ/);
      assert.ok(await page.locator('.story-coverage .word-pill').count()>=3);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      // Reading practice on the generated story.
      await page.locator('.story-actions').getByRole('button',{name:'تمرين قراءة'}).click();
      await page.locator('.practice-field').nth(1).getByRole('button',{name:'الكل'}).click();
      await page.locator('.practice-start').click();
      let n=0;
      while(await page.locator('.practice-q').count()){
        const q=page.locator('.practice-q');
        if(await q.locator('.practice-options').count())await q.locator('.practice-option').first().click();
        else if(await q.locator('#practice-input').count())await q.getByRole('button',{name:'اعرض الإجابة'}).click();
        else{await q.getByRole('button',{name:'اعرض المعنى'}).click();await q.getByRole('button',{name:'عرفتها'}).click();}
        n++;await page.locator('.practice-next').click();
        assert.ok(n<40,'the session ends');
      }
      assert.ok(n>=3,'cloze/meaning from the story + 3 grounded questions');
      await page.locator('.finish').waitFor();
      assert.equal(await page.locator('.result-counts > div').count(),3);
      assert.match(await page.locator('.finish').innerText(),/تمرّنت على \d+ كلمة/);
      await page.locator('.finish').getByRole('button',{name:'القصة التالية'}).click();
      await page.waitForFunction(()=>/\/s\//.test(location.hash),null,{timeout:15000});
      assert.equal(calls.length,2);
      assert.ok(calls[1].words.length>=1&&calls[1].words.length<=6,'only the word(s) the first story missed');
      assert.ok(calls[1].words.every(w=>!calls[0].words.some(x=>x.term===w.term)||!EN_STORY.story.includes(w.term)),'used words are not sent again');
      assert.equal(await fsrsSnapshot(page),before,'cards, due dates, FSRS state and reviews unchanged');
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('P2-03: select all / deselect all with 120 words; counter, batches, persistence across reload and Reading ↔ Listening',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      const words=Array.from({length:120},(_,i)=>({term:'word'+i,meaning:'معنى '+i}));
      const {deck}=await seed(page,{words:[...words,{term:'old',meaning:'قديم'}],archived:['old']});
      await mockStory(page,()=>'hang');
      await page.goto(base()+`/#/words/practice/${encodeURIComponent(deck)}/words`);await page.reload();
      await page.locator('.pick-list').waitFor();
      assert.equal(await page.locator('.pick-row').count(),120,'archived card excluded');
      assert.match(await page.locator('.pick-count').innerText(),/6 من 120/);
      await page.getByRole('button',{name:'تحديد الكل',exact:true}).click();
      assert.match(await page.locator('.pick-count').innerText(),/120 من 120[\s\S]*120 كلمة ← 20 قصص/);
      assert.equal(await page.getByRole('button',{name:'تحديد الكل',exact:true}).isDisabled(),true);
      await page.getByRole('button',{name:'إلغاء تحديد الكل'}).click();
      assert.match(await page.locator('.pick-count').innerText(),/0 من 120/);
      await page.getByRole('button',{name:'تحديد الكل',exact:true}).click();
      await page.locator('.pick-row').nth(3).click(); // partial state
      assert.match(await page.locator('.pick-count').innerText(),/119 من 120/);
      assert.equal(await page.getByRole('button',{name:'تحديد الكل',exact:true}).isDisabled(),false);
      await page.reload();await page.locator('.pick-list').waitFor();
      assert.match(await page.locator('.pick-count').innerText(),/119 من 120/,'selection survives a reload');
      const done=page.getByRole('button',{name:'تم',exact:true});
      // Regression (WebKit): the Done bar must be pinned on screen, not after the last of 120 words.
      const box=await done.boundingBox();assert.ok(box&&box.y+box.height<=844,'Done is visible without scrolling: '+JSON.stringify(box));
      const hit=await done.evaluate(b=>{const r=b.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,t=document.elementFromPoint(x,y);return {top:t===b||b.contains(t),tag:t?.className??'',y,vh:innerHeight};});
      await done.click();
      try{await page.locator('.story-start').waitFor({timeout:10000});}
      catch(e){console.log('P2-03 DIAG',JSON.stringify({hit,hash:await hashOf(page),main:(await page.locator('main').innerText()).slice(0,300)}));throw e;}
      assert.match(await page.locator('.word-summary').innerText(),/119 من 120/);
      assert.match(await page.locator('.story-start').innerText(),/20 قصص/);
      await page.locator('.story-go').click();
      const plan=await page.evaluate(()=>JSON.parse(localStorage.getItem('wordloop-practice-plan')));
      assert.equal(plan.state.queue.length,119,'the whole selection is queued — nothing dropped');
      assert.equal(new Set(plan.state.queue).size,119);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('P2-04: declining consent sends nothing; offline, quota, invalid and cancel each show one clear state',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      const {deck}=await seed(page);
      let mode='quota';
      const calls=await mockStory(page,()=>mode==='quota'?{status:429,body:{code:'quota'}}:mode==='invalid'?{status:200,body:{story:{...EN_STORY,questions:[]}}}:mode==='off'?{status:503,body:{code:'off'}}:'hang');
      await openPractice(page,base());
      await page.locator('.story-go').click();
      await page.getByRole('button',{name:'لا، شكرًا'}).click();
      await page.locator('.story-start').waitFor();
      assert.equal(calls.length,0,'declined → nothing sent');
      await page.locator('.story-go').click();
      await page.getByRole('button',{name:'موافق، اكتب القصة'}).click();
      await page.locator('.story-failed').waitFor();
      assert.match(await page.locator('.story-failed').innerText(),/وصلت حد القصص لليوم/);
      assert.equal(await page.locator('.story-failed').getByRole('button',{name:'جرّب مرة ثانية'}).count(),0,'no retry on quota');
      // Consent is remembered; the tampered reply is rejected by the client validator too.
      mode='invalid';await page.locator('.story-failed').getByRole('button',{name:'تمرّن على نصوصك'}).click();
      await page.locator('.story-go').click();
      await page.locator('.story-failed').waitFor();
      assert.match(await page.locator('.story-failed').innerText(),/ما نجحت في فحص الجودة/);
      assert.equal(await data(page,async m=>(await m.listPassages()).length),0,'nothing invalid is saved');
      mode='off';await page.locator('.story-failed').getByRole('button',{name:'جرّب مرة ثانية'}).click();
      await page.locator('.story-off').waitFor();
      assert.match(await page.locator('.story-off').innerText(),/ما تفعّلت للحين[\s\S]*قصة تجريبية محلية/);
      assert.equal(await page.locator('[role=alert]').count(),0,'«AI off» is information, not an error');
      assert.equal(await page.locator('.story-off').getByRole('button',{name:'جرّب بقصة تجريبية'}).count(),1);
      mode='hang';await page.locator('.story-off').getByRole('button',{name:'تمرّن على نصوصك'}).click();
      await page.locator('.story-go').click();
      await page.locator('.story-working').waitFor();
      await page.getByRole('button',{name:'إلغاء'}).click();
      assert.match(await page.locator('.story-failed').innerText(),/ألغيت/);
      await context.setOffline(true);
      await page.locator('.story-failed').getByRole('button',{name:'جرّب مرة ثانية'}).click();
      await page.waitForFunction(()=>/غير متصل/.test(document.querySelector('.story-failed')?.textContent??''));
      await context.setOffline(false);
      assert.equal(await data(page,async m=>(await m.listPassages()).length),0);
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('P2-05: English UI is LTR; a Spanish deck with a saved text still practises it; French deck explains «not yet»',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      const {deck}=await seed(page,{lang:'es-ES',words:[{term:'Madrid',meaning:'مدريد'},{term:'español',meaning:'الإسبانية'}],passage:true});
      await page.evaluate(()=>localStorage.setItem('wordloop-locale','en'));
      await page.goto(base()+`/#/words/d/${encodeURIComponent(deck)}`);await page.reload();
      await page.locator('.practice-row').click();
      await page.locator('.story-start').waitFor();
      assert.equal(await hashOf(page),`#/words/practice/${encodeURIComponent(deck)}`);
      assert.match(await page.locator('.practice-hub').innerText(),/Start practice[\s\S]*Your texts[\s\S]*Reading practice[\s\S]*Listening practice/);
      assert.equal(await page.locator('.hub-text small').getAttribute('lang'),'es-ES');
      assert.equal(await page.evaluate(()=>document.documentElement.dir),'ltr');
      await page.setViewportSize({width:320,height:700});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      const fr=await seed(page,{folder:'French',lang:'fr-FR',words:[{term:'bonjour',meaning:'مرحبا'}]});
      await page.goto(base()+`/#/words/practice/${encodeURIComponent(fr.deck)}`);
      await page.locator('.story-soon').waitFor();
      assert.match(await page.locator('.story-soon').innerText(),/English and Spanish/);
      assert.equal(await page.locator('.story-go').count(),0);
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('P2-07: AI OFF on the real Worker → calm notice + Demo Mode: all 14 words, 3 demo stories, Reading, Listening, results — nothing sent, FSRS untouched',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      await context.addInitScript(fakeSpeech);
      const words=[...EN_WORDS,...EXTRA,...['window','garden','river','pencil','chair','mountain'].map((term,i)=>({term,meaning:'معنى '+i}))];
      const {deck}=await seed(page,{words});
      const sent=[];page.on('request',r=>{if(r.url().includes('/api/practice/story')&&r.method()==='POST')sent.push(r.url());});
      await openPractice(page,base());
      const before=await fsrsSnapshot(page);
      // The real local Worker has no AI binding → the status says «off» before Start: a note, not an error.
      await page.locator('.story-off-note').waitFor();
      assert.match(await page.locator('.story-off-note').innerText(),/ما تفعّلت للحين/);
      assert.equal(await page.locator('[role=alert]').count(),0);
      // Select every word of the deck.
      await page.locator('.word-summary').click();await page.locator('.pick-list').waitFor();
      await page.getByRole('button',{name:'تحديد الكل',exact:true}).click();
      assert.match(await page.locator('.pick-count').innerText(),/14 من 14[\s\S]*14 كلمة ← 3 قصص/);
      await page.getByRole('button',{name:'تم',exact:true}).click();
      await page.locator('.story-start').waitFor();
      assert.match(await page.locator('.word-summary').innerText(),/14 من 14/);
      await page.getByRole('button',{name:'ابدأ بقصة تجريبية'}).click();
      // No consent screen (nothing is sent) → the demo story, clearly labelled.
      await page.locator('.story-view').waitFor();
      assert.match(await page.locator('main h1').innerText(),/^قصة تجريبية: /);
      assert.match(await page.locator('.story-demo-banner').innerText(),/مو من الذكاء الاصطناعي/);
      assert.match(await page.locator('.page-head .lead').innerText(),/القصة 1 من 3/);
      assert.equal(await page.locator('.story-coverage .word-pill').count(),6,'the whole first batch is in the text');
      await page.locator('.story-word',{hasText:'breakfast'}).click();
      assert.match(await page.locator('.word-pop').innerText(),/فطور/);
      // Reading: every question.
      await page.locator('.story-actions').getByRole('button',{name:'تمرين قراءة'}).click();
      await page.locator('.practice-field').nth(1).getByRole('button',{name:'الكل'}).click();
      await page.locator('.practice-start').click();
      const nRead=await answerAll(page);
      assert.equal(nRead,6+6+3,'6 cloze + 6 meaning + 3 comprehension');
      await page.locator('.finish').waitFor();
      const counts=await page.locator('.result-counts dd').allInnerTexts();
      assert.equal(counts.map(Number).reduce((a,b)=>a+b),nRead,'right + wrong + almost = questions');
      assert.match(await page.locator('.finish').innerText(),/تمرّنت على 6 كلمة/);
      // Listening on the same story: dictation (typed exactly → correct) + comprehension.
      await page.locator('.finish').getByRole('button',{name:'تمرين استماع'}).click();
      await page.locator('.listen-player').first().waitFor();
      await page.locator('.practice-field').nth(1).getByRole('button',{name:'الكل'}).click();
      await page.locator('.practice-start').click();
      const sentences=await page.evaluate(async()=>{const m=await import('/src/data.ts');const [p]=await m.listPassages();const pr=await import('/src/practice.ts');return pr.sentences(p.body);});
      const nListen=await answerAll(page,{type:i=>sentences[i]??'x'});
      assert.ok(nListen>=sentences.length,'every sentence dictated, then comprehension');
      await page.locator('.finish').waitFor();
      assert.ok(Number((await page.locator('.result-counts .ok dd').innerText()))>=sentences.length,'exact dictation is marked right');
      // Next story → demo story 2 of 3, still no network.
      await page.locator('.finish').getByRole('button',{name:'القصة التالية'}).click();
      await page.waitForFunction(()=>/القصة 2 من 3/.test(document.querySelector('.page-head .lead')?.textContent??''));
      assert.ok(await page.locator('.story-demo-banner').isVisible());
      assert.deepEqual(sent,[],'Demo Mode never calls the story endpoint');
      assert.equal(await data(page,async m=>(await m.listPassages()).filter(p=>p.title.startsWith('قصة تجريبية: ')).length),2);
      assert.equal(await fsrsSnapshot(page),before,'cards, due dates, FSRS state and reviews unchanged');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.deepEqual(errors,[]);await context.close();
    });
    await t.test('P2-06: a generated story is a local passage: it survives backup → delete → restore',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      await seed(page);
      await mockStory(page);
      await page.evaluate(()=>localStorage.setItem('wordloop-ai-consent','"v1"'));
      await openPractice(page,base());
      await page.locator('.story-go').click();
      await page.locator('.story-view').waitFor();
      const out=await data(page,async m=>{
        const backup=JSON.parse(JSON.stringify(await m.buildBackup()));const [p]=await m.listPassages();
        await m.deletePassage(p.id);const gone=(await m.listPassages()).length;
        await m.restoreBackup(backup);
        return {gone,passages:(await m.listPassages()).map(p=>[p.title,p.questions.length,p.contentLanguage,p.questions.every(q=>p.body.includes(q.quote))])};
      });
      assert.equal(out.gone,0);
      assert.deepEqual(out.passages,[['A Busy Morning',3,'en-US',true]]);
      assert.deepEqual(errors,[]);await context.close();
    });
  });
}

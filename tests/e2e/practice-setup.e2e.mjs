// Practice 2.0 — PR-1 foundation: the landing (three skills, nothing starts on its own), the shared setup (learning
// language · automatic / whole library / hand-picked words · level) across decks, and Listening's saved-content list.
// Chromium + WebKit; phone 390 and desktop 1280; Arabic RTL and English LTR. AI status is mocked OFF: nothing is sent.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {ENGINES,startServer,freshPage} from './harness.mjs';

let server;
before(async()=>{server=await startServer();});
after(async()=>{await server?.stop();});

const DESKTOP={viewport:{width:1280,height:800},isMobile:false,hasTouch:false,deviceScaleFactor:1};
const data=(page,fn,arg)=>page.evaluate(async([src,arg])=>{const m=await import('/src/data.ts');return new Function('m','arg',`return (${src})(m,arg)`)(m,arg);},[fn.toString(),arg]);
const fsrsSnapshot=page=>data(page,async m=>JSON.stringify([(await m.listWords()).map(w=>[w.id,w.dueAt,w.fsrsState,w.revision]),await m.listReviews()]));
const hashOf=page=>page.evaluate(()=>location.hash);
const noHScroll=page=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);

/** Two English decks in TWO different folders (5 + 6 words), a Spanish deck in a third folder (3 words) and an archived English word. */
async function seed(page,{passage=false}={}){
  return data(page,async(m,{passage})=>{
    const mk=async(name,lang,terms)=>{const f=await m.createFolder('Folder '+name);const d=await m.createDeck({folderId:f.id,name,contentLanguage:lang,meaningLanguage:'ar-SA'});
      for(const t of terms)await m.addWord({term:t,meanings:['معنى '+t],example:'',translation:'',tag:'',contentType:'vocabulary',deckId:d.id});return d.id;};
    const a=await mk('Travel','en-US',['ticket','station','map','luggage','passport']);
    const b=await mk('Work','en-US',['meeting','deadline','report','office','manager','salary']); // a term is unique across the library (addWord refuses a repeat)
    const es=await mk('Español','es-ES',['gato','perro','casa']);
    const old=await m.addWord({term:'archived',meanings:['قديم'],example:'',translation:'',tag:'',contentType:'vocabulary',deckId:b});await m.archiveWord(old.id);
    let p=null;if(passage)p=await m.createPassage({deckId:a,title:'At the station',body:'I bought a ticket at the station. My map was in my luggage.',questions:[]});
    return {a,b,es,passage:p?.id??null};
  },{passage});
}
async function aiOff(page){
  const calls=[];
  await page.route('**/api/practice/story/status',r=>r.fulfill({status:200,contentType:'application/json',body:'{"ai":"off"}'}));
  await page.route('**/api/practice/story',r=>{calls.push(r.request().postData());return r.fulfill({status:503,contentType:'application/json',body:'{"error":"off"}'});});
  return calls;
}
async function setLocale(page,l){await page.evaluate(x=>localStorage.setItem('wordloop-locale',x),l);}

for(const [name,engine] of Object.entries(ENGINES)){
  test(`[${name}] Practice 2.0 foundation`,async t=>{
    const browser=await engine.launch();
    t.after(()=>browser.close());
    const base=()=>server.base;

    await t.test('PS-01 landing: centred intro + Reading · Listening · Writing; choosing opens a setup, nothing starts — AR and EN, phone and desktop',async()=>{
      for(const [locale,opts,title,skills,soon] of [
        ['ar',undefined,'جاهز تمارس اللي تعلّمته؟',['القراءة','الاستماع','الكتابة'],'قريبًا'],
        ['en',DESKTOP,'Ready to practise what you’ve learned?',['Reading','Listening','Writing'],'Coming soon']]){
        const {context,page,errors}=await freshPage(browser,base(),opts);
        const calls=await aiOff(page);await seed(page);
        if(locale==='en')await setLocale(page,'en');
        await page.goto(base()+'/#/words/practice');await page.reload();await page.locator('.practice-landing').waitFor();
        assert.equal(await page.locator('main h1').innerText(),title);
        assert.equal(await page.locator('.landing-intro').evaluate(e=>getComputedStyle(e).textAlign),'center');
        assert.deepEqual(await page.locator('.skill-card .skill-text b').allTextContents(),skills,locale+': the skill order');
        assert.equal(await page.locator('.landing-intro').innerText().then(x=>/AI|الذكاء/.test(x)),false,'no technical AI warning on the landing');
        const write=page.locator('.skill-write');
        assert.equal(await write.getAttribute('aria-disabled'),'true');assert.match(await write.innerText(),new RegExp(soon));
        for(const c of await page.locator('button.skill-card').all())assert.ok((await c.boundingBox()).height>=44,'touch target');
        assert.ok(await noHScroll(page),'no horizontal scroll');
        await page.locator('.skill-read').click();
        await page.locator('.story-start').waitFor();
        assert.equal(await hashOf(page),'#/words/practice/read');
        assert.equal(calls.length,0,'opening a skill sends nothing');
        assert.equal(await page.evaluate(()=>localStorage.getItem('wordloop-practice-plan')),null,'and starts nothing');
        await page.locator('.back-btn').click();await page.locator('.practice-landing').waitFor();
        await page.locator('.skill-listen').click();await page.locator('.listen-setup').waitFor();
        assert.equal(await hashOf(page),'#/words/practice/listen');
        await page.goBack();await page.locator('.practice-landing').waitFor();
        assert.deepEqual(errors,[]);await context.close();
      }
    });

    await t.test('PS-02 words: automatic, whole library (every English deck, never truncated) and hand-picked with a deck filter; the language switches the pool',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      await aiOff(page);const {b}=await seed(page);
      // Several folders: the English pool is every active English word exactly once — nothing lost, nothing repeated.
      const pool=await page.evaluate(async()=>{const d=await import('/src/data.ts'),p=await import('/src/practiceSetup.ts');
        const words=await d.listWords(),lib=await d.listLibrary(),en=p.poolFor(words,p.decksOf(lib.decks,'en-US'));
        const active=words.filter(w=>!w.archived&&lib.decks.find(x=>x.id===w.deckId)?.contentLanguage==='en-US');
        return {ids:en.map(w=>w.id),terms:en.map(w=>w.term),active:active.map(w=>w.id),folders:new Set(active.map(w=>lib.decks.find(x=>x.id===w.deckId).folderId)).size,
          all:p.selectionFor('all',en,'A2',null)};});
      assert.equal(pool.folders,2,'the English words live in two folders');
      assert.equal(pool.ids.length,11);assert.equal(new Set(pool.ids).size,11,'no duplicate ids');assert.equal(new Set(pool.terms).size,11,'no duplicate terms');
      assert.deepEqual([...pool.ids].sort(),[...pool.active].sort(),'no active word lost; the archived one excluded');
      assert.deepEqual(pool.all,pool.ids,'«whole library» takes all 11, in order');
      await page.goto(base()+'/#/words/practice/read');await page.reload();await page.locator('.story-start').waitFor();
      // English (11 distinct words over two decks) comes first; the archived word never counts.
      assert.deepEqual(await page.locator('.lang-chips .chip').allInnerTexts().then(x=>x.map(s=>s.replace(/\s+/g,' ').trim())),['الإنجليزية (الولايات المتحدة) 11','الإسبانية الأوروبية 3'],'language chips, named in the interface language') ;
      const summary=()=>page.locator('.word-summary-top b').innerText();
      assert.equal(await page.locator('.source-field .chip.on').innerText(),'تلقائي','automatic is the default');
      assert.equal(await summary(),'6 من 11 كلمة مختارة','A2 batch');
      await page.locator('.source-field .chip',{hasText:'المكتبة كلها'}).click();
      assert.equal(await summary(),'11 من 11 كلمة مختارة');
      assert.match(await page.locator('.story-start').innerText(),/2 قصص/,'split into stories, nothing dropped');
      await page.locator('.source-field .chip',{hasText:'أختار بنفسي'}).click();
      await page.locator('.word-summary').click();await page.locator('.pick-list').waitFor();
      assert.equal(await page.locator('.pick-row').count(),11);
      await page.getByRole('button',{name:'إلغاء تحديد الكل'}).click();
      await page.locator('.word-picker .deck-chips .chip',{hasText:'Work'}).click();
      assert.equal(await page.locator('.pick-row').count(),6,'Work only');
      await page.getByRole('button',{name:'تحديد الكل',exact:true}).click();
      assert.match(await page.locator('.pick-count').innerText(),/^6 من 11/);
      await page.getByRole('button',{name:'تم',exact:true}).click();await page.locator('.story-start').waitFor();
      assert.equal(await page.locator('.source-field .chip.on').innerText(),'أختار بنفسي');
      assert.equal(await summary(),'6 من 11 كلمة مختارة');
      await page.reload();await page.locator('.story-start').waitFor();
      assert.equal(await summary(),'6 من 11 كلمة مختارة','the choice survives a reload');
      // Start (demo: AI is off) → the plan holds exactly the hand-picked Work words and is saved in the Work deck.
      const before=await fsrsSnapshot(page);
      await page.locator('.story-go').click();await page.locator('.story-view').waitFor({timeout:15000});
      const plan=await page.evaluate(()=>JSON.parse(localStorage.getItem('wordloop-practice-plan')));
      assert.equal(plan.deckId,b);assert.equal(plan.state.total,6);
      assert.equal(plan.stories[0].batch.length,6);assert.equal(new Set(plan.stories[0].batch).size,6,'the story covers the 6 Work words, each once');
      assert.equal(await fsrsSnapshot(page),before,'FSRS untouched');
      // Spanish: a different pool.
      await page.goto(base()+'/#/words/practice/read');await page.locator('.story-start').waitFor();
      await page.locator('.lang-chips .chip',{hasText:'الإسبانية'}).click();
      assert.equal(await summary(),'3 من 3 كلمة مختارة');
      assert.ok(await noHScroll(page));
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('PS-03 Listening lists the saved texts of the language and opens the existing player; empty → a way to Reading',async()=>{
      const {context,page,errors}=await freshPage(browser,base(),DESKTOP);
      await aiOff(page);await seed(page,{passage:true});
      await setLocale(page,'en');
      await page.goto(base()+'/#/words/practice/listen');await page.reload();await page.locator('.listen-setup').waitFor();
      assert.equal(await page.locator('main h1').innerText(),'Listening');
      assert.equal(await page.locator('.hub-item').count(),1);
      await page.locator('.hub-item').getByRole('button',{name:/Listening practice: At the station/}).click();
      await page.waitForFunction(()=>/\/texts\/.+\/listen$/.test(location.hash));
      await page.goBack();await page.locator('.listen-setup').waitFor();
      await page.locator('.lang-chips .chip',{hasText:'Spanish'}).click();
      await page.locator('.listen-setup .empty').waitFor();
      await page.getByRole('button',{name:'Go to Reading'}).click();
      await page.locator('.story-start').waitFor();
      assert.equal(await page.locator('.lang-chips .chip.on').innerText().then(s=>/Spanish/.test(s)),true,'the language choice is shared');
      assert.deepEqual(errors,[]);await context.close();
    });
  });
}

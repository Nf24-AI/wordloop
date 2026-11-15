// Issue #42 — a visible «رجوع» on every branched screen, the right destination, no history loops,
// and no silent loss of typed text (Chromium + WebKit, iPhone width, AR/EN).
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {ENGINES,startServer,freshPage,addCard} from './harness.mjs';

let server;
before(async()=>{server=await startServer();});
after(async()=>{await server?.stop();});

const FOLDER='00000000-0000-4000-8000-00000000f001',DECK='00000000-0000-4000-8000-00000000d001';
const data=(page,fn,arg)=>page.evaluate(async([src,arg])=>{const m=await import('/src/data.ts');return new Function('m','arg',`return (${src})(m,arg)`)(m,arg);},[fn.toString(),arg]);
const hashOf=page=>page.evaluate(()=>location.hash);
const h1=page=>page.locator('main h1').innerText();
const backLabel=page=>page.locator('.back-btn').getAttribute('aria-label');
const backCount=page=>page.locator('.back-btn').count();
async function at(page,hash,title){await page.waitForFunction(h=>location.hash===h,hash);if(title)await page.waitForFunction(t=>document.querySelector('main h1')?.textContent===t,title);}
const leaveDialog=page=>page.locator('dialog[open]',{hasText:'عندك تغييرات غير محفوظة'});

for(const [name,engine] of Object.entries(ENGINES)){
  test(`[${name}] issue #42 back navigation`,async t=>{
    const browser=await engine.launch();
    t.after(()=>browser.close());
    const base=()=>server.base;

    await t.test('BACK-01 inventory: top-level tabs have no Back; every branched screen has one with the right destination',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      const {folderId,deckId}=await data(page,async m=>{const f=await m.createFolder('السفر');const d=await m.createDeck({folderId:f.id,name:'المطار',contentLanguage:'en-US',meaningLanguage:'ar-SA'});return {folderId:f.id,deckId:d.id};});
      const rows=[];
      const check=async(hash,expected)=>{
        await page.goto(base()+'/'+hash);await page.reload();await page.waitForSelector('main h1');
        const label=await backCount(page)?await backLabel(page):null;
        rows.push([hash,label]);
        assert.equal(label,expected,`${hash}: Back should be ${expected}`);
      };
      await check('#/',null);await check('#/words',null);await check('#/words/all',null);await check('#/words/due',null);await check('#/stats',null);
      await check('#/words/f/'+folderId,'رجوع إلى مكتبتي');
      await check('#/words/d/'+deckId,'رجوع إلى السفر');
      await check('#/add/'+deckId,'رجوع إلى المطار');
      await check('#/review/d/'+deckId,'رجوع إلى المطار');
      await check('#/review/f/'+folderId,'رجوع إلى السفر');
      // No in-app history (deep link / reopened PWA): global screens fall back to Home.
      for(const hash of ['#/add','#/review','#/settings']){
        const fresh=await context.newPage();await fresh.goto(base()+'/'+hash);await fresh.locator('.back-btn').waitFor();
        rows.push([hash+' (cold start)',await backLabel(fresh)]);assert.equal(await backLabel(fresh),'رجوع إلى الرئيسية',hash);await fresh.close();
      }
      // With in-app history, global screens go back to where they were opened.
      await page.goto(base()+'/#/stats');await page.waitForSelector('main h1');await page.goto(base()+'/#/settings');await page.locator('.back-btn').waitFor();
      assert.equal(await backLabel(page),'رجوع إلى تقدّمك');
      // Touch target and placement.
      await page.goto(base()+'/#/words/d/'+deckId);await page.reload();await page.locator('.back-btn').waitFor();
      const box=await page.locator('.back-btn').boundingBox();
      assert.ok(box.height>=44&&box.width>=44,'Back is at least 44×44');
      const head=await page.locator('main h1').boundingBox();assert.ok(box.y<head.y,'Back sits above the title');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      console.log('navigation inventory',JSON.stringify(rows));
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('BACK-02 owner scenario: library → folder → deck → card, then Back step by step; history has no loops; reopening inside a folder still has Back',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      const {folderId,deckId}=await data(page,async m=>{const f=await m.createFolder('السفر');const d=await m.createDeck({folderId:f.id,name:'المطار',contentLanguage:'en-US',meaningLanguage:'ar-SA'});return {folderId:f.id,deckId:d.id};});
      await page.goto(base()+'/#/add/'+deckId);await page.reload();await addCard(page,base(),'boarding pass','بطاقة صعود',{navigate:false});
      await page.getByRole('status').filter({hasText:'«boarding pass»'}).waitFor();
      await page.goto(base()+'/#/words');await page.reload();await page.locator('.folder-card',{hasText:'السفر'}).click();await at(page,'#/words/f/'+folderId,'السفر');
      await page.locator('.deck-row',{hasText:'المطار'}).click();await at(page,'#/words/d/'+deckId,'المطار');
      await page.locator('.word-main',{hasText:'boarding pass'}).click();await page.locator('.word-detail').waitFor();
      const depth=await page.evaluate(()=>history.length);
      await page.locator('.back-btn').click();await at(page,'#/words/f/'+folderId,'السفر');
      await page.locator('.back-btn').click();await at(page,'#/words','مكتبتي');
      assert.equal(await page.evaluate(()=>history.length),depth,'Back walked the real history: no new entries');
      // Forward/back stays consistent (no duplicated entries that bounce between two screens).
      await page.goForward();await at(page,'#/words/f/'+folderId,'السفر');
      await page.goBack();await at(page,'#/words','مكتبتي');
      // Reopen (cold start) inside the folder: Back still leads to the library, by replacing — not by leaving the app.
      const page2=await context.newPage();await page2.goto(base()+'/#/words/d/'+deckId);await page2.waitForSelector('main h1');
      const start=await page2.evaluate(()=>history.length);
      await page2.locator('.back-btn').click();await at(page2,'#/words/f/'+folderId,'السفر');
      await page2.locator('.back-btn').click();await at(page2,'#/words','مكتبتي');
      assert.equal(await page2.evaluate(()=>history.length),start,'deep link: Back replaced, so it can never step out of the PWA');
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('BACK-03 folder → new deck → add card → Back: returns to that deck; global Add returns to where it was opened',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      await page.goto(base()+'/#/words/f/'+FOLDER);await page.reload();await page.locator('.deck-row.new').click();
      await page.fill('#deck-title','Phrasal verbs');await page.locator('dialog.form-sheet[open] button[type=submit]').click();
      await page.waitForFunction(()=>document.querySelector('main h1')?.textContent==='Phrasal verbs');
      const deckHash=await hashOf(page);
      await page.locator('.deck-actions .btn').click();await page.waitForSelector('#term');
      assert.equal(await backLabel(page),'رجوع إلى Phrasal verbs');
      await addCard(page,base(),'give up','يستسلم',{navigate:false});await page.getByRole('status').filter({hasText:'«give up»'}).waitFor();
      await page.locator('.back-btn').click();await at(page,deckHash,'Phrasal verbs');
      await page.locator('.word-main',{hasText:'give up'}).waitFor();
      // Global Add from Progress (via the + sheet) → Back returns to Progress.
      await page.goto(base()+'/#/stats');await page.waitForSelector('main h1');
      await page.locator('.tabbar .tab-add').click();await page.locator('.qa-item[data-action=add]').click();await page.waitForSelector('#term');
      assert.equal(await backLabel(page),'رجوع إلى تقدّمك');
      await page.locator('.back-btn').click();await at(page,'#/stats');
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('BACK-04 unsaved Add: Back, a tab and the browser/gesture Back all ask first; «إكمال التعديل» keeps the text; leaving saves nothing',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      await page.goto(base()+'/#/words/d/'+DECK);await page.reload();await page.waitForSelector('main h1');
      await page.locator('.deck-actions .btn').click();await page.waitForSelector('#term');
      await page.fill('#term','commute');await page.fill('#meaning','تنقّل يومي');
      // 1) The Back button.
      await page.locator('.back-btn').click();await leaveDialog(page).waitFor();
      assert.equal(await leaveDialog(page).locator('button').allInnerTexts().then(b=>b.join('|')),'الخروج بدون حفظ|إكمال التعديل');
      await page.getByRole('button',{name:'إكمال التعديل'}).click();
      assert.equal(await page.inputValue('#term'),'commute');assert.match(await hashOf(page),/^#\/add\//);
      // 2) A tab.
      await page.locator('.tabbar .tab').first().click();await leaveDialog(page).waitFor();
      await page.getByRole('button',{name:'إكمال التعديل'}).click();assert.equal(await page.inputValue('#meaning'),'تنقّل يومي');
      // 3) Browser / iOS gesture Back: the route is put back and the question is asked; the form keeps its text.
      await page.goBack();await leaveDialog(page).waitFor();
      assert.match(await hashOf(page),/^#\/add\//,'URL restored to Add while asking');
      await page.getByRole('button',{name:'إكمال التعديل'}).click();
      assert.equal(await page.inputValue('#term'),'commute');
      // Leave without saving: lands on the deck, nothing written, the draft is gone.
      await page.locator('.back-btn').click();await leaveDialog(page).waitFor();
      await page.getByRole('button',{name:'الخروج بدون حفظ'}).click();
      await at(page,'#/words/d/'+DECK);
      assert.equal((await data(page,async m=>(await m.listWords()).length)),0,'nothing was saved');
      assert.equal(await page.evaluate(()=>localStorage.getItem('wordloop-add-draft')),null);
      await page.locator('.deck-actions .btn').click();await page.waitForSelector('#term');assert.equal(await page.inputValue('#term'),'');
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('BACK-05 typed text survives a refresh / PWA relaunch and is cleared once saved',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      await page.goto(base()+'/#/add/'+DECK);await page.waitForSelector('#term');
      await page.fill('#term','layover');await page.fill('#meaning','توقف بين رحلتين');
      await page.reload();await page.waitForSelector('#term');
      assert.equal(await page.inputValue('#term'),'layover');assert.equal(await page.inputValue('#meaning'),'توقف بين رحلتين');
      await page.click('form button[type=submit]');await page.getByRole('status').filter({hasText:'«layover»'}).waitFor();
      assert.equal(await page.evaluate(()=>localStorage.getItem('wordloop-add-draft')),null);
      await page.reload();await page.waitForSelector('#term');assert.equal(await page.inputValue('#term'),'');
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('BACK-06 sheets: Cancel and Esc ask before dropping a typed name; an untouched sheet closes at once',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      await page.goto(base()+'/#/words');await page.locator('.folder-card.new').click();await page.locator('#folder-title').waitFor();
      await page.locator('dialog.form-sheet[open] .sheet-actions .btn-quiet').click();
      await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
      await page.locator('.folder-card.new').click();await page.fill('#folder-title','العمل');
      await page.locator('dialog.form-sheet[open] .sheet-actions .btn-quiet').click();await leaveDialog(page).waitFor();
      await page.getByRole('button',{name:'إكمال التعديل'}).click();
      assert.equal(await page.inputValue('#folder-title'),'العمل');
      await page.locator('#folder-title').press('Escape');await leaveDialog(page).waitFor();
      await page.getByRole('button',{name:'الخروج بدون حفظ'}).click();
      await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
      assert.equal((await data(page,async m=>(await m.listLibrary()).folders.length)),1,'no folder was created');
      // An untouched Edit sheet closed right away (before its fields finished loading) never asks.
      await page.goto(base()+'/#/add/'+DECK);await addCard(page,base(),'gate','بوابة',{navigate:false});await page.getByRole('status').filter({hasText:'«gate»'}).waitFor();
      await page.goto(base()+'/#/words/all');await page.reload();await page.locator('.word-main',{hasText:'gate'}).click();
      for(let i=0;i<3;i++){
        await page.locator('.word-detail .word-actions > button.btn').filter({has:page.locator('.lucide-pencil')}).click();await page.keyboard.press('Escape');
        await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
      }
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('BACK-07 scoped review → Back returns to the deck and changes no FSRS data',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      await page.goto(base()+'/#/add/'+DECK);await addCard(page,base(),'gate','بوابة',{navigate:false});await page.getByRole('status').filter({hasText:'«gate»'}).waitFor();
      const before=await data(page,async m=>JSON.stringify((await m.listWords()).map(w=>[w.dueAt,w.fsrsState,w.revision])));
      await page.goto(base()+'/#/words/d/'+DECK);await page.reload();await page.waitForSelector('main h1');
      await page.goto(base()+'/#/review/d/'+DECK);await page.waitForSelector('.back-btn');
      await page.locator('.reveal').click().catch(()=>{});
      await page.locator('.back-btn').click();await at(page,'#/words/d/'+DECK);
      assert.equal(await data(page,async m=>JSON.stringify((await m.listWords()).map(w=>[w.dueAt,w.fsrsState,w.revision]))),before);
      assert.equal(await data(page,async m=>(await m.listReviews()).length),0);
      assert.deepEqual(errors,[]);await context.close();
    });

    for(const width of [320,390]){
      await t.test(`BACK-08 @${width}px English (LTR): «Back to …», arrow points left, long names truncate without overflow`,async()=>{
        const {context,page,errors}=await freshPage(browser,base(),{viewport:{width,height:740}});
        await page.goto(base()+'/#/settings');await page.click('.lang-switch [data-locale=en]');await page.waitForFunction(()=>document.documentElement.lang==='en');
        const id=await data(page,async m=>(await m.createFolder('A very long folder name that keeps going and going')).id);
        const d=await data(page,async(m,id)=>(await m.createDeck({folderId:id,name:'Deck',contentLanguage:'en-US',meaningLanguage:'ar-SA'})).id,id);
        await page.goto(base()+'/#/words/d/'+d);await page.reload();await page.locator('.back-btn').waitFor();
        assert.equal(await backLabel(page),'Back to A very long folder name that keeps going and going');
        assert.equal(await page.locator('.back-btn .back-word').innerText(),'Back');
        assert.equal(await page.locator('.back-btn svg').getAttribute('class').then(c=>/arrow-left/.test(c)),true,'LTR back arrow points left');
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal scroll');
        await page.goto(base()+'/#/words/f/'+id);await page.waitForFunction(()=>document.querySelector('.back-btn')?.getAttribute('aria-label')==='Back to Library');
        await page.goto(base()+'/#/settings');await page.click('.lang-switch [data-locale=ar]');await page.waitForFunction(()=>document.documentElement.lang==='ar');
        await page.goto(base()+'/#/words/f/'+id);await page.reload();await page.locator('.back-btn').waitFor();
        assert.equal(await page.locator('.back-btn svg').getAttribute('class').then(c=>/arrow-right/.test(c)),true,'RTL back arrow points right');
        assert.deepEqual(errors,[]);await context.close();
      });
    }
  });
}

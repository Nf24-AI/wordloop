// Issue #16 — «مكتبتي» (folders → decks → cards) in real engines (Chromium + WebKit) at iPhone width.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {ENGINES,startServer,freshPage,addCard} from './harness.mjs';

let server;
before(async()=>{server=await startServer();});
after(async()=>{await server?.stop();});

const DEFAULT_DECK='00000000-0000-4000-8000-00000000d001';
/** Calls the app's own data module inside the page (Vite serves the TS source in dev). */
const data=(page,fn,arg)=>page.evaluate(async([src,arg])=>{const m=await import('/src/data.ts');return new Function('m','arg',`return (${src})(m,arg)`)(m,arg);},[fn.toString(),arg]);
const hashOf=page=>page.evaluate(()=>location.hash);
/** Element rectangles measured in one frame (the page-in animation moves content between separate boundingBox calls). */
const rects=(page,sel)=>page.evaluate(sel=>[...document.querySelectorAll(sel)].map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}),sel);
const sheetSubmit=page=>page.locator('dialog.form-sheet[open] button[type=submit]').click();

for(const [name,engine] of Object.entries(ENGINES)){
  test(`[${name}] issue #16 library`,async t=>{
    const browser=await engine.launch();
    t.after(()=>browser.close());
    const base=()=>server.base;

    await t.test('LIB-01: empty library shows the default folder, a dashed «مجلد جديد» tile in two columns, tabs and search; no fake data',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      await page.goto(base()+'/#/words');
      await page.locator('.folder-card').first().waitFor();
      assert.equal(await page.locator('main h1').innerText(),'مكتبتي');
      assert.equal(await page.getAttribute('.search input','placeholder'),'ابحث عن مجلد أو حزمة أو بطاقة...');
      assert.deepEqual(await page.locator('.lib-tabs .chip').allInnerTexts(),['المجلدات','كل البطاقات','تنتظر مراجعة']);
      const cards=await page.locator('.folder-grid .folder-card').allInnerTexts();
      assert.equal(cards.length,2,'only the real default folder + the new-folder tile');
      assert.match(cards[0],/غير مصنفة/);assert.match(cards[0],/حزمة وحدة · ولا بطاقة/);
      assert.match(cards[1],/مجلد جديد/);
      const [a,b]=await rects(page,'.folder-grid .folder-card');
      assert.ok(Math.abs(a.y-b.y)<1,'two columns on one row at 390px');
      assert.ok(a.width>=140&&b.width>=140);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal scroll');
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('LIB-02: build 3 folders and 2 decks, add several cards to one deck; counts are real and update immediately',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      await page.goto(base()+'/#/words');await page.locator('.folder-card').first().waitFor();
      for(const n of ['الإنجليزية','علوم الحاسب','إدارة المشاريع']){
        await page.goto(base()+'/#/words');await page.locator('.folder-card.new').click();
        await page.fill('#sheet-name',n);await sheetSubmit(page);
        await page.waitForFunction(n=>document.querySelector('main h1')?.textContent===n,n);
        assert.match(await hashOf(page),/^#\/words\/f\//);
      }
      // Inside «إدارة المشاريع» (last created): two decks, the second with Spanish content.
      await page.locator('.deck-row.new').click();await page.fill('#deck-name','Business English');await sheetSubmit(page);
      await page.waitForFunction(()=>document.querySelector('main h1')?.textContent==='Business English');
      const deckHash=await hashOf(page);
      await page.locator('.crumbs button').nth(1).click();await page.locator('.deck-row.new').click();
      await page.fill('#deck-name','Vocabulario');await page.selectOption('#deck-content-lang','es-ES');await sheetSubmit(page);
      await page.waitForFunction(()=>document.querySelector('main h1')?.textContent==='Vocabulario');
      assert.equal(await page.locator('.head-actions .lang-chip').innerText(),'ES → AR');
      const lib=await data(page,async m=>m.listLibrary());
      assert.equal(lib.folders.length,4);assert.equal(lib.decks.length,3);
      // Contextual + inside a deck: goes straight to Add with that deck selected (no menu).
      await page.goto(base()+'/'+deckHash);await page.waitForFunction(()=>document.querySelector('main h1')?.textContent==='Business English');
      await page.click('.tab-add');
      await page.waitForSelector('#term');
      assert.match(await hashOf(page),/^#\/add\//);
      assert.equal(await page.locator('dialog[open]').count(),0,'no quick menu inside a deck');
      const deckId=decodeURIComponent(deckHash.split('/').pop());
      assert.equal(await page.inputValue('#add-deck'),deckId);
      await addCard(page,base(),'stakeholder','صاحب مصلحة',{navigate:false});await page.getByRole('status').filter({hasText:'«stakeholder»'}).waitFor();
      await addCard(page,base(),'deadline','موعد نهائي',{navigate:false});await page.getByRole('status').filter({hasText:'«deadline»'}).waitFor();
      await page.getByRole('button',{name:'شوف كلماتي'}).click();
      await page.locator('.word-list .word').nth(1).waitFor();
      assert.equal(await hashOf(page),deckHash);
      assert.deepEqual((await page.locator('.word-list .word-text b').allTextContents()).sort(),['deadline','stakeholder']);
      assert.match(await page.locator('.page-head p').innerText(),/بطاقتين · 2 تنتظر/);
      // Folder card counts on the root grid.
      await page.goto(base()+'/#/words');
      const pm=page.locator('.folder-card',{hasText:'إدارة المشاريع'});
      await pm.waitFor();assert.match(await pm.innerText(),/حزمتين · بطاقتين/);
      assert.match(await page.locator('.folder-card',{hasText:'علوم الحاسب'}).innerText(),/ولا حزمة · ولا بطاقة/);
      // Outside a deck, + still opens the menu, and Add remembers the last deck used on this device.
      await page.click('.tab-add');await page.locator('dialog[open] [data-action=add]').click();
      await page.waitForSelector('#add-deck');assert.equal(await page.inputValue('#add-deck'),deckId);
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('LIB-03: moving a card keeps its schedule and history; delete is offered only when nothing is lost',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      await addCard(page,base(),'leverage','يستفيد من');await page.getByRole('status').filter({hasText:'«leverage»'}).waitFor();
      const {deckId}=await data(page,async m=>{const f=await m.createFolder('Work');const d=await m.createDeck({folderId:f.id,name:'Meetings'});return {deckId:d.id};});
      const before=await data(page,async m=>(await m.listWords())[0]);
      assert.equal(before.deckId,DEFAULT_DECK);
      await page.goto(base()+'/#/words/d/'+DEFAULT_DECK);await page.reload();
      await page.locator('.word-main').click();await page.getByRole('button',{name:'انقلها'}).click();
      await page.selectOption('#move-deck',deckId);await sheetSubmit(page);
      await page.getByRole('status').filter({hasText:'نقلنا «leverage»'}).waitFor();
      const after=await data(page,async m=>(await m.listWords())[0]);
      assert.equal(after.deckId,deckId);
      for(const k of ['id','createdAt','dueAt','revision'])assert.equal(after[k],before[k],k);
      assert.deepEqual(after.fsrsState,before.fsrsState);
      // The default deck is now empty but still can't be deleted; the non-empty deck can't be deleted either.
      await page.locator('.head-actions [aria-label="إعدادات الحزمة"]').click();
      assert.equal(await page.locator('dialog[open] .danger-zone button').count(),0);
      assert.match(await page.locator('dialog[open] .danger-zone').innerText(),/ما ينحذف/);
      await page.keyboard.press('Escape');
      await page.goto(base()+'/#/words/d/'+encodeURIComponent(deckId));
      await page.locator('.head-actions [aria-label="إعدادات الحزمة"]').click();
      assert.match(await page.locator('dialog[open] .danger-zone').innerText(),/فيها بطاقات/);
      await page.keyboard.press('Escape');
      // An empty, non-default deck can be deleted after confirmation, then the folder.
      const empty=await data(page,async m=>{const l=await m.listLibrary();const f=l.folders.find(x=>x.name==='Work');return (await m.createDeck({folderId:f.id,name:'Empty'})).id;});
      await page.goto(base()+'/#/words/d/'+encodeURIComponent(empty));
      await page.locator('.head-actions [aria-label="إعدادات الحزمة"]').click();
      await page.locator('dialog[open] .danger-zone button').click();
      await page.getByRole('button',{name:'إيه، احذفه'}).click();
      await page.getByRole('status').filter({hasText:'حذفنا «Empty»'}).waitFor();
      assert.match(await hashOf(page),/^#\/words\/f\//);
      assert.equal((await data(page,async m=>m.listWords())).length,1,'no card lost');
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('LIB-04: search finds folders, decks and cards; All and Due tabs are routes; unknown places are handled',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      await addCard(page,base(),'agenda','جدول أعمال');await page.getByRole('status').filter({hasText:'«agenda»'}).waitFor();
      await data(page,async m=>{const f=await m.createFolder('Agenda folder');await m.createDeck({folderId:f.id,name:'Agenda deck'});});
      await page.goto(base()+'/#/words');await page.reload();await page.locator('.folder-card').first().waitFor();
      await page.fill('.search input','agenda');
      await page.locator('.results').waitFor();
      assert.deepEqual(await page.locator('.results-title').allInnerTexts(),['مجلدات','حزم','بطاقات']);
      assert.match(await page.locator('.results .word-place').innerText(),/غير مصنفة · بطاقاتي/);
      await page.fill('.search input','');
      await page.getByRole('button',{name:/^كل البطاقات/}).click();
      assert.equal(await hashOf(page),'#/words/all');await page.locator('.word-list').waitFor();
      await page.getByRole('button',{name:/^تنتظر مراجعة/}).click();
      assert.equal(await hashOf(page),'#/words/due');
      await page.goBack();await page.waitForFunction(()=>location.hash==='#/words/all');
      await page.goto(base()+'/#/words/d/missing');
      await page.getByRole('heading',{name:'ما لقينا هذا المكان'}).waitFor();
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('LIB-05: English interface is LTR with translated defaults; the deck language is independent of the UI',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      await page.goto(base()+'/#/settings');await page.click('.lang-switch [data-locale=en]');
      await page.waitForFunction(()=>document.documentElement.lang==='en');
      await page.goto(base()+'/#/words');await page.locator('.folder-card').first().waitFor();
      assert.equal(await page.locator('main h1').innerText(),'Library');
      assert.match(await page.locator('.folder-card').first().innerText(),/Unsorted/);
      assert.match(await page.locator('.folder-card').first().innerText(),/1 deck · no cards/);
      assert.equal(await page.evaluate(()=>document.documentElement.dir),'ltr');
      const [a,b]=await rects(page,'.folder-grid .folder-card');
      assert.ok(a.x<b.x,'first folder on the left in LTR');
      const lib=await data(page,async m=>m.listLibrary());
      assert.equal(lib.decks[0].contentLanguage,'en-US');assert.equal(lib.decks[0].meaningLanguage,'ar-SA');
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('LIB-06: 320px wide still shows two folder columns without clipping or horizontal scroll',async()=>{
      const {context,page,errors}=await freshPage(browser,base(),{viewport:{width:320,height:640}});
      await data(page,async m=>{await m.createFolder('مجلد باسم طويل جدًا للتجربة على الشاشات الضيقة');});
      await page.goto(base()+'/#/words');await page.reload();await page.locator('.folder-card').nth(2).waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      const [a,b]=await rects(page,'.folder-grid .folder-card');
      assert.ok(Math.abs(a.y-b.y)<1);
      assert.equal(await page.evaluate(()=>[...document.querySelectorAll('.folder-card b')].every(b=>b.scrollWidth<=b.clientWidth+1)),true,'names wrap, not clip');
      assert.equal(await page.evaluate(()=>[...document.querySelectorAll('.lib-tabs .chip')].every(c=>{const r=c.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;})),true,'all three views fully visible');
      const [h1,add]=await rects(page,'main h1, .page-head .add-circle'); // document order: title, then +
      assert.ok(add.y<h1.y+h1.height,'header + stays on the title row');
      assert.deepEqual(errors,[]);await context.close();
    });
  });
}

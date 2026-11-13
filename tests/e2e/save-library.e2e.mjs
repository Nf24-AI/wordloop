// Issue #4 — browser regression tests (Chromium + WebKit, iPhone-sized viewport).
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {ENGINES,startServer,freshPage,addCard,libraryTerms} from './harness.mjs';

let server;
before(async()=>{server=await startServer();});
after(async()=>{await server?.stop();});

for(const [name,engine] of Object.entries(ENGINES)){
  test(`[${name}] issue #4 save/library`,async t=>{
    const browser=await engine.launch();
    t.after(()=>browser.close());
    const base=()=>server.base;

    await t.test('SAVE-01/02: sequential saves appear in Library and survive reload + navigation',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      await addCard(page,base(),'overlook','يغفل عن');
      await page.getByRole('status').filter({hasText:'حفظنا «overlook»'}).waitFor();
      await addCard(page,base(),'reliable','موثوق',{navigate:false});
      await page.getByRole('status').filter({hasText:'حفظنا «reliable»'}).waitFor();
      await addCard(page,base(),'eventually','في النهاية',{navigate:false});
      await page.getByRole('button',{name:'شوف كلماتي'}).click();
      assert.deepEqual((await libraryTerms(page,base(),{navigate:false})).sort(),['eventually','overlook','reliable']);
      await page.goto(base()+'/#/');await page.goto(base()+'/#/add');await page.reload();
      assert.deepEqual((await libraryTerms(page,base())).sort(),['eventually','overlook','reliable']);
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('SAVE-03: duplicate with different case/spaces is refused, fields kept, nothing added',async()=>{
      const {context,page}=await freshPage(browser,base());
      await addCard(page,base(),'in charge of','مسؤول عن');
      await page.getByRole('status').filter({hasText:'حفظنا'}).waitFor();
      await addCard(page,base(),'  In   Charge OF ','معنى ثاني',{navigate:false});
      await page.locator('.inline-error[role=alert]').waitFor();
      assert.equal(await page.inputValue('#term'),'  In   Charge OF ');
      assert.equal(await page.inputValue('#meaning'),'معنى ثاني');
      assert.deepEqual(await libraryTerms(page,base()),['in charge of']);
      await context.close();
    });

    await t.test('SAVE-04: storage failure → explicit error, inputs kept, no success message',async()=>{
      const {context,page}=await freshPage(browser,base());
      await page.goto(base()+'/#/add');await page.waitForSelector('#term');
      await page.evaluate(()=>{IDBObjectStore.prototype.add=function(){throw new DOMException('quota','QuotaExceededError');};});
      await addCard(page,base(),'overlook','يغفل عن',{navigate:false});
      await page.locator('.inline-error[role=alert]').filter({hasText:'ممتلئة'}).waitFor();
      assert.equal(await page.inputValue('#term'),'overlook');
      assert.equal(await page.inputValue('#meaning'),'يغفل عن');
      assert.equal(await page.locator('.toast').count(),0,'no success toast');
      await context.close();
    });

    await t.test('SAVE-05: saved but list refresh fails → says "saved", offers retry, card then appears',async()=>{
      const {context,page}=await freshPage(browser,base());
      await page.goto(base()+'/#/add');await page.waitForSelector('#term');
      await page.evaluate(()=>{const real=IDBObjectStore.prototype.getAll;window.__realGetAll=real;
        const realAdd=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(...a){window.__breakRefresh=true;return realAdd.apply(this,a);};
        IDBObjectStore.prototype.getAll=function(...a){if(window.__breakRefresh&&this.name==='words')throw new DOMException('lost','UnknownError');return real.apply(this,a);};});
      await addCard(page,base(),'overlook','يغفل عن',{navigate:false});
      const notice=page.locator('.inline-error.soft');
      await notice.waitFor();
      assert.match(await notice.textContent(),/انحفظت «overlook» على جهازك/);
      assert.equal(await page.locator('.toast.ok').count(),0,'no end-to-end success claimed yet');
      await page.evaluate(()=>{window.__breakRefresh=false;});
      await page.getByRole('button',{name:'حدّث القائمة'}).click();
      await page.getByRole('status').filter({hasText:'حفظنا «overlook»'}).waitFor();
      assert.equal(await notice.count(),0);
      assert.deepEqual(await libraryTerms(page,base()),['overlook']);
      await context.close();
    });

    await t.test('SAVE-06: new card is findable by search and the due filter; clearing filters shows all',async()=>{
      const {context,page}=await freshPage(browser,base());
      for(const [term,m] of [['overlook','يغفل عن'],['reliable','موثوق']]){await addCard(page,base(),term,m);await page.getByRole('status').filter({hasText:`«${term}»`}).waitFor();}
      await page.goto(base()+'/#/words');await page.locator('.word-list .word').nth(1).waitFor(); // both cards listed before typing
      await page.fill('input[type=search]','relia');
      await page.locator('.word-list .word').nth(1).waitFor({state:'detached'});
      assert.deepEqual(await libraryTerms(page,base(),{navigate:false}),['reliable']);
      await page.fill('input[type=search]','');
      await page.getByRole('button',{name:/تنتظر مراجعة/}).click();
      await page.locator('.word-list .word').nth(1).waitFor();
      assert.deepEqual((await libraryTerms(page,base(),{navigate:false})).sort(),['overlook','reliable']);
      await context.close();
    });

    await t.test('another open window refreshes after a save there (no focus event needed)',async()=>{
      const {context,page}=await freshPage(browser,base());
      const other=await context.newPage();await other.goto(base()+'/#/words');await other.waitForSelector('main h1');
      await addCard(page,base(),'meanwhile','في الأثناء');
      await page.getByRole('status').filter({hasText:'«meanwhile»'}).waitFor();
      await other.locator('.word-list .word-text b',{hasText:'meanwhile'}).waitFor({timeout:3000});
      await context.close();
    });

    await t.test('returning to a backgrounded app (visibilitychange only) reloads from IndexedDB',async()=>{
      const {context,page}=await freshPage(browser,base());
      await addCard(page,base(),'overlook','يغفل عن');await page.getByRole('status').filter({hasText:'حفظنا'}).waitFor();
      await page.goto(base()+'/#/words');await page.waitForSelector('.word-list');
      // Write directly to IndexedDB (as another context would), with no broadcast, then simulate resume.
      await page.evaluate(()=>new Promise((res,rej)=>{const r=indexedDB.open('wordloop-local-v1');r.onsuccess=()=>{const db=r.result;const tx=db.transaction('words','readwrite');const s=tx.objectStore('words');
        s.getAll().onsuccess=e=>{const w={...e.target.result[0],id:'external-1',term:'external',createdAt:new Date().toISOString()};w.fsrsState={...w.fsrsState,cardId:'external-1'};s.put(w);};tx.oncomplete=()=>{db.close();res();};tx.onerror=()=>rej(tx.error);};}));
      await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
      await page.locator('.word-list .word-text b',{hasText:'external'}).waitFor({timeout:3000});
      await context.close();
    });

    await t.test('SEC-07: hostile text is rendered as plain text',async()=>{
      const {context,page}=await freshPage(browser,base());
      let dialogs=0;page.on('dialog',d=>{dialogs++;void d.dismiss();});
      const evil='<img src=x onerror=alert(1)>';
      await addCard(page,base(),evil,'<b>bold</b>');await page.getByRole('status').filter({hasText:'حفظنا'}).waitFor();
      assert.deepEqual(await libraryTerms(page,base()),[evil]);
      assert.equal(await page.locator('main img').count(),0);assert.equal(dialogs,0);
      await context.close();
    });
  });
}

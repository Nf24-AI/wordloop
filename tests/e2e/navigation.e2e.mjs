// Issues #8 / #9 — one primary CTA on Home and the central + quick-action sheet (Chromium + WebKit).
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {ENGINES,startServer,freshPage} from './harness.mjs';

let server;
before(async()=>{server=await startServer();});
after(async()=>{await server?.stop();});

const seed=(page,{due})=>page.evaluate(due=>new Promise(res=>{
  const now=Date.now(),iso=ms=>new Date(ms).toISOString();
  const mk=(id,dueIn)=>{const dueAt=iso(now+dueIn);return {id,contentType:'vocabulary',note:'',term:id,meaning:'م',example:'',translation:'',tag:'عام',createdAt:iso(now),updatedAt:iso(now),dueAt,fsrsState:{cardId:id,dueAt},archived:false,revision:0};};
  const words=[mk('first',due?-60_000:2*86_400_000),mk('second',3*86_400_000)];
  const r=indexedDB.open('wordloop-local-v1');r.onsuccess=()=>{const tx=r.result.transaction('words','readwrite');for(const w of words)tx.objectStore('words').put(w);tx.oncomplete=()=>{r.result.close();res();};};
}),due);
/** Buttons inside <main> that lead to Add (by label). */
const mainAddButtons=page=>page.locator('main button').filter({hasText:/أضف بطاقة|أضف كلمة|تعلّمت كلمة/}).count();
const hashOf=page=>page.evaluate(()=>location.hash||'#/');

for(const [name,engine] of Object.entries(ENGINES)){
  test(`[${name}] issues #8/#9 navigation`,async t=>{
    const browser=await engine.launch();
    t.after(()=>browser.close());
    const base=()=>server.base;

    await t.test('NAV-01: with due cards, Home has exactly one primary CTA and it starts the review',async()=>{
      const {context,page}=await freshPage(browser,base());
      await seed(page,{due:true});await page.reload();await page.waitForSelector('.facts');
      assert.equal(await page.locator('main .btn-ink').count(),1);
      assert.equal(await mainAddButtons(page),0,'no in-content add buttons');
      await page.locator('main .btn-ink').click();
      assert.equal(await hashOf(page),'#/review');
      await context.close();
    });

    await t.test('NAV-02: with nothing due, and with an empty library, the one CTA adds a card',async()=>{
      for(const state of ['nodue','empty']){
        const {context,page}=await freshPage(browser,base());
        if(state==='nodue'){await seed(page,{due:false});await page.reload();await page.waitForSelector('.facts');}
        assert.equal(await page.locator('main .btn-ink').count(),1,state);
        assert.match(await page.locator('main .btn-ink').textContent(),/أضف بطاقة/);
        await page.locator('main .btn-ink').click();
        assert.equal(await hashOf(page),'#/add',state);
        await context.close();
      }
    });

    await t.test('Library header has no add button; Add stays reachable through +',async()=>{
      const {context,page}=await freshPage(browser,base());
      await seed(page,{due:true});await page.goto(base()+'/#/words');await page.reload();await page.waitForSelector('.word-list');
      assert.equal(await mainAddButtons(page),0);
      await page.click('.tab-add');
      await page.locator('[data-action=add]').click();
      assert.equal(await hashOf(page),'#/add');
      await context.close();
    });

    await t.test('NAV-03: + opens the sheet; Add and Review route correctly; Back returns to the previous page',async()=>{
      const {context,page}=await freshPage(browser,base());
      await seed(page,{due:true});await page.goto(base()+'/#/words');await page.reload();await page.waitForSelector('.word-list');
      const sheet=page.getByRole('dialog',{name:'وش تبي تسوي؟'});
      await page.click('.tab-add');await sheet.waitFor();
      assert.equal(await page.getAttribute('.tab-add','aria-expanded'),'true');
      await page.locator('[data-action=review]').click();
      await sheet.waitFor({state:'hidden'});
      assert.equal(await hashOf(page),'#/review');
      await page.goBack();await page.waitForFunction(()=>location.hash==='#/words');
      await page.click('.tab-add');await sheet.waitFor();
      await page.locator('[data-action=add]').click();
      assert.equal(await hashOf(page),'#/add');
      await context.close();
    });

    await t.test('dismiss with Esc, outside tap and Back; focus returns to +; page unchanged',async()=>{
      const {context,page}=await freshPage(browser,base());
      await seed(page,{due:true});await page.reload();await page.waitForSelector('.facts');
      const sheet=page.getByRole('dialog',{name:'وش تبي تسوي؟'});
      await page.click('.tab-add');await sheet.waitFor();
      await page.keyboard.press('Escape');await sheet.waitFor({state:'hidden'});
      assert.equal(await page.evaluate(()=>document.activeElement?.classList.contains('tab-add')),true,'focus back on +');
      await page.click('.tab-add');await sheet.waitFor();
      await page.mouse.click(195,60); // backdrop above the bottom sheet
      await sheet.waitFor({state:'hidden'});
      await page.click('.tab-add');await sheet.waitFor();
      await page.goBack();await sheet.waitFor({state:'hidden'});
      assert.equal(await hashOf(page),'#/');
      assert.equal(await page.locator('main .facts').count(),1,'still on Home');
      await context.close();
    });

    await t.test('NAV-04: Practice is shown as «قريبًا», disabled and never navigates',async()=>{
      const {context,page}=await freshPage(browser,base());
      await page.click('.tab-add');
      const practice=page.locator('[data-action=practice]');
      assert.equal(await practice.getAttribute('aria-disabled'),'true');
      assert.match(await practice.textContent(),/قريبًا/);
      await practice.click({force:true}); // a real tap; Playwright otherwise refuses aria-disabled targets
      assert.equal(await hashOf(page),'#/');
      assert.equal(await page.getByRole('dialog').isVisible(),true,'sheet stays open, nothing happens');
      await context.close();
    });

    await t.test('NAV-05: keyboard-only: open with Enter, focus starts on the first action, Tab reaches each, targets ≥ 44px',async()=>{
      const {context,page}=await freshPage(browser,base());
      await seed(page,{due:true});await page.reload();await page.waitForSelector('.facts');
      await page.focus('.tab-add');await page.keyboard.press('Enter');
      await page.getByRole('dialog').waitFor();
      assert.equal(await page.evaluate(()=>document.activeElement?.dataset.action),'add');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(()=>document.activeElement?.dataset.action),'review');
      for(const sel of ['[data-action=add]','[data-action=review]','[data-action=practice]','.qa-head button','.tab-add']){
        const box=await page.locator(sel).boundingBox();assert.ok(box.height>=44&&box.width>=44,`${sel} ${box.width}x${box.height}`);
      }
      assert.equal(await page.getAttribute('.tab-add','aria-haspopup'),'dialog');
      await page.keyboard.press('Enter'); // activates "review"
      assert.equal(await hashOf(page),'#/review');
      await context.close();
    });

    await t.test('320px viewport: sheet fits without horizontal scroll',async()=>{
      const {context,page}=await freshPage(browser,base(),{viewport:{width:320,height:640}});
      await page.click('.tab-add');await page.getByRole('dialog').waitFor();
      const box=await page.locator('.quick-sheet').boundingBox();
      assert.ok(box.x>=0&&box.x+box.width<=320.5,`sheet ${box.x}+${box.width}`);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=320),true);
      await context.close();
    });
  });
}

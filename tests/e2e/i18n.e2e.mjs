// Issue #6 — cog settings icon and a full Arabic/English UI toggle with RTL/LTR (Chromium + WebKit).
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {ENGINES,startServer,freshPage,addCard} from './harness.mjs';

let server;
before(async()=>{server=await startServer();});
after(async()=>{await server?.stop();});

const ARABIC=/[؀-ۿ]/;
/** Raw IndexedDB contents, exactly as stored. */
const dump=page=>page.evaluate(()=>new Promise((res,rej)=>{
  const r=indexedDB.open('wordloop-local-v1');
  r.onerror=()=>rej(r.error);
  r.onsuccess=()=>{const db=r.result,tx=db.transaction(['words','reviews'],'readonly'),out={};
    tx.objectStore('words').getAll().onsuccess=e=>{out.words=e.target.result;};
    tx.objectStore('reviews').getAll().onsuccess=e=>{out.reviews=e.target.result;};
    tx.oncomplete=()=>{db.close();res(out);};};
}));
const docDir=page=>page.evaluate(()=>({html:document.documentElement.dir,lang:document.documentElement.lang,app:document.querySelector('.app')?.getAttribute('dir')}));
async function switchTo(page,base,locale){
  await page.goto(base+'/#/settings');await page.waitForSelector('.lang-switch');
  await page.click(`.lang-switch [data-locale=${locale}]`);
  await page.waitForFunction(l=>document.documentElement.lang===l,locale);
}
/** Visible interface text, without the language picker's own native names. */
const uiText=page=>page.evaluate(()=>{
  const clone=document.body.cloneNode(true);
  // The picker's native names and the add-form preview (Arabic sample meaning for an Arabic field) are not UI copy.
  clone.querySelectorAll('[data-locale],.add-aside,script,style').forEach(n=>n.remove());
  return clone.innerText;
});

for(const [name,engine] of Object.entries(ENGINES)){
  test(`[${name}] issue #6 language`,async t=>{
    const browser=await engine.launch();
    t.after(()=>browser.close());
    const base=()=>server.base;

    await t.test('Settings uses the cog icon in the tab rail and top bar',async()=>{
      const {context,page}=await freshPage(browser,base());
      assert.equal(await page.locator('.topbar svg.lucide-settings').count(),1);
      assert.equal(await page.locator('svg.lucide-settings-2').count(),0);
      await context.close();
    });

    await t.test('I18N-01: switching to English flips dir/lang, translates the shell, and persists after reload',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      assert.deepEqual(await docDir(page),{html:'rtl',lang:'ar',app:'rtl'});
      await switchTo(page,base(),'en');
      assert.deepEqual(await docDir(page),{html:'ltr',lang:'en',app:'ltr'});
      assert.equal(await page.title(),'Settings · WordLoop');
      assert.equal(await page.getAttribute('.lang-switch [data-locale=en]','aria-checked'),'true');
      assert.match(await page.locator('.toast').textContent(),/English/);
      assert.deepEqual(await page.locator('.tabbar .tab').allTextContents(),['Home','Review','My cards','Progress']);
      // LTR: the first tab (Home) is on the left edge.
      const home=await page.locator('.tabbar .tab').first().boundingBox(),last=await page.locator('.tabbar .tab').last().boundingBox();
      assert.ok(home.x<last.x,'Home tab is left of Progress in LTR');
      await page.reload();await page.waitForSelector('main h1');
      assert.deepEqual(await docDir(page),{html:'ltr',lang:'en',app:'ltr'});
      await switchTo(page,base(),'ar');
      assert.deepEqual(await docDir(page),{html:'rtl',lang:'ar',app:'rtl'});
      assert.equal(await page.title(),'الإعدادات · WordLoop');
      assert.deepEqual(errors,[]);
      await context.close();
    });

    await t.test('I18N-02: saved cards, reviews and FSRS schedules are byte-identical after switching both ways',async()=>{
      const {context,page}=await freshPage(browser,base());
      await addCard(page,base(),'serendipity','صدفة سعيدة');await page.waitForSelector('.toast');
      await addCard(page,base(),'Break a leg','بالتوفيق');await page.waitForSelector('.toast');
      // Make one card due and review it once so there is FSRS history to compare.
      await page.goto(base()+'/#/review');
      const dueNow=await page.locator('.reveal').count();
      if(dueNow){await page.click('.reveal');await page.click('.grade.g-good');}
      const before=await dump(page);
      assert.equal(before.words.length,2);
      await switchTo(page,base(),'en');
      await page.reload();await page.waitForSelector('main h1');
      assert.deepEqual(await dump(page),before,'nothing stored changed in English');
      await page.goto(base()+'/#/words');await page.waitForSelector('.word-list');
      const terms=await page.locator('.word-text b').allTextContents(),meanings=await page.locator('.word-text > span').allTextContents();
      assert.deepEqual(terms.sort(),['Break a leg','serendipity']);
      assert.ok(meanings.includes('صدفة سعيدة')&&meanings.includes('بالتوفيق'),'Arabic meanings shown as written');
      assert.equal(await page.locator('.word-text > span').first().getAttribute('dir'),'auto');
      await switchTo(page,base(),'ar');
      assert.deepEqual(await dump(page),before,'nothing stored changed after switching back');
      await context.close();
    });

    await t.test('I18N-03: English mode shows no Arabic interface text on any screen',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      // Latin-only user content, so any Arabic left on screen would be untranslated UI.
      await addCard(page,base(),'resilient','able to recover quickly');await page.waitForSelector('.toast');
      await switchTo(page,base(),'en');
      for(const route of ['','add','review','words','stats','settings']){
        await page.goto(base()+'/#/'+route);await page.waitForSelector('main h1');
        if(route==='words')await page.click('.word-main');
        if(route==='add'){for(const k of ['phrase','sentence','idiom','vocabulary']){await page.click(`[data-kind=${k}]`);const txt=await uiText(page);assert.ok(!ARABIC.test(txt),`add/${k}: ${txt.match(/.{0,30}[؀-ۿ]+.{0,30}/)?.[0]}`);}}
        const txt=await uiText(page);
        assert.ok(!ARABIC.test(txt),`#/${route}: ${txt.match(/.{0,30}[؀-ۿ]+.{0,30}/)?.[0]}`);
        assert.ok(!ARABIC.test(await page.title()),`title of #/${route}`);
      }
      await page.goto(base()+'/#/');await page.waitForSelector('main h1');
      await page.click('.tab-add');await page.getByRole('dialog',{name:'What would you like to do?'}).waitFor();
      assert.ok(!ARABIC.test(await uiText(page)),'quick actions sheet');
      assert.match(await page.locator('[data-action=practice]').textContent(),/Soon/);
      assert.equal(await page.getAttribute('.tab-add','aria-label').then(v=>ARABIC.test(v)),false,'+ label');
      assert.deepEqual(errors,[]);
      await context.close();
    });

    await t.test('I18N-04: language radio group is keyboard operable, 44px, and English fits 320px',async()=>{
      const {context,page}=await freshPage(browser,base(),{viewport:{width:320,height:640}});
      await page.goto(base()+'/#/settings');await page.waitForSelector('.lang-switch');
      for(const b of await page.locator('.lang-switch button').all()){const box=await b.boundingBox();assert.ok(box.height>=44,`${box.height}`);}
      await page.focus('.lang-switch [aria-checked=true]');await page.keyboard.press('ArrowLeft');
      await page.waitForFunction(()=>document.documentElement.lang==='en');
      await page.waitForSelector('.lang-switch [data-locale=en][aria-checked=true]');
      for(const route of ['','add','words','stats','settings']){
        await page.goto(base()+'/#/'+route);await page.waitForSelector('main h1');
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=320),true,`#/${route} has no horizontal scroll`);
      }
      await context.close();
    });
  });
}

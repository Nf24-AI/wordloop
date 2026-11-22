// Issue #74 — the sidebar CTA says what it does, and «الممارسة» is a first-class navigation item that opens the
// existing Practice hub (no duplicate screen). Desktop (sidebar) and phone (tab bar), Arabic and English, Chromium + WebKit.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {ENGINES,startServer,freshPage} from './harness.mjs';

let server;
before(async()=>{server=await startServer();});
after(async()=>{await server?.stop();});

const DESKTOP={viewport:{width:1280,height:800},isMobile:false,hasTouch:false,deviceScaleFactor:1};
const hashOf=page=>page.evaluate(()=>location.hash||'#/');
const current=(page,scope)=>page.locator(`${scope} [aria-current=page]`).evaluateAll(els=>els.map(e=>e.textContent.trim()));
/** Waits until the active navigation item is exactly `label` (React renders the new route right after the hash change). */
const activeIs=(page,scope,label)=>page.waitForFunction(([s,l])=>{const a=[...document.querySelectorAll(s+' [aria-current=page]')].map(e=>e.textContent.trim());return a.length===1&&a[0]===l;},[scope,label]);
async function setLocale(page,locale){await page.evaluate(l=>localStorage.setItem('wordloop-locale',l),locale);await page.reload();await page.waitForSelector('main h1');}

for(const [name,engine] of Object.entries(ENGINES)){
  test(`[${name}] issue #74 practice navigation`,async t=>{
    const browser=await engine.launch();
    t.after(()=>browser.close());
    const base=()=>server.base;

    await t.test('PNAV-01 desktop: the CTA label names every action its menu really offers',async()=>{
      for(const [locale,label,dialog] of [['ar','أضف، راجع، أو مارس','وش تبي تسوي؟'],['en','Add, review or practise','What would you like to do?']]){
        const {context,page}=await freshPage(browser,base(),DESKTOP);
        if(locale==='en')await setLocale(page,'en');
        const cta=page.locator('.rail-add');
        assert.equal((await cta.textContent()).trim(),label,locale);
        assert.equal(await cta.getAttribute('aria-haspopup'),'dialog');
        await cta.click();await page.getByRole('dialog',{name:dialog}).waitFor();
        assert.deepEqual(await page.locator('dialog[open] .qa-item').evaluateAll(b=>b.map(x=>x.dataset.action)),['add','review','practice'],'the menu: add · review · practise');
        await page.locator('dialog[open] [data-action=practice]').click();
        assert.equal(await hashOf(page),'#/words/practice','the practise action works');
        await context.close();
      }
    });

    await t.test('PNAV-02 desktop: «الممارسة» sits between «المراجعة» and «مكتبتي», opens the Practice hub, and is the active item',async()=>{
      const {context,page,errors}=await freshPage(browser,base(),DESKTOP);
      const items=await page.locator('.rail nav .rail-link > span').allTextContents();
      assert.deepEqual(items,['الرئيسية','المراجعة','الممارسة','مكتبتي','تقدّمك','الإعدادات']);
      await page.locator('.rail nav .rail-link',{hasText:'الممارسة'}).click();
      assert.equal(await hashOf(page),'#/words/practice');
      await page.waitForFunction(()=>document.querySelector('main h1')?.textContent==='جاهز تمارس اللي تعلّمته؟'); // the Practice landing
      await activeIs(page,'.rail nav','الممارسة'); // Practice is active, not Library
      await page.locator('.rail nav .rail-link',{hasText:'مكتبتي'}).click();
      assert.equal(await hashOf(page),'#/words');
      await activeIs(page,'.rail nav','مكتبتي');
      await page.goBack();await page.waitForFunction(()=>location.hash==='#/words/practice');
      await activeIs(page,'.rail nav','الممارسة'); // Back
      await page.goForward();await page.waitForFunction(()=>location.hash==='#/words');
      await activeIs(page,'.rail nav','مكتبتي'); // Forward
      // a deeper Practice screen (choosing words for a deck) still counts as Practice
      await page.evaluate(()=>{location.hash='#/words/practice/x/words';});
      await page.waitForFunction(()=>document.querySelector('.rail nav [aria-current=page]')?.textContent.includes('الممارسة'));
      assert.deepEqual(errors,[]);
      await context.close();
    });

    await t.test('PNAV-03 desktop keyboard: focus reaches «الممارسة» and Enter opens it',async()=>{
      const {context,page}=await freshPage(browser,base(),DESKTOP);
      const link=page.locator('.rail nav .rail-link',{hasText:'الممارسة'});
      await link.focus();assert.equal(await link.evaluate(el=>el===document.activeElement),true);
      await page.keyboard.press('Enter');
      await page.waitForFunction(()=>location.hash==='#/words/practice');
      await activeIs(page,'.rail nav','الممارسة');
      await context.close();
    });

    await t.test('PNAV-04 phone (390px): the tab bar shows «الممارسة», fits, and opens Practice — Arabic RTL and English LTR',async()=>{
      for(const [locale,tabs,practice,home] of [['ar',['الرئيسية','المراجعة','الممارسة','مكتبتي','تقدّمك'],'الممارسة','الرئيسية'],['en',['Home','Review','Practice','Library','Progress'],'Practice','Home']]){
        const {context,page,errors}=await freshPage(browser,base());
        if(locale==='en')await setLocale(page,'en');
        assert.deepEqual(await page.locator('.tabbar .tab').allTextContents(),tabs,locale);
        const boxes=await page.locator('.tabbar > button').evaluateAll(b=>b.map(x=>{const r=x.getBoundingClientRect();return {l:r.left,r:r.right,w:r.width};}));
        assert.equal(boxes.length,6,'5 tabs + the central +');
        for(const b of boxes){assert.ok(b.l>=-0.5&&b.r<=390.5,'inside the screen');assert.ok(b.w>=44,'a 44px touch target');}
        for(let i=1;i<boxes.length;i++)assert.ok(locale==='ar'?boxes[i].r<=boxes[i-1].l+0.5:boxes[i].l>=boxes[i-1].r-0.5,'no overlap, in '+(locale==='ar'?'RTL':'LTR')+' order');
        const labelsFit=await page.locator('.tabbar .tab > span:last-child').evaluateAll(s=>s.every(x=>x.scrollWidth<=x.clientWidth+1));
        assert.ok(labelsFit,'labels are not cut off');
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal scroll');
        await page.locator('.tabbar .tab',{hasText:practice}).click();
        assert.equal(await hashOf(page),'#/words/practice');
        await activeIs(page,'.tabbar',practice);
        await page.locator('.tabbar .tab',{hasText:home}).click();
        assert.equal(await hashOf(page),'#/');
        assert.deepEqual(errors,[]);
        await context.close();
      }
    });

    await t.test('PNAV-05 the other destinations still work from the sidebar',async()=>{
      const {context,page}=await freshPage(browser,base(),DESKTOP);
      for(const [label,hash] of [['المراجعة','#/review'],['مكتبتي','#/words'],['تقدّمك','#/stats'],['الإعدادات','#/settings'],['الرئيسية','#/']]){
        await page.locator('.rail nav .rail-link',{hasText:label}).click();
        await page.waitForFunction(h=>(location.hash||'#/')===h,hash);
        await activeIs(page,'.rail nav',label);
      }
      await context.close();
    });
  });
}

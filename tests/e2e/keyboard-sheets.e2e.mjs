// Issue #43 — sheets with fields stay usable when the iPhone keyboard is up (Chromium + WebKit, 320–430px, AR/EN).
// Headless engines have no on-screen keyboard, so the keyboard is simulated the way iOS reports it:
// the layout viewport keeps its height and window.visualViewport shrinks (and may scroll by offsetTop).
// This proves the layout reacts to visualViewport; it is NOT a substitute for the real-iPhone UAT.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {ENGINES,startServer,freshPage,addCard} from './harness.mjs';

let server;
before(async()=>{server=await startServer();});
after(async()=>{await server?.stop();});

/** Pretend an on-screen keyboard of `kb` px is open (or closed with 0), as iOS reports it through visualViewport. */
const keyboard=(page,kb,offsetTop=0)=>page.evaluate(([kb,offsetTop])=>{
  const vv=window.visualViewport;
  Object.defineProperty(vv,'height',{configurable:true,get:()=>window.innerHeight-kb-offsetTop});
  Object.defineProperty(vv,'offsetTop',{configurable:true,get:()=>offsetTop});
  vv.dispatchEvent(new Event('resize'));
  return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
},[kb,offsetTop]);
/** Rectangles of the open sheet and its key parts, measured in one frame. */
const parts=page=>page.evaluate(()=>{
  const d=document.querySelector('dialog.form-sheet[open]'),q=s=>{const e=s===':scope'?d:d.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,width:r.width};};
  return {sheet:q(':scope'),title:q('h2'),field:q('input'),submit:q('button[type=submit]'),cancel:q('.sheet-actions .btn-quiet'),vh:innerHeight,vw:innerWidth,scrollW:document.documentElement.scrollWidth};
});
/** The element is fully inside the visible band [offsetTop, offsetTop+visible height]. */
function inside(r,top,bottom,what){assert.ok(r,`${what} exists`);assert.ok(r.top>=top-1&&r.bottom<=bottom+1,`${what} visible: ${Math.round(r.top)}–${Math.round(r.bottom)} within ${top}–${bottom}`);}
const settle=page=>page.waitForFunction(()=>{const d=document.querySelector('dialog.form-sheet[open]');return d&&d.getAnimations().every(a=>a.playState!=='running');});

for(const [name,engine] of Object.entries(ENGINES)){
  test(`[${name}] issue #43 keyboard and sheets`,async t=>{
    const browser=await engine.launch();
    t.after(()=>browser.close());
    const base=()=>server.base;

    for(const width of [320,375,390,430]){
      await t.test(`KB-01 @${width}px: «مجلد جديد» shows title, field, Create and Cancel — with the keyboard closed and open — and creates the folder without hiding the keyboard`,async()=>{
        const {context,page,errors}=await freshPage(browser,base(),{viewport:{width,height:width<=320?568:844}});
        await page.goto(base()+'/#/words');await page.locator('.folder-card.new').click();
        await page.locator('dialog.form-sheet[open] #folder-title').waitFor();await settle(page);
        // Touch screens open the sheet without raising the keyboard: focus is on the title, not on the field.
        const focus=await page.evaluate(()=>({coarse:matchMedia('(pointer:coarse)').matches,tag:document.activeElement?.tagName,id:document.activeElement?.id}));
        if(focus.coarse)assert.equal(focus.tag,'H2','touch: the title is focused, the keyboard stays down');
        else assert.equal(focus.id,'folder-title','mouse/keyboard: the field is focused');
        let p=await parts(page);
        for(const k of ['title','field','submit','cancel'])inside(p[k],0,p.vh,`closed keyboard: ${k}`);
        assert.ok(p.scrollW<=p.vw,'no horizontal scroll');
        // No contact AutoFill hints: not called "name", autocomplete off.
        assert.deepEqual(await page.$eval('#folder-title',e=>[e.id,e.name,e.autocomplete]),['folder-title','folder-title','off']);
        // Keyboard up (iOS: ~336px + suggestion bar at 390 wide; smaller phones lose more of the screen).
        const kb=width<=320?260:336;
        await page.locator('#folder-title').tap();await keyboard(page,kb);await settle(page);
        p=await parts(page);
        for(const k of ['title','field','submit','cancel'])inside(p[k],0,p.vh-kb,`keyboard open: ${k}`);
        // iOS may also scroll the visual viewport; the sheet follows it.
        await keyboard(page,kb,40);await settle(page);p=await parts(page);
        for(const k of ['field','submit','cancel'])inside(p[k],40,p.vh-kb,`keyboard open + offsetTop 40: ${k}`);
        await page.fill('#folder-title','Keyboard '+width);
        await page.locator('dialog.form-sheet[open] button[type=submit]').click();
        await page.waitForFunction(n=>document.querySelector('main h1')?.textContent===n,'Keyboard '+width);
        await keyboard(page,0);
        assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--kb').trim()),'0px','keyboard closed → no lift');
        assert.deepEqual(errors,[]);await context.close();
      });
    }

    await t.test('KB-02: the same holds for New deck, Folder settings and Edit card, in Arabic and English, with the larger system text',async()=>{
      const {context,page,errors}=await freshPage(browser,base(),{viewport:{width:375,height:667}});
      await addCard(page,base(),'resilient','مرن');await page.getByRole('status').filter({hasText:'«resilient»'}).waitFor();
      for(const locale of ['ar','en']){
        if(locale==='en'){await page.goto(base()+'/#/settings');await page.click('.lang-switch [data-locale=en]');await page.waitForFunction(()=>document.documentElement.lang==='en');}
        // Larger system text (Dynamic Type) — the sheet must scroll, with Save/Cancel still reachable.
        await page.addStyleTag({content:'html{font-size:125%} .sheet,.sheet *{font-size:1.2em}'}).catch(()=>{});
        const open=async(path,trigger)=>{await page.goto(base()+path);await page.reload();await trigger();await page.locator('dialog.form-sheet[open]').waitFor();await settle(page);};
        const check=async what=>{
          await keyboard(page,0);let p=await parts(page);
          inside(p.submit,0,p.vh,`${locale} ${what}: Save with keyboard closed`);inside(p.cancel,0,p.vh,`${locale} ${what}: Cancel with keyboard closed`);
          const kb=300;await page.locator('dialog.form-sheet[open] :is(input,select)').first().focus();await keyboard(page,kb);await settle(page);
          await page.waitForTimeout(400); // keepFieldVisible runs after the keyboard animation
          p=await parts(page);
          inside(p.submit,0,p.vh-kb,`${locale} ${what}: Save above the keyboard`);inside(p.cancel,0,p.vh-kb,`${locale} ${what}: Cancel above the keyboard`);
          inside(p.sheet,0,p.vh-kb,`${locale} ${what}: whole sheet above the keyboard`);
          const focused=await page.evaluate(()=>{const r=document.activeElement.getBoundingClientRect();return {top:r.top,bottom:r.bottom};});
          inside(focused,0,p.vh-kb,`${locale} ${what}: focused field`);
          await keyboard(page,0);await page.locator('dialog.form-sheet[open] .sheet-actions .btn-quiet').click();
          await page.waitForFunction(()=>!document.querySelector('dialog.form-sheet[open]'));
        };
        await open('/#/words/f/00000000-0000-4000-8000-00000000f001',()=>page.locator('.deck-row.new').click());await check('new deck');
        await open('/#/words/f/00000000-0000-4000-8000-00000000f001',()=>page.locator('.page-head .head-actions .icon-btn').first().click());await check('folder settings');
        await open('/#/words/all',async()=>{await page.locator('.word-main',{hasText:'resilient'}).click();await page.locator('.word-detail').waitFor();await page.locator('.word-detail .word-actions > button.btn').filter({has:page.locator('.lucide-pencil')}).click();});await check('edit card');
      }
      assert.deepEqual(errors,[]);await context.close();
    });
  });
}

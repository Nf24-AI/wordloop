// Issue #26 (UI, batch 2B) — the unified Add form in real engines (Chromium + WebKit, iPhone 390px):
// no kind picker, identical content/meaning boxes with language badges, several meanings, optional example,
// deck languages with an optional override, one green Save, ready for the next card.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {ENGINES,startServer,freshPage} from './harness.mjs';

let server;
before(async()=>{server=await startServer();});
after(async()=>{await server?.stop();});

const data=(page,fn,arg)=>page.evaluate(async([src,arg])=>{const m=await import('/src/data.ts');return new Function('m','arg',`return (${src})(m,arg)`)(m,arg);},[fn.toString(),arg]);
const stored=page=>page.evaluate(()=>new Promise(res=>{const r=indexedDB.open('wordloop-local-v1');r.onsuccess=()=>{const q=r.result.transaction('words').objectStore('words').getAll();q.onsuccess=()=>{r.result.close();res(q.result);};};}));
const openAdd=async(page,path='add')=>{await page.goto(server.base+'/#/'+path);await page.reload();await page.waitForSelector('#term');};
const save=page=>page.locator('form button[type=submit]').click();

for(const [name,engine] of Object.entries(ENGINES)){
  test(`[${name}] issue #26 unified add`,async t=>{
    const browser=await engine.launch();
    t.after(()=>browser.close());
    const base=()=>server.base;

    await t.test('ADD-01: «show» with «يُظهر» + «عرض (فيلم، منتج)» via one button; no kind picker; identical boxes with EN/AR badges only',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      await openAdd(page);
      assert.equal(await page.locator('[data-kind], [role=radiogroup]').count(),0,'no kind selection');
      assert.equal(await page.locator('#example').count(),0,'example hidden until asked for');
      await page.fill('#term','show');await page.fill('#meaning','يُظهر');
      await page.getByRole('button',{name:'إضافة معنى آخر'}).click();
      await page.locator('#meaning-1').waitFor();
      assert.equal(await page.evaluate(()=>document.activeElement?.id),'meaning-1','new meaning box is focused');
      await page.fill('#meaning-1','عرض (فيلم، منتج)');
      await page.evaluate(()=>document.activeElement?.blur());await page.waitForTimeout(250); // compare at rest, not the focus ring
      const boxes=await page.evaluate(()=>['term','meaning','meaning-1'].map(id=>{const b=document.getElementById(id).closest('.lang-box'),c=getComputedStyle(b),r=b.getBoundingClientRect();
        return {h:Math.round(r.height),w:Math.round(r.width),radius:c.borderRadius,border:c.borderTopWidth+' '+c.borderTopColor,badge:b.querySelector('.lang-badge').textContent,dir:document.getElementById(id).dir};}));
      assert.deepEqual(boxes.map(b=>b.badge),['EN','AR','AR']);
      assert.deepEqual(boxes.map(b=>b.dir),['ltr','rtl','rtl'],'direction follows the box language');
      for(const k of ['h','w','radius','border'])assert.equal(new Set(boxes.map(b=>b[k])).size,1,`same ${k} for every box`);
      const text=await page.locator('main').innerText();
      assert.ok(!/لغة المحتوى|لغة المعنى/.test(text),'no repeated language captions');
      assert.equal(await page.locator('form button[type=submit]').innerText(),'حفظ');
      assert.equal(await page.locator('form button[type=submit]').evaluate(b=>getComputedStyle(b).backgroundColor),'rgb(47, 125, 104)','green Save (--teal)');
      await save(page);await page.getByRole('status').filter({hasText:'حفظنا «show»'}).waitFor();
      const [w]=await stored(page);
      assert.deepEqual(w.meanings,['يُظهر','عرض (فيلم، منتج)']);assert.equal(w.meaning,'يُظهر');
      assert.equal(w.contentType,'vocabulary','safe internal kind');assert.equal(w.example,'');
      assert.equal(w.contentLanguage,undefined);assert.equal(w.meaningLanguage,undefined);
      await page.goto(base()+'/#/words/all');await page.locator('.word-main',{hasText:'show'}).waitFor();
      assert.match(await page.locator('.word-main').innerText(),/يُظهر؛ عرض \(فيلم، منتج\)/);
      await page.goto(base()+'/#/review');await page.locator('.reveal').click();
      await page.locator('main',{hasText:'عرض (فيلم، منتج)'}).waitFor();
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('ADD-02: example appears only when asked and is saved; extra meanings can be removed but never the last one; at most 10',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      await openAdd(page);
      assert.equal(await page.locator('.lang-box').filter({has:page.locator('#meaning')}).getByRole('button',{name:/احذف المعنى/}).count(),0,'the only meaning cannot be removed');
      await page.getByRole('button',{name:'إضافة جملة توضيحية'}).click();
      await page.locator('#example').waitFor();assert.equal(await page.evaluate(()=>document.activeElement?.id),'example');
      assert.equal(await page.getByRole('button',{name:'إضافة جملة توضيحية'}).count(),0);
      await page.getByRole('button',{name:'احذف الجملة التوضيحية'}).click();
      assert.equal(await page.locator('#example').count(),0);
      for(let i=1;i<10;i++)await page.getByRole('button',{name:'إضافة معنى آخر'}).click();
      assert.equal(await page.locator('[id^=meaning]').count(),10);
      assert.equal(await page.getByRole('button',{name:'إضافة معنى آخر'}).count(),0,'no 11th meaning');
      await page.getByRole('button',{name:'احذف المعنى 10'}).click();
      assert.equal(await page.locator('[id^=meaning]').count(),9);
      for(let n=9;n>1;n--)await page.getByRole('button',{name:`احذف المعنى ${n}`}).click();
      assert.equal(await page.locator('[id^=meaning]').count(),1);
      await page.fill('#term','I forgot my keys at home.');await page.fill('#meaning','نسيت مفاتيحي في البيت.');
      await page.getByRole('button',{name:'إضافة جملة توضيحية'}).click();await page.fill('#example','So I went back.');
      await save(page);await page.getByRole('status').filter({hasText:'«I forgot my keys at home.»'}).waitFor();
      const [w]=await stored(page);
      assert.equal(w.contentType,'sentence');assert.equal(w.example,'So I went back.');assert.deepEqual(w.meanings,['نسيت مفاتيحي في البيت.']);
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('ADD-03: missing text is refused in place; Enter saves; after a save the form is ready for the next card in the same deck',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      const deckId=await data(page,async m=>{const f=await m.createFolder('Work');return (await m.createDeck({folderId:f.id,name:'Meetings'})).id;});
      await openAdd(page,'add/'+encodeURIComponent(deckId));
      await save(page);
      await page.locator('#term-hint[role=alert]').waitFor();
      assert.equal(await page.evaluate(()=>document.activeElement?.id),'term');
      await page.fill('#term','agenda');await save(page);
      await page.locator('#meaning-hint[role=alert]').waitFor();
      assert.equal(await page.evaluate(()=>document.activeElement?.id),'meaning');
      assert.equal((await stored(page)).length,0,'nothing written');
      await page.fill('#meaning','جدول أعمال');await page.locator('#meaning').press('Enter');
      await page.getByRole('status').filter({hasText:'حفظنا «agenda»'}).waitFor();
      assert.equal(await page.inputValue('#term'),'');assert.equal(await page.inputValue('#meaning'),'');
      assert.equal(await page.inputValue('#add-deck'),deckId,'same deck for the next card');
      assert.equal(await page.evaluate(()=>document.activeElement?.id),'term');
      await page.fill('#term','minutes');await page.fill('#meaning','محضر');await page.locator('#meaning').press('Enter');
      await page.getByRole('status').filter({hasText:'«minutes»'}).waitFor();
      const rows=await stored(page);
      assert.equal(rows.length,2);assert.ok(rows.every(w=>w.deckId===deckId));
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('ADD-04: badges follow the deck languages; an optional override is stored on the card only when it differs',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      const deckId=await data(page,async m=>{const f=await m.createFolder('Idiomas');return (await m.createDeck({folderId:f.id,name:'Español',contentLanguage:'es-ES',meaningLanguage:'ar-SA'})).id;});
      await openAdd(page,'add/'+encodeURIComponent(deckId));
      const badges=()=>page.locator('.lang-box .lang-badge').allTextContents();
      assert.deepEqual(await badges(),['ES','AR']);
      assert.equal(await page.locator('#term').getAttribute('lang'),'es-ES');
      await page.fill('#term','hola');await page.fill('#meaning','مرحبا');await save(page);
      await page.getByRole('status').filter({hasText:'«hola»'}).waitFor();
      await page.click('.lang-pair');await page.selectOption('#add-content-lang','fr-FR');
      assert.deepEqual(await badges(),['FR','AR']);
      await page.fill('#term','bonjour');await page.fill('#meaning','صباح الخير');await save(page);
      await page.getByRole('status').filter({hasText:'«bonjour»'}).waitFor();
      const rows=await stored(page),hola=rows.find(w=>w.term==='hola'),bonjour=rows.find(w=>w.term==='bonjour');
      assert.equal(hola.contentLanguage,undefined,'deck language applies, nothing extra stored');
      assert.equal(bonjour.contentLanguage,'fr-FR');assert.equal(bonjour.meaningLanguage,undefined);
      await page.getByRole('button',{name:'ارجع للغات الحزمة'}).click();
      assert.deepEqual(await badges(),['ES','AR']);
      assert.deepEqual(errors,[]);await context.close();
    });
  });
}

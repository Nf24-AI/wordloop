// Issue #25 — simplified card details in «مكتبتي» (Chromium + WebKit, 390px): no redundant rows, optional learning
// details, Edit keeps the schedule, Remove lives in ••• with confirmation and only archives.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {ENGINES,startServer,freshPage,addCard} from './harness.mjs';

let server;
before(async()=>{server=await startServer();});
after(async()=>{await server?.stop();});

const data=(page,fn,arg)=>page.evaluate(async([src,arg])=>{const m=await import('/src/data.ts');return new Function('m','arg',`return (${src})(m,arg)`)(m,arg);},[fn.toString(),arg]);
const raw=page=>page.evaluate(()=>new Promise(res=>{const r=indexedDB.open('wordloop-local-v1');r.onsuccess=()=>{const db=r.result,tx=db.transaction(['words','reviews']),out={};let n=0;for(const s of ['words','reviews']){const q=tx.objectStore(s).getAll();q.onsuccess=()=>{out[s]=q.result;if(++n===2){db.close();res(out);}};}};}));
const open=async(page,term)=>{await page.goto(server.base+'/#/words/all');await page.reload();await page.locator('.word-main',{hasText:term}).click();await page.locator('.word-detail').waitFor();};

for(const [name,engine] of Object.entries(ENGINES)){
  test(`[${name}] issue #25 card details`,async t=>{
    const browser=await engine.launch();
    t.after(()=>browser.close());
    const base=()=>server.base;

    await t.test('CARD-01: expanded card shows content + deck, not kind/«عام»/stage/«لسا»/next-review rows; learning details are optional',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      await page.goto(base()+'/#/add');await page.waitForSelector('#term');
      await page.fill('#term','overlook');await page.fill('#meaning','يغفل عن');await page.fill('#example','I overlooked an important email.');await page.fill('#translation','فاتتني رسالة مهمة.');
      await page.click('form button[type=submit]');await page.getByRole('status').filter({hasText:'«overlook»'}).waitFor();
      await open(page,'overlook');
      const detail=page.locator('.word-detail');
      const visible=await detail.evaluate(el=>{const c=el.cloneNode(true);c.querySelector('details')?.remove();return c.textContent;});
      for(const bad of ['النوع','التصنيف','عام','المرحلة','لسا','المراجعة الجاية','وقت مراجعتها'])assert.ok(!visible.includes(bad),`no «${bad}» by default`);
      assert.match(visible,/I overlooked an important email\./);assert.match(visible,/فاتتني رسالة مهمة\./);
      assert.match(visible,/الحزمة:\s*غير مصنفة · بطاقاتي/);
      assert.equal(visible.split('غير مصنفة · بطاقاتي').length-1+(await page.locator('.word-main .word-place').count()),1,'the deck appears once on an open card');
      assert.equal(await page.locator('.word-list .due-pill').count(),1,'one due state per card');
      assert.equal(await detail.locator('.btn.danger').count(),0,'no red delete button in the card');
      assert.equal(await detail.locator('details[open]').count(),0,'learning details collapsed by default');
      await detail.locator('summary',{hasText:'تفاصيل التعلم'}).click();
      const learn=await detail.locator('details .word-meta').innerText();
      assert.match(learn,/مرحلة التعلم/);assert.match(learn,/ما راجعتها للحين/);assert.match(learn,/المراجعة الجاية/);
      assert.ok(!/fsrs|stability|difficulty/i.test(learn),'no raw FSRS');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('CARD-02: Edit changes content only — id, deck, dueAt, FSRS, revision and reviews stay identical; duplicates are refused',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      await addCard(page,base(),'show','يُظهر');await page.getByRole('status').filter({hasText:'«show»'}).waitFor();
      await addCard(page,base(),'display','يعرض',{navigate:false});await page.getByRole('status').filter({hasText:'«display»'}).waitFor();
      await data(page,async m=>{const w=(await m.listWords()).find(x=>x.term==='show');await m.editWord(w.id,{meanings:['يُظهر','عرض (فيلم، منتج)']});});
      const before=await raw(page);const b=before.words.find(w=>w.term==='show');
      await open(page,'show');
      await page.locator('.word-detail').getByRole('button',{name:'عدّلها'}).click();
      await page.locator('dialog[open] #edit-meaning-1').waitFor();
      assert.equal(await page.inputValue('#edit-meaning-0'),'يُظهر');assert.equal(await page.inputValue('#edit-meaning-1'),'عرض (فيلم، منتج)');
      // Duplicate term (another active card of the same kind) is refused in place.
      await page.fill('#edit-term','display');await page.locator('dialog[open] button[type=submit]').click();
      await page.locator('dialog[open] .inline-error').waitFor();
      assert.equal((await raw(page)).words.find(w=>w.id===b.id).term,'show','nothing written');
      await page.fill('#edit-term','shows');await page.fill('#edit-meaning-0','يبيّن');
      await page.locator('dialog[open] button[type=submit]').click();
      await page.getByRole('status').filter({hasText:'«shows»'}).waitFor();
      const row=page.locator('.word-main',{hasText:'shows'});await row.waitFor();
      assert.match(await row.innerText(),/يبيّن؛ عرض \(فيلم، منتج\)/,'list updates immediately');
      const after=await raw(page);const a=after.words.find(w=>w.id===b.id);
      assert.equal(after.words.length,before.words.length);
      for(const k of ['id','deckId','contentType','createdAt','dueAt','revision','archived'])assert.deepEqual(a[k],b[k],k);
      assert.deepEqual(a.fsrsState,b.fsrsState);assert.deepEqual(after.reviews,before.reviews);
      assert.deepEqual(a.meanings,['يبيّن','عرض (فيلم، منتج)']);assert.equal(a.meaning,'يبيّن');
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('CARD-03: Archive is in the ••• sheet, says it is not a deletion, needs confirmation, and only archives',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      await addCard(page,base(),'resilient','مرن');await page.getByRole('status').filter({hasText:'«resilient»'}).waitFor();
      await open(page,'resilient');
      await page.getByRole('button',{name:'خيارات أكثر لـ«resilient»'}).click();
      const sheet=page.getByRole('dialog',{name:'وش تبي تسوي بـ«resilient»؟'});await sheet.waitFor();
      await sheet.getByRole('button',{name:'أرشفها (بدون حذف)'}).click();
      const confirm=page.getByRole('dialog',{name:'تأرشف «resilient»؟'});await confirm.waitFor();
      assert.match(await confirm.innerText(),/الأرشفة مو حذف/);assert.ok(!/(احذف|حذفنا|شيل)/.test(await confirm.innerText()),'no deletion wording');
      await confirm.getByRole('button',{name:'لا، خلها'}).click();
      assert.equal((await raw(page)).words[0].archived,false,'cancel keeps the card');
      await page.getByRole('button',{name:'خيارات أكثر لـ«resilient»'}).click();await sheet.getByRole('button',{name:'أرشفها (بدون حذف)'}).click();
      await confirm.getByRole('button',{name:'إيه، أرشفها'}).click();
      await page.getByRole('status').filter({hasText:'أرشفنا «resilient»'}).waitFor();
      const w=(await raw(page)).words;
      assert.equal(w.length,1,'still stored');assert.equal(w[0].archived,true);
      await page.locator('main .empty').waitFor();
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('CARD-04: opening «تفاصيل التعلم» on the last card scrolls it fully above the bottom tab bar',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      await data(page,async m=>{for(let i=0;i<12;i++)await m.addWord({contentType:'vocabulary',term:'term'+String(i).padStart(2,'0'),meaning:'معنى '+i,example:'',translation:'',note:'',tag:''});});
      await page.goto(base()+'/#/words/all');await page.reload();await page.locator('.word-list .word').nth(11).waitFor();
      const last=page.locator('.word-list .word').last();
      await last.locator('.word-main').click();
      await page.evaluate(()=>{const s=document.querySelector('.word-list .word:last-child summary');window.scrollTo(0,s.getBoundingClientRect().top+scrollY-innerHeight+150);});
      await last.locator('summary').click();await page.waitForTimeout(700);
      const r=await page.evaluate(()=>{const bar=document.querySelector('.tabbar').getBoundingClientRect(),d=document.querySelector('.word-list .word:last-child details').getBoundingClientRect();return {bar:bar.top,end:d.bottom,top:d.top};});
      assert.ok(r.end<=r.bar+0.5,`details end at ${r.end}, tab bar at ${r.bar}`);assert.ok(r.top>=0);
      assert.deepEqual(errors,[]);await context.close();
    });
  });
}

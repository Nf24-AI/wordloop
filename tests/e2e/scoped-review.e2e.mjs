// Issue #17 — scoped due review in real engines (Chromium + WebKit, iPhone 390px): «راجع هذه الحزمة / هذا المجلد»
// reviews only what is due in that place, shows real counters, explains when nothing is due and leads back to the full review.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {ENGINES,startServer,freshPage} from './harness.mjs';

let server;
before(async()=>{server=await startServer();});
after(async()=>{await server?.stop();});

const data=(page,fn,arg)=>page.evaluate(async([src,arg])=>{const m=await import('/src/data.ts');return new Function('m','arg',`return (${src})(m,arg)`)(m,arg);},[fn.toString(),arg]);
const hashOf=page=>page.evaluate(()=>location.hash);
const reviews=page=>page.evaluate(()=>new Promise(res=>{const r=indexedDB.open('wordloop-local-v1');r.onsuccess=()=>{const q=r.result.transaction('reviews').objectStore('reviews').getAll();q.onsuccess=()=>{r.result.close();res(q.result);};};}));
/** Work (Meetings 2, Email 2) + Languages (Español 2); every card due now. */
const seed=page=>data(page,async m=>{
  const work=await m.createFolder('Work'),lang=await m.createFolder('Languages');
  const meet=await m.createDeck({folderId:work.id,name:'Meetings'}),mail=await m.createDeck({folderId:work.id,name:'Email'});
  const es=await m.createDeck({folderId:lang.id,name:'Español',contentLanguage:'es-ES',meaningLanguage:'ar-SA'});
  const card=(term,deckId)=>({term,meanings:['معنى '+term],example:'',translation:'',tag:'',contentType:'vocabulary',deckId});
  for(const [d,ts] of [[meet,['agenda','minutes']],[mail,['regards','cc']],[es,['hola','gracias']]])for(const t of ts)await m.addWord(card(t,d.id));
  return {work:work.id,lang:lang.id,meet:meet.id,mail:mail.id,es:es.id};
});
/** Reviews every card in the open session with «تذكرتها»; returns the terms seen, in order. */
async function reviewAll(page){
  const seen=[];
  while(await page.locator('.review .reveal').count()){
    seen.push(await page.locator('.review .term').innerText());
    await page.locator('.review .reveal').click();await page.locator('.grade.g-good').click();
    await page.waitForFunction(n=>document.querySelector('.finish')||document.querySelector('.review-count b')?.textContent===String(n+1),seen.length);
  }
  return seen;
}

for(const [name,engine] of Object.entries(ENGINES)){
  test(`[${name}] issue #17 scoped review`,async t=>{
    const browser=await engine.launch();
    t.after(()=>browser.close());
    const base=()=>server.base;

    await t.test('SCOPE-01: a deck shows real counters; «راجع هذه الحزمة» reviews only its due cards; the finish offers the full review',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      const ids=await seed(page);
      await page.goto(base()+'/#/words/d/'+encodeURIComponent(ids.meet));await page.reload();
      const panel=page.locator('.scope-panel');await panel.waitFor();
      assert.match(await panel.locator('.scope-facts').innerText(),/تنتظر الحين\s*2/);
      assert.match(await panel.locator('.scope-facts').innerText(),/راجعتها اليوم\s*0/);
      const btn=panel.getByRole('button',{name:'راجع هذه الحزمة (2)'});
      const fits=await btn.evaluate(b=>{const r=b.getBoundingClientRect(),nav=document.querySelector('.tabbar, nav.tabs, .bottom-nav');return r.right<=innerWidth&&r.left>=0&&(!nav||r.bottom<=nav.getBoundingClientRect().top||r.bottom<=innerHeight);});
      assert.ok(fits,'review button inside the screen, above the bottom navigation');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal scroll');
      await btn.click();
      assert.equal(await hashOf(page),'#/review/d/'+encodeURIComponent(ids.meet));
      assert.match(await page.locator('.scope-chip').innerText(),/تراجع حزمة\s*Meetings/);
      assert.match(await page.locator('.review-count').innerText(),/1\s*من\s*2/);
      const seen=await reviewAll(page);
      assert.deepEqual(seen.sort(),['agenda','minutes'],'only this deck');
      await page.locator('.finish h1',{hasText:'خلصت مراجعتك'}).waitFor();
      assert.equal((await reviews(page)).length,2,'one FSRS review per card, nothing extra');
      await page.getByRole('button',{name:'راجع كل المستحق (4)'}).click();
      assert.equal(await hashOf(page),'#/review');
      assert.match(await page.locator('.review-count').innerText(),/1\s*من\s*4/);
      assert.equal(await page.locator('.scope-chip').count(),0,'the full review has no scope chip');
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('SCOPE-02: «راجع هذا المجلد» covers every deck in the folder and nothing outside it; «راجع الكل» switches to the full review',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      const ids=await seed(page);
      await page.goto(base()+'/#/words/f/'+encodeURIComponent(ids.work));await page.reload();
      await page.getByRole('button',{name:'راجع هذا المجلد (4)'}).click();
      assert.match(await page.locator('.scope-chip').innerText(),/تراجع مجلد\s*Work/);
      assert.match(await page.locator('.review-count').innerText(),/1\s*من\s*4/);
      const first=await page.locator('.review .term').innerText();
      assert.ok(['agenda','minutes','regards','cc'].includes(first));
      await page.getByRole('button',{name:'راجع الكل'}).click();await page.locator('.scope-chip').waitFor({state:'detached'});
      assert.equal(await hashOf(page),'#/review');
      assert.match(await page.locator('.review-count').innerText(),/1\s*من\s*6/);
      await page.goto(base()+'/#/review/f/'+encodeURIComponent(ids.work));
      const seen=await reviewAll(page);
      assert.deepEqual(seen.sort(),['agenda','cc','minutes','regards']);
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('SCOPE-03: nothing due here → the deck says when the next review is and offers the full review; the scoped review explains it; an unknown place falls back to all',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      const ids=await seed(page);
      await data(page,async(m,es)=>{for(const w of await m.listWords())if(w.deckId===es)await m.reviewWord(w.id,'easy');},ids.es);
      await page.goto(base()+'/#/words/d/'+encodeURIComponent(ids.es));await page.reload();
      const panel=page.locator('.scope-panel');await panel.waitFor();
      assert.match(await panel.locator('.scope-facts').innerText(),/تنتظر الحين\s*0/);
      assert.match(await panel.locator('.scope-facts').innerText(),/راجعتها اليوم\s*2/);
      assert.match(await panel.locator('.scope-rest').innerText(),/ما فيه شي مستحق هنا الحين\. أقرب مراجعة/);
      assert.equal(await panel.getByRole('button',{name:/راجع هذه الحزمة/}).count(),0,'no review button when nothing is due');
      assert.equal(await page.locator('.deck-actions .btn-ink').count(),1,'adding a card is the main action again');
      await panel.getByRole('button',{name:'راجع كل المستحق (4)'}).click();
      assert.equal(await hashOf(page),'#/review');
      await page.goto(base()+'/#/review/d/'+encodeURIComponent(ids.es));
      await page.locator('.finish h1',{hasText:'ما فيه شي مستحق في هذه الحزمة'}).waitFor();
      assert.match(await page.locator('.finish .lead').innerText(),/أقرب مراجعة هنا/);
      await page.getByRole('button',{name:'ارجع للحزمة'}).click();
      assert.equal(await hashOf(page),'#/words/d/'+encodeURIComponent(ids.es));
      await page.goto(base()+'/#/review/d/not-a-deck');
      assert.match(await page.locator('.review-count').innerText(),/1\s*من\s*4/,'unknown place → full review, never an empty queue');
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('SCOPE-04: English labels; a moved card is reviewed in its new deck and keeps its review history',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      const ids=await seed(page);
      await page.goto(base()+'/#/settings');await page.click('.lang-switch [data-locale=en]');await page.waitForFunction(()=>document.documentElement.lang==='en');
      const moved=await data(page,async(m,{meet,es})=>{const w=(await m.listWords()).find(x=>x.term==='agenda');await m.reviewWord(w.id,'again');await m.moveWord(w.id,es);return w.id;},ids);
      const before=(await reviews(page)).filter(r=>r.wordId===moved);
      await page.goto(base()+'/#/words/d/'+encodeURIComponent(ids.es));await page.reload();
      const panel=page.locator('.scope-panel');await panel.waitFor();
      assert.match(await panel.locator('.scope-facts').innerText(),/Due now\s*2/);
      assert.match(await panel.locator('.scope-facts').innerText(),/Reviewed today\s*1/,'the moved card’s attempt counts in its new deck');
      await panel.getByRole('button',{name:'Review this deck (2)'}).click();
      assert.match(await page.locator('.scope-chip').innerText(),/Reviewing deck\s*Español/);
      assert.deepEqual((await reviews(page)).filter(r=>r.wordId===moved),before,'old review events kept as they were');
      await page.goto(base()+'/#/words/d/'+encodeURIComponent(ids.meet));await page.reload();
      assert.match(await page.locator('.scope-panel .scope-facts').innerText(),/Due now\s*1/);
      assert.deepEqual(errors,[]);await context.close();
    });
  });
}

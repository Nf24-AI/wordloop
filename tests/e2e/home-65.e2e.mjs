// Issue #65 — Home: no empty «next review» tile when nothing is upcoming; a card with no meaning says so (Chromium + WebKit).
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {ENGINES,startServer,freshPage} from './harness.mjs';

let server;
before(async()=>{server=await startServer();});
after(async()=>{await server?.stop();});

const H=3_600_000,D=86_400_000;
/** Seed cards: [term, meaning, dueInMs, ageMs]. An empty meaning models a legacy card with no text. */
const seed=(page,cards)=>page.evaluate(cards=>new Promise(res=>{
  const now=Date.now(),iso=ms=>new Date(ms).toISOString();
  const words=cards.map(([term,meaning,dueIn,age],i)=>{const id='s'+i,dueAt=iso(now+dueIn);return {id,contentType:'vocabulary',note:'',term,meaning,example:'',translation:'',tag:'عام',createdAt:iso(now-age),updatedAt:iso(now),dueAt,fsrsState:{cardId:id,dueAt},archived:false,revision:0};});
  const r=indexedDB.open('wordloop-local-v1');r.onsuccess=()=>{const tx=r.result.transaction('words','readwrite');for(const w of words)tx.objectStore('words').put(w);tx.oncomplete=()=>{r.result.close();res();};};
}),cards);

for(const [name,engine] of Object.entries(ENGINES)){
  test(`[${name}] issue #65 home dashboard`,async t=>{
    const browser=await engine.launch();
    t.after(()=>browser.close());

    await t.test('due now, nothing upcoming: the next tile shows the ready message, never a blank term',async()=>{
      const {context,page,errors}=await freshPage(browser,server.base);
      await seed(page,[['alpha','ألف',-H,2*D]]);await page.reload();await page.waitForSelector('.facts');
      assert.match(await page.locator('[data-home=next]').innerText(),/كل بطاقاتك جاهزة الحين/);
      assert.equal(await page.locator('[data-home=next] .home-term').count(),0);
      assert.deepEqual(errors,[]);
      await context.close();
    });

    await t.test('due now and an upcoming card: next-review tile names the card',async()=>{
      const {context,page}=await freshPage(browser,server.base);
      await seed(page,[['gamma','جيم',-H,2*D],['delta','دال',2*D,D]]);await page.reload();await page.waitForSelector('.facts');
      assert.match(await page.locator('[data-home=next] .home-term').innerText(),/delta/);
      await context.close();
    });

    await t.test('latest card without a meaning shows the no-meaning hint, not an empty line',async()=>{
      const {context,page}=await freshPage(browser,server.base);
      await seed(page,[['beta','',D+2*H,2*D]]);await page.reload();await page.waitForSelector('.facts');
      const last=page.locator('[data-home=last-added]');
      assert.match(await last.innerText(),/beta/);
      assert.match(await last.innerText(),/ما كتبت معنى لهذي البطاقة بعد/);
      await context.close();
    });
  });
}

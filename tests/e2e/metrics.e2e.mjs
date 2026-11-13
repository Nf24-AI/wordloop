// Issue #10 — the home counters shown to the user (Chromium + WebKit).
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {ENGINES,startServer,freshPage} from './harness.mjs';

let server;
before(async()=>{server=await startServer();});
after(async()=>{await server?.stop();});

const seed=page=>page.evaluate(()=>new Promise(res=>{
  const now=Date.now(),iso=ms=>new Date(ms).toISOString();
  const mk=(id,dueIn,archived=false)=>{const dueAt=iso(now+dueIn);return {id,contentType:'vocabulary',note:'',term:id,meaning:'م',example:'',translation:'',tag:'عام',createdAt:iso(now),updatedAt:iso(now),dueAt,fsrsState:{cardId:id,dueAt},archived,revision:0};};
  const words=[mk('due-card',-60_000),mk('in-3-days',3*86_400_000),mk('in-20-days',20*86_400_000),mk('archived',-60_000,true)];
  const reviews=['again','again','hard','good'].map((g,i)=>({id:'r'+i,wordId:'in-3-days',grade:g,reviewedAt:iso(now-(5-i)*1000),nextDueAt:iso(now)}));
  const r=indexedDB.open('wordloop-local-v1');r.onsuccess=()=>{const tx=r.result.transaction(['words','reviews'],'readwrite');for(const w of words)tx.objectStore('words').put(w);for(const x of reviews)tx.objectStore('reviews').put(x);tx.oncomplete=()=>{r.result.close();res();};};
}));

for(const [name,engine] of Object.entries(ENGINES)){
  test(`[${name}] MET-01/02 home counters`,async()=>{
    const browser=await engine.launch();
    try{
      const {context,page}=await freshPage(browser,server.base);
      await seed(page);await page.reload();await page.waitForSelector('.facts');
      const facts=Object.fromEntries(await page.locator('.facts>div').evaluateAll(els=>els.map(el=>[el.querySelector('dt').textContent,el.querySelector('dd').textContent])));
      assert.deepEqual(facts,{'في مكتبتك':'3بطاقات','راجعتها اليوم':'1بطاقة','مجدولة في الأيام السبعة الجاية':'1بطاقة'});
      assert.match(await page.locator('.fact-note').textContent(),/4 محاولات/);
      assert.match(await page.locator('.hero-count').textContent(),/^1بطاقة تنتظرك الحين$/);
      await context.close();
    }finally{await browser.close();}
  });
}

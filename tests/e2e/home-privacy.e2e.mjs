// Issues #7 / #11 — useful, data-grounded Home; privacy explanation lives in Settings (Chromium + WebKit).
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {ENGINES,startServer,freshPage,addCard} from './harness.mjs';

let server;
before(async()=>{server=await startServer();});
after(async()=>{await server?.stop();});

const H=3_600_000,D=86_400_000;
/** Seed cards: [term, contentType, dueInMs, ageMs]. */
const seed=(page,cards)=>page.evaluate(cards=>new Promise(res=>{
  const now=Date.now(),iso=ms=>new Date(ms).toISOString();
  const words=cards.map(([term,kind,dueIn,age],i)=>{const id='s'+i,dueAt=iso(now+dueIn);return {id,contentType:kind,note:'',term,meaning:'معنى '+term,example:'',translation:'',tag:'عام',createdAt:iso(now-age),updatedAt:iso(now),dueAt,fsrsState:{cardId:id,dueAt},archived:false,revision:0};});
  const r=indexedDB.open('wordloop-local-v1');r.onsuccess=()=>{const tx=r.result.transaction('words','readwrite');for(const w of words)tx.objectStore('words').put(w);tx.oncomplete=()=>{r.result.close();res();};};
}),cards);
const homeText=page=>page.locator('main').innerText();
/** The old Home privacy copy (#7: must no longer be on Home). */
const OLD_PRIVACY=/ما نرفع كلماتك|كلماتك تبقى على جهازك/;

for(const [name,engine] of Object.entries(ENGINES)){
  test(`[${name}] issues #7/#11 home + privacy`,async t=>{
    const browser=await engine.launch();
    t.after(()=>browser.close());
    const base=()=>server.base;

    await t.test('HOME-01 empty: one CTA, no privacy block, a quiet link to Privacy & data',async()=>{
      const {context,page}=await freshPage(browser,base());
      assert.equal(await page.locator('main .btn-ink').count(),1);
      assert.doesNotMatch(await homeText(page),OLD_PRIVACY);
      assert.equal(await page.locator('[data-home]').count(),0,'no last-added / next tiles without cards');
      assert.equal(await page.locator('.tip').count(),0,'no tip before the first card');
      await page.locator('main .privacy-line').click();
      assert.equal(await page.evaluate(()=>location.hash),'#/settings');
      await page.getByRole('heading',{name:'الخصوصية والبيانات'}).waitFor();
      await context.close();
    });

    await t.test('HOME-01 one card, nothing due: last added shown; next review lives in the hero only',async()=>{
      const {context,page}=await freshPage(browser,base());
      await seed(page,[['serendipity','vocabulary',D+H,2*H]]);await page.reload();await page.waitForSelector('.facts');
      const last=page.locator('[data-home=last-added]');
      assert.match(await last.innerText(),/serendipity/);
      assert.match(await last.innerText(),/أضفتها اليوم/);
      assert.match(await last.innerText(),/مفردة/);
      assert.equal(await page.locator('[data-home=next]').count(),0);
      assert.match(await page.locator('.hero .lead').innerText(),/أقرب مراجعة بكرة/);
      assert.equal(await page.locator('.tip').count(),1);
      assert.doesNotMatch(await homeText(page),OLD_PRIVACY);
      await last.click();
      assert.equal(await page.evaluate(()=>location.hash),'#/words');
      await context.close();
    });

    await t.test('HOME-01 one card, due: the next tile says everything is ready (no invented date)',async()=>{
      const {context,page}=await freshPage(browser,base());
      await seed(page,[['serendipity','vocabulary',-60_000,2*D]]);await page.reload();await page.waitForSelector('.facts');
      assert.match(await page.locator('[data-home=next]').innerText(),/كل بطاقاتك جاهزة الحين/);
      assert.match(await page.locator('[data-home=last-added]').innerText(),/serendipity[\s\S]*أضفتها/);
      await context.close();
    });

    await t.test('HOME-01 many cards, some due: newest card and nearest upcoming review come from the data',async()=>{
      const {context,page}=await freshPage(browser,base());
      await seed(page,[['overlook','vocabulary',-60_000,9*D],['in charge of','phrase',-H,4*D],['Break a leg','idiom',3*D,D],['far away','phrase',9*D,3*D],['Could you walk me through it?','sentence',6*D,20*60_000]]);
      await page.reload();await page.waitForSelector('.facts');
      assert.match(await page.locator('[data-home=last-added]').innerText(),/Could you walk me through it\?[\s\S]*جملة/);
      const next=await page.locator('[data-home=next]').innerText();
      assert.match(next,/Break a leg/);assert.match(next,/بعد 3 أيام/);
      assert.equal(await page.locator('main .btn-ink').count(),1,'still one primary CTA (#8)');
      assert.equal(await page.locator('.hero-count b').innerText(),'2');
      await context.close();
    });

    await t.test('HOME-01 tip is stable within a day and in the UI language',async()=>{
      const {context,page}=await freshPage(browser,base());
      await seed(page,[['overlook','vocabulary',D,D]]);await page.reload();await page.waitForSelector('.tip');
      const first=await page.locator('.tip').innerText();
      await page.reload();await page.waitForSelector('.tip');
      assert.equal(await page.locator('.tip').innerText(),first);
      await page.evaluate(()=>localStorage.setItem('wordloop-locale','en'));await page.reload();await page.waitForSelector('.tip');
      assert.match(await page.locator('.tip').innerText(),/^Today’s tip/);
      assert.match(await page.locator('[data-home=last-added]').innerText(),/Added yesterday/);
      await context.close();
    });

    await t.test('HOME-02/03: Settings → Privacy & data is first, accurate, and names the push metadata exception',async()=>{
      const {context,page}=await freshPage(browser,base());
      await page.goto(base()+'/#/settings');
      const section=page.locator('#privacy');
      await section.waitFor();
      const text=await section.innerText();
      assert.match(text,/الخصوصية والبيانات/);
      assert.match(text,/على جهازك بس/);
      for(const part of [/عنوان الإشعارات/,/رمز عشوائي/,/موعد أقرب مراجعة/,/ما نرسل نص بطاقاتك ولا معانيها ولا مراجعاتك/,/نحذف بيانات جهازك من الخادم/])assert.match(text,part);
      const order=await page.locator('main section').evaluateAll(s=>s.map(x=>x.id||x.getAttribute('aria-labelledby')));
      assert.equal(order[0],'privacy','privacy is the first section in Settings');
      assert.equal(await page.locator('.rail-privacy').count(),1,'desktop rail keeps a quiet privacy link');
      await context.close();
    });

    await t.test('SEC-06 / HOME-03: ordinary study flows send nothing to any server',async()=>{
      const {context,page}=await freshPage(browser,base());
      const sent=[];
      page.on('request',r=>{const u=new URL(r.url());if(r.method()!=='GET'||u.pathname.startsWith('/api/'))sent.push(`${r.method()} ${u.pathname} ${r.postData()||''}`);});
      await addCard(page,base(),'clandestine','سري');await page.waitForSelector('.toast');
      await page.goto(base()+'/#/words');await page.waitForSelector('.word-list');
      await page.goto(base()+'/#/');await page.waitForSelector('[data-home=last-added]');
      await page.goto(base()+'/#/stats');await page.waitForSelector('main h1');
      assert.deepEqual(sent,[],'no POST and no /api calls without push enabled');
      await context.close();
    });
  });
}

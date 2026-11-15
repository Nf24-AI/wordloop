// Issues #5 / #12 — the four stored card kinds stay supported (badges, idiom note, review, filter) in real engines.
// Since #26 the Add form no longer offers a kind; legacy-kind cards are created through the app's own data module.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {ENGINES,startServer,freshPage,libraryTerms} from './harness.mjs';

let server;
before(async()=>{server=await startServer();});
after(async()=>{await server?.stop();});

/** Creates a card of a given (legacy) kind through the app's data module, then waits for the app to show it. */
async function addTyped(page,base,kind,fields,{navigate=true}={}){
  if(navigate){await page.goto(base+'/#/words/all');await page.waitForSelector('main h1');}
  await page.evaluate(async([kind,f])=>{const m=await import('/src/data.ts');await m.addWord({contentType:kind,example:'',translation:'',note:'',tag:'',...f});},[kind,fields]);
}
const stored=page=>page.evaluate(()=>new Promise(res=>{const r=indexedDB.open('wordloop-local-v1');r.onsuccess=()=>{const q=r.result.transaction('words').objectStore('words').getAll();q.onsuccess=()=>{r.result.close();res(q.result);};};}));

for(const [name,engine] of Object.entries(ENGINES)){
  test(`[${name}] issues #5/#12 card kinds`,async t=>{
    const browser=await engine.launch();
    t.after(()=>browser.close());
    const base=()=>server.base;

    await t.test('TYPE-01/03: add one of each kind; Library shows kind badges and an idiom keeps its explanation',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      await addTyped(page,base(),'vocabulary',{term:'overlook',meaning:'يغفل عن'});
      await addTyped(page,base(),'phrase',{term:'in charge of',meaning:'مسؤول عن',example:"I'm in charge of it."});
      await addTyped(page,base(),'sentence',{term:'I forgot my keys at home, so I had to go back.',meaning:'نسيت مفاتيحي في البيت فرجعت.',note:'لما تتأخر'});
      await addTyped(page,base(),'idiom',{term:'break the ice',meaning:'يكسر الحاجز ويبدأ الكلام',note:'ما له علاقة بالثلج',example:'He told a joke to break the ice.'});
      const rows=await stored(page);
      assert.deepEqual(Object.fromEntries(rows.map(w=>[w.term,w.contentType])),{'overlook':'vocabulary','in charge of':'phrase','I forgot my keys at home, so I had to go back.':'sentence','break the ice':'idiom'});
      assert.equal(rows.find(w=>w.contentType==='idiom').note,'ما له علاقة بالثلج');
      await page.goto(base()+'/#/words/all');await page.reload();await page.waitForSelector('.word-list');
      const badges=await page.locator('.word-list .kind-badge').allTextContents();
      assert.deepEqual(badges.sort(),['تعبير اصطلاحي','جملة','عبارة','مفردة'].sort());
      await page.locator('.word-main',{hasText:'break the ice'}).click();
      await page.locator('.word-detail .note',{hasText:'ما له علاقة بالثلج'}).waitFor();
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('TYPE-02: same text as phrase and idiom coexist in data; the unified form refuses a duplicate and keeps the typed text',async()=>{
      const {context,page}=await freshPage(browser,base());
      await addTyped(page,base(),'phrase',{term:'break the ice',meaning:'يكسر الثلج'});
      await addTyped(page,base(),'idiom',{term:'break the ice',meaning:'يكسر الحاجز'},{navigate:false});
      assert.equal((await stored(page)).length,2);
      await page.goto(base()+'/#/add');await page.reload();await page.waitForSelector('#term');
      await page.fill('#term','Break  The Ice');await page.fill('#meaning','ثاني');
      await page.click('form button[type=submit]');
      await page.locator('#term-hint[role=alert]').waitFor();
      assert.equal(await page.inputValue('#term'),'Break  The Ice');
      assert.equal((await stored(page)).length,2);
      await context.close();
    });

    await t.test('Library kind filter narrows and clears',async()=>{
      const {context,page}=await freshPage(browser,base());
      await addTyped(page,base(),'vocabulary',{term:'overlook',meaning:'يغفل عن'});
      await addTyped(page,base(),'idiom',{term:'break the ice',meaning:'يكسر الحاجز'});
      await page.goto(base()+'/#/words/all');await page.reload();await page.waitForSelector('.word-list');
      await page.getByRole('group',{name:'نوع البطاقة'}).getByRole('button',{name:/تعبير اصطلاحي/}).click();
      await page.locator('.word-list .word').nth(1).waitFor({state:'detached'});
      assert.deepEqual(await libraryTerms(page,base(),{navigate:false}),['break the ice']);
      await page.getByRole('button',{name:'كل الأنواع'}).click();
      await page.locator('.word-list .word').nth(1).waitFor();
      await context.close();
    });

    await t.test('TYPE-05 (UI): review shows the kind and idiomatic meaning; grading works for every kind',async()=>{
      const {context,page}=await freshPage(browser,base());
      await addTyped(page,base(),'vocabulary',{term:'overlook',meaning:'يغفل عن'});
      await addTyped(page,base(),'phrase',{term:'in charge of',meaning:'مسؤول عن'});
      await addTyped(page,base(),'sentence',{term:'I forgot my keys.',meaning:'نسيت مفاتيحي.'});
      await addTyped(page,base(),'idiom',{term:'break the ice',meaning:'يكسر الحاجز',note:'ما له علاقة بالثلج'});
      await page.goto(base()+'/#/review');await page.reload();
      const seen=new Set();
      for(let i=0;i<4;i++){
        await page.locator('.reveal').waitFor();
        const badge=await page.locator('.card .kind-badge').textContent();seen.add(badge);
        await page.click('.reveal');
        if(badge==='تعبير اصطلاحي'){await page.locator('.answer-label',{hasText:'المعنى الاصطلاحي'}).waitFor();await page.locator('.answer .note',{hasText:'ما له علاقة بالثلج'}).waitFor();}
        await page.locator('.grade.g-good').click();
        await page.waitForFunction(n=>document.querySelector('.review-count b')?.textContent!==String(n)||!document.querySelector('.reveal'),i+1);
      }
      assert.equal(seen.size,4);
      await page.locator('.finish').waitFor();
      const reviews=await page.evaluate(()=>new Promise(res=>{const r=indexedDB.open('wordloop-local-v1');r.onsuccess=()=>{const q=r.result.transaction('reviews').objectStore('reviews').getAll();q.onsuccess=()=>{r.result.close();res(q.result);};};}));
      assert.equal(reviews.length,4);
      await context.close();
    });

    await t.test('legacy card (no contentType) shows as vocabulary; a v1 backup file restores through Settings',async()=>{
      const {context,page}=await freshPage(browser,base());
      const now=new Date().toISOString();
      const legacy={id:'legacy-1',term:'legacy',meaning:'قديم',example:'',translation:'',tag:'عام',createdAt:now,updatedAt:now,dueAt:now,fsrsState:{cardId:'legacy-1',dueAt:now},archived:false,revision:0};
      await page.evaluate(w=>new Promise(res=>{const r=indexedDB.open('wordloop-local-v1');r.onsuccess=()=>{const tx=r.result.transaction('words','readwrite');tx.objectStore('words').put(w);tx.oncomplete=()=>{r.result.close();res();};};}),legacy);
      await page.goto(base()+'/#/words/all');await page.reload();
      await page.locator('.word-list .kind-badge',{hasText:'مفردة'}).waitFor();
      const v1={app:'wordloop',version:1,exportedAt:now,words:[{...legacy,id:'from-file',term:'restored',fsrsState:{cardId:'from-file',dueAt:now}}],reviews:[{id:'r1',wordId:'from-file',grade:'good',reviewedAt:now,nextDueAt:now}]};
      await page.goto(base()+'/#/settings');await page.waitForSelector('input[type=file]',{state:'attached'});
      page.once('dialog',d=>void d.accept());
      await page.setInputFiles('input[type=file]',{name:'wordloop-backup-v1.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(v1))});
      await page.getByRole('status').filter({hasText:'رجّعنا'}).waitFor();
      const rows=await stored(page);
      assert.equal(rows.length,1);assert.equal(rows[0].id,'from-file');assert.equal(rows[0].contentType,'vocabulary');assert.equal(rows[0].dueAt,now);
      await context.close();
    });
  });
}

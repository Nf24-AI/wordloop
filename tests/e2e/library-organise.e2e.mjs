// Issue #29 — sort inside a deck and «كل البطاقات», multi-select move and archive with confirmation, offline.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {ENGINES,startServer,freshPage} from './harness.mjs';

let server;
before(async()=>{server=await startServer();});
after(async()=>{await server?.stop();});

const words=page=>page.evaluate(()=>new Promise(res=>{const r=indexedDB.open('wordloop-local-v1');r.onsuccess=()=>{const q=r.result.transaction('words').objectStore('words').getAll();q.onsuccess=()=>{r.result.close();res(q.result);};};}));
const terms=page=>page.locator('.word-list .word-text b').allTextContents();
/** The list re-renders right after the toast; wait for it instead of reading once. */
async function termsSettle(page,want){for(let i=0;i<40;i++){const t=(await terms(page)).sort();if(JSON.stringify(t)===JSON.stringify(want))return t;await page.waitForTimeout(100);}return (await terms(page)).sort();}
/** Deck A with five cards created in order (so «newest» is the reverse), the second one reviewed; deck B empty. */
async function setup(page){
  return page.evaluate(async()=>{const m=await import('/src/data.ts');const f=await m.createFolder('الإنجليزية');
    const a=await m.createDeck({folderId:f.id,name:'Deck A'}),b=await m.createDeck({folderId:f.id,name:'Deck B'});
    const ids=[];for(const t of ['delta','alpha','echo','charlie','bravo']){ids.push((await m.addWord({contentType:'vocabulary',term:t,meanings:['م '+t],example:'',translation:'',tag:'',deckId:a.id})).id);await new Promise(r=>setTimeout(r,5));}
    await m.reviewWord(ids[1],'easy');return [a.id,b.id];});
}

for(const [name,engine] of Object.entries(ENGINES)){
  test(`[${name}] issue #29 library organisation`,async t=>{
    const browser=await engine.launch();
    t.after(()=>browser.close());
    const base=()=>server.base;

    await t.test('ORG-E1: sort a deck by newest, name and due without losing the search',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      const [a]=await setup(page);
      await page.goto(base()+'/#/words/d/'+a);await page.reload();await page.waitForSelector('.word-list');
      assert.deepEqual(await terms(page),['bravo','charlie','echo','alpha','delta']);
      await page.selectOption('.sort-pick select','name');
      assert.deepEqual(await terms(page),['alpha','bravo','charlie','delta','echo']);
      await page.selectOption('.sort-pick select','due');
      assert.equal((await terms(page)).at(-1),'alpha','the reviewed card is due last');
      await page.fill('.search input','a');
      await page.selectOption('.sort-pick select','newest');
      assert.equal(await page.inputValue('.search input'),'a','the search stays');
      assert.deepEqual(await terms(page),['bravo','charlie','alpha','delta']);
      // The order is remembered on this device.
      await page.reload();await page.waitForSelector('.word-list');
      assert.equal(await page.inputValue('.sort-pick select'),'newest');
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('ORG-E2: select 3 cards → move to deck B; counts update; FSRS and history kept',async()=>{
      const {context,page}=await freshPage(browser,base());
      const [a,b]=await setup(page);
      const before=await words(page);
      await page.goto(base()+'/#/words/d/'+a);await page.reload();await page.waitForSelector('.word-list');
      await page.getByRole('button',{name:'تحديد'}).click();
      for(const t of ['alpha','echo','bravo'])await page.getByRole('checkbox',{name:`حدد «${t}»`}).check();
      await page.locator('.select-hint',{hasText:'3 بطاقات محددة'}).waitFor();
      await page.locator('.select-bar').getByRole('button',{name:'انقلها'}).click();
      await page.selectOption('#bulk-move-deck',b);
      await page.locator('.form-sheet').getByRole('button',{name:'انقلها'}).click();
      await page.locator('.toast',{hasText:'نقلنا 3 بطاقات'}).waitFor();
      assert.deepEqual(await termsSettle(page,['charlie','delta']),['charlie','delta']);
      assert.equal(await page.locator('.select-bar').count(),0,'selection mode ends after the move');
      const after=await words(page);
      for(const w of before){const n=after.find(x=>x.id===w.id);
        assert.equal(n.deckId,['alpha','echo','bravo'].includes(w.term)?b:a);
        for(const k of ['dueAt','fsrsState','revision','createdAt'])assert.deepEqual(n[k],w[k],k);}
      await page.goto(base()+'/#/words/d/'+b);await page.waitForSelector('.word-list');
      assert.match(await page.locator('main h1 + .lead, .page-head .lead').first().textContent(),/3/);
      await context.close();
    });

    await t.test('ORG-E3: select in «كل البطاقات» and archive with confirmation, offline',async()=>{
      const {context,page}=await freshPage(browser,base());
      await setup(page);
      await page.goto(base()+'/#/words/all');await page.reload();await page.waitForSelector('.word-list');
      await context.setOffline(true);
      await page.getByRole('button',{name:'تحديد'}).click();
      await page.getByRole('checkbox',{name:'حدد «delta»'}).check();await page.getByRole('checkbox',{name:'حدد «echo»'}).check();
      await page.locator('.select-bar').getByRole('button',{name:'أرشفها'}).click();
      const dialog=page.locator('dialog[open]',{hasText:'تأرشف بطاقتين؟'});await dialog.waitFor();
      // «لا، خلها» changes nothing.
      await dialog.getByRole('button',{name:'لا، خلها'}).click();
      assert.equal((await words(page)).filter(w=>w.archived).length,0);
      await page.locator('.select-bar').getByRole('button',{name:'أرشفها'}).click();
      await page.locator('dialog[open]').getByRole('button',{name:'إيه، أرشفها'}).click();
      await page.locator('.toast',{hasText:'أرشفنا بطاقتين'}).waitFor();
      const all=await words(page);
      assert.deepEqual(all.filter(w=>w.archived).map(w=>w.term).sort(),['delta','echo']);
      assert.equal(all.length,5,'nothing deleted');
      assert.deepEqual(await termsSettle(page,['alpha','bravo','charlie']),['alpha','bravo','charlie']);
      await context.setOffline(false);await context.close();
    });
  });
}

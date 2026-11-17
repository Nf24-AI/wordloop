// Issue #27 — «أكمل من حيث توقفت» on Home: last meaningful deck, survives a relaunch, one tap, never a misleading button.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {ENGINES,startServer,freshPage,addCard} from './harness.mjs';

let server;
before(async()=>{server=await startServer();});
after(async()=>{await server?.stop();});

async function twoDecks(page){
  return page.evaluate(async()=>{const m=await import('/src/data.ts');const f=await m.createFolder('الإنجليزية');
    const a=await m.createDeck({folderId:f.id,name:'Deck A'}),b=await m.createDeck({folderId:f.id,name:'Deck B'});return [a.id,b.id];});
}
const words=page=>page.evaluate(()=>new Promise(res=>{const r=indexedDB.open('wordloop-local-v1');r.onsuccess=()=>{const q=r.result.transaction('words').objectStore('words').getAll();q.onsuccess=()=>{r.result.close();res(q.result);};};}));

for(const [name,engine] of Object.entries(ENGINES)){
  test(`[${name}] issue #27 continue learning`,async t=>{
    const browser=await engine.launch();
    t.after(()=>browser.close());
    const base=()=>server.base;

    await t.test('CONT-E1: use deck A then B, relaunch → Home offers B; one tap opens B\'s due review; FSRS untouched',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      const [a,b]=await twoDecks(page);
      // Just opening a deck is not «learning»: no pointer yet.
      await page.goto(base()+'/#/words/d/'+a);await page.reload();await page.waitForSelector('main h1');
      await page.goto(base()+'/#/');await page.reload();await page.waitForSelector('main h1');
      assert.equal(await page.locator('[data-home=continue]').count(),0);
      await page.goto(base()+'/#/add/'+a);await page.reload();await addCard(page,base(),'alpha','ألفا',{navigate:false});await page.locator('.toast').first().waitFor();
      await page.goto(base()+'/#/add/'+b);await page.reload();await addCard(page,base(),'beta','بيتا',{navigate:false});await page.locator('.toast',{hasText:'beta'}).waitFor();
      const before=await words(page);
      // Relaunch: close the app page and open a new one in the same (installed) context.
      await page.close();
      const p2=await context.newPage();p2.on('pageerror',e=>errors.push(String(e)));
      await p2.goto(base()+'/');await p2.waitForSelector('main h1');
      const card=p2.locator('[data-home=continue]');await card.waitFor();
      assert.match(await card.textContent(),/Deck B/);
      assert.doesNotMatch(await card.textContent(),/Deck A/);
      await card.click();
      await p2.waitForFunction(id=>location.hash==='#/review/d/'+id,b);
      await p2.locator('.card h2.term',{hasText:'beta'}).waitFor();
      assert.deepEqual(await words(p2),before,'restoring the route changes no card');
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('CONT-E2: finished → «open»; deck deleted → no Continue card at all',async()=>{
      const {context,page}=await freshPage(browser,base());
      const [a,b]=await twoDecks(page);
      await page.goto(base()+'/#/add/'+b);await page.reload();await addCard(page,base(),'gamma','غاما',{navigate:false});await page.locator('.toast',{hasText:'gamma'}).waitFor();
      await page.goto(base()+'/#/review/d/'+b);await page.reload();await page.click('.reveal');await page.locator('.grade.g-easy').click();await page.locator('.finish h1').waitFor();
      await page.goto(base()+'/#/');await page.reload();
      const card=page.locator('[data-home=continue]');await card.waitFor();
      assert.equal(await card.getAttribute('data-action'),'open','nothing due → open the deck, not a fake «continue review»');
      await card.click();await page.waitForFunction(id=>location.hash==='#/words/d/'+id,b);
      // Move the card away and delete deck B: the pointer is left dangling and must not show.
      await page.evaluate(async([a,b])=>{const m=await import('/src/data.ts');for(const w of await m.listWords())await m.moveWord(w.id,a);await m.deleteDeck(b);},[a,b]);
      await page.goto(base()+'/#/');await page.reload();await page.waitForSelector('main h1');
      await page.waitForTimeout(300);
      assert.equal(await page.locator('[data-home=continue]').count(),0);
      await context.close();
    });

    await t.test('CONT-E3: English label; a deck with only archived cards offers «add a card»',async()=>{
      const {context,page}=await freshPage(browser,base());
      await page.evaluate(()=>localStorage.setItem('wordloop-locale','en'));
      const [a]=await twoDecks(page);
      await page.goto(base()+'/#/add/'+a);await page.reload();await addCard(page,base(),'delta','دلتا',{navigate:false});await page.locator('.toast',{hasText:'delta'}).waitFor();
      await page.evaluate(async()=>{const m=await import('/src/data.ts');await m.addWord({contentType:'vocabulary',term:'other',meanings:['x'],example:'',translation:'',tag:''});for(const w of await m.listWords())if(w.term==='delta')await m.archiveWord(w.id);});
      await page.goto(base()+'/#/');await page.reload();
      const card=page.locator('[data-home=continue]');await card.waitFor();
      assert.equal(await card.getAttribute('data-action'),'add');
      assert.match(await card.textContent(),/Pick up where you left off/);
      await card.click();await page.waitForFunction(id=>location.hash==='#/add/'+id,a);
      await context.close();
    });
  });
}

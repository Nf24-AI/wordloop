// Issue #28 — Bulk Add in real engines: paste → editable preview → one save into the right deck; errors keep the input.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {ENGINES,startServer,freshPage} from './harness.mjs';

let server;
before(async()=>{server=await startServer();});
after(async()=>{await server?.stop();});

const words=page=>page.evaluate(()=>new Promise(res=>{const r=indexedDB.open('wordloop-local-v1');r.onsuccess=()=>{const q=r.result.transaction('words').objectStore('words').getAll();q.onsuccess=()=>{r.result.close();res(q.result);};};}));
async function deck(page,name,lang='es-ES'){
  return page.evaluate(async([name,lang])=>{const m=await import('/src/data.ts');const fs=(await m.listLibrary()).folders;const f=fs.find(x=>x.name==='Idiomas')??await m.createFolder('Idiomas');return (await m.createDeck({folderId:f.id,name,contentLanguage:lang})).id;},[name,lang]);
}

for(const [name,engine] of Object.entries(ENGINES)){
  test(`[${name}] issue #28 bulk add`,async t=>{
    const browser=await engine.launch();
    t.after(()=>browser.close());
    const base=()=>server.base;

    await t.test('BULK-E1: 20 structured lines → preview → 20 cards saved in the deck, from the Add page link',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      const d=await deck(page,'Spanish A1');
      await page.goto(base()+'/#/add/'+d);await page.reload();await page.waitForSelector('#term');
      await page.getByRole('button',{name:'لصق عدة بطاقات'}).click();
      await page.waitForFunction(id=>location.hash==='#/add/bulk/'+encodeURIComponent(id),d);
      assert.equal(await page.inputValue('#add-deck'),d,'the deck comes from the context');
      const lines=Array.from({length:20},(_,i)=>`palabra${i} — كلمة ${i}`);lines[3]='banco — بنك; ضفة';
      await page.fill('#bulk-text',lines.join('\n'));
      await page.getByRole('button',{name:'معاينة'}).click();
      await page.locator('.bulk-row').nth(19).waitFor();
      assert.match(await page.locator('.bulk-counts').textContent(),/20/);
      assert.equal(await page.locator('.bulk-row').nth(3).locator('.bulk-meanings').inputValue(),'بنك; ضفة');
      await page.getByRole('button',{name:/احفظ 20/}).click();
      await page.waitForFunction(id=>location.hash==='#/words/d/'+encodeURIComponent(id),d);
      await page.locator('.toast',{hasText:'20'}).waitFor();
      const all=await words(page);
      assert.equal(all.length,20);assert.ok(all.every(w=>w.deckId===d&&w.revision===0));
      assert.deepEqual(all.find(w=>w.term==='banco').meanings,['بنك','ضفة'],'two meanings → one card');
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('BULK-E2: duplicates and unknown lines are flagged; fixing a line brings it in; only valid rows are saved',async()=>{
      const {context,page}=await freshPage(browser,base());
      const d=await deck(page,'Spanish A2');
      await page.evaluate(async d=>{const m=await import('/src/data.ts');await m.addWord({contentType:'vocabulary',term:'gato',meanings:['قط'],example:'',translation:'',tag:'',deckId:d});},d);
      await page.goto(base()+'/#/add/bulk/'+d);await page.reload();await page.waitForSelector('#bulk-text');
      await page.fill('#bulk-text','gato — قطة\nperro — كلب\nPERRO — كلب\nsolo una frase');
      await page.getByRole('button',{name:'معاينة'}).click();
      await page.locator('.bulk-row').nth(3).waitFor();
      assert.deepEqual(await page.locator('.bulk-row').evaluateAll(rs=>rs.map(r=>r.dataset.status)),['dupDeck','ok','dupPaste','error']);
      await page.locator('.bulk-row').nth(3).locator('.bulk-term').fill('frase');
      await page.locator('.bulk-row').nth(3).locator('.bulk-meanings').fill('جملة');
      await page.locator('.bulk-row[data-status=error]').waitFor({state:'detached'});
      await page.getByRole('button',{name:/احفظ بطاقتين/}).click();
      await page.waitForFunction(id=>location.hash==='#/words/d/'+encodeURIComponent(id),d);
      assert.deepEqual((await words(page)).map(w=>w.term).sort(),['frase','gato','perro']);
      await context.close();
    });

    await t.test('BULK-E3: a failed save shows no success and keeps the input; the retry saves once',async()=>{
      const {context,page}=await freshPage(browser,base());
      const d=await deck(page,'Temporal');
      await page.goto(base()+'/#/add/bulk/'+d);await page.reload();await page.waitForSelector('#bulk-text');
      await page.fill('#bulk-text','uno — واحد\ndos — اثنين');
      await page.getByRole('button',{name:'معاينة'}).click();await page.locator('.bulk-row').nth(1).waitFor();
      // The deck is deleted elsewhere (another tab) before saving.
      await page.evaluate(async d=>{const m=await import('/src/data.ts');await m.deleteDeck(d);},d);
      await page.getByRole('button',{name:/احفظ بطاقتين/}).click();
      await page.locator('.bulk-page .inline-error[role=alert]').waitFor();
      assert.equal((await words(page)).length,0,'nothing saved');
      assert.equal(await page.locator('.toast.ok').count(),0,'no false success');
      assert.equal(await page.locator('.bulk-row').count(),2,'the preview is still there');
      assert.match(await page.inputValue('#bulk-text'),/uno — واحد/);
      // Choose an existing deck and retry: saved exactly once.
      await page.selectOption('#add-deck','00000000-0000-4000-8000-00000000d001');
      const save=page.getByRole('button',{name:/احفظ بطاقتين/});
      await save.click();
      await page.waitForFunction(()=>location.hash.startsWith('#/words/d/'));
      assert.equal((await words(page)).length,2);
      await context.close();
    });
  });
}

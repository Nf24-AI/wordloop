// Issue #15 — Folder/Deck data model in real browser engines (Chromium + WebKit): legacy upgrade, backup v3 through Settings.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {ENGINES,startServer,freshPage} from './harness.mjs';

let server;
before(async()=>{server=await startServer();});
after(async()=>{await server?.stop();});

const DEFAULT_DECK='00000000-0000-4000-8000-00000000d001',DEFAULT_FOLDER='00000000-0000-4000-8000-00000000f001';
/** Raw IndexedDB dump of the app's database (records exactly as stored), plus the schema version. */
const dump=page=>page.evaluate(()=>new Promise(res=>{const r=indexedDB.open('wordloop-local-v1');r.onsuccess=()=>{const db=r.result,tx=db.transaction(['words','reviews','meta']),out={version:db.version};let n=0;for(const s of ['words','reviews','meta']){const q=tx.objectStore(s).getAll();q.onsuccess=()=>{out[s]=q.result;if(++n===3){db.close();res(out);}};}};}));
/** Calls the app's own data module inside the page (Vite serves the TS source in dev). */
const data=(page,fn,arg)=>page.evaluate(async([src,arg])=>{const m=await import('/src/data.ts');return new Function('m','arg',`return (${src})(m,arg)`)(m,arg);},[fn.toString(),arg]);

for(const [name,engine] of Object.entries(ENGINES)){
  test(`[${name}] issue #15 folders/decks data`,async t=>{
    const browser=await engine.launch();
    t.after(()=>browser.close());
    const base=()=>server.base;

    await t.test('MIG-01/02: pre-#15 cards and reviews survive the upgrade untouched and appear in Library',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      const now=Date.now(),iso=ms=>new Date(ms).toISOString();
      const words=[0,1,2].map(i=>{const id=`old-${i}`,dueAt=iso(now+(i-1)*86_400_000);const w={id,term:`legacy ${i}`,meaning:`قديم ${i}`,example:'',translation:'',tag:'عام',createdAt:iso(now-9e8),updatedAt:iso(now-9e8),dueAt,fsrsState:{cardId:id,dueAt,stability:2+i,reps:2},archived:false,revision:i};if(i)Object.assign(w,{contentType:'idiom',note:'n'});return w;});
      const reviews=[{id:'r-0',wordId:'old-0',grade:'good',reviewedAt:iso(now-8e8),nextDueAt:words[0].dueAt}];
      await page.evaluate(([words,reviews])=>new Promise(res=>{const r=indexedDB.open('wordloop-local-v1');r.onsuccess=()=>{const tx=r.result.transaction(['words','reviews'],'readwrite');for(const w of words)tx.objectStore('words').put(w);for(const x of reviews)tx.objectStore('reviews').put(x);tx.oncomplete=()=>{r.result.close();res();};};}),[words,reviews]);
      await page.goto(base()+'/#/words');await page.reload();
      await page.locator('.word-list .word-text b').nth(2).waitFor();
      const lib=await data(page,async m=>m.listLibrary());
      assert.deepEqual(lib.folders.map(f=>f.id),[DEFAULT_FOLDER]);
      assert.deepEqual(lib.decks.map(d=>[d.id,d.contentLanguage,d.meaningLanguage]),[[DEFAULT_DECK,'en-US','ar-SA']]);
      const cards=await data(page,async m=>m.listWords());
      assert.ok(cards.every(c=>c.deckId===DEFAULT_DECK));
      const db=await dump(page);
      assert.equal(db.version,1,'no IndexedDB version bump (rollback-safe)');
      assert.deepEqual(db.words.sort((a,b)=>a.id.localeCompare(b.id)),words,'stored cards byte-identical');
      assert.deepEqual(db.reviews,reviews);
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('MIG-05: Settings exports backup v3 with folders/decks, and a v3 file restores them through Settings',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      const ids=await data(page,async m=>{const f=await m.createFolder('الإنجليزية');const d=await m.createDeck({folderId:f.id,name:'Español',contentLanguage:'es-ES'});const w=await m.addWord({term:'hola',meaning:'مرحبا',example:'',translation:'',tag:'',deckId:d.id});return {f:f.id,d:d.id,w:w.id};});
      await page.goto(base()+'/#/settings');
      const download=page.waitForEvent('download');
      await page.locator('main button.tile',{hasText:'حمّل نسخة من كلماتك'}).click();
      const file=await (await download).createReadStream();
      const chunks=[];for await(const c of file)chunks.push(c);
      const backup=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      assert.equal(backup.version,3);
      assert.deepEqual(backup.folders.map(f=>f.id).sort(),[DEFAULT_FOLDER,ids.f].sort());
      assert.equal(backup.decks.find(d=>d.id===ids.d).contentLanguage,'es-ES');
      assert.equal(backup.words.find(w=>w.id===ids.w).deckId,ids.d);
      // Restore the same file on a clean origin through the Settings file picker.
      const fresh=await freshPage(browser,base());
      await fresh.page.goto(base()+'/#/settings');await fresh.page.waitForSelector('input[type=file]',{state:'attached'});
      fresh.page.once('dialog',d=>void d.accept());
      await fresh.page.setInputFiles('input[type=file]',{name:'wordloop-backup-v3.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
      await fresh.page.getByRole('status').filter({hasText:'رجّعنا'}).waitFor();
      const lib=await data(fresh.page,async m=>m.listLibrary());
      assert.equal(lib.decks.find(d=>d.id===ids.d)?.name,'Español');
      const cards=await data(fresh.page,async m=>m.listWords());
      assert.equal(cards.find(c=>c.id===ids.w)?.deckId,ids.d);
      assert.deepEqual(errors,[]);assert.deepEqual(fresh.errors,[]);
      await fresh.context.close();await context.close();
    });
  });
}

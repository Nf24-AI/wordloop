// Issue #15 — Folder → Deck → Card data model, safe migration of existing cards, backup v3 (QA V2: MIG-01…MIG-13).
import 'fake-indexeddb/auto';
import {IDBFactory,IDBObjectStore} from 'fake-indexeddb';
import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  addWord,archiveWord,buildBackup,listLibrary,listReviews,listWords,resetConnectionForTests,restoreBackup,reviewWord,validateBackup,
  createFolder,renameFolder,createDeck,updateDeck,deleteDeck,deleteFolder,moveWord,libraryCounts,cardLanguages,canonicalLanguage,
  rememberBackup,lastBackupDate,DEFAULT_DECK_ID,DEFAULT_FOLDER_ID,
} from '../src/data.ts';

beforeEach(()=>{globalThis.indexedDB=new IDBFactory();resetConnectionForTests();});
const card=(term,extra={})=>({contentType:'vocabulary',term,meaning:'معنى',example:'',translation:'',note:'',tag:'',...extra});

/** Opens the database exactly as the shipped (pre-#15) app does: name wordloop-local-v1, version 1, three stores. */
function openV1(){
  return new Promise((res,rej)=>{const r=indexedDB.open('wordloop-local-v1',1);r.onupgradeneeded=()=>{for(const s of ['words','reviews'])r.result.createObjectStore(s,{keyPath:'id'});r.result.createObjectStore('meta',{keyPath:'key'});};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
}
async function raw(store,mode,fn){
  const db=await openV1(),tx=db.transaction(store,mode),out=await fn(tx.objectStore(store));
  await new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});db.close();return out;
}
const getAllRaw=store=>raw(store,'readonly',s=>new Promise(r=>{s.getAll().onsuccess=e=>r(e.target.result);}));
const byId=(a,b)=>a.id.localeCompare(b.id);
/** Checksum of what must never change: id, dueAt, fsrsState, revision, createdAt (cards) and every review event. */
const checksum=(words,reviews)=>createHash('sha256').update(JSON.stringify({
  words:[...words].sort(byId).map(w=>[w.id,w.dueAt,w.fsrsState,w.revision,w.createdAt]),
  reviews:[...reviews].sort(byId).map(r=>[r.id,r.wordId,r.grade,r.reviewedAt,r.nextDueAt]),
})).digest('hex');

const at='2026-11-10T09:00:00.000Z',kinds=['vocabulary','phrase','sentence','idiom'];
/** A synthetic legacy library: 40 cards of mixed kinds (some pre-#5 without kind), archived and due/upcoming, with history. */
function legacyFixture(){
  const words=Array.from({length:40},(_,i)=>{
    const id=`legacy-${i}`,dueAt=new Date(Date.parse(at)+(i-20)*3600_000).toISOString();
    const w={id,term:`term ${i}`,meaning:`معنى ${i}`,example:i%3?'':'An example.',translation:i%3?'':'مثال.',tag:i%5?'عام':'سفر',createdAt:at,updatedAt:at,dueAt,
      fsrsState:{cardId:id,dueAt,stability:1.5+i,stabilityFast:1.2+i,difficulty:5,state:2,scheduleStatus:'review',reps:3,lapses:i%2,lastReviewAt:at,scheduledDays:2,learningStep:0},archived:i%9===0,revision:i%4};
    if(i%4)Object.assign(w,{contentType:kinds[i%4],note:i%2?'ملاحظة':''}); // every 4th card predates #5
    return w;
  });
  const reviews=words.flatMap((w,i)=>[0,1,2].slice(0,1+i%3).map(k=>({id:`r-${i}-${k}`,wordId:w.id,grade:['again','hard','good','easy'][(i+k)%4],reviewedAt:at,nextDueAt:w.dueAt})));
  return {words,reviews};
}
async function plantLegacy(){
  const f=legacyFixture();
  await raw('words','readwrite',s=>{for(const w of f.words)s.put(w);});
  await raw('reviews','readwrite',s=>{for(const r of f.reviews)s.put(r);});
  await raw('meta','readwrite',s=>{s.put({key:'lastBackup',value:at});});
  return f;
}

test('MIG-01: existing cards land in the default folder/deck with their original ids; the schema version stays 1',async()=>{
  const f=await plantLegacy();
  const words=await listWords(),{folders,decks}=await listLibrary();
  assert.equal(words.length,40);
  assert.deepEqual(words.map(w=>w.id).sort(),f.words.map(w=>w.id).sort());
  assert.ok(words.every(w=>w.deckId===DEFAULT_DECK_ID));
  assert.deepEqual(folders.map(x=>[x.id,x.name]),[[DEFAULT_FOLDER_ID,'غير مصنفة']]);
  assert.deepEqual(decks.map(x=>[x.id,x.folderId,x.name,x.contentLanguage,x.meaningLanguage]),[[DEFAULT_DECK_ID,DEFAULT_FOLDER_ID,'بطاقاتي','en-US','ar-SA']]);
  // An older app build (VERSION=1) must still be able to open the database after a rollback.
  const db=await openV1();assert.equal(db.version,1);assert.deepEqual([...db.objectStoreNames].sort(),['meta','reviews','words']);db.close();
});

test('MIG-02/03: review events and dueAt/fsrsState/revision are byte-identical after migration; stored cards are not rewritten',async()=>{
  const f=await plantLegacy();
  const before=checksum(f.words,f.reviews);
  await listLibrary();const words=await listWords(),reviews=await listReviews();
  assert.equal(checksum(words,reviews),before);
  assert.deepEqual((await getAllRaw('words')).sort(byId),[...f.words].sort(byId),'stored records untouched by reading');
  assert.deepEqual((await getAllRaw('reviews')).sort(byId),[...f.reviews].sort(byId));
  assert.equal(await lastBackupDate(),at,'other meta is kept');
});

test('MIG-13: migration is idempotent across repeated app starts (one default folder/deck, stable schedule)',async()=>{
  const f=await plantLegacy();
  for(let i=0;i<3;i++){resetConnectionForTests();await listLibrary();}
  const {folders,decks}=await listLibrary();
  assert.equal(folders.length,1);assert.equal(decks.length,1);
  const meta=await getAllRaw('meta');
  assert.equal(meta.filter(m=>m.type==='folder').length,1);assert.equal(meta.filter(m=>m.type==='deck').length,1);
  assert.equal(checksum(await listWords(),await listReviews()),checksum(f.words,f.reviews));
});

test('new cards go to the default deck, or to a chosen deck; an unknown deck is refused and nothing is saved',async()=>{
  const folder=await createFolder('الإنجليزية'),deck=await createDeck({folderId:folder.id,name:'Business English'});
  const a=await addWord(card('overlook')),b=await addWord(card('leverage',{deckId:deck.id}));
  assert.equal(a.deckId,DEFAULT_DECK_ID);assert.equal(b.deckId,deck.id);
  await assert.rejects(addWord(card('ghost',{deckId:'no-such-deck'})),/لم نجد الحزمة/);
  assert.deepEqual((await listWords()).map(w=>w.term).sort(),['leverage','overlook']);
  const stored=await getAllRaw('words');assert.ok(stored.every(w=>typeof w.deckId==='string'),'canonical write schema stores deckId');
});

test('MIG-07: create/rename folders and decks; moving a card keeps id, dueAt, FSRS, revision and history',async()=>{
  const f=await createFolder('  علوم   الحاسب ');assert.equal(f.name,'علوم الحاسب');
  const g=await renameFolder(f.id,'Computer Science');assert.equal(g.name,'Computer Science');assert.equal(g.createdAt,f.createdAt);
  const d1=await createDeck({folderId:f.id,name:'Networking'}),d2=await createDeck({folderId:DEFAULT_FOLDER_ID,name:'Idioms'});
  const w=await addWord(card('latency',{deckId:d1.id}));
  await reviewWord(w.id,'again');
  const [before]=await listWords(),reviewsBefore=await listReviews();
  const moved=await moveWord(w.id,d2.id);
  assert.equal(moved.deckId,d2.id);
  for(const k of ['id','createdAt','dueAt','revision','contentType','term','meaning'])assert.deepEqual(moved[k],before[k],k);
  assert.deepEqual(moved.fsrsState,before.fsrsState);
  assert.deepEqual(await listReviews(),reviewsBefore,'history untouched');
  const renamed=await updateDeck(d1.id,{name:'Networks'});assert.equal(renamed.name,'Networks');
  const relocated=await updateDeck(d1.id,{folderId:DEFAULT_FOLDER_ID});assert.equal(relocated.folderId,DEFAULT_FOLDER_ID);
  const {decks}=await listLibrary();assert.equal(decks.find(d=>d.id===d1.id).folderId,DEFAULT_FOLDER_ID);
});

test('a review racing a deck move keeps the move (the review is written on top of the latest record)',async()=>{
  const d=await createDeck({folderId:DEFAULT_FOLDER_ID,name:'Later'});
  const w=await addWord(card('race'));
  // Start the review, then move the card before the review's write transaction runs.
  const p=reviewWord(w.id,'good');await moveWord(w.id,d.id);await p;
  const [after]=await listWords();
  assert.equal(after.deckId,d.id,'move not undone by the review');assert.equal(after.revision,1);
  assert.equal((await listReviews()).length,1);
});

test('MIG-09: duplicate names are refused (folders globally, decks per folder); a card with a missing deck still counts',async()=>{
  const f=await createFolder('الإنجليزية');
  await assert.rejects(createFolder(' الإنجليزية '),/يوجد مجلد/);
  await assert.rejects(createFolder(''),/اكتب اسمًا/);
  await assert.rejects(createFolder('x'.repeat(61)),/أطول/);
  await assert.rejects(renameFolder(DEFAULT_FOLDER_ID,'الإنجليزية'),/يوجد مجلد/,'rename into an existing name');
  await renameFolder(f.id,'الإنجليزية'); // renaming to its own name is not a duplicate
  await createDeck({folderId:f.id,name:'Idioms'});
  await assert.rejects(createDeck({folderId:f.id,name:'idioms'}),/توجد حزمة/);
  await createDeck({folderId:DEFAULT_FOLDER_ID,name:'Idioms'}); // same name, different folder: fine
  await assert.rejects(createDeck({folderId:'nope',name:'X'}),/لم نجد المجلد/);
  // A corrupted association (deck id that no longer exists) never drops the card.
  const w=await addWord(card('orphan'));
  await raw('words','readwrite',s=>{s.put({...w,deckId:'deleted-deck'});});
  const {decks}=await listLibrary(),counts=libraryCounts(await listWords(),decks);
  assert.equal(counts.deck.get(DEFAULT_DECK_ID).cards,1);assert.equal(counts.folder.get(DEFAULT_FOLDER_ID).cards,1);
});

test('MIG-08: non-empty decks/folders and the defaults cannot be deleted; nothing cascades',async()=>{
  const f=await createFolder('مشاريع'),d=await createDeck({folderId:f.id,name:'PMP'});
  const w=await addWord(card('scope',{deckId:d.id}));await archiveWord(w.id);
  await assert.rejects(deleteDeck(d.id),/فيها بطاقات/,'archived cards still count');
  await assert.rejects(deleteFolder(f.id),/فيه حزم/);
  await assert.rejects(deleteDeck(DEFAULT_DECK_ID),/الافتراضية/);
  await assert.rejects(deleteFolder(DEFAULT_FOLDER_ID),/الافتراضي/);
  assert.equal((await listWords()).length,1);
  await moveWord(w.id,DEFAULT_DECK_ID);await deleteDeck(d.id);await deleteFolder(f.id);
  const {folders,decks}=await listLibrary();
  assert.deepEqual(folders.map(x=>x.id),[DEFAULT_FOLDER_ID]);assert.deepEqual(decks.map(x=>x.id),[DEFAULT_DECK_ID]);
  assert.equal((await listWords())[0].id,w.id);
});

test('MIG-10: deck languages are canonical BCP-47, independent of the UI; per-card override wins; no inference from text',async()=>{
  assert.equal(canonicalLanguage('en-us'),'en-US');assert.equal(canonicalLanguage('es-ES'),'es-ES');
  for(const bad of ['','english','e','en_US','12-34',null,'x'.repeat(40)])assert.equal(canonicalLanguage(bad),null,String(bad));
  const es=await createDeck({folderId:DEFAULT_FOLDER_ID,name:'Español',contentLanguage:'es-es',meaningLanguage:'ar-sa'});
  assert.equal(es.contentLanguage,'es-ES');assert.equal(es.meaningLanguage,'ar-SA');
  await assert.rejects(createDeck({folderId:DEFAULT_FOLDER_ID,name:'Bad',contentLanguage:'spanish'}),/رمز اللغة/);
  const w=await addWord(card('hola',{deckId:es.id}));
  const {decks}=await listLibrary();
  assert.deepEqual(cardLanguages(w,decks),{content:'es-ES',meaning:'ar-SA'});
  assert.deepEqual(cardLanguages({...w,contentLanguage:'en-GB'},decks),{content:'en-GB',meaning:'ar-SA'});
  assert.deepEqual(cardLanguages({deckId:'missing'},decks),{content:'en-US',meaning:'ar-SA'});
  const before=(await listWords())[0];
  await updateDeck(es.id,{contentLanguage:'es-MX'});
  assert.deepEqual((await listWords())[0],before,'changing deck language does not touch cards');
});

test('MIG-04: v1 and v2 backups import into the default deck with every field kept',async()=>{
  const f=legacyFixture();
  const v1={app:'wordloop',version:1,exportedAt:at,words:f.words.map(({contentType,note,...w})=>w),reviews:f.reviews};
  const v2={app:'wordloop',version:2,exportedAt:at,words:f.words.map(w=>({contentType:'vocabulary',note:'',...w})),reviews:f.reviews};
  for(const file of [v1,v2]){
    globalThis.indexedDB=new IDBFactory();resetConnectionForTests();
    await restoreBackup(JSON.parse(JSON.stringify(file)));
    const words=await listWords();
    assert.equal(words.length,40);assert.ok(words.every(w=>w.deckId===DEFAULT_DECK_ID));
    for(const src of file.words){
      const got=words.find(w=>w.id===src.id);
      for(const k of ['meaning','translation','example','tag','archived','dueAt','revision','createdAt'])assert.deepEqual(got[k],src[k],`v${file.version} ${k}`);
      assert.deepEqual(got.fsrsState,src.fsrsState);
      assert.equal(got.contentType,src.contentType??'vocabulary');assert.equal(got.note,src.note??'');
    }
    assert.equal(checksum(words,await listReviews()),checksum(file.words,file.reviews));
    const {folders,decks}=await listLibrary();assert.equal(folders.length,1);assert.equal(decks.length,1);
  }
});

test('MIG-05: a v3 export round-trips folders, decks, languages, ids, reviews and FSRS onto a clean origin',async()=>{
  await plantLegacy();
  const f=await createFolder('الإنجليزية'),d=await createDeck({folderId:f.id,name:'Spanish basics',contentLanguage:'es-ES',meaningLanguage:'ar-SA'});
  const words=await listWords();await moveWord(words[1].id,d.id);await moveWord(words[2].id,d.id);
  const w=await addWord(card('hola',{deckId:d.id}));await reviewWord(w.id,'good');
  const file=JSON.stringify(await buildBackup());
  const before={words:await listWords(),reviews:await listReviews(),lib:await listLibrary()};
  const parsed=JSON.parse(file);
  assert.equal(parsed.version,3);assert.equal(parsed.folders.length,2);assert.equal(parsed.decks.length,2);
  assert.ok(parsed.words.every(x=>typeof x.deckId==='string'));
  globalThis.indexedDB=new IDBFactory();resetConnectionForTests(); // "another device"
  await restoreBackup(validateBackup(parsed));
  assert.deepEqual(await listWords(),before.words);
  assert.deepEqual(await listReviews(),before.reviews);
  assert.deepEqual(await listLibrary(),before.lib);
});

test('MIG-09: inconsistent v3 files are rejected before anything local is replaced',async()=>{
  const f=await createFolder('A'),d=await createDeck({folderId:f.id,name:'B'});
  await addWord(card('keepme',{deckId:d.id}));
  const good=await buildBackup(),before={words:await listWords(),lib:await listLibrary()};
  const bad=[
    ['v3 without decks',{...good,decks:undefined}],
    ['card in unknown deck',{...good,words:good.words.map(w=>({...w,deckId:'nope'}))}],
    ['v3 card without deckId',{...good,words:good.words.map(({deckId,...w})=>w)}],
    ['deck in unknown folder',{...good,decks:good.decks.map(x=>x.id===d.id?{...x,folderId:'nope'}:x)}],
    ['duplicate deck id',{...good,decks:[...good.decks,good.decks[0]]}],
    ['duplicate folder id',{...good,folders:[...good.folders,good.folders[0]]}],
    ['bad language',{...good,decks:good.decks.map(x=>({...x,contentLanguage:'klingon language'}))}],
    ['bad card language',{...good,words:good.words.map(w=>({...w,meaningLanguage:'??'}))}],
    ['empty deck name',{...good,decks:good.decks.map(x=>({...x,name:'  '}))}],
    ['folder name too long',{...good,folders:good.folders.map(x=>({...x,name:'x'.repeat(61)}))}],
    ['too many decks',{...good,decks:new Array(5001).fill(good.decks[0])}],
  ];
  for(const [name,payload] of bad)await assert.rejects(restoreBackup(JSON.parse(JSON.stringify(payload))),Error,name);
  assert.deepEqual(await listWords(),before.words);assert.deepEqual(await listLibrary(),before.lib);
});

test('MIG-06: a failure in the middle of a restore leaves cards, reviews, folders and decks intact',async()=>{
  const f=await createFolder('A'),d=await createDeck({folderId:f.id,name:'B'});
  await addWord(card('keepme',{deckId:d.id}));await rememberBackup();
  const before={words:await listWords(),reviews:await listReviews(),lib:await listLibrary(),last:await lastBackupDate()};
  const incoming=validateBackup({app:'wordloop',version:2,exportedAt:at,words:legacyFixture().words.slice(0,3).map(w=>({contentType:'vocabulary',note:'',...w})),reviews:[]});
  const put=IDBObjectStore.prototype.put;let n=0;
  IDBObjectStore.prototype.put=function(...a){if(++n===3)throw new DOMException('boom','QuotaExceededError');return put.apply(this,a);};
  try{await assert.rejects(restoreBackup(incoming),/boom/);}finally{IDBObjectStore.prototype.put=put;}
  assert.deepEqual(await listWords(),before.words);assert.deepEqual(await listReviews(),before.reviews);
  assert.deepEqual(await listLibrary(),before.lib);assert.equal(await lastBackupDate(),before.last);
});

test('a v3 restore keeps the last-backup date and replaces only library records in meta',async()=>{
  await rememberBackup();const last=await lastBackupDate();
  const f=await createFolder('Old folder');void f;
  const file=validateBackup({app:'wordloop',version:1,exportedAt:at,words:[],reviews:[]});
  await restoreBackup(file);
  const {folders}=await listLibrary();
  assert.deepEqual(folders.map(x=>x.id),[DEFAULT_FOLDER_ID],'restore replaces folders');
  assert.equal(await lastBackupDate(),last);
});

test('library counts are real: active cards and due cards per deck and per folder',async()=>{
  const f=await createFolder('الإنجليزية'),d=await createDeck({folderId:f.id,name:'Idioms'});
  const a=await addWord(card('a',{deckId:d.id})),b=await addWord(card('b',{deckId:d.id}));await addWord(card('c'));
  await archiveWord(b.id);
  const {decks}=await listLibrary(),words=await listWords();
  const now=Date.now()+60_000; // new cards are due after their first learning step
  const counts=libraryCounts(words,decks,now);
  assert.deepEqual(counts.deck.get(d.id),{cards:1,due:1});
  assert.deepEqual(counts.folder.get(f.id),{decks:1,cards:1,due:1});
  assert.deepEqual(counts.folder.get(DEFAULT_FOLDER_ID),{decks:1,cards:1,due:1});
  assert.deepEqual(libraryCounts(words,decks,Date.parse(a.dueAt)-1).deck.get(d.id),{cards:1,due:0});
});

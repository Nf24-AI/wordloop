// Issue #26 (data part) — several meanings on one card, one FSRS schedule; lossless mapping of the legacy `meaning`.
// QA V2: MIG-11, MIG-12 (+ MIG-03 for edits).
import 'fake-indexeddb/auto';
import {IDBFactory} from 'fake-indexeddb';
import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {addWord,editWord,archiveWord,reviewWord,moveWord,createDeck,buildBackup,restoreBackup,validateBackup,listWords,listReviews,resetConnectionForTests,cleanMeanings,MAX_MEANINGS,MEANING_LIMIT,DEFAULT_FOLDER_ID} from '../src/data.ts';

beforeEach(()=>{globalThis.indexedDB=new IDBFactory();resetConnectionForTests();});
const base={contentType:'vocabulary',example:'',translation:'',note:'',tag:''};
async function raw(store,mode,fn){
  const db=await new Promise((res,rej)=>{const r=indexedDB.open('wordloop-local-v1',1);r.onupgradeneeded=()=>{for(const s of ['words','reviews'])r.result.createObjectStore(s,{keyPath:'id'});r.result.createObjectStore('meta',{keyPath:'key'});};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
  const tx=db.transaction(store,mode),out=await fn(tx.objectStore(store));
  await new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});db.close();return out;
}
const getAllRaw=store=>raw(store,'readonly',s=>new Promise(r=>{s.getAll().onsuccess=e=>r(e.target.result);}));
const schedule=w=>({id:w.id,createdAt:w.createdAt,dueAt:w.dueAt,fsrsState:w.fsrsState,revision:w.revision,deckId:w.deckId,contentType:w.contentType,archived:w.archived});
const at='2026-11-10T09:00:00.000Z';
const legacy=(id,meaning)=>({id,term:id,meaning,example:'Ex.',translation:'مثال',tag:'عام',createdAt:at,updatedAt:at,dueAt:at,fsrsState:{cardId:id,dueAt:at,stability:3,stabilityFast:2.5,difficulty:5,state:2,scheduleStatus:'review',lastReviewAt:'2026-11-01T09:00:00.000Z',reps:2,lapses:0,scheduledDays:3,learningStep:0},archived:false,revision:2});

test('MIG-11: a legacy single meaning becomes meanings[0] exactly; stored cards are not rewritten; meaning mirrors meanings[0]',async()=>{
  const cards=[legacy('show','يُظهر'),legacy('spaces','  معنى بمسافات  '),{...legacy('kind','نوع'),contentType:'idiom',note:'ن'}];
  await raw('words','readwrite',s=>{for(const c of cards)s.put(c);});
  const words=await listWords();
  for(const c of cards){
    const w=words.find(x=>x.id===c.id);
    assert.deepEqual(w.meanings,[c.meaning],'kept byte-for-byte, even surrounding spaces');
    assert.equal(w.meaning,c.meaning);
  }
  assert.deepEqual((await getAllRaw('words')).sort((a,b)=>a.id.localeCompare(b.id)),cards.sort((a,b)=>a.id.localeCompare(b.id)),'reading rewrote nothing');
});

test('UX-08 data: «show» with two meanings is ONE card with ONE schedule; both meanings saved in order',async()=>{
  const w=await addWord({...base,term:'show',meanings:['  يُظهر ','عرض (فيلم، منتج)','']});
  assert.deepEqual(w.meanings,['يُظهر','عرض (فيلم، منتج)']);assert.equal(w.meaning,'يُظهر');
  const all=await listWords();assert.equal(all.length,1,'no duplicate card per meaning');
  const [stored]=await getAllRaw('words');
  assert.deepEqual(stored.meanings,['يُظهر','عرض (فيلم، منتج)']);assert.equal(stored.meaning,'يُظهر','older builds still read a valid meaning');
  const legacyStyle=await addWord({...base,term:'overlook',meaning:'يغفل عن'});
  assert.deepEqual(legacyStyle.meanings,['يغفل عن'],'the single-meaning API still works');
});

test('at least one non-empty meaning; repeats removed; count and length limits enforced',async()=>{
  await assert.rejects(addWord({...base,term:'x',meanings:['','   ']}),/معناها/);
  await assert.rejects(addWord({...base,term:'x',meaning:''}),/معناها/);
  await assert.rejects(addWord({...base,term:'x',meanings:Array.from({length:MAX_MEANINGS+1},(_,i)=>`م${i}`)}),/أطول/);
  await assert.rejects(addWord({...base,term:'x',meanings:['م'.repeat(MEANING_LIMIT+1)]}),/أطول/);
  assert.deepEqual(cleanMeanings(['Show',' show ','عرض']),['Show','عرض']);
  assert.equal((await listWords()).length,0,'nothing saved by refused adds');
  const ok=await addWord({...base,term:'max',meanings:Array.from({length:MAX_MEANINGS},(_,i)=>`م${i}`)});
  assert.equal(ok.meanings.length,MAX_MEANINGS);
});

test('MIG-12 + MIG-03: edit to add/remove meanings keeps id, deck, dueAt, FSRS, revision and history; no new card',async()=>{
  const deck=await createDeck({folderId:DEFAULT_FOLDER_ID,name:'Verbs'});
  const w=await addWord({...base,term:'show',meanings:['يُظهر'],deckId:deck.id});
  await reviewWord(w.id,'again');
  const [reviewed]=await listWords(),history=await listReviews();
  const two=await editWord(w.id,{meanings:['يُظهر','عرض (فيلم، منتج)']});
  assert.deepEqual(two.meanings,['يُظهر','عرض (فيلم، منتج)']);
  assert.deepEqual(schedule(two),schedule(reviewed));
  const one=await editWord(w.id,{meanings:['عرض (فيلم، منتج)']}); // delete the first meaning
  assert.deepEqual(one.meanings,['عرض (فيلم، منتج)']);assert.equal(one.meaning,'عرض (فيلم، منتج)');
  assert.deepEqual(schedule(one),schedule(reviewed));
  assert.deepEqual(await listReviews(),history,'history untouched');
  assert.equal((await listWords()).length,1);
  await assert.rejects(editWord(w.id,{meanings:['  ']}),/معناها/,'cannot remove the last meaning');
  assert.deepEqual((await listWords())[0].meanings,['عرض (فيلم، منتج)'],'refused edit changed nothing');
});

test('editing other fields: limits, term duplicates within the kind, unknown card; FSRS never touched',async()=>{
  const a=await addWord({...base,term:'alpha',meaning:'أ'});await addWord({...base,term:'beta',meaning:'ب'});
  const before=schedule((await listWords()).find(x=>x.id===a.id));
  const e=await editWord(a.id,{example:' An example. ',note:'ملاحظة',tag:'',translation:'مثال'});
  assert.equal(e.example,'An example.');assert.equal(e.tag,'عام');assert.equal(e.note,'ملاحظة');
  assert.deepEqual(schedule(e),before);
  await assert.rejects(editWord(a.id,{term:' BETA '}),/موجودة/);
  await assert.rejects(editWord(a.id,{note:'n'.repeat(501)}),/أطول/);
  await assert.rejects(editWord('missing',{note:'x'}),/لم نجد/);
  const renamed=await editWord(a.id,{term:'  Alpha   one '});assert.equal(renamed.term,'Alpha one');
  assert.deepEqual(schedule(renamed),before);
});

test('a review racing an edit keeps the edited meanings (review writes on top of the latest record)',async()=>{
  const w=await addWord({...base,term:'race',meaning:'سباق'});
  const p=reviewWord(w.id,'good');await editWord(w.id,{meanings:['سباق','تسابق']});await p;
  const [after]=await listWords();
  assert.deepEqual(after.meanings,['سباق','تسابق']);assert.equal(after.revision,1);
});

test('archive and move keep every meaning',async()=>{
  const deck=await createDeck({folderId:DEFAULT_FOLDER_ID,name:'D'});
  const w=await addWord({...base,term:'keep',meanings:['يحتفظ','يبقي']});
  await moveWord(w.id,deck.id);await archiveWord(w.id);
  const [stored]=await getAllRaw('words');
  assert.deepEqual(stored.meanings,['يحتفظ','يبقي']);assert.equal(stored.meaning,'يحتفظ');assert.equal(stored.archived,true);
});

test('backup: meanings round-trip in v3; v1/v2 files map meaning → meanings; malformed meanings are rejected before restore',async()=>{
  await addWord({...base,term:'show',meanings:['يُظهر','عرض']});
  const file=JSON.parse(JSON.stringify(await buildBackup()));
  assert.deepEqual(file.words[0].meanings,['يُظهر','عرض']);assert.equal(file.words[0].meaning,'يُظهر');
  const before=await listWords();
  globalThis.indexedDB=new IDBFactory();resetConnectionForTests();
  await restoreBackup(validateBackup(file));
  assert.deepEqual(await listWords(),before);
  const v1=validateBackup({app:'wordloop',version:1,exportedAt:at,words:[legacy('old','قديم')],reviews:[]});
  assert.deepEqual(v1.words[0].meanings,['قديم']);
  const v2=validateBackup({app:'wordloop',version:2,exportedAt:at,words:[{...legacy('old2','قديم'),contentType:'phrase',note:''}],reviews:[]});
  assert.deepEqual(v2.words[0].meanings,['قديم']);
  for(const [name,meanings] of [['empty list',[]],['blank meaning',['  ']],['not strings',[1]],['too many',Array(MAX_MEANINGS+1).fill('م')],['too long',['م'.repeat(MEANING_LIMIT+1)]],['not a list','يُظهر']]){
    const bad={...file,words:file.words.map(w=>({...w,meanings}))};
    assert.throws(()=>validateBackup(bad),Error,name);
  }
  assert.throws(()=>validateBackup({...file,words:file.words.map(({meaning,...w})=>w)}),Error,'legacy meaning still required (older builds need it)');
  assert.deepEqual(await listWords(),before,'nothing replaced by rejected files');
});

// Issues #5 / #12 — four card kinds, legacy compatibility, backup v1 → v2, atomic restore.
import 'fake-indexeddb/auto';
import {IDBFactory,IDBObjectStore} from 'fake-indexeddb';
import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {addWord,archiveWord,buildBackup,listReviews,listWords,resetConnectionForTests,restoreBackup,reviewWord,validateBackup,TERM_LIMIT} from '../src/data.ts';

const card=(contentType,term,extra={})=>({contentType,term,meaning:'معنى',example:'',translation:'',note:'',tag:'',...extra});
beforeEach(()=>{globalThis.indexedDB=new IDBFactory();resetConnectionForTests();});

/** Raw access to the app's database, to plant legacy (pre-#5) records exactly as old versions stored them. */
async function raw(store,mode,fn){
  const db=await new Promise((res,rej)=>{const r=indexedDB.open('wordloop-local-v1',1);r.onupgradeneeded=()=>{for(const s of ['words','reviews'])r.result.createObjectStore(s,{keyPath:'id'});r.result.createObjectStore('meta',{keyPath:'key'});};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
  const tx=db.transaction(store,mode);const out=await fn(tx.objectStore(store));
  await new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});db.close();return out;
}
const getAllRaw=store=>raw(store,'readonly',s=>new Promise(r=>{s.getAll().onsuccess=e=>r(e.target.result);}));
const at='2026-11-10T09:00:00.000Z';
function legacyWord(i,overrides={}){
  const id=`legacy-${i}`,dueAt=new Date(Date.parse(at)+i*3600_000).toISOString();
  return {id,term:`word${i}`,meaning:`معنى ${i}`,example:'',translation:'',tag:'عام',createdAt:at,updatedAt:at,dueAt,
    fsrsState:{cardId:id,dueAt,stability:1.5+i,difficulty:5,state:2,reps:3,lapses:0,lastReviewAt:at,learningSteps:0},archived:i%7===0,revision:i%4,...overrides};
}
function legacyReview(i,wordId){return {id:`r-${i}`,wordId,grade:['again','hard','good','easy'][i%4],reviewedAt:at,nextDueAt:at};}

test('TYPE-01: all four kinds are saved with their canonical contentType and fields',async()=>{
  await addWord(card('vocabulary','overlook'));
  await addWord(card('phrase','in charge of',{example:"I'm in charge of the budget."}));
  await addWord(card('sentence','I forgot my keys.'));
  await addWord(card('idiom','break the ice',{meaning:'يكسر الحاجز ويبدأ الكلام',note:'يقال عند بداية تعارف لتخفيف التوتر',example:'He told a joke to break the ice.'}));
  const byTerm=Object.fromEntries((await listWords()).map(w=>[w.term,w]));
  assert.equal(byTerm['overlook'].contentType,'vocabulary');
  assert.equal(byTerm['in charge of'].contentType,'phrase');
  assert.equal(byTerm['I forgot my keys.'].contentType,'sentence');
  const idiom=byTerm['break the ice'];
  assert.equal(idiom.contentType,'idiom');assert.equal(idiom.note,'يقال عند بداية تعارف لتخفيف التوتر');assert.equal(idiom.example,'He told a joke to break the ice.');
  const stored=await getAllRaw('words');
  assert.ok(stored.every(w=>['vocabulary','phrase','sentence','idiom'].includes(w.contentType)),'new records store the kind');
});

test('TYPE-02: same text may exist as phrase and idiom; same-kind duplicates are refused',async()=>{
  await addWord(card('phrase','break the ice'));
  await addWord(card('idiom','Break  the ICE'));
  await assert.rejects(addWord(card('idiom','break the ice ')),/موجودة/);
  await assert.rejects(addWord(card('phrase','BREAK THE ICE')),/موجودة/);
  assert.equal((await listWords()).length,2);
});

test('length limits per kind: real sentences fit; over-long text and unknown kinds are refused',async()=>{
  await addWord(card('sentence','a'.repeat(TERM_LIMIT.sentence)));
  await assert.rejects(addWord(card('sentence','b'.repeat(TERM_LIMIT.sentence+1))),/أطول/);
  await assert.rejects(addWord(card('vocabulary','c'.repeat(TERM_LIMIT.vocabulary+1))),/أطول/);
  await assert.rejects(addWord(card('idiom','x',{note:'n'.repeat(501)})),/أطول/);
  await assert.rejects(addWord(card('proverb','x')),/نوع البطاقة/);
});

test('legacy cards (no contentType) read as vocabulary; review keeps id/FSRS history and stores the kind',async()=>{
  // A real FSRS-7 card, then stored exactly as pre-#5 versions did (no contentType/note).
  const made=await addWord(card('vocabulary','legacy'));resetConnectionForTests();
  const {contentType,note,...old}=made;void contentType;void note;
  await raw('words','readwrite',s=>{s.put(old);});
  const [w]=await listWords();
  assert.equal(w.contentType,'vocabulary');assert.equal(w.note,'');assert.equal(w.id,old.id);assert.equal(w.dueAt,old.dueAt);assert.deepEqual(w.fsrsState,old.fsrsState);
  assert.equal((await getAllRaw('words'))[0].contentType,undefined,'reading does not rewrite stored data');
  await reviewWord(old.id,'good');
  const [after]=await getAllRaw('words');
  assert.equal(after.id,old.id);assert.equal(after.contentType,'vocabulary');assert.equal(after.revision,old.revision+1);assert.equal(after.createdAt,old.createdAt);
  assert.equal((await listReviews())[0].wordId,old.id);
});

test('archiving a legacy card keeps everything and normalises its kind',async()=>{
  const old=legacyWord(2,{archived:false});
  await raw('words','readwrite',s=>{s.put(old);});
  await archiveWord(old.id);
  const [after]=await getAllRaw('words');
  assert.deepEqual({...after,updatedAt:old.updatedAt},{...old,archived:true,contentType:'vocabulary',note:''});
});

test('DATA-04: a 50-card legacy library is unchanged by the upgrade (count, IDs, due dates, revision, history)',async()=>{
  const words=Array.from({length:50},(_,i)=>legacyWord(i+1));
  const reviews=words.flatMap((w,i)=>[legacyReview(2*i,w.id),legacyReview(2*i+1,w.id)]);
  await raw('words','readwrite',s=>{for(const w of words)s.put(w);});
  await raw('reviews','readwrite',s=>{for(const r of reviews)s.put(r);});
  const list=await listWords();
  assert.equal(list.length,50);
  for(const w of words){const n=list.find(x=>x.id===w.id);assert.ok(n);assert.equal(n.dueAt,w.dueAt);assert.equal(n.revision,w.revision);assert.equal(n.archived,w.archived);assert.deepEqual(n.fsrsState,w.fsrsState);assert.equal(n.contentType,'vocabulary');}
  assert.deepEqual((await listReviews()).sort((a,b)=>a.id.localeCompare(b.id)),reviews.sort((a,b)=>a.id.localeCompare(b.id)));
  assert.deepEqual((await getAllRaw('words')).sort((a,b)=>a.id.localeCompare(b.id)),words.sort((a,b)=>a.id.localeCompare(b.id)),'stored records untouched');
});

test('DATA-01: a v1 backup imports as vocabulary with ids, due dates, FSRS state and reviews preserved',async()=>{
  const w=legacyWord(3),r=legacyReview(1,w.id);
  const v1={app:'wordloop',version:1,exportedAt:at,words:[w],reviews:[r]};
  const safe=validateBackup(JSON.parse(JSON.stringify(v1)));
  assert.equal(safe.version,2);
  assert.deepEqual(safe.words[0],{...w,contentType:'vocabulary',note:''});
  await restoreBackup(safe);
  const [got]=await listWords();
  assert.equal(got.id,w.id);assert.equal(got.dueAt,w.dueAt);assert.deepEqual(got.fsrsState,w.fsrsState);assert.equal(got.revision,w.revision);
  assert.deepEqual(await listReviews(),[r]);
});

test('DATA-02: a v2 export round-trips into a fresh database with every kind, field and review',async()=>{
  for(const [type,term] of [['vocabulary','overlook'],['phrase','in charge of'],['sentence','I forgot my keys.'],['idiom','break the ice']])
    await addWord(card(type,term,{note:type==='idiom'?'شرح':'',example:'Example.',translation:'مثال.',tag:'سفر'}));
  const [first]=await listWords();await reviewWord(first.id,'again');
  const file=JSON.stringify(await buildBackup());
  const before={words:await listWords(),reviews:await listReviews()};
  assert.equal(JSON.parse(file).version,2);
  globalThis.indexedDB=new IDBFactory();resetConnectionForTests(); // "another device"
  await restoreBackup(validateBackup(JSON.parse(file)));
  assert.deepEqual(await listWords(),before.words);
  assert.deepEqual(await listReviews(),before.reviews);
});

test('DATA-03: invalid backups are rejected before anything local is replaced',async()=>{
  await addWord(card('vocabulary','keepme'));
  const good=await buildBackup();
  const bad=[
    ['unknown version',{...good,version:3}],
    ['v2 card without kind',{...good,words:good.words.map(({contentType,...w})=>w)}],
    ['unknown kind',{...good,words:good.words.map(w=>({...w,contentType:'proverb'}))}],
    ['v1 with a bad kind',{...good,version:1,words:good.words.map(w=>({...w,contentType:'proverb'}))}],
    ['note too long',{...good,words:good.words.map(w=>({...w,note:'x'.repeat(501)}))}],
    ['wrong dueAt',{...good,words:good.words.map(w=>({...w,dueAt:'2020-01-01T00:00:00.000Z'}))}],
    ['orphan review',{...good,reviews:[{id:'r-x',wordId:'nope',grade:'good',reviewedAt:at,nextDueAt:at}]}],
    ['too many cards',{...good,words:new Array(50001).fill(null)}],
    ['not wordloop',{...good,app:'other'}],
  ];
  for(const [name,payload] of bad)await assert.rejects(restoreBackup(payload),Error,name);
  assert.deepEqual((await listWords()).map(w=>w.term),['keepme']);
});

test('DATA-05: a failure in the middle of a restore leaves the existing database intact',async()=>{
  await addWord(card('vocabulary','keepme'));await addWord(card('idiom','break the ice'));
  const before=await listWords();
  const incoming=validateBackup({app:'wordloop',version:1,exportedAt:at,words:[legacyWord(1),legacyWord(2),legacyWord(3)],reviews:[]});
  const put=IDBObjectStore.prototype.put;let n=0;
  IDBObjectStore.prototype.put=function(...a){if(++n===2)throw new DOMException('boom','DataCloneError');return put.apply(this,a);};
  try{await assert.rejects(restoreBackup(incoming));}finally{IDBObjectStore.prototype.put=put;}
  assert.deepEqual(await listWords(),before);
});

test('TYPE-05: FSRS scheduling depends on the grade, not the kind',async()=>{
  for(const grade of ['again','hard','good','easy']){
    globalThis.indexedDB=new IDBFactory();resetConnectionForTests();
    const intervals={};
    for(const type of ['vocabulary','phrase','sentence','idiom']){
      const w=await addWord(card(type,`${type} ${grade}`));
      const t=Date.now();const next=await reviewWord(w.id,grade);intervals[type]=Date.parse(next)-t;
    }
    const base=intervals.vocabulary;
    for(const [type,ms] of Object.entries(intervals))assert.ok(Math.abs(ms-base)<2000,`${grade}/${type}: ${ms} vs ${base}`);
  }
});

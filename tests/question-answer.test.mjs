// Issue #18 — Question & Answer, a fifth card kind: storage, rollback safety, duplicates, review, backup, FSRS invariants.
import 'fake-indexeddb/auto';
import {IDBFactory} from 'fake-indexeddb';
import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {addWord,archiveWord,buildBackup,createDeck,createFolder,editWord,listReviews,listWords,moveWord,normalizeWord,resetConnectionForTests,restoreBackup,reviewWord,summary,validateBackup,toStored,TERM_LIMIT,CONTENT_TYPES} from '../src/data.ts';
import {readingAvailability} from '../src/practice.ts';

beforeEach(()=>{globalThis.indexedDB=new IDBFactory();resetConnectionForTests();});
const qa=(term,answer,extra={})=>({contentType:'question_answer',term,meanings:[answer],example:'',translation:'',note:'',tag:'',...extra});
const word=(term,extra={})=>({contentType:'vocabulary',term,meanings:['معنى'],example:'',translation:'',note:'',tag:'',...extra});

async function rawWords(){
  const db=await new Promise((res,rej)=>{const r=indexedDB.open('wordloop-local-v1',1);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
  const all=await new Promise(r=>{db.transaction('words').objectStore('words').getAll().onsuccess=e=>r(e.target.result);});db.close();return all;
}
async function putRaw(record){
  const db=await new Promise((res,rej)=>{const r=indexedDB.open('wordloop-local-v1',1);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
  const tx=db.transaction('words','readwrite');tx.objectStore('words').put(record);
  await new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});db.close();
}
/** Forces a card due now (as if its time had come), without touching anything else. */
async function makeDue(id){const w=(await rawWords()).find(x=>x.id===id);const past=new Date(Date.now()-60_000).toISOString();await putRaw({...w,dueAt:past,fsrsState:{...w.fsrsState,dueAt:past}});}
const fsrsOf=w=>({id:w.id,dueAt:w.dueAt,fsrsState:w.fsrsState,revision:w.revision,createdAt:w.createdAt});

test('QA-01: a question is saved as its own kind with answer and explanation; one FSRS card',async()=>{
  const w=await addWord(qa('ما وظيفة DNS؟','تحويل أسماء النطاقات إلى عناوين IP',{note:'example.com ← 93.184.216.34'}));
  assert.equal(w.contentType,'question_answer');
  assert.deepEqual(w.meanings,['تحويل أسماء النطاقات إلى عناوين IP']);assert.equal(w.meaning,w.meanings[0]);
  assert.equal(w.note,'example.com ← 93.184.216.34');
  const [read]=await listWords();
  assert.equal(read.contentType,'question_answer');assert.equal(read.cardType,undefined,'the storage marker never leaks into the app shape');
  assert.ok(CONTENT_TYPES.includes('question_answer'));assert.equal(TERM_LIMIT.question_answer,300);
});

test('QA-02 rollback safety: stored as a legacy sentence + cardType marker, readable and kept by a pre-#18 build',async()=>{
  const w=await addWord(qa('What does DNS do?','Turns names into IP addresses'));
  const [raw]=await rawWords();
  assert.equal(raw.contentType,'sentence','an old build sees a valid legacy kind');
  assert.equal(raw.cardType,'question_answer');
  assert.equal(raw.meaning,'Turns names into IP addresses','old builds read the single meaning');
  // A pre-#18 build: spreads the stored record, coerces only unknown kinds, then writes after a review.
  const oldNormalize=s=>({...s,contentType:['vocabulary','phrase','sentence','idiom'].includes(s.contentType)?s.contentType:'vocabulary',note:s.note??''});
  const old=oldNormalize(raw);assert.equal(old.contentType,'sentence');
  await putRaw({...old,revision:old.revision+1,updatedAt:new Date().toISOString()});
  const [back]=await listWords();
  assert.equal(back.contentType,'question_answer','after roll-forward the card is still a question');
  assert.equal(back.id,w.id);assert.equal(back.revision,1);
});

test('QA-03: duplicates are checked among questions only; the four kinds never mix with Q&A',async()=>{
  await addWord(word('DNS'));
  await addWord(qa('DNS','نظام أسماء النطاقات'));
  await assert.rejects(addWord(qa('  dns ','ثاني')),/موجودة/);
  await assert.rejects(addWord(word('dns')),/موجودة/);
  const list=await listWords();
  assert.deepEqual(list.map(w=>w.contentType).sort(),['question_answer','vocabulary']);
});

test('QA-04: review grades a question like any card; move/edit/archive keep FSRS, reviews and the kind',async()=>{
  const f=await createFolder('علوم الحاسب'),d=await createDeck({folderId:f.id,name:'Networking',contentLanguage:'ar-SA',meaningLanguage:'ar-SA'});
  const w=await addWord(qa('ما وظيفة DNS؟','تحويل الأسماء إلى عناوين',{deckId:d.id}));
  await makeDue(w.id);
  const next=await reviewWord(w.id,'good');
  let [after]=await listWords();
  assert.equal(after.contentType,'question_answer');assert.equal(after.revision,1);assert.equal(after.dueAt,next);
  assert.equal((await listReviews()).length,1);
  const before=fsrsOf(after);
  await moveWord(w.id,'00000000-0000-4000-8000-00000000d001');
  await editWord(w.id,{term:'ما وظيفة خادم DNS؟',meanings:['يحوّل أسماء النطاقات إلى عناوين IP'],note:'شرح'});
  await archiveWord(w.id);
  [after]=await listWords();
  assert.deepEqual(fsrsOf(after),before,'moving, editing and archiving never touch dueAt / fsrsState / revision');
  assert.equal(after.contentType,'question_answer');assert.equal(after.archived,true);assert.equal(after.note,'شرح');
  assert.equal((await listReviews()).length,1,'the review log is unchanged');
  assert.equal((await rawWords())[0].cardType,'question_answer');
});

test('QA-05: adding a question changes no other card\'s schedule',async()=>{
  const a=await addWord(word('overlook'));await makeDue(a.id);await reviewWord(a.id,'hard');
  const before=(await listWords()).map(fsrsOf);
  await addWord(qa('Q?','A'));
  const after=(await listWords()).filter(w=>w.contentType!=='question_answer').map(fsrsOf);
  assert.deepEqual(after,before);
});

test('QA-06 backup: exported in the stored shape (v4, older builds can import it); round trip keeps kind, FSRS and reviews',async()=>{
  const w=await addWord(qa('What is TCP?','A reliable transport protocol',{note:'Three-way handshake'}));
  await makeDue(w.id);await reviewWord(w.id,'easy');
  await addWord(word('overlook'));
  const backup=await buildBackup();
  assert.equal(backup.version,4);
  const exported=backup.words.find(x=>x.id===w.id);
  assert.equal(exported.contentType,'sentence');assert.equal(exported.cardType,'question_answer');
  const before=(await listWords()).map(fsrsOf).sort((a,b)=>a.id.localeCompare(b.id));
  globalThis.indexedDB=new IDBFactory();resetConnectionForTests();
  await restoreBackup(JSON.parse(JSON.stringify(backup)));
  const list=await listWords();
  assert.equal(list.find(x=>x.id===w.id).contentType,'question_answer');
  assert.equal(list.find(x=>x.id===w.id).note,'Three-way handshake');
  assert.deepEqual(list.map(fsrsOf).sort((a,b)=>a.id.localeCompare(b.id)),before);
  assert.equal((await listReviews()).length,1);
});

test('QA-07 import: a file naming the kind directly is accepted; an unknown marker is refused before anything changes',async()=>{
  const w=await addWord(qa('Q1?','A1'));
  const backup=JSON.parse(JSON.stringify(await buildBackup()));
  const direct={...backup,words:backup.words.map(({cardType,...x})=>({...x,contentType:'question_answer'}))};
  assert.equal(validateBackup(direct).words[0].contentType,'question_answer');
  const bad={...backup,words:backup.words.map(x=>({...x,cardType:'flashcard'}))};
  assert.throws(()=>validateBackup(bad),/غير صحيحة/);
  await assert.rejects(restoreBackup(bad));
  assert.equal((await listWords())[0].id,w.id,'a refused import leaves local data as it was');
});

test('QA-08: toStored/normalizeWord are inverse for every kind; legacy records stay untouched',()=>{
  const base={id:'x',deckId:'d',term:'t',meaning:'m',meanings:['m'],example:'',translation:'',note:'',tag:'عام',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',dueAt:'2026-01-01T00:00:00.000Z',fsrsState:{},archived:false,revision:0};
  for(const k of CONTENT_TYPES){const w={...base,contentType:k};assert.deepEqual(normalizeWord(toStored(w)),w,k);}
  assert.deepEqual(toStored({...base,contentType:'idiom'}),{...base,contentType:'idiom'});
});

test('QA-09: stats count questions like any card; practice never turns a question into a word exercise',async()=>{
  const w=await addWord(qa('DNS','نظام أسماء'));
  const s=summary(await listWords(),[]);
  assert.equal(s.inLibrary,1);assert.equal(s.dueNow,1);
  const passage={id:'p',deckId:w.deckId,title:'t',body:'DNS is everywhere. DNS maps names.',contentLanguage:'en-US',translation:'',questions:[],createdAt:'',updatedAt:''};
  const avail=readingAvailability(passage,await listWords());
  assert.equal(avail.cloze,0);assert.equal(avail.meaning,0);
});

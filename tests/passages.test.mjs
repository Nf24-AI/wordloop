// Issue #21 — Learning Passages: local-only texts inside decks with learner-provided facts; backup v4 keeps them and
// still accepts v1–v3; IndexedDB stays at version 1; cards, reviews and FSRS are never touched.
import 'fake-indexeddb/auto';
import {IDBFactory} from 'fake-indexeddb';
import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {createFolder,createDeck,deleteDeck,addWord,listWords,listReviews,reviewWord,createPassage,updatePassage,deletePassage,listPassages,getPassage,
  buildBackup,validateBackup,restoreBackup,resetConnectionForTests,PASSAGE_LIMITS} from '../src/data.ts';

beforeEach(()=>{globalThis.indexedDB=new IDBFactory();resetConnectionForTests();});
const LUCIA='Lucía vive en Madrid. Estudia español todos los días.';
async function spanishDeck(){const f=await createFolder('Idiomas');return createDeck({folderId:f.id,name:'Español',contentLanguage:'es-ES',meaningLanguage:'ar-SA'});}

test('a Spanish passage is saved in its deck with the deck language, survives a reload, and keeps its facts',async()=>{
  const es=await spanishDeck();
  const p=await createPassage({deckId:es.id,title:'Lucía',body:LUCIA,questions:[{question:'Where does Lucía live?',answer:'Madrid',quote:'vive en Madrid'}]});
  assert.equal(p.contentLanguage,'es-ES');assert.equal(p.deckId,es.id);
  assert.deepEqual(p.questions.map(q=>[q.question,q.answer,q.quote]),[['Where does Lucía live?','Madrid','vive en Madrid']]);
  resetConnectionForTests(); // like a reload: a fresh connection to the same database
  assert.deepEqual(await getPassage(p.id),p);
  assert.deepEqual((await listPassages(es.id)).map(x=>x.id),[p.id]);
  assert.equal((await listPassages('another-deck')).length,0);
  const db=await new Promise(r=>{const q=indexedDB.open('wordloop-local-v1');q.onsuccess=()=>r(q.result);});
  assert.equal(db.version,1,'no IndexedDB upgrade: an older build can still open the database');db.close();
});

test('facts must be sourced: the quote has to be in the text; empty question/answer and over-long input are refused',async()=>{
  const es=await spanishDeck();
  await assert.rejects(createPassage({deckId:es.id,title:'x',body:LUCIA,questions:[{question:'Where?',answer:'Madrid',quote:'vive en Sevilla'}]}),/المقتطف لازم يكون من النص/);
  await assert.rejects(createPassage({deckId:es.id,title:'x',body:LUCIA,questions:[{question:'Where?',answer:''}]}),/اكتب السؤال وإجابته/);
  await assert.rejects(createPassage({deckId:es.id,title:'',body:LUCIA}),/اكتب عنوانًا ونصًا/);
  await assert.rejects(createPassage({deckId:es.id,title:'x',body:'a'.repeat(PASSAGE_LIMITS.body+1)}),/أطول من اللازم/);
  await assert.rejects(createPassage({deckId:'nope',title:'x',body:LUCIA}),/لم نجد الحزمة/);
  await assert.rejects(createPassage({deckId:es.id,title:'x',body:LUCIA,contentLanguage:'not a tag'}),/رمز اللغة/);
  const p=await createPassage({deckId:es.id,title:'x',body:LUCIA,questions:[{question:'Where?',answer:'Madrid',alternatives:['madrid','en Madrid',' en Madrid ']}]});
  assert.deepEqual(p.questions[0].alternatives,['en Madrid'],'trimmed, de-duplicated, never the answer itself');
  assert.equal((await listPassages()).length,1,'refused passages wrote nothing');
});

test('edit keeps ids and createdAt; a deck holding passages cannot be deleted; deleting the passage frees it',async()=>{
  const es=await spanishDeck();
  const p=await createPassage({deckId:es.id,title:'Lucía',body:LUCIA,questions:[{question:'Where?',answer:'Madrid'}]});
  const q=p.questions[0];
  const next=await updatePassage(p.id,{title:'Lucía en Madrid',questions:[{...q,answer:'Madrid, España'}]});
  assert.equal(next.id,p.id);assert.equal(next.createdAt,p.createdAt);assert.equal(next.questions[0].id,q.id,'question id kept');
  assert.equal(next.questions[0].answer,'Madrid, España');
  await assert.rejects(deleteDeck(es.id),/فيها نصوص/);
  await deletePassage(p.id);
  assert.equal((await listPassages()).length,0);
  await deleteDeck(es.id);
});

test('passages never touch cards, reviews or FSRS',async()=>{
  const es=await spanishDeck();
  const w=await addWord({term:'hola',meanings:['مرحبا'],example:'',translation:'',tag:'',contentType:'vocabulary',deckId:es.id});
  await reviewWord(w.id,'good');
  const words=await listWords(),reviews=await listReviews();
  const p=await createPassage({deckId:es.id,title:'Lucía',body:LUCIA});
  await updatePassage(p.id,{body:LUCIA+' Le gusta leer.'});await deletePassage(p.id);
  assert.deepEqual(await listWords(),words);assert.deepEqual(await listReviews(),reviews);
});

test('backup v4 round-trips passages; v3 files (no passages) are still accepted; an invalid passage rejects the file before anything changes',async()=>{
  const es=await spanishDeck();
  await createPassage({deckId:es.id,title:'Lucía',body:LUCIA,translation:'لوسيا تعيش في مدريد.',questions:[{question:'Where does Lucía live?',answer:'Madrid',alternatives:['en Madrid'],quote:'vive en Madrid'}]});
  const backup=JSON.parse(JSON.stringify(await buildBackup()));
  assert.equal(backup.version,4);assert.equal(backup.passages.length,1);
  const before=await listPassages();
  globalThis.indexedDB=new IDBFactory();resetConnectionForTests();
  await restoreBackup(validateBackup(backup));
  assert.deepEqual(await listPassages(),before);
  const v3={...backup,version:3};delete v3.passages;
  assert.deepEqual(validateBackup(v3).passages,[],'older files: no passages, everything else as before');
  assert.equal(validateBackup(v3).words.length,backup.words.length);
  for(const bad of [{...backup,passages:[{...backup.passages[0],deckId:'missing'}]},{...backup,passages:[{...backup.passages[0],questions:[{...backup.passages[0].questions[0],quote:'not in the text'}]}]},
    {...backup,passages:undefined},{...backup,passages:[backup.passages[0],backup.passages[0]]}])
    assert.throws(()=>validateBackup(bad));
  await assert.rejects(restoreBackup({...backup,passages:[{...backup.passages[0],deckId:'missing'}]}));
  assert.deepEqual(await listPassages(),before,'a rejected file changes nothing');
});

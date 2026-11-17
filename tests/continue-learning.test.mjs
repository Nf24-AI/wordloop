// Issue #27 — Continue Learning: a device-local pointer resolved honestly against current data; read-only for FSRS.
import 'fake-indexeddb/auto';
import {IDBFactory} from 'fake-indexeddb';
import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {addWord,archiveWord,createDeck,createFolder,deleteDeck,listLibrary,listReviews,listWords,moveWord,resetConnectionForTests,updateDeck,DEFAULT_DECK_ID} from '../src/data.ts';
import {forgetContinue,readContinue,rememberContinue,resolveContinue} from '../src/continue.ts';

beforeEach(()=>{globalThis.indexedDB=new IDBFactory();resetConnectionForTests();});
const card=(term,deckId)=>({contentType:'vocabulary',term,meanings:['معنى'],example:'',translation:'',note:'',tag:'',deckId});
/** A Storage stand-in (the PWA's localStorage survives a relaunch; a Map is enough to model that here). */
function memoryStorage(){const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>{m.set(k,String(v));},removeItem:k=>{m.delete(k);}};}
const HOUR=3600_000;

test('CONT-01: the last meaningful deck wins and survives a relaunch (A then B → B)',()=>{
  const s=memoryStorage();
  rememberContinue('deck','A',s);rememberContinue('deck','B',s);
  // «Relaunch»: a new read from the same storage.
  assert.deepEqual({...readContinue(s),at:undefined},{kind:'deck',id:'B',at:undefined});
  forgetContinue(s);assert.equal(readContinue(s),null);
});

test('CONT-02: corrupt or foreign values never produce a pointer',()=>{
  for(const raw of ['{', '"x"', JSON.stringify({kind:'card',id:'x',at:'t'}), JSON.stringify({kind:'deck',id:'',at:'t'}), JSON.stringify({kind:'deck',id:'x'.repeat(81),at:'t'})]){
    const s=memoryStorage();s.setItem('wordloop-continue',raw);assert.equal(readContinue(s),null,raw);
  }
  assert.equal(readContinue(null),null);
  assert.doesNotThrow(()=>rememberContinue('deck','x',{setItem(){throw new DOMException('full','QuotaExceededError');}}));
});

test('CONT-03: due cards → review (only still-due ones); finished → open; all archived → add; deleted → nothing',async()=>{
  const f=await createFolder('الإنجليزية'),a=await createDeck({folderId:f.id,name:'A'}),b=await createDeck({folderId:f.id,name:'B'});
  const x=await addWord(card('one',b.id)),y=await addWord(card('two',b.id));
  let lib=await listLibrary(),words=await listWords();
  const p={kind:'deck',id:b.id,at:new Date().toISOString()};
  assert.deepEqual(resolveContinue(p,lib,words),{action:'review',kind:'deck',id:b.id,due:2,cards:2});
  // Later: both cards scheduled in the future (as after a finished review) → open the deck, not a fake «continue».
  const later=Date.now()-HOUR;
  assert.equal(resolveContinue(p,lib,words,later).action,'open');
  await archiveWord(x.id);await archiveWord(y.id);
  words=await listWords();
  assert.deepEqual(resolveContinue(p,lib,words),{action:'add',kind:'deck',id:b.id,due:0,cards:0});
  // Move the archived cards away, delete the deck → no card at all.
  await moveWord(x.id,a.id);await moveWord(y.id,a.id);await deleteDeck(b.id);
  lib=await listLibrary();words=await listWords();
  assert.equal(resolveContinue(p,lib,words),null);
});

test('CONT-04: rename and move of the deck are tolerated (the pointer stores only the id)',async()=>{
  const f=await createFolder('F1'),g=await createFolder('F2'),d=await createDeck({folderId:f.id,name:'Old'});
  await addWord(card('word',d.id));
  await updateDeck(d.id,{name:'New name',folderId:g.id});
  const r=resolveContinue({kind:'deck',id:d.id,at:''},await listLibrary(),await listWords());
  assert.equal(r.action,'review');assert.equal(r.id,d.id);
  // A folder pointer follows the deck into its new folder.
  assert.equal(resolveContinue({kind:'folder',id:g.id,at:''},await listLibrary(),await listWords()).due,1);
  assert.equal(resolveContinue({kind:'folder',id:f.id,at:''},await listLibrary(),await listWords()),null,'an empty folder offers nothing');
});

test('CONT-05: resolving never changes FSRS, dueAt, revisions or the review log',async()=>{
  await addWord(card('a',DEFAULT_DECK_ID));await addWord(card('b',DEFAULT_DECK_ID));
  const before=JSON.stringify(await listWords()),reviews=JSON.stringify(await listReviews());
  const lib=await listLibrary(),words=await listWords();
  for(let i=0;i<5;i++)resolveContinue({kind:'deck',id:DEFAULT_DECK_ID,at:''},lib,words);
  assert.equal(JSON.stringify(await listWords()),before);
  assert.equal(JSON.stringify(await listReviews()),reviews);
});

// Issue #26 (UI batch 2B) — data support for the unified Add form: internal kind from text shape, optional per-card
// language override, multi-meaning card is one FSRS unit, and the v3 backup keeps all of it.
import 'fake-indexeddb/auto';
import {IDBFactory} from 'fake-indexeddb';
import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {addWord,inferContentType,createFolder,createDeck,buildBackup,restoreBackup,validateBackup,listWords,resetConnectionForTests,cardLanguages,listLibrary} from '../src/data.ts';

beforeEach(()=>{globalThis.indexedDB=new IDBFactory();resetConnectionForTests();});
const card=(term,extra={})=>({term,meanings:['معنى'],example:'',translation:'',tag:'',...extra});

test('inferContentType uses text shape only and never guesses idiom',()=>{
  for(const [t,k] of [['show','vocabulary'],['  serendipity ','vocabulary'],['in charge of','phrase'],['break the ice','phrase'],
    ['I forgot my keys.','sentence'],['Where are you?','sentence'],['هل أنت بخير؟','sentence'],['one two three four five six','sentence'],['a b c d e','phrase'],['','vocabulary']])
    assert.equal(inferContentType(t),k,t);
});

test('a card saved without a kind gets the inferred kind; one card with several meanings is one FSRS unit',async()=>{
  const w=await addWord({...card('show',{meanings:['يُظهر','عرض (فيلم، منتج)']}),contentType:inferContentType('show')});
  assert.equal(w.contentType,'vocabulary');assert.deepEqual(w.meanings,['يُظهر','عرض (فيلم، منتج)']);assert.equal(w.meaning,'يُظهر');
  const all=await listWords();assert.equal(all.length,1);assert.equal(all[0].fsrsState.cardId,w.id);
});

test('per-card languages: omitted → deck languages apply; given → canonical and stored; invalid → refused, nothing saved',async()=>{
  const f=await createFolder('Langs');const es=await createDeck({folderId:f.id,name:'Español',contentLanguage:'es-ES',meaningLanguage:'ar-SA'});
  const plain=await addWord({...card('hola'),deckId:es.id});
  assert.equal(plain.contentLanguage,undefined);assert.deepEqual(cardLanguages(plain,(await listLibrary()).decks),{content:'es-ES',meaning:'ar-SA'});
  const over=await addWord({...card('bonjour'),deckId:es.id,contentLanguage:'FR-fr',meaningLanguage:'en-us'});
  assert.equal(over.contentLanguage,'fr-FR');assert.equal(over.meaningLanguage,'en-US');
  await assert.rejects(addWord({...card('nope'),deckId:es.id,contentLanguage:'not a tag'}),/رمز اللغة غير صحيح/);
  assert.equal((await listWords()).length,2);
});

test('v3 backup round-trips inferred kinds, meanings and per-card languages',async()=>{
  await addWord({...card('show',{meanings:['يُظهر','عرض']}),contentType:'vocabulary'});
  await addWord({...card('I forgot my keys.'),contentType:inferContentType('I forgot my keys.'),contentLanguage:'en-GB'});
  const backup=await buildBackup();const before=await listWords();
  globalThis.indexedDB=new IDBFactory();resetConnectionForTests();
  const v=validateBackup(JSON.parse(JSON.stringify(backup)));assert.ok(v);await restoreBackup(v);
  assert.deepEqual(await listWords(),before);
});

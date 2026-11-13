// Issue #4 — save / library consistency against a real IndexedDB implementation (fake-indexeddb, in memory).
import 'fake-indexeddb/auto';
import {IDBFactory} from 'fake-indexeddb';
import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {addWord,archiveWord,listWords,normalizeTerm,onOtherTabChange,resetConnectionForTests} from '../src/data.ts';

const fields=(term,meaning='معنى')=>({term,meaning,example:'',translation:'',tag:''});
beforeEach(()=>{globalThis.indexedDB=new IDBFactory();resetConnectionForTests();});

test('SAVE-01: two sequential saves are both listed with their fields',async()=>{
  const a=await addWord(fields('overlook','يغفل عن'));
  const b=await addWord({term:'reliable',meaning:'موثوق',example:'She is reliable.',translation:'هي موثوقة.',tag:'عمل'});
  const list=await listWords();
  assert.deepEqual(list.map(w=>w.id).sort(),[a.id,b.id].sort());
  const saved=list.find(w=>w.id===b.id);
  assert.equal(saved.term,'reliable');assert.equal(saved.meaning,'موثوق');assert.equal(saved.example,'She is reliable.');
  assert.equal(saved.translation,'هي موثوقة.');assert.equal(saved.tag,'عمل');assert.equal(saved.archived,false);assert.equal(saved.revision,0);
  assert.equal(saved.dueAt,saved.fsrsState.dueAt,'FSRS due date and card due date agree');
});

test('SAVE-02: three saves survive a fresh connection (reload analogue)',async()=>{
  for(const t of ['overlook','reliable','eventually'])await addWord(fields(t));
  resetConnectionForTests(); // same database, new connection — like reopening the app
  assert.deepEqual((await listWords()).map(w=>w.term).sort(),['eventually','overlook','reliable']);
});

test('SAVE-03: duplicates are refused regardless of case and extra spaces; the existing card is unchanged',async()=>{
  const first=await addWord(fields('in charge of','مسؤول عن'));
  for(const dup of ['  In Charge Of  ','IN   CHARGE\tOF'])await assert.rejects(addWord(fields(dup,'شي ثاني')),/موجودة عندك بالفعل/);
  const list=await listWords();
  assert.equal(list.length,1);assert.deepEqual(list[0],first);
});

test('SAVE-03: inner whitespace is collapsed when saving; normalizeTerm is the duplicate key',async()=>{
  const w=await addWord(fields('  break   the  ice '));
  assert.equal(w.term,'break the ice');
  assert.equal(normalizeTerm(' Break  THE ice'),'break the ice');
});

test('archived cards do not block re-adding the same term',async()=>{
  const w=await addWord(fields('overlook'));await archiveWord(w.id);
  const again=await addWord(fields('Overlook'));
  const list=await listWords();
  assert.equal(list.length,2);assert.equal(list.find(x=>x.id===w.id).archived,true);assert.equal(list.find(x=>x.id===again.id).archived,false);
});

test('SAVE-04: a storage failure rejects the save and writes nothing',async()=>{
  await addWord(fields('overlook'));
  const {IDBObjectStore}=await import('fake-indexeddb');
  const original=IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add=function(){throw new DOMException('quota','QuotaExceededError');};
  try{await assert.rejects(addWord(fields('reliable')),e=>e instanceof DOMException&&e.name==='QuotaExceededError');}
  finally{IDBObjectStore.prototype.add=original;}
  assert.deepEqual((await listWords()).map(w=>w.term),['overlook']);
});

test('reopens automatically when the cached connection was closed (no reload needed)',async()=>{
  await addWord(fields('overlook'));
  const {IDBDatabase}=await import('fake-indexeddb');
  const original=IDBDatabase.prototype.transaction;let calls=0,failures=0;
  // First transaction attempt behaves like a connection the browser already closed.
  IDBDatabase.prototype.transaction=function(...args){if(!calls++){failures++;throw new DOMException('closed','InvalidStateError');}return original.apply(this,args);};
  try{await addWord(fields('reliable'));}
  finally{IDBDatabase.prototype.transaction=original;}
  assert.equal(failures,1,'the closed connection failed once and the save still succeeded on retry');
  assert.deepEqual((await listWords()).map(w=>w.term).sort(),['overlook','reliable']);
});

test('a versionchange (e.g. another tab deleting/upgrading) drops the cached connection instead of breaking later saves',async()=>{
  await addWord(fields('overlook'));
  await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase('wordloop-local-v1');r.onsuccess=resolve;r.onerror=()=>reject(r.error);});
  await addWord(fields('reliable')); // must not throw "database connection is closing"
  assert.deepEqual((await listWords()).map(w=>w.term),['reliable']);
});

test('other open tabs are told to refresh after a committed save (ping only, no word data)',async()=>{
  const messages=[];
  const ch=new BroadcastChannel('wordloop-local-changes');ch.onmessage=e=>messages.push(e.data);
  try{
    await addWord(fields('overlook'));
    await new Promise(r=>setTimeout(r,50));
    assert.deepEqual(messages,[{type:'changed'}]);
    let called=0;const stop=onOtherTabChange(()=>called++);
    await addWord(fields('reliable'));await new Promise(r=>setTimeout(r,50));stop();
    assert.equal(called,1);
  }finally{ch.close();}
});

// Issue #29 — sort, multi-select move and archive: atomic, counts correct, FSRS and review history untouched.
import 'fake-indexeddb/auto';
import {IDBFactory} from 'fake-indexeddb';
import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {addWord,archiveWords,buildBackup,createDeck,createFolder,libraryCounts,listLibrary,listReviews,listWords,moveWords,resetConnectionForTests,reviewWord,sortWords} from '../src/data.ts';

beforeEach(()=>{globalThis.indexedDB=new IDBFactory();resetConnectionForTests();});
const card=(term,deckId)=>({contentType:'vocabulary',term,meanings:['م'],example:'',translation:'',tag:'',deckId});
const keep=w=>({id:w.id,createdAt:w.createdAt,dueAt:w.dueAt,revision:w.revision,fsrsState:w.fsrsState,term:w.term,meanings:w.meanings,contentType:w.contentType});

async function setup(){
  const f=await createFolder('الإنجليزية'),a=await createDeck({folderId:f.id,name:'A'}),b=await createDeck({folderId:f.id,name:'B'});
  const cards=[];for(const t of ['one','two','three','four','five'])cards.push(await addWord(card(t,a.id)));
  await reviewWord(cards[0].id,'good');await reviewWord(cards[1].id,'again');
  return {a,b,cards};
}

test('ORG-01: move 3 selected cards to another deck — counts follow, FSRS and reviews stay exactly as they were',async()=>{
  const {a,b,cards}=await setup();
  const before=new Map((await listWords()).map(w=>[w.id,keep(w)])),reviews=JSON.stringify(await listReviews());
  const ids=[cards[0].id,cards[1].id,cards[2].id];
  assert.equal(await moveWords([...ids,ids[0]],b.id),3,'duplicated ids count once');
  const after=await listWords();
  for(const id of ids){const w=after.find(x=>x.id===id);assert.equal(w.deckId,b.id);assert.deepEqual(keep(w),before.get(id));}
  assert.equal(JSON.stringify(await listReviews()),reviews);
  const {deck}=libraryCounts(after,(await listLibrary()).decks);
  assert.equal(deck.get(a.id).cards,2);assert.equal(deck.get(b.id).cards,3);
  assert.equal(await moveWords(ids,b.id),0,'moving again changes nothing');
});

test('ORG-02: a move is all-or-nothing (missing card or deck → nothing moves)',async()=>{
  const {a,b,cards}=await setup();
  await assert.rejects(moveWords([cards[0].id,'gone'],b.id),/لم نجد/);
  await assert.rejects(moveWords([cards[0].id],'no-such-deck'),/الحزمة/);
  assert.ok((await listWords()).every(w=>w.deckId===a.id));
});

test('ORG-03: archive several (after confirmation in the UI) — not deleted, FSRS/reviews kept, still in the backup',async()=>{
  const {cards}=await setup();
  const before=new Map((await listWords()).map(w=>[w.id,keep(w)]));
  const ids=[cards[0].id,cards[3].id];
  assert.equal(await archiveWords(ids),2);
  assert.equal(await archiveWords(ids),0,'already archived: nothing to do');
  const list=await listWords();
  for(const id of ids){const w=list.find(x=>x.id===id);assert.equal(w.archived,true);assert.deepEqual(keep(w),before.get(id));}
  assert.equal(list.filter(w=>!w.archived).length,3);
  assert.equal((await listReviews()).length,2);
  const backup=await buildBackup();
  assert.equal(backup.words.filter(w=>w.archived).length,2);
  await assert.rejects(archiveWords([cards[1].id,'gone']),/لم نجد/);
  assert.equal((await listWords()).find(w=>w.id===cards[1].id).archived,false,'all-or-nothing');
});

test('ORG-04: sort by newest, name (natural, case-insensitive) and due date; the input is not mutated',()=>{
  const w=(term,createdAt,dueAt)=>({term,createdAt,dueAt});
  const list=[w('banana','2026-01-02','2026-03-01'),w('Apple','2026-01-03','2026-02-01'),w('item 10','2026-01-01','2026-01-01'),w('item 2','2026-01-04','2026-04-01')];
  const copy=JSON.stringify(list);
  assert.deepEqual(sortWords(list,'newest').map(x=>x.term),['item 2','Apple','banana','item 10']);
  assert.deepEqual(sortWords(list,'name').map(x=>x.term),['Apple','banana','item 2','item 10']);
  assert.deepEqual(sortWords(list,'due').map(x=>x.term),['item 10','Apple','banana','item 2']);
  assert.equal(JSON.stringify(list),copy);
});

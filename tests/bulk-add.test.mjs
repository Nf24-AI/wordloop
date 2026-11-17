// Issue #28 — Bulk Add: deterministic parsing, honest preview, one atomic save, idempotent retry, FSRS untouched.
import 'fake-indexeddb/auto';
import {IDBFactory} from 'fake-indexeddb';
import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {addWord,addWords,createDeck,createFolder,listWords,listReviews,resetConnectionForTests,reviewWord,DEFAULT_DECK_ID} from '../src/data.ts';
import {bulkCounts,checkRows,csvFields,parseBulk,splitMeanings,BULK_MAX_LINES} from '../src/bulk.ts';

beforeEach(()=>{globalThis.indexedDB=new IDBFactory();resetConnectionForTests();});
const toCards=(rows,deckId)=>rows.filter(r=>r.status==='ok'&&r.include).map(r=>({id:r.id,term:r.term,meanings:r.meanings,example:r.example,deckId}));

test('BULK-01: the predefined patterns split into term / meanings / example',()=>{
  const {rows}=parseBulk(['show — يُظهر','see – يرى','go - يذهب','be = يكون','run\tيجري\tI run daily.','bank — بنك; ضفة النهر | مصرف'].join('\n'));
  assert.deepEqual(rows.map(r=>[r.term,r.meanings,r.example]),[
    ['show',['يُظهر'],''],['see',['يرى'],''],['go',['يذهب'],''],['be',['يكون'],''],['run',['يجري'],'I run daily.'],['bank',['بنك','ضفة النهر','مصرف'],''],
  ]);
  assert.ok(rows.every(r=>r.status==='ok'&&r.include));
  assert.equal(new Set(rows.map(r=>r.id)).size,rows.length,'every row has its own id');
});

test('BULK-02: CSV only when every line has a comma; quotes keep commas; a header row is skipped',()=>{
  const csv=parseBulk('term,meaning,example\n"in charge of","مسؤول عن، قائد",She is in charge.\nbreak the ice,يكسر الحاجز');
  assert.equal(csv.skippedHeader,true);
  assert.deepEqual(csv.rows.map(r=>[r.term,r.meanings,r.example]),[['in charge of',['مسؤول عن، قائد'],'She is in charge.'],['break the ice',['يكسر الحاجز'],'']]);
  assert.deepEqual(csvFields('a,"b ""c"", d",e'),['a','b "c", d','e']);
  // A sentence with a comma in an otherwise dash-separated paste is NOT cut at the comma.
  const mixed=parseBulk('show — يُظهر\nWell, I think so');
  assert.equal(mixed.rows[1].status,'error');assert.equal(mixed.rows[1].problem,'noSplit');assert.equal(mixed.rows[1].term,'Well, I think so');
});

test('BULK-03: unstructured lines are never guessed; empty lines ignored; long pastes are capped',()=>{
  const {rows}=parseBulk('\n  \nthis is just a sentence without a meaning\n\nok — تمام\n');
  assert.equal(rows.length,2);
  assert.equal(rows[0].problem,'noSplit');assert.deepEqual(rows[0].meanings,[]);
  assert.equal(rows[1].status,'ok');
  const many=parseBulk(Array.from({length:BULK_MAX_LINES+5},(_,i)=>`w${i} — م${i}`).join('\n'));
  assert.equal(many.rows.length,BULK_MAX_LINES);assert.equal(many.truncated,true);
  assert.deepEqual(splitMeanings('a; A ;b|  ;c؛d'),['a','b','c','d']);
});

test('BULK-04: duplicates against the deck, another deck and within the paste are flagged and left out',async()=>{
  const f=await createFolder('الإنجليزية'),a=await createDeck({folderId:f.id,name:'A'}),b=await createDeck({folderId:f.id,name:'B'});
  await addWord({contentType:'vocabulary',term:'show',meanings:['يعرض'],example:'',translation:'',tag:'',deckId:a.id});
  await addWord({contentType:'vocabulary',term:'see',meanings:['يرى'],example:'',translation:'',tag:'',deckId:b.id});
  const rows=checkRows(parseBulk('Show — يُظهر\nsee — يشوف\nrun — يجري\nRUN — يركض\nnope').rows,await listWords(),a.id);
  assert.deepEqual(rows.map(r=>r.status),['dupDeck','dupLibrary','ok','dupPaste','error']);
  assert.deepEqual(rows.map(r=>r.include),[false,false,true,false,true]);
  assert.deepEqual(bulkCounts(rows),{ready:1,errors:1,duplicates:3,left:0});
  // Fixing a row (giving the error line a meaning) makes it savable.
  const fixed=checkRows(rows.map(r=>r.status==='error'?{...r,meanings:['لا']}:r),await listWords(),a.id);
  assert.equal(fixed[4].status,'ok');
});

test('BULK-05: 20 structured lines → 20 cards in the right deck, in one save, with fresh FSRS and nothing else touched',async()=>{
  const f=await createFolder('الإسبانية'),d=await createDeck({folderId:f.id,name:'Spanish A1',contentLanguage:'es-ES'});
  const old=await addWord({contentType:'vocabulary',term:'hola',meanings:['مرحبا'],example:'',translation:'',tag:''});
  await reviewWord(old.id,'good');const before=(await listWords()).find(w=>w.id===old.id);
  const text=Array.from({length:20},(_,i)=>`palabra${i} — كلمة ${i}`).join('\n');
  const rows=checkRows(parseBulk(text).rows,await listWords(),d.id);
  const res=await addWords(toCards(rows,d.id));
  assert.equal(res.saved.length,20);assert.equal(res.alreadySaved,0);
  const list=await listWords();
  assert.equal(list.filter(w=>w.deckId===d.id).length,20);
  assert.ok(list.filter(w=>w.deckId===d.id).every(w=>w.revision===0&&w.fsrsState.reps===0&&w.contentType==='vocabulary'));
  assert.deepEqual(list.find(w=>w.id===old.id),before,'an existing card keeps dueAt, FSRS and revision');
  assert.equal((await listReviews()).length,1);
});

test('BULK-06: retrying the same preview never saves twice; a bad row aborts the whole save (no partial success)',async()=>{
  const rows=checkRows(parseBulk('uno — واحد\ndos — اثنين').rows,await listWords(),DEFAULT_DECK_ID);
  const cards=toCards(rows,DEFAULT_DECK_ID);
  await addWords(cards);
  const again=await addWords(cards);
  assert.equal(again.saved.length,0);assert.equal(again.alreadySaved,2);
  assert.equal((await listWords()).length,2);
  // One invalid card → nothing from this batch is written.
  const bad=[{id:crypto.randomUUID(),term:'tres',meanings:['ثلاثة'],example:'',deckId:DEFAULT_DECK_ID},{id:crypto.randomUUID(),term:'cuatro',meanings:[''],example:'',deckId:DEFAULT_DECK_ID}];
  await assert.rejects(addWords(bad),e=>e.row===1);
  assert.equal((await listWords()).length,2);
  // A duplicate of an existing card (other id) is refused as a whole too.
  await assert.rejects(addWords([{id:crypto.randomUUID(),term:'UNO',meanings:['x'],example:'',deckId:DEFAULT_DECK_ID}]),/موجودة/);
  await assert.rejects(addWords([{id:crypto.randomUUID(),term:'x',meanings:['1'],example:'',deckId:'missing-deck'}]),/الحزمة/);
  assert.equal((await listWords()).length,2);
});

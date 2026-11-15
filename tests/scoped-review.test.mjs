// Issue #17 — scoped due review and scoped counters. Pure read-only helpers: they never change FSRS, dueAt or the review log.
import 'fake-indexeddb/auto';
import {IDBFactory} from 'fake-indexeddb';
import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {addWord,createFolder,createDeck,moveWord,archiveWord,reviewWord,listWords,listReviews,listLibrary,buildBackup,restoreBackup,validateBackup,
  resetConnectionForTests,dueInScope,inScope,scopedSummary,summary,currentDeckId,DEFAULT_DECK_ID} from '../src/data.ts';

beforeEach(()=>{globalThis.indexedDB=new IDBFactory();resetConnectionForTests();});
const card=(term,deckId)=>({term,meanings:['معنى'],example:'',translation:'',tag:'',contentType:'vocabulary',deckId});

/** Two folders, three decks, 2 cards each. Every new card is due now. */
async function seed(){
  const work=await createFolder('Work'),lang=await createFolder('Languages');
  const meet=await createDeck({folderId:work.id,name:'Meetings'}),mail=await createDeck({folderId:work.id,name:'Email'});
  const es=await createDeck({folderId:lang.id,name:'Español',contentLanguage:'es-ES',meaningLanguage:'ar-SA'});
  for(const [d,ts] of [[meet,['agenda','minutes']],[mail,['regards','cc']],[es,['hola','gracias']]])for(const t of ts)await addWord(card(t,d.id));
  return {work,lang,meet,mail,es};
}
const terms=ws=>ws.map(w=>w.term).sort();

test('three decks: a deck review shows only its cards; a folder review its decks; all = every due card exactly once',async()=>{
  const {work,lang,meet,mail,es}=await seed();
  const words=await listWords(),{decks}=await listLibrary(),later=Date.now()+60_000;
  assert.deepEqual(terms(dueInScope(words,{kind:'deck',id:meet.id},decks,later)),['agenda','minutes']);
  assert.deepEqual(terms(dueInScope(words,{kind:'deck',id:mail.id},decks,later)),['cc','regards']);
  assert.deepEqual(terms(dueInScope(words,{kind:'deck',id:es.id},decks,later)),['gracias','hola']);
  assert.deepEqual(terms(dueInScope(words,{kind:'folder',id:work.id},decks,later)),['agenda','cc','minutes','regards']);
  assert.deepEqual(terms(dueInScope(words,{kind:'folder',id:lang.id},decks,later)),['gracias','hola']);
  const all=dueInScope(words,{kind:'all'},decks,later);
  assert.equal(all.length,6);assert.equal(new Set(all.map(w=>w.id)).size,6,'no duplicates');
  assert.ok(all.every((w,i)=>i===0||all[i-1].dueAt<=w.dueAt),'oldest due first');
});

test('scoped counters add up to the global ones and separate unique cards from attempts (#10)',async()=>{
  const {work,lang,meet}=await seed();
  const [agenda]=(await listWords()).filter(w=>w.term==='agenda');
  await reviewWord(agenda.id,'again');
  const words=await listWords(),stored=await listReviews(),{decks}=await listLibrary(),now=new Date(Date.now()+1000);
  const reviews=[...stored,{...stored[0],id:'second-attempt',grade:'good'}]; // a second attempt on the same card today (after «again»)
  const deck=scopedSummary(words,reviews,decks,{kind:'deck',id:meet.id},now);
  assert.equal(deck.inLibrary,2);assert.equal(deck.cardsReviewedToday,1);assert.equal(deck.reviewAttemptsToday,2);
  assert.equal(deck.dueNow+deck.scheduledNext7Days,2);
  const w=scopedSummary(words,reviews,decks,{kind:'folder',id:work.id},now),l=scopedSummary(words,reviews,decks,{kind:'folder',id:lang.id},now),g=summary(words,reviews,now);
  for(const k of Object.keys(g))assert.equal(w[k]+l[k],g[k],k);
  assert.deepEqual(scopedSummary(words,reviews,decks,{kind:'all'},now),g);
});

test('moving a card moves it in current counters; its review events and FSRS state stay exactly the same',async()=>{
  const {meet,es}=await seed();
  const [agenda]=(await listWords()).filter(w=>w.term==='agenda');
  await reviewWord(agenda.id,'good');
  const before=(await listWords()).find(w=>w.id===agenda.id),reviewsBefore=await listReviews();
  await moveWord(agenda.id,es.id);
  const words=await listWords(),reviews=await listReviews(),{decks}=await listLibrary(),moved=words.find(w=>w.id===agenda.id);
  assert.deepEqual(reviews,reviewsBefore,'review log untouched');
  assert.deepEqual(moved.fsrsState,before.fsrsState);assert.equal(moved.dueAt,before.dueAt);
  assert.equal(inScope(moved,{kind:'deck',id:es.id},decks),true);assert.equal(inScope(moved,{kind:'deck',id:meet.id},decks),false);
  assert.equal(scopedSummary(words,reviews,decks,{kind:'deck',id:es.id}).reviewAttemptsToday,1,'attempts follow the card');
  assert.equal(scopedSummary(words,reviews,decks,{kind:'deck',id:meet.id}).reviewAttemptsToday,0);
});

test('archived cards leave due review and card counts; a card whose deck is missing counts in the default deck',async()=>{
  const {meet}=await seed();
  const [minutes]=(await listWords()).filter(w=>w.term==='minutes');
  await archiveWord(minutes.id);
  const words=await listWords(),{decks}=await listLibrary(),later=Date.now()+60_000;
  assert.deepEqual(terms(dueInScope(words,{kind:'deck',id:meet.id},decks,later)),['agenda']);
  assert.equal(scopedSummary(words,[],decks,{kind:'deck',id:meet.id}).inLibrary,1);
  const orphan={...words[0],deckId:'00000000-0000-4000-8000-0000000000aa'};
  assert.equal(currentDeckId(orphan,decks),DEFAULT_DECK_ID);
  assert.equal(inScope(orphan,{kind:'deck',id:DEFAULT_DECK_ID},decks),true);
});

test('backup round trip keeps scoped results identical',async()=>{
  const {work}=await seed();
  const [hola]=(await listWords()).filter(w=>w.term==='hola');await reviewWord(hola.id,'hard');
  const snap=async()=>{const w=await listWords(),r=await listReviews(),{decks}=await listLibrary(),now=new Date(Date.now()+1000);
    return [scopedSummary(w,r,decks,{kind:'folder',id:work.id},now),terms(dueInScope(w,{kind:'folder',id:work.id},decks,now.getTime()))];};
  const before=await snap(),backup=await buildBackup();
  globalThis.indexedDB=new IDBFactory();resetConnectionForTests();
  await restoreBackup(validateBackup(JSON.parse(JSON.stringify(backup))));
  assert.deepEqual(await snap(),before);
});

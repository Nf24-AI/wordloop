// Practice 2.0 — shared configuration: learning language groups, the cross-deck pool, the three word sources and
// where a story is saved. Pure functions; no storage, no FSRS writes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chooseLanguage,decksOf,homeDeck,languageGroups,poolFor,selectionFor,selectionKey,isVocabSource} from '../src/practiceSetup.ts';
import {BATCH_SIZE} from '../src/story.ts';

const deck=(id,lang)=>({id,folderId:'f',name:id,contentLanguage:lang,meaningLanguage:'ar-SA',createdAt:'',updatedAt:''});
let n=0;
const word=(deckId,term,{due='2026-11-20T00:00:00.000Z',archived=false,type='vocabulary',meaning='معنى'}={})=>({
  id:'w'+(++n),deckId,term,meaning,meanings:[meaning],example:'',translation:'',note:'',tag:'',contentType:type,archived,
  createdAt:'2026-11-01T00:00:00.000Z',updatedAt:'',dueAt:due,fsrsState:{state:0,stability:0},revision:1});

const EN1=deck('en1','en-US'),EN2=deck('en2','en-us'),ES=deck('es','es-ES'),FR=deck('fr','fr-FR');
const DECKS=[EN1,ES,EN2,FR];

test('SETUP-01: languages group decks case-insensitively and come largest first',()=>{
  const words=[word('en1','apple'),word('en2','river'),word('en2','castle'),word('es','gato')];
  const g=languageGroups(words,DECKS);
  assert.deepEqual(g.map(x=>[x.lang,x.decks.map(d=>d.id),x.words]),[['en-US',['en1','en2'],3],['es-ES',['es'],1],['fr-FR',['fr'],0]]);
  assert.deepEqual(decksOf(DECKS,'EN-us').map(d=>d.id),['en1','en2']);
});

test('SETUP-02: the pool spans every deck of the language, drops archived / Q&A / meaningless cards and duplicates across decks',()=>{
  const words=[word('en1','Apple'),word('en2','apple'),word('en2','gone',{archived:true}),word('en2','What is it?',{type:'question_answer'}),
    word('en2','blank',{meaning:''}),word('en2','river'),word('es','agua')];
  const pool=poolFor(words,decksOf(DECKS,'en-US'));
  assert.deepEqual(pool.map(w=>[w.deckId,w.term]),[['en1','Apple'],['en2','river']]);
});

test('SETUP-03: automatic = the level batch, soonest due first; whole library = every word, never truncated; manual = the picks still eligible',()=>{
  const words=Array.from({length:30},(_,i)=>word(i%2?'en1':'en2','w'+i,{due:new Date(Date.UTC(2026,10,1+i)).toISOString()}));
  const pool=poolFor(words,decksOf(DECKS,'en-US'));
  const auto=selectionFor('auto',pool,'A2',null);
  assert.equal(auto.length,BATCH_SIZE.A2);
  assert.deepEqual(auto,words.slice(0,BATCH_SIZE.A2).map(w=>w.id),'soonest due first');
  assert.equal(selectionFor('all',pool,'A2',null).length,30,'all 30 — batching happens later, nothing dropped');
  assert.deepEqual(selectionFor('manual',pool,'A2',[words[3].id,'deleted-card',words[3].id,words[9].id]),[words[3].id,words[9].id],'stale ids leave, no duplicates');
  assert.deepEqual(selectionFor('manual',pool,'A2',null),auto,'never chosen → the automatic subset is pre-ticked');
  assert.deepEqual(selectionFor('manual',pool,'A2',[]),[],'an explicit empty choice stays empty');
  assert.deepEqual(selectionFor('auto',[],'B1',null),[]);
});

test('SETUP-04: the story is saved in the deck that holds most of the chosen words (ties → library order)',()=>{
  const words=[word('en1','a'),word('en2','b'),word('en2','c'),word('en1','d')];
  const pool=poolFor(words,[EN1,EN2]);
  assert.equal(homeDeck([words[1].id,words[2].id,words[0].id],pool,[EN1,EN2]),'en2');
  assert.equal(homeDeck([words[0].id,words[1].id],pool,[EN1,EN2]),'en1','tie → first deck');
  assert.equal(homeDeck([],pool,[EN1,EN2]),'en1');
  assert.equal(homeDeck([],pool,[]),null);
});

test('SETUP-05: the language: a deck route wins, then the stored choice if it still exists, then the largest',()=>{
  const g=languageGroups([word('es','gato'),word('es','perro'),word('en1','apple')],DECKS);
  assert.equal(chooseLanguage(g,'en-us',null),'en-US');
  assert.equal(chooseLanguage(g,'de-DE',null),'es-ES','a removed language falls back to the largest');
  assert.equal(chooseLanguage(g,'en-US',FR),'fr-FR');
  assert.equal(chooseLanguage([],null,null),null);
  assert.equal(selectionKey('EN-us'),'lang:en-us');
  assert.ok(isVocabSource('all')&&!isVocabSource('everything'));
});

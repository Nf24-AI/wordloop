// Issue #24 — AI lesson architecture: gating, exact payload, structured-output validation, passage mapping, no FSRS effect.
// The mock generator below exists ONLY in this test file; no provider is connected in the app.
import 'fake-indexeddb/auto';
import {IDBFactory} from 'fake-indexeddb';
import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {addWord,createDeck,createFolder,createPassage,listPassages,listReviews,listWords,resetConnectionForTests} from '../src/data.ts';
import {AI_LESSONS_FLAG,aiLessonsAvailable,buildLessonRequest,lessonGenerator,lessonToPassageInput,registerLessonGenerator,validateLesson,LESSON_MAX_CARDS} from '../src/lessons.ts';
import {readingAvailability,listeningAvailability} from '../src/practice.ts';

beforeEach(()=>{globalThis.indexedDB=new IDBFactory();resetConnectionForTests();registerLessonGenerator(null);});
const deck={id:'d1',contentLanguage:'es-ES',meaningLanguage:'ar-SA'};
const vocab=[{term:'hola',meanings:['مرحبا'],archived:false},{term:'casa',meanings:['بيت'],archived:false},{term:'amigo',meanings:['صديق','رفيق'],archived:false}];
const req=buildLessonRequest(deck,vocab,{level:'A1',mode:'both',questionCount:3});
const good={title:'La casa de Ana',text:'Hola, me llamo Ana. Vivo en una casa grande. Mi amigo se llama Leo.',translation:'',
  questions:[{question:'¿Cómo se llama ella?',answer:'Ana',quote:'me llamo Ana'},{question:'¿Dónde vive?',answer:'una casa grande',quote:'Vivo en una casa grande.'},{question:'¿Quién es Leo?',answer:'Mi amigo',quote:'Mi amigo se llama Leo.'}]};

test('AI-01: hidden unless the build flag is on AND a generator is configured; no generator ships',()=>{
  assert.equal(AI_LESSONS_FLAG,false,'outside a flagged build the flag is off');
  assert.equal(lessonGenerator(),null);
  assert.equal(aiLessonsAvailable(true),false,'flag alone is not enough');
  registerLessonGenerator({id:'mock',label:'Mock',costNote:'',generate:async()=>good});
  assert.equal(aiLessonsAvailable(false),false,'a generator alone is not enough');
  assert.equal(aiLessonsAvailable(true),true);
});

test('AI-02: the request carries only languages, options and the selected cards\' term + meanings',()=>{
  assert.deepEqual(req,{contentLanguage:'es-ES',meaningLanguage:'ar-SA',level:'A1',mode:'both',questionCount:3,
    vocabulary:[{term:'hola',meanings:['مرحبا']},{term:'casa',meanings:['بيت']},{term:'amigo',meanings:['صديق','رفيق']}]});
  const full={...vocab[0],id:'secret-id',note:'private note',example:'ex',fsrsState:{s:1},dueAt:'2026-01-01',deckId:'d1'};
  const r=buildLessonRequest(deck,[full],{level:'A2',mode:'reading',questionCount:5});
  assert.deepEqual(Object.keys(r.vocabulary[0]),['term','meanings']);
  assert.ok(!JSON.stringify(r).includes('secret-id')&&!JSON.stringify(r).includes('private note')&&!JSON.stringify(r).includes('2026-01-01'));
  assert.equal(buildLessonRequest(deck,Array.from({length:50},(_,i)=>({term:'w'+i,meanings:['m'],archived:false})),{level:'B1',mode:'listening',questionCount:10}).vocabulary.length,LESSON_MAX_CARDS);
  assert.equal(buildLessonRequest(deck,[...vocab,{term:'old',meanings:['x'],archived:true}],{level:'A1',mode:'both',questionCount:3}).vocabulary.length,3,'archived cards are never sent');
  assert.throws(()=>buildLessonRequest(deck,[],{level:'A1',mode:'both',questionCount:3}));
  assert.throws(()=>buildLessonRequest(deck,vocab,{level:'C2',mode:'both',questionCount:3}));
  assert.throws(()=>buildLessonRequest(deck,vocab,{level:'A1',mode:'both',questionCount:4}));
});

test('AI-03: a well-formed lesson passes; it reports which selected words it used',()=>{
  const v=validateLesson(good,req);
  assert.equal(v.ok,true);assert.deepEqual(v.usedTerms,['hola','casa','amigo']);
});

test('AI-04: every rule refuses bad structured output',()=>{
  const codes=raw=>{const v=validateLesson(raw,req);return v.ok?[]:v.issues.map(i=>i.code);};
  const q=(i,patch)=>({...good,questions:good.questions.map((x,j)=>j===i?{...x,...patch}:x)});
  assert.deepEqual(codes(null),['shape']);assert.deepEqual(codes([]),['shape']);assert.deepEqual(codes({...good,questions:'x'}),['shape']);
  assert.ok(codes({...good,title:'  '}).includes('title'));
  assert.ok(codes({...good,text:'x'.repeat(5001)}).includes('tooLong'));
  assert.ok(codes({...good,questions:good.questions.slice(0,2)}).includes('count'));
  assert.ok(codes(q(0,{quote:'Ana is a doctor'})).includes('quoteNotInText'),'the quote must be in the text');
  assert.ok(codes(q(1,{answer:'un piso'})).includes('answerNotInQuote'),'the answer must be backed by its quote');
  assert.ok(codes(q(0,{quote:''})).includes('quote'));
  assert.ok(codes(q(2,{question:'¿Cómo se llama ella?'})).includes('duplicateQuestion'));
  assert.ok(codes(q(0,{question:'¿Se llama Ana?'})).includes('answerInQuestion'),'a question must not contain its answer');
  assert.ok(codes({...good,text:'Buenos días a todos. Ana vive en una casa.'.replace('casa','choza'),questions:[]}).includes('noVocabulary'));
  assert.ok(codes(q(1,{answer:7})).includes('shape'));
});

test('AI-05: an accepted lesson saves as one Learning Passage usable by Reading/Listening; FSRS and cards untouched',async()=>{
  const f=await createFolder('الإسبانية'),d=await createDeck({folderId:f.id,name:'Spanish A1',contentLanguage:'es-ES'});
  for(const v of vocab)await addWord({contentType:'vocabulary',term:v.term,meanings:v.meanings,example:'',translation:'',tag:'',deckId:d.id});
  const before=JSON.stringify(await listWords());
  // The mock generator (tests only) returns the structured output; it is validated before saving.
  registerLessonGenerator({id:'mock',label:'Mock',costNote:'',generate:async()=>good});
  const raw=await lessonGenerator().generate(buildLessonRequest(d,await listWords(),{level:'A1',mode:'both',questionCount:3}),new AbortController().signal);
  const v=validateLesson(raw,req);assert.equal(v.ok,true);
  const p=await createPassage(lessonToPassageInput(v.lesson,d));
  assert.equal((await listPassages(d.id)).length,1);
  assert.equal(p.questions.length,3);assert.equal(p.contentLanguage,'es-ES');
  assert.ok(readingAvailability(p,await listWords()).comprehension===3&&listeningAvailability(p).comprehension===3);
  assert.equal(JSON.stringify(await listWords()),before,'no card is added or rescheduled');
  assert.equal((await listReviews()).length,0);
});

test('AI-06: a rejected or failed lesson writes nothing',async()=>{
  registerLessonGenerator({id:'mock',label:'Mock',costNote:'',generate:async()=>{throw new TypeError('Failed to fetch');}});
  await assert.rejects(lessonGenerator().generate(req,new AbortController().signal));
  assert.equal((await listPassages()).length,0);assert.equal((await listWords()).length,0);
});

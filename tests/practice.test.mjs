// #22 Reading / #23 Listening practice engine: every question comes from saved data; answers are checked carefully.
import 'fake-indexeddb/auto';
import {IDBFactory} from 'fake-indexeddb';
import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {normalize,checkAnswer,compareDictation,sentences,cardsInPassage,clozeItems,distractorsFor,meaningItems,comprehensionItems,dictationItems,buildReading,buildListening,readingAvailability,score,seeded} from '../src/practice.ts';
import {addWord,createFolder,createDeck,createPassage,listWords,listReviews,resetConnectionForTests} from '../src/data.ts';

beforeEach(()=>{globalThis.indexedDB=new IDBFactory();resetConnectionForTests();});
const LUCIA='Lucía vive en Madrid. Estudia español todos los días.';
const passage=(over={})=>({id:'p1',deckId:'d1',title:'Lucía',body:LUCIA,contentLanguage:'es-ES',translation:'',questions:[],createdAt:'',updatedAt:'',...over});
const card=(id,term,meanings,over={})=>({id,deckId:'d1',term,meaning:meanings[0],meanings,archived:false,contentType:'vocabulary',example:'',translation:'',note:'',tag:'',createdAt:'',updatedAt:'',dueAt:'',fsrsState:{},...over});

test('acceptance (#22): a saved fact about where Lucía lives gives «Where does Lucía live?» → Madrid, and nothing else is invented',()=>{
  const p=passage({questions:[{id:'q1',question:'Where does Lucía live?',answer:'Madrid',alternatives:[],quote:'Lucía vive en Madrid.'}]});
  const items=comprehensionItems(p);
  assert.deepEqual(items,[{kind:'comprehension',id:'q:q1',question:'Where does Lucía live?',answer:'Madrid',accepted:['Madrid'],quote:'Lucía vive en Madrid.'}]);
  assert.equal(checkAnswer('madrid',items[0].accepted,'es-ES').verdict,'correct');
  assert.equal(checkAnswer('Barcelona',items[0].accepted,'es-ES').verdict,'wrong');
});

test('acceptance (#22): without saved questions there is no comprehension question at all — free text is never mined',()=>{
  const p=passage();
  assert.deepEqual(comprehensionItems(p),[]);
  assert.equal(readingAvailability(p,[]).comprehension,0);
  assert.deepEqual(buildReading(p,[],['comprehension'],10),[]);
});

test('cloze: only a card term that really occurs as a whole word; its sentence, all occurrences blanked, meaning as the hint',()=>{
  const cards=[card('a','Madrid',['مدريد']),card('b','español',['الإسبانية']),card('c','vive',['يعيش']),card('d','día',['يوم']),card('e','Vi',['رأيت']),card('f','x',['؟'])];
  const p=passage({body:'Lucía vive en Madrid. Madrid es grande y Lucía vive bien.'});
  assert.deepEqual(cardsInPassage(p,cards).map(c=>c.id),['a','c'],'«día» is inside «días» only in other text; «Vi» is part of «vive»; one-letter terms skipped');
  const items=clozeItems(p,cards);
  const madrid=items.find(i=>i.id==='cloze:a');
  assert.equal(madrid.sentence,'Lucía vive en Madrid.');assert.deepEqual(madrid.parts,['Lucía vive en ','.']);assert.equal(madrid.hint,'مدريد');
  assert.equal(checkAnswer('madrid',madrid.accepted,'es-ES').verdict,'correct');
  const vive=items.find(i=>i.id==='cloze:c');assert.deepEqual(vive.parts,['Lucía ',' en Madrid.']);
  const two=clozeItems(passage({body:'Vive y vive.'}),[card('v','vive',['يعيش'])])[0];
  assert.deepEqual(two.parts,['',' y ','.'],'every occurrence in the sentence is blanked, so the answer is never visible');
  assert.equal(two.answer,'Vive');
});

test('cloze ignores archived cards, cards of other decks and regex characters in terms',()=>{
  const p=passage({body:'¿Qué es Node.js? Es un lenguaje (de programación).'});
  const cards=[card('a','Node.js',['بيئة تشغيل']),card('n','Nodexjs',['ليس في النص']),card('b','lenguaje',['لغة'],{archived:true}),card('c','programación',['برمجة'],{deckId:'other'}),card('d','(de',['من'])];
  assert.deepEqual(clozeItems(p,cards).map(i=>i.id),['cloze:a','cloze:d'],'«.» is literal: «Nodexjs» is not matched');
});

test('answers: case, spaces and punctuation never matter; accents and ñ do (reported as «almost»); Arabic diacritics are ignored',()=>{
  assert.equal(normalize('  ¡Hola,   MUNDO!  ','es-ES'),'hola mundo');
  assert.equal(checkAnswer('LUCÍA.','Lucía'.split('|'),'es-ES').verdict,'correct');
  assert.equal(checkAnswer('Lucia',['Lucía'],'es-ES').verdict,'accent');
  assert.equal(checkAnswer('si',['sí'],'es-ES').verdict,'accent');
  assert.equal(checkAnswer('ano',['año'],'es-ES').verdict,'accent','ñ is not silently accepted');
  assert.equal(checkAnswer("don't",['don’t'],'en-US').verdict,'correct');
  assert.equal(checkAnswer('مَدْرِيد',['مدريد'],'ar-SA').verdict,'correct');
  assert.equal(checkAnswer('',['Madrid']).verdict,'wrong');
  assert.equal(checkAnswer('la capital',['Madrid','la capital']).verdict,'correct','alternatives are accepted');
});

test('meaning MCQ only with ≥3 independent distractors; synonyms, overlaps and duplicate terms are never offered as wrong options',()=>{
  const target=card('t','casa',['بيت','منزل']);
  const pool=[target,card('s','hogar',['منزل']),card('o','la casa',['البيت الكبير']),card('dup','Casa',['دار']),card('x','perro',['كلب']),card('y','gato',['قطة']),card('z','libro',['كتاب'])];
  const d=distractorsFor(target,pool);
  assert.deepEqual(d.sort(),['قطة','كتاب','كلب'].sort(),'«منزل» (shared meaning) and «Casa» (same term) are excluded');
  const p=passage({body:'Mi casa es tu casa.'});
  const [first]=meaningItems(p,pool,seeded(1));
  assert.equal(first.term,'casa','cards in the passage come first');
  assert.equal(first.options.length,4);assert.equal(first.options[first.correct],'بيت');
  for(const o of first.options.filter((_,i)=>i!==first.correct))assert.ok(['قطة','كتاب','كلب'].includes(o));
  const few=meaningItems(p,[target,card('x','perro',['كلب'])]);
  assert.equal(few[0].options,null,'not enough safe distractors → «show the answer» recall, no choices');
});

test('dictation: sentence split, word-by-word marks (ok / accent / wrong / missing / extra)',()=>{
  assert.deepEqual(sentences('Hola. ¿Qué tal?\n¡Bien!  Gracias…  Adiós'),['Hola.','¿Qué tal?','¡Bien!','Gracias…','Adiós']);
  assert.equal(compareDictation('lucía vive en madrid',LUCIA.split('. ')[0]+'.','es-ES').verdict,'correct');
  const r=compareDictation('Lucia vive Madriz','Lucía vive en Madrid.','es-ES');
  assert.equal(r.verdict,'wrong');
  assert.deepEqual(r.words.map(w=>[w.word,w.status]),[['Lucía','accent'],['vive','ok'],['en','wrong'],['Madrid.','missing']]);
  const extra=compareDictation('Lucía vive en en Madrid','Lucía vive en Madrid.','es-ES');assert.deepEqual(extra.extra,['en']);assert.equal(extra.verdict,'wrong');
  assert.equal(compareDictation('Lucia vive en Madrid','Lucía vive en Madrid.','es-ES').verdict,'accent');
  assert.deepEqual(dictationItems(passage()).map(i=>i.text),['Lucía vive en Madrid.','Estudia español todos los días.']);
});

test('sessions: chosen activities and count, mixed; listening keeps passage order; score counts right answers only',()=>{
  const p=passage({questions:[{id:'q1',question:'Where does Lucía live?',answer:'Madrid',alternatives:[],quote:''}]});
  const cards=[card('a','Madrid',['مدريد']),card('b','español',['الإسبانية'])];
  const s=buildReading(p,cards,['cloze','meaning','comprehension'],3,seeded(7));
  assert.equal(s.length,3);assert.deepEqual(new Set(s.map(i=>i.kind)),new Set(['cloze','meaning','comprehension']));
  assert.equal(buildReading(p,cards,['cloze'],0).length,2,'0 = all');
  assert.deepEqual(buildListening(p,['dictation','comprehension'],0).map(i=>i.kind),['dictation','dictation','comprehension']);
  assert.deepEqual(score([{id:'1',verdict:'correct'},{id:'2',verdict:'accent'},{id:'3',verdict:'knew'},{id:'4',verdict:'wrong'},{id:'5',verdict:'revealed'}]),{right:2,almost:1,total:5});
});

test('practice never touches cards, reviews or FSRS (the engine has no write path)',async()=>{
  const f=await createFolder('ES'),d=await createDeck({folderId:f.id,name:'Lucía',contentLanguage:'es-ES'});
  await addWord({term:'Madrid',meanings:['مدريد'],example:'',translation:'',tag:'',contentType:'vocabulary',deckId:d.id});
  const p=await createPassage({deckId:d.id,title:'Lucía',body:LUCIA,questions:[{question:'Where does Lucía live?',answer:'Madrid',quote:'Lucía vive en Madrid.'}]});
  const before=JSON.stringify([await listWords(),await listReviews()]);
  const words=await listWords();
  buildReading(p,words,['cloze','meaning','comprehension'],0);buildListening(p,['dictation','comprehension'],0);
  assert.equal(JSON.stringify([await listWords(),await listReviews()]),before);
});

/* ───────── #61 engine audit regressions ───────── */
test('#61: no activity selected, or only empty activities → an empty session, never a hang or a crash',()=>{
  const p=passage(),cards=[card('a','Madrid',['مدريد'])];
  assert.deepEqual(buildReading(p,cards,[],5),[]);
  assert.deepEqual(buildReading(p,cards,['comprehension'],5),[],'the only chosen activity has no questions');
  assert.deepEqual(buildReading(p,[],['cloze','meaning','comprehension'],0),[]);
  assert.deepEqual(buildListening(p,[],5),[]);
  assert.equal(buildReading(p,cards,['cloze','comprehension'],10).length,1,'empty pools are skipped, the others still mix');
});

test('#61: cloze prefers a sentence with a single occurrence so the context stays readable',()=>{
  const p=passage({body:'Vive y vive en casa. Lucía vive en Madrid.'});
  const [it]=clozeItems(p,[card('v','vive',['يعيش'])]);
  assert.equal(it.sentence,'Lucía vive en Madrid.');
  assert.deepEqual(it.parts,['Lucía ',' en Madrid.'],'exactly one blank');
  const only=clozeItems(passage({body:'Vive y vive.'}),[card('v','vive',['يعيش'])])[0];
  assert.equal(only.parts.length,3,'when every sentence repeats the term, all occurrences stay hidden');
});

test('#61: Unicode — decomposed accents match composed cards, and a combining mark is part of the word',()=>{
  const nfd='Lucía vive en Madrid y estudia español.'.normalize('NFD');
  const p=passage({body:nfd});
  const cards=[card('a','español',['الإسبانية']),card('b','Lucía',['لوسيا']),card('c','Luci',['ليس كلمة'])];
  assert.deepEqual(cardsInPassage(p,cards).map(c=>c.id).sort(),['a','b'],'«Luci» does not match inside «Luci\u0301a»');
  const it=clozeItems(p,cards).find(i=>i.id==='cloze:a');
  assert.equal(it.answer,'español','the blank shows the NFC form');
  assert.equal(checkAnswer('español',it.accepted,'es-ES').verdict,'correct','typed NFD answer is fine');
  assert.equal(checkAnswer('espanol',it.accepted,'es-ES').verdict,'accent');
});

test('#61: regex metacharacters, punctuation-edged and multi-word terms are literal and whole-word',()=>{
  const p=passage({body:'Uso C++ y C# a diario. ¿Te gusta el café con leche? Sí, a diario.'});
  const cards=[card('a','C++',['لغة']),card('b','café con leche',['قهوة بالحليب']),card('c','a diario',['يوميًا']),card('d','$^.*',['رموز'])];
  const ids=cardsInPassage(p,cards).map(c=>c.id).sort();
  assert.deepEqual(ids,['b','c'],'«C++» is one letter once punctuation is ignored, so it is too short to ask about');
  const c=clozeItems(p,cards).find(i=>i.id==='cloze:c');
  assert.equal(c.parts.length,2,'«a diario» occurs once in its first single-occurrence sentence');
});

test('#61: meaning questions are only about words of THIS text; the rest of the deck only supplies wrong options',()=>{
  const p=passage({body:'Mi casa es grande.'});
  const pool=[card('t','casa',['بيت']),card('x','perro',['كلب']),card('y','gato',['قطة']),card('z','libro',['كتاب'])];
  const items=meaningItems(p,pool,seeded(3));
  assert.deepEqual(items.map(i=>i.term),['casa']);
  assert.equal(items[0].options.length,4,'distractors still come from the whole deck');
  assert.equal(readingAvailability(passage({body:'Nada aquí.'}),pool).meaning,0);
});

test('#61: accents stay meaningful, Arabic diacritics/hamza variants are «almost» or correct, alternatives accepted',()=>{
  assert.equal(checkAnswer('año',['ano']).verdict,'accent','the reverse slip is also only «almost»');
  assert.equal(checkAnswer('أحمد',['احمد'],'ar-SA').verdict,'accent');
  assert.equal(checkAnswer('مدرسة',['مدرسة'],'ar-SA').verdict,'correct');
  assert.equal(checkAnswer('el centro',['Madrid','el centro'],'es-ES').verdict,'correct');
  assert.equal(checkAnswer('   ',['Madrid']).verdict,'wrong');
});

test('#61: dictation reports missing, extra, wrong and accent words separately',()=>{
  const r=compareDictation('Lucía vive vive en Madrid hoy','Lucía vive en Madríd.','es-ES');
  assert.deepEqual(r.extra,['vive','hoy']);
  assert.deepEqual(r.words.map(w=>w.status),['ok','ok','ok','accent']);
  assert.equal(r.verdict,'wrong','extra words are not «correct»');
  const m=compareDictation('Lucía en','Lucía vive en Madrid.','es-ES');
  assert.deepEqual(m.words.map(w=>w.status),['ok','missing','ok','missing']);
});

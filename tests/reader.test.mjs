// #77 Reading 2.0 — the book reader's logic: highlights (saved vs suggested), the bundled phrase list, preferences, «finished» marks.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {highlightParts} from '../src/story.ts';
import {PHRASEBOOK} from '../src/phrasebook.ts';
import {DEFAULT_PREFS,FONT_SCALES,MAX_SUGGESTIONS,cleanPrefs,isRead,markRead,readCount,readPrefs,readerParagraphs,readingMinutes,suggestionsFor,writePrefs} from '../src/reader.ts';

const store=()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>{m.set(k,String(v));},raw:m};};
const paras=(body,saved,sug=[],lang='en',owned=[])=>readerParagraphs(highlightParts(body,saved,lang),sug,owned);
const kinds=p=>p.flat().filter(s=>s.kind).map(s=>`${s.kind}:${s.text}`);
const EN=suggestionsFor('en-US','ar-SA');

test('READER-HL-01: paragraphs keep every character; saved cards and suggestions are marked, nothing else',()=>{
  const body='Although it rained, we went out.\n\nHowever, the bus was late. We took an umbrella!';
  const p=paras(body,['umbrella','bus'],EN);
  assert.equal(p.length,2);
  assert.equal(p.map(x=>x.map(s=>s.text).join('')).join('\n\n'),body,'the text is unchanged');
  assert.deepEqual(kinds(p),['suggested:Although','suggested:However','saved:bus','saved:umbrella']);
  assert.ok(p.flat().filter(s=>!s.kind).every(s=>!s.term),'plain runs carry no term');
});

test('READER-HL-02: a saved card always wins over a suggestion, whole phrases before single words',()=>{
  // The learner saved «at least»: it is yellow, never green, and the suggestion «at least» is not offered twice.
  const p=paras('I need at least one day, at least!',['at least'],EN);
  assert.deepEqual(kinds(p),['saved:at least','saved:at least']);
  // «wake up» (a phrase) is matched before «up»; inflected forms count for saved cards (the story matcher).
  assert.deepEqual(kinds(paras('She wakes up early and looks up.',['up','wake up'])),['saved:wakes up','saved:up']);
  // A suggestion never splits or hides a saved card that overlaps it.
  assert.deepEqual(kinds(paras('Come in the morning light.',['morning light'],EN)),['saved:morning light']);
});

test('READER-HL-03: suggestions — exact wording, whole words, first occurrence only, capped, never one the learner owns',()=>{
  assert.deepEqual(kinds(paras('Sometimes I walk. Sometimes I run.',[],EN)),['suggested:Sometimes'],'first occurrence only');
  assert.deepEqual(kinds(paras('The howevers and the unlessness of it.',[],EN)),[],'no partial or inflected guesses');
  assert.deepEqual(kinds(paras('However, we stayed.',[],EN,'en',['HOWEVER'])),[],'owned anywhere in the library → not suggested');
  const many=paras(EN.map(s=>s.term).join(', then ')+'.',[],EN);
  assert.equal(kinds(many).length,MAX_SUGGESTIONS);
  assert.deepEqual(kinds(paras('However, we stayed.',[],[])),[],'no list → yellow only');
  // Punctuation and quotes around a phrase stay outside the mark.
  assert.deepEqual(paras('“For example,” she said.',[],EN)[0].map(s=>s.text),['“','For example',',” she said.']);
});

test('READER-HL-04: Spanish — accents are meaningful, phrases match as written',()=>{
  const ES=suggestionsFor('es-ES','ar-SA');
  assert.deepEqual(kinds(paras('Sin embargo, la fruta es barata otra vez. Ademas no.',['barato'],ES,'es')),['suggested:Sin embargo','saved:barata','suggested:otra vez']);
});

test('READER-PB-01: suggestions exist only for a language pair we wrote meanings for; nothing is guessed',()=>{
  assert.ok(EN.length>20&&EN.every(s=>s.term&&s.meaning));
  assert.ok(suggestionsFor('es','en').length>20);
  assert.deepEqual(suggestionsFor('en-US','en-GB'),[],'same language → none');
  assert.deepEqual(suggestionsFor('en-US','fr-FR'),[],'no meaning in that language → none');
  assert.deepEqual(suggestionsFor('fr-FR','ar-SA'),[],'no list for that language → none');
  assert.equal(suggestionsFor('es','ar').find(s=>s.term==='sin embargo').meaning,'ومع ذلك');
});

test('READER-PB-02: the bundled list is well-formed and claims no level',()=>{
  for(const [lang,list] of Object.entries(PHRASEBOOK)){
    const seen=new Set();
    for(const e of list){
      assert.equal(e.term,e.term.trim().toLocaleLowerCase(),`${lang}:${e.term} is lower-case and trimmed`);
      assert.ok(!seen.has(e.term),`${lang}:${e.term} is listed once`);seen.add(e.term);
      assert.ok(e.ar&&/[؀-ۿ]/.test(e.ar),`${lang}:${e.term} has an Arabic meaning`);
      if(lang==='es')assert.ok(e.en&&/^[a-z ,]+$/.test(e.en),`${lang}:${e.term} has an English meaning`);
      assert.ok(!/\b[ABC][12]\b/.test(JSON.stringify(e)),'no CEFR label');
      assert.ok(Object.keys(e).every(k=>['term','ar','en'].includes(k)),'term + meanings only');
    }
  }
});

test('READER-PREF-01: preferences are cleaned, persisted locally, and survive bad stored values',()=>{
  assert.deepEqual(cleanPrefs(null),DEFAULT_PREFS);
  assert.deepEqual(cleanPrefs({size:99,font:'comic',theme:'pink',highlights:'yes',focus:1}),DEFAULT_PREFS);
  assert.deepEqual(cleanPrefs({size:FONT_SCALES.length-1,font:'sans',theme:'dark',highlights:false,focus:true}),{size:FONT_SCALES.length-1,font:'sans',theme:'dark',highlights:false,focus:true});
  assert.ok(FONT_SCALES.length>=3&&FONT_SCALES.length<=5&&[...FONT_SCALES].every((v,i,a)=>i===0||v>a[i-1]),'3–5 rising steps');
  const s=store();
  writePrefs({...DEFAULT_PREFS,size:3,theme:'dark'},s);
  assert.deepEqual(readPrefs(s),{...DEFAULT_PREFS,size:3,theme:'dark'});
  s.setItem('wordloop-reader-prefs','{not json');
  assert.deepEqual(readPrefs(s),DEFAULT_PREFS);
  assert.deepEqual(readPrefs(null),DEFAULT_PREFS,'no storage (private mode) → defaults');
  assert.deepEqual([...s.raw.keys()],['wordloop-reader-prefs'],'one key, nothing else is written');
});

test('READER-DONE-01: finishing is recorded once per text; reading again never adds a second completion',()=>{
  const s=store();
  assert.equal(isRead('p1',s),false);assert.equal(readCount(s),0);
  assert.deepEqual(markRead('p1',new Date('2026-11-22T10:00:00Z'),s),{first:true});
  assert.deepEqual(markRead('p1',new Date('2026-11-23T10:00:00Z'),s),{first:false});
  assert.deepEqual(markRead('p2',new Date('2026-11-23T11:00:00Z'),s),{first:true});
  assert.equal(readCount(s),2);assert.equal(isRead('p1',s),true);
  const saved=JSON.parse(s.raw.get('wordloop-reading-done'));
  assert.deepEqual(saved.p1,{first:'2026-11-22T10:00:00.000Z',last:'2026-11-23T10:00:00.000Z'},'first finish is kept; only «last» moves');
  assert.deepEqual(Object.keys(saved.p1).sort(),['first','last'],'no score, no quiz result, no card data');
  s.setItem('wordloop-reading-done','[1,2]');assert.equal(readCount(s),0,'a broken value is ignored');
  assert.deepEqual(markRead('p3',new Date(),null),{first:true},'no storage → still works for this visit');
});

test('READER-TIME-01: the reading time is an estimate of at least one minute',()=>{
  assert.equal(readingMinutes('Short text.'),1);
  assert.equal(readingMinutes(Array(390).fill('word').join(' ')),3);
});

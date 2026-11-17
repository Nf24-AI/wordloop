/**
 * #22 Reading Practice + #23 Listening Practice — a local question-template engine. No AI, no network, no FSRS.
 *
 * Every question comes from something the learner saved, never from guessing at free text:
 * - cloze: a card's term that really occurs in the passage (whole-word match), blanked in its sentence; the card's
 *   meaning is the hint, so the context determines the answer;
 * - meaning: the deck's cards (those in the passage first); multiple choice only when ≥3 independent distractors exist
 *   (no shared or overlapping meaning, not the same term) — otherwise «show the answer» recall;
 * - comprehension (reading and listening): ONLY the passage's saved questions (PassageQuestion), with their quote as
 *   the source. No saved questions → no comprehension questions;
 * - dictation: the passage's own sentences.
 * Answers are compared with a careful normalisation: case, spacing and punctuation never matter; accents and ñ do
 * (they can change the meaning: si/sí, año/ano), so an accent-only slip is reported as «almost», not as correct.
 * Results stay in memory for the session; nothing here writes to IndexedDB, dueAt or fsrsState.
 */
import type {Passage,Word} from './data';

export type Verdict='correct'|'accent'|'wrong';
export type ClozeItem={kind:'cloze';id:string;parts:string[];answer:string;accepted:string[];hint:string;sentence:string};
export type MeaningItem={kind:'meaning';id:string;term:string;answer:string;accepted:string[];options:string[]|null;correct:number};
export type ComprehensionItem={kind:'comprehension';id:string;question:string;answer:string;accepted:string[];quote:string};
export type DictationItem={kind:'dictation';id:string;text:string};
export type PracticeItem=ClozeItem|MeaningItem|ComprehensionItem|DictationItem;
export type ReadingKind='cloze'|'meaning'|'comprehension';
export type ListeningKind='dictation'|'comprehension';

/* ───────── normalisation ───────── */
const ARABIC_MARKS=/[ً-ْٰـ]/g; // tashkeel + tatweel: never part of what a learner must type
/** Case, spacing and punctuation removed; letters (with their accents) kept. Apostrophes/hyphens inside words stay. */
export function normalize(s:string,lang='und'):string{
  let t=s.normalize('NFC').replace(/[’‘`´]/g,"'").replace(ARABIC_MARKS,'');
  try{t=t.toLocaleLowerCase(lang);}catch{t=t.toLowerCase();}
  return t.replace(/(?<![\p{L}\p{N}])['-]|['-](?![\p{L}\p{N}])/gu,' ').replace(/[^\p{L}\p{N}\p{M}'\- ]+/gu,' ').replace(/\s+/g,' ').trim();
}
/** Also ignores accents/diacritics (and Arabic letter variants) — used only to recognise «almost right». */
export function fold(s:string,lang='und'):string{
  return normalize(s,lang).normalize('NFD').replace(/\p{M}+/gu,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه');
}
/** Checks a typed answer against every accepted form. */
export function checkAnswer(input:string,accepted:readonly string[],lang='und'):{verdict:Verdict;expected:string}{
  const n=normalize(input,lang),f=fold(input,lang),forms=accepted.filter(a=>normalize(a,lang));
  if(!n)return {verdict:'wrong',expected:forms[0]??''};
  const exact=forms.find(a=>normalize(a,lang)===n);if(exact)return {verdict:'correct',expected:exact};
  const close=forms.find(a=>fold(a,lang)===f);if(close)return {verdict:'accent',expected:close};
  return {verdict:'wrong',expected:forms[0]??''};
}

export type WordMark={word:string;status:'ok'|'accent'|'wrong'|'missing';typed?:string};
/** Word-by-word dictation check: aligns on accent-free words, then marks each target word. */
export function compareDictation(input:string,target:string,lang='und'):{verdict:Verdict;words:WordMark[];extra:string[]}{
  const tw=target.split(/\s+/).filter(w=>normalize(w,lang)),iw=input.split(/\s+/).filter(w=>normalize(w,lang));
  const tf=tw.map(w=>fold(w,lang)),inf=iw.map(w=>fold(w,lang));
  // LCS on folded words.
  const L=Array.from({length:tw.length+1},()=>new Array<number>(iw.length+1).fill(0));
  for(let i=tw.length-1;i>=0;i--)for(let j=iw.length-1;j>=0;j--)L[i][j]=tf[i]===inf[j]?L[i+1][j+1]+1:Math.max(L[i+1][j],L[i][j+1]);
  const words:WordMark[]=[],extra:string[]=[];let i=0,j=0;const gapT:number[]=[],gapI:number[]=[];
  const flush=()=>{while(gapT.length){const t=gapT.shift()!,k=gapI.shift();words.push(k===undefined?{word:tw[t],status:'missing'}:{word:tw[t],status:'wrong',typed:iw[k]});}
    for(const k of gapI.splice(0))extra.push(iw[k]);};
  while(i<tw.length&&j<iw.length){
    if(tf[i]===inf[j]){flush();words.push({word:tw[i],status:normalize(tw[i],lang)===normalize(iw[j],lang)?'ok':'accent',typed:iw[j]});i++;j++;}
    else if(L[i+1][j]>=L[i][j+1])gapT.push(i++);else gapI.push(j++);
  }
  while(i<tw.length)gapT.push(i++);while(j<iw.length)gapI.push(j++);flush();
  const verdict:Verdict=!extra.length&&words.every(w=>w.status==='ok')?'correct':!extra.length&&words.every(w=>w.status==='ok'||w.status==='accent')?'accent':'wrong';
  return {verdict,words,extra};
}

/* ───────── sources ───────── */
/** The passage's sentences, in order (also splits on line breaks). */
export function sentences(body:string):string[]{
  return body.split(/\n+/).flatMap(line=>line.split(/(?<=[.!?…؟。])\s+/)).map(s=>s.trim()).filter(s=>normalize(s));
}
const escapeRe=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
/** Whole-word, case-insensitive occurrences of `term` (letters/digits on either side mean «not this word»). */
function wordRe(term:string){return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(term.trim()).replace(/\s+/g,'\\s+')}(?![\\p{L}\\p{N}])`,'giu');}
/** #18: a Q&A card is a question, not a word of the text, so it never feeds cloze or meaning items. */
const usable=(w:Word)=>!w.archived&&w.contentType!=='question_answer'&&normalize(w.term).length>=2&&w.term.trim().length<=60;
/** Deck cards whose term occurs in the passage text. */
export function cardsInPassage(p:Passage,cards:readonly Word[]):Word[]{
  return cards.filter(w=>w.deckId===p.deckId&&usable(w)&&wordRe(w.term).test(p.body));
}
const meaningsOf=(w:Word)=>(w.meanings?.length?w.meanings:[w.meaning]).map(m=>m.trim()).filter(Boolean);

export function clozeItems(p:Passage,cards:readonly Word[]):ClozeItem[]{
  const out:ClozeItem[]=[],seen=new Set<string>(),all=sentences(p.body);
  for(const w of cardsInPassage(p,cards)){
    const key=fold(w.term,p.contentLanguage);if(seen.has(key))continue;
    const sentence=all.find(s=>wordRe(w.term).test(s));if(!sentence)continue; // spans a sentence break: skip, never guess
    const matches=[...sentence.matchAll(wordRe(w.term))];
    const parts:string[]=[];let at=0;for(const m of matches){parts.push(sentence.slice(at,m.index));at=m.index!+m[0].length;}parts.push(sentence.slice(at));
    const answer=matches[0][0];seen.add(key);
    out.push({kind:'cloze',id:'cloze:'+w.id,parts,answer,accepted:[...new Set([answer,w.term.trim()])],hint:meaningsOf(w).join('، '),sentence});
  }
  return out;
}

/** Distractors that are certainly wrong for `target`: other terms whose meanings share nothing with the target's. */
export function distractorsFor(target:Word,pool:readonly Word[],lang='und'):string[]{
  const own=meaningsOf(target).map(m=>fold(m,lang)),term=fold(target.term,lang),out:string[]=[],seen=new Set(own);
  for(const c of pool){
    if(c.id===target.id||c.archived||fold(c.term,lang)===term)continue;
    const theirs=meaningsOf(c).map(m=>fold(m,lang));
    if(!theirs.length||theirs.some(m=>own.some(o=>o===m||o.includes(m)||m.includes(o))))continue; // synonym / overlap: unsafe
    const text=meaningsOf(c)[0],k=fold(text,lang);if(seen.has(k))continue;seen.add(k);out.push(text);
  }
  return out;
}
export function meaningItems(p:Passage,cards:readonly Word[],rand:()=>number=Math.random):MeaningItem[]{
  const deck=cards.filter(w=>w.deckId===p.deckId&&usable(w)&&meaningsOf(w).length);
  const inText=new Set(cardsInPassage(p,deck).map(w=>w.id));
  const ordered=[...deck.filter(w=>inText.has(w.id)),...deck.filter(w=>!inText.has(w.id))];
  return ordered.map(w=>{
    const ms=meaningsOf(w),d=shuffle(distractorsFor(w,deck),rand).slice(0,3);
    if(d.length<3)return {kind:'meaning',id:'meaning:'+w.id,term:w.term,answer:ms.join('، '),accepted:ms,options:null,correct:-1};
    const options=shuffle([ms[0],...d],rand);
    return {kind:'meaning',id:'meaning:'+w.id,term:w.term,answer:ms.join('، '),accepted:ms,options,correct:options.indexOf(ms[0])};
  });
}
export function comprehensionItems(p:Passage):ComprehensionItem[]{
  return p.questions.filter(q=>q.question.trim()&&q.answer.trim()).map(q=>({kind:'comprehension',id:'q:'+q.id,question:q.question,answer:q.answer,accepted:[q.answer,...q.alternatives],quote:q.quote}));
}
export function dictationItems(p:Passage,maxWords=25):DictationItem[]{
  return sentences(p.body).filter(s=>s.split(/\s+/).length<=maxWords).map((text,i)=>({kind:'dictation',id:'dict:'+i,text}));
}

/* ───────── sessions ───────── */
export function shuffle<T>(a:readonly T[],rand:()=>number=Math.random):T[]{const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b;}
/** Deterministic generator for tests. */
export function seeded(seed:number){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}

export function readingAvailability(p:Passage,cards:readonly Word[]):Record<ReadingKind,number>{
  return {cloze:clozeItems(p,cards).length,meaning:meaningItems(p,cards).length,comprehension:comprehensionItems(p).length};
}
export function listeningAvailability(p:Passage):Record<ListeningKind,number>{
  return {dictation:dictationItems(p).length,comprehension:comprehensionItems(p).length};
}
/** A reading session: the chosen activities, mixed, up to `count` questions (0 = all). */
export function buildReading(p:Passage,cards:readonly Word[],kinds:readonly ReadingKind[],count:number,rand:()=>number=Math.random):PracticeItem[]{
  const pools:PracticeItem[][]=[];
  if(kinds.includes('cloze'))pools.push(shuffle(clozeItems(p,cards),rand));
  if(kinds.includes('meaning'))pools.push(shuffle(meaningItems(p,cards,rand),rand));
  if(kinds.includes('comprehension'))pools.push(shuffle(comprehensionItems(p),rand));
  return interleave(pools,count);
}
/** A listening session: dictation in passage order, then listening comprehension. */
export function buildListening(p:Passage,kinds:readonly ListeningKind[],count:number):PracticeItem[]{
  const items:PracticeItem[]=[...(kinds.includes('dictation')?dictationItems(p):[]),...(kinds.includes('comprehension')?comprehensionItems(p):[])];
  return count>0?items.slice(0,count):items;
}
function interleave(pools:PracticeItem[][],count:number){
  const out:PracticeItem[]=[];let k=0;const total=pools.reduce((n,p)=>n+p.length,0),max=count>0?Math.min(count,total):total;
  while(out.length<max){const p=pools[k++%pools.length];if(p.length)out.push(p.shift()!);}
  return out;
}

export type Answered={id:string;verdict:Verdict|'revealed'|'knew'|'missed'};
/** Session score: correct answers and «I knew it» count; «almost» is shown but not counted. */
export function score(answers:readonly Answered[]){
  const right=answers.filter(a=>a.verdict==='correct'||a.verdict==='knew').length;
  return {right,almost:answers.filter(a=>a.verdict==='accent').length,total:answers.length};
}

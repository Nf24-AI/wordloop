/**
 * #64 Practice 2.0 — the AI story contract, shared by the app and the staging Worker. Pure: no DOM, no IndexedDB, no network.
 *
 * - `StoryRequest` is EXACTLY what leaves the device: the content/meaning languages, the CEFR level the learner chose,
 *   story or conversation, and up to STORY_MAX_WORDS {term, meaning} pairs. No ids, FSRS state, due dates, reviews,
 *   examples, notes, device ids or other cards.
 * - `buildStoryPrompt` is the versioned system/user prompt (STORY_PROMPT_VERSION). Changing it = bump the version.
 * - `validateStory` is the gate every model output must pass before anyone sees it: strict JSON shape, length band
 *   for the level, the right language, exactly 3 questions whose quote is copied from the story and whose answer is
 *   inside that quote, no repeated / answer-leaking questions, no links/markup, and REAL vocabulary coverage measured
 *   on the text (the model's own `usedWords` claim is never trusted).
 * - `planBatches` splits a large selection into story-sized batches; nothing selected is ever dropped silently.
 */
import {normalize} from './practice.ts';

export const STORY_PROMPT_VERSION='story-v1';
export const CEFR_LEVELS=['A1','A2','B1','B2','C1'] as const;
export type Cefr=typeof CEFR_LEVELS[number];
export const STORY_GENRES=['story','conversation'] as const;
export type StoryGenre=typeof STORY_GENRES[number];
/** MVP: English and Spanish content only (#64). Other deck languages get a clear «not yet» — never a weak story. */
export const STORY_LANGUAGES=['en','es'] as const;
export const STORY_MAX_WORDS=12;
export const STORY_QUESTIONS=3;
const TERM_MAX=60,MEANING_MAX=80;
/** Words per story by level: beginners get fewer target words in a shorter text. */
export const BATCH_SIZE:Record<Cefr,number>={A1:5,A2:6,B1:8,B2:10,C1:12};
/** Story length (words) per level. The validator allows a little slack around the band. */
export const LENGTH_BAND:Record<Cefr,[number,number]>={A1:[60,130],A2:[90,170],B1:[130,230],B2:[170,300],C1:[200,360]};

export type StoryWord={term:string;meaning:string};
export type StoryRequest={v:1;contentLanguage:string;meaningLanguage:string;level:Cefr;genre:StoryGenre;words:StoryWord[]};
export type StoryQuestion={question:string;answer:string;quote:string};
export type Story={title:string;story:string;translation:string;usedWords:string[];questions:StoryQuestion[]};

const LANG_TAG=/^[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/;
export const baseLang=(tag:string)=>tag.split('-')[0].toLowerCase();
export const storyLanguageSupported=(tag:string)=>(STORY_LANGUAGES as readonly string[]).includes(baseLang(tag));
const isObj=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const str=(v:unknown):v is string=>typeof v==='string';
const clean=(s:string)=>s.normalize('NFC').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g,'').replace(/\s+/g,' ').trim();

/* ───────── request ───────── */
export type RequestProblem='shape'|'language'|'level'|'genre'|'noWords'|'tooMany'|'word'|'duplicate';
/** Server AND client: anything that does not fit exactly is refused (never trimmed into something the learner didn't pick). */
export function validateStoryRequest(raw:unknown):{ok:true;request:StoryRequest}|{ok:false;problem:RequestProblem}{
  if(!isObj(raw)||raw.v!==1||!Array.isArray(raw.words))return {ok:false,problem:'shape'};
  const extra=Object.keys(raw).filter(k=>!['v','contentLanguage','meaningLanguage','level','genre','words'].includes(k));
  if(extra.length)return {ok:false,problem:'shape'};
  const {contentLanguage:cl,meaningLanguage:ml,level,genre}=raw;
  if(!str(cl)||!str(ml)||!LANG_TAG.test(cl)||!LANG_TAG.test(ml)||!storyLanguageSupported(cl))return {ok:false,problem:'language'};
  if(!(CEFR_LEVELS as readonly unknown[]).includes(level))return {ok:false,problem:'level'};
  if(!(STORY_GENRES as readonly unknown[]).includes(genre))return {ok:false,problem:'genre'};
  if(!raw.words.length)return {ok:false,problem:'noWords'};
  if(raw.words.length>STORY_MAX_WORDS)return {ok:false,problem:'tooMany'};
  const words:StoryWord[]=[],seen=new Set<string>();
  for(const w of raw.words){
    if(!isObj(w)||Object.keys(w).some(k=>k!=='term'&&k!=='meaning')||!str(w.term)||!str(w.meaning))return {ok:false,problem:'word'};
    const term=clean(w.term),meaning=clean(w.meaning);
    if(!term||term.length>TERM_MAX||meaning.length>MEANING_MAX||/[<>{}]/.test(term+meaning))return {ok:false,problem:'word'};
    const k=normalize(term,cl);if(!k)return {ok:false,problem:'word'};
    if(seen.has(k))return {ok:false,problem:'duplicate'};seen.add(k);
    words.push({term,meaning});
  }
  return {ok:true,request:{v:1,contentLanguage:cl,meaningLanguage:ml,level:level as Cefr,genre:genre as StoryGenre,words}};
}

/* ───────── prompt (versioned) ───────── */
const LEVEL_GUIDE:Record<Cefr,string>={
  A1:'very short simple sentences, present tense, the most common everyday words only',
  A2:'short simple sentences, present and simple past, common everyday words',
  B1:'clear connected sentences, common tenses, some linking words',
  B2:'natural varied sentences, a wider vocabulary, some idiomatic but common phrasing',
  C1:'rich, natural and precise language with varied structures',
};
const LANG_NAME:Record<string,string>={en:'English',es:'Spanish',ar:'Arabic',fr:'French',de:'German',it:'Italian',pt:'Portuguese',tr:'Turkish',ru:'Russian',zh:'Chinese',ja:'Japanese',ko:'Korean'};
export const languageName=(tag:string)=>LANG_NAME[baseLang(tag)]??tag;

export const STORY_SYSTEM_PROMPT=`You write original, natural texts for language learners. (${STORY_PROMPT_VERSION})
Rules:
- Write ONLY in the requested content language and at the requested CEFR level.
- Use a realistic everyday situation with a clear beginning, middle and end. Keep it coherent and interesting.
- Include as many of the target words as fit naturally, each written exactly as given (you may adapt a verb's form only if it still contains the given word). Never force a word into an awkward sentence; it is fine to leave a word out.
- Avoid repeating the same sentence pattern, and do not repeat a target word unnecessarily.
- No real people, brands, news, medical, legal or financial advice, violence or adult content. No links, markup or emojis.
- Write exactly 3 comprehension questions in the content language. Each question must be answerable from the text alone.
- For each question, "quote" is ONE sentence copied character-for-character from the text, and "answer" is a short phrase copied character-for-character from that quote. The question must not contain its answer.
- "usedWords" lists the target words you actually used, exactly as given.
- "translation" is a faithful translation of the text into the meaning language.
- Respond with ONE JSON object only, no other text:
{"title":string,"story":string,"translation":string,"usedWords":string[],"questions":[{"question":string,"answer":string,"quote":string}]}`;

export function buildStoryPrompt(r:StoryRequest):{system:string;user:string}{
  const [min,max]=LENGTH_BAND[r.level],kind=r.genre==='conversation'?'a short conversation between two people (each line starts with the speaker\'s first name and a colon)':'a short story';
  const user=JSON.stringify({
    task:`Write ${kind}.`,contentLanguage:languageName(r.contentLanguage),meaningLanguage:languageName(r.meaningLanguage),
    cefrLevel:r.level,style:LEVEL_GUIDE[r.level],lengthInWords:`${min}-${max}`,questionCount:STORY_QUESTIONS,
    targetWords:r.words.map(w=>({word:w.term,meaning:w.meaning})),
  });
  return {system:STORY_SYSTEM_PROMPT,user};
}
/** The bounded repair turn: tells the model exactly which checks failed. Used at most once per request. */
export function buildRepairPrompt(issues:readonly StoryIssue[]):string{
  return `Your JSON failed these checks: ${[...new Set(issues.map(i=>i.code))].join(', ')}. Fix them and reply with the corrected JSON object only. Remember: every quote must be copied exactly from the story, every answer copied exactly from its quote.`;
}
/** JSON schema for providers with structured output (Workers AI JSON mode). */
export const STORY_JSON_SCHEMA={type:'object',additionalProperties:false,required:['title','story','translation','usedWords','questions'],properties:{
  title:{type:'string'},story:{type:'string'},translation:{type:'string'},usedWords:{type:'array',items:{type:'string'}},
  questions:{type:'array',minItems:3,maxItems:3,items:{type:'object',additionalProperties:false,required:['question','answer','quote'],
    properties:{question:{type:'string'},answer:{type:'string'},quote:{type:'string'}}}}}} as const;

/** Pulls the JSON object out of a model reply (tolerates a ```json fence; nothing else). */
export function parseModelJson(text:unknown):unknown{
  if(isObj(text))return text;
  if(!str(text))return null;
  const t=text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  const a=t.indexOf('{'),b=t.lastIndexOf('}');
  if(a<0||b<=a)return null;
  try{return JSON.parse(t.slice(a,b+1));}catch{return null;}
}

/* ───────── output validation ───────── */
export type StoryIssueCode='shape'|'title'|'tooShort'|'tooLong'|'language'|'unsafe'|'count'|'question'|'quoteNotInStory'|'answerNotInQuote'|'answerInQuestion'|'duplicateQuestion'|'lowCoverage';
export type StoryIssue={code:StoryIssueCode;index?:number};
const flat=(v:string)=>v.normalize('NFC').replace(/[’‘]/g,"'").replace(/[“”]/g,'"').replace(/\s+/g,' ').trim().toLocaleLowerCase();
const wordCount=(s:string)=>s.split(/\s+/).filter(w=>/[\p{L}\p{N}]/u.test(w)).length;
/** Very common function words: enough to tell English from Spanish (and from the meaning language) in a 60+ word text. */
const STOP:Record<string,string[]>={
  en:['the','and','is','to','a','of','in','it','you','he','she','i','was','with','for','on','at','my','her','his','they','we','are','have','this','that'],
  es:['el','la','los','las','y','es','de','que','en','un','una','con','por','para','su','se','no','lo','al','del','mi','está','muy','pero','como','yo'],
};
function languageLooksRight(text:string,lang:string){
  const own=STOP[baseLang(lang)];if(!own)return true;
  const tokens=normalize(text,lang).split(' ');if(tokens.length<20)return true;
  const hits=(list:string[])=>{const s=new Set(list);return tokens.filter(t=>s.has(t)).length;};
  const mine=hits(own),other=Math.max(0,...Object.entries(STOP).filter(([k])=>k!==baseLang(lang)).map(([,l])=>hits(l)));
  return mine/tokens.length>=0.12&&mine>other;
}
const UNSAFE=/(https?:\/\/|www\.|<\/?[a-z][^>]*>|```|@[a-z0-9-]+\.[a-z]{2,})/i;
/** Which of the requested terms really occur in `text` (Unicode-aware, whole words, case/accents as written). */
export function termsIn(text:string,terms:readonly string[],lang:string):string[]{
  const body=` ${normalize(text,lang)} `;
  return terms.filter(t=>{const n=normalize(t,lang);return !!n&&body.includes(` ${n} `);});
}
/** At least half of the batch (and ≥1) must really be in the text; the rest is carried to a later batch. */
export const minCoverage=(n:number)=>Math.max(1,Math.ceil(n/2));

export function validateStory(raw:unknown,req:StoryRequest):{ok:true;story:Story;used:string[];missing:string[]}|{ok:false;issues:StoryIssue[]}{
  if(!isObj(raw)||!str(raw.title)||!str(raw.story)||!Array.isArray(raw.questions)||(raw.usedWords!==undefined&&!Array.isArray(raw.usedWords))||(raw.translation!==undefined&&!str(raw.translation)))
    return {ok:false,issues:[{code:'shape'}]};
  const issues:StoryIssue[]=[],lang=req.contentLanguage;
  const title=clean(raw.title),story=raw.story.normalize('NFC').replace(/\r\n?/g,'\n').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim(),translation=str(raw.translation)?raw.translation.trim():'';
  if(!title||title.length>80)issues.push({code:'title'});
  const n=wordCount(story),[min,max]=LENGTH_BAND[req.level];
  if(n<Math.floor(min*0.7))issues.push({code:'tooShort'});
  if(n>Math.ceil(max*1.3)||story.length>4000||translation.length>5000)issues.push({code:'tooLong'});
  if(!languageLooksRight(story,lang))issues.push({code:'language'});
  if(UNSAFE.test(title+'\n'+story+'\n'+translation))issues.push({code:'unsafe'});
  if(raw.questions.length!==STORY_QUESTIONS)issues.push({code:'count'});
  const questions:StoryQuestion[]=[],seen=new Set<string>();
  raw.questions.forEach((q,index)=>{
    if(!isObj(q)||!str(q.question)||!str(q.answer)||!str(q.quote)){issues.push({code:'shape',index});return;}
    const question=clean(q.question),answer=clean(q.answer),quote=clean(q.quote);
    if(!question||!answer||!quote||question.length>200||answer.length>120||quote.length>400){issues.push({code:'question',index});return;}
    if(UNSAFE.test(question+answer))issues.push({code:'unsafe',index});
    if(!flat(story).includes(flat(quote)))issues.push({code:'quoteNotInStory',index});
    else if(!` ${normalize(quote,lang)} `.includes(` ${normalize(answer,lang)} `))issues.push({code:'answerNotInQuote',index});
    if(` ${normalize(question,lang)} `.includes(` ${normalize(answer,lang)} `))issues.push({code:'answerInQuestion',index});
    const k=normalize(question,lang);if(seen.has(k))issues.push({code:'duplicateQuestion',index});seen.add(k);
    questions.push({question,answer,quote});
  });
  const terms=req.words.map(w=>w.term),used=termsIn(story,terms,lang),missing=terms.filter(t=>!used.includes(t));
  if(used.length<minCoverage(terms.length))issues.push({code:'lowCoverage'});
  if(issues.length)return {ok:false,issues};
  return {ok:true,story:{title,story,translation,usedWords:used,questions},used,missing};
}

/* ───────── batches ───────── */
export type Batch={index:number;ids:string[]};
/** Splits the ordered selection into batches of the level's size. Every id appears exactly once, in order. */
export function planBatches(ids:readonly string[],level:Cefr):Batch[]{
  const unique=[...new Set(ids)],size=BATCH_SIZE[level],out:Batch[]=[];
  for(let i=0;i<unique.length;i+=size)out.push({index:out.length,ids:unique.slice(i,i+size)});
  return out;
}
/** After a batch: words the story didn't use go back into the queue once (into the next batch, then the end);
 *  a word missed twice is reported as «not practised» — still visible, never silently dropped. */
export type PlanState={level:Cefr;queue:string[];done:string[];missedTwice:string[];retried:string[];batch:number;total:number};
export function startPlan(ids:readonly string[],level:Cefr):PlanState{const queue=[...new Set(ids)];return {level,queue,done:[],missedTwice:[],retried:[],batch:0,total:queue.length};}
export function nextBatch(s:PlanState):string[]{return s.queue.slice(0,BATCH_SIZE[s.level]);}
export function completeBatch(s:PlanState,batchIds:readonly string[],usedIds:readonly string[]):PlanState{
  const used=new Set(usedIds),rest=s.queue.filter(id=>!batchIds.includes(id));
  const missed=batchIds.filter(id=>!used.has(id)),again=missed.filter(id=>!s.retried.includes(id)),lost=missed.filter(id=>s.retried.includes(id));
  return {...s,queue:[...rest,...again],done:[...s.done,...batchIds.filter(id=>used.has(id))],missedTwice:[...s.missedTwice,...lost],retried:[...s.retried,...again],batch:s.batch+1};
}
export const planFinished=(s:PlanState)=>s.queue.length===0;
/** Batches still to go (an estimate: retried words may add one). */
export const batchesLeft=(s:PlanState)=>Math.ceil(s.queue.length/BATCH_SIZE[s.level]);

/** Splits `text` into plain runs and runs that are one of `terms` (whole words, case-insensitive, NFC), for highlighting.
 *  Longer terms win («wake up» before «up»). */
export function highlightParts(text:string,terms:readonly string[]):{text:string;term?:string}[]{
  const t=text.normalize('NFC'),list=[...new Set(terms.map(x=>x.normalize('NFC').trim()).filter(Boolean))].sort((a,b)=>b.length-a.length);
  if(!list.length)return [{text:t}];
  const esc=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s+');
  const re=new RegExp(`(?<![\\p{L}\\p{N}\\p{M}])(${list.map(esc).join('|')})(?![\\p{L}\\p{N}\\p{M}])`,'giu');
  const out:{text:string;term?:string}[]=[];let at=0;
  for(const m of t.matchAll(re)){
    if(m.index!>at)out.push({text:t.slice(at,m.index)});
    const hit=m[0].toLocaleLowerCase();out.push({text:m[0],term:list.find(x=>x.toLocaleLowerCase().replace(/\s+/g,' ')===hit.replace(/\s+/g,' '))??m[0]});
    at=m.index!+m[0].length;
  }
  if(at<t.length)out.push({text:t.slice(at)});
  return out;
}

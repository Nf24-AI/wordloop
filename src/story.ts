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

/** v2 (2026-11-18, from the 20-story eval): short self-contained answers, consistent facts. */
export const STORY_PROMPT_VERSION='story-v2';
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
- Keep every fact consistent from start to end: places, who did what, and cause and effect (e.g. a noise from upstairs comes from someone upstairs).
- Use the given "characters" as the main people (you may add a minor one). Use "suggestedSetting" unless the target words clearly need another place.
- Write at least the minimum number of words in lengthInWords.
- Include as many of the target words as fit naturally, each written exactly as given (you may adapt a verb's form only if it still contains the given word). Never force a word into an awkward sentence; it is fine to leave a word out.
- Avoid repeating the same sentence pattern, and do not repeat a target word unnecessarily.
- No real people, brands, news, medical, legal or financial advice, violence or adult content. No links, markup or emojis.
- Write exactly 3 comprehension questions in the content language. Each question must be answerable from the text alone.
- For each question, "quote" is ONE sentence copied character-for-character from the text, and "answer" is a short phrase copied character-for-character from that quote. The question must not contain its answer.
- Each answer is 1 to 6 words: the specific fact asked for (a thing, person, place, time, reason or action), never the whole sentence.
- The answer must make sense on its own as a reply to its question: name the thing itself, not a pronoun or "one" (write "a ladder", not "a sturdy one").
- Ask about the characters in the third person, so the answer reads correctly (not a first-person line like "No, I didn't"). The question's verb must match what the answer says.
- "usedWords" lists the target words you actually used, exactly as given.
- "translation" is a faithful translation of the text into the meaning language.
- Respond with ONE JSON object only, no other text:
{"title":string,"story":string,"translation":string,"usedWords":string[],"questions":[{"question":string,"answer":string,"quote":string}]}`;

/* Eval 2026-11-18: the model reused the same few names (Lucas ×5, Leo ×2, Sarah ×3, Tom ×3) and two identical titles.
 * Each request now gets a cast and a setting picked from a seed (random in the Worker, fixed per case in the eval). */
export const CAST:Record<'en'|'es',string[]>={
  en:['Maya','Omar','Priya','Daniel','Hana','Victor','Amira','Jonah','Lena','Samir','Grace','Felix','Nadia','Owen','Rosa','Ibrahim','Chloe','Marcus','Yuki','Theo','Zara','Elliot','Layla','Hugo'],
  es:['Lucía','Mateo','Carmen','Andrés','Valeria','Javier','Inés','Diego','Paula','Rafael','Elena','Tomás','Sofía','Martín','Alba','Hugo','Nerea','Pablo','Irene','Samuel','Julia','Óscar','Marta','Adrián'],
};
export const SETTINGS=['a train station','a small bakery','a public library','a football pitch','a hospital waiting room','a mountain village',
  'a busy market','a school science lab','a ferry crossing','a bicycle repair shop','a city park in autumn','a museum','a beach at sunrise',
  'a hotel reception','a music lesson','a cooking class','a rainy bus stop','a farm','an airport','a neighbourhood festival','a camping trip',
  'a bookshop','a dentist\'s office','a new apartment'];
export function storyCast(seed:number,lang:string):{cast:[string,string];setting:string}{
  const names=CAST[baseLang(lang)==='es'?'es':'en'],n=names.length,x=Math.abs(Math.trunc(seed))||1;
  const a=x%n,b=(a+1+Math.floor(x/n)%(n-1))%n;
  return {cast:[names[a],names[b]],setting:SETTINGS[Math.floor(x/7)%SETTINGS.length]};
}
export function buildStoryPrompt(r:StoryRequest,seed=1):{system:string;user:string}{
  const {cast,setting}=storyCast(seed,r.contentLanguage);
  const [min,max]=LENGTH_BAND[r.level],kind=r.genre==='conversation'?'a short conversation between two people (each line starts with the speaker\'s first name and a colon)':'a short story';
  const user=JSON.stringify({
    task:`Write ${kind}.`,contentLanguage:languageName(r.contentLanguage),meaningLanguage:languageName(r.meaningLanguage),
    cefrLevel:r.level,style:LEVEL_GUIDE[r.level],lengthInWords:`${min}-${max}`,questionCount:STORY_QUESTIONS,
    targetWords:r.words.map(w=>({word:w.term,meaning:w.meaning})),
    characters:cast,suggestedSetting:setting,
  });
  return {system:STORY_SYSTEM_PROMPT,user};
}
/** The bounded repair turn: tells the model exactly which checks failed. Used at most once per request. */
export function buildRepairPrompt(issues:readonly StoryIssue[]):string{
  return `Your JSON failed these checks: ${[...new Set(issues.map(i=>i.code))].join(', ')}. Fix them and reply with the corrected JSON object only. Remember: every quote must be copied exactly from the story, every answer copied exactly from its quote, and every answer is 1 to 6 words.`;
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
export type StoryIssueCode='shape'|'title'|'tooShort'|'tooLong'|'language'|'unsafe'|'count'|'question'|'quoteNotInStory'|'answerNotInQuote'|'answerInQuestion'|'answerTooLong'|'answerPerson'|'answerVague'|'duplicateQuestion'|'lowCoverage';
/** An answer is a fact, not a sentence (the prompt asks for 1–6 words; 8 leaves room for names and articles). */
export const MAX_ANSWER_WORDS=8;
/* Eval 2026-11-18: «No, no fui» answered a third-person question; «a sturdy one» did not name the thing. */
const FIRST_PERSON:Record<string,{answer:RegExp;question:RegExp}>={
  en:{answer:/(?<![\p{L}])(i|me|my|mine|we|us|our)(?![\p{L}])/u,question:/(?<![\p{L}])(i|me|my|we|us|our|you|your)(?![\p{L}])/u},
  es:{answer:/(?<![\p{L}])(yo|me|mi|mis|nosotros|nosotras|nos|fui|soy|estoy|tengo|estaba|hice|voy|quiero|puedo)(?![\p{L}])/u,
      question:/(?<![\p{L}])(tú|tu|te|usted|yo|mi|me|vosotros|nosotros)(?![\p{L}])/u},
};
const VAGUE:Record<string,RegExp>={
  en:/(?<![\p{L}])(one|ones|it|that|this|them|those|these|something|thing|things)$/u,
  es:/^(?:(?:un|una|el|la|lo|eso|esto|ello|algo|uno|ese|esa|este|esta)\s*)+$|(?<![\p{L}])(uno|una|eso|esto|algo)$/u,
};
/** Answer problems a reader would notice: a first-person reply to a third-person question; a pronoun instead of the thing.
 *  The person check applies to conversations and to yes/no replies only — a story narrated in the first person
 *  («I wake up early…») legitimately has answers like «my friend Sam». */
export function answerProblems(question:string,answer:string,lang:string,genre:StoryGenre='conversation'):('answerPerson'|'answerVague')[]{
  const b=baseLang(lang),q=prep(question),a=prep(answer).replace(/[.!?¡¿,;:]+/g,' ').replace(/\s+/g,' ').trim(),out:('answerPerson'|'answerVague')[]=[];
  const reply=/^(yes|no|sí|si)(?![\p{L}])/u.test(a);
  const fp=FIRST_PERSON[b];if(fp&&(genre==='conversation'||reply)&&fp.answer.test(a)&&!fp.question.test(q))out.push('answerPerson');
  const v=VAGUE[b];if(v&&a.split(' ').length<=3&&v.test(a))out.push('answerVague');
  return out;
}
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
/* ───────── word forms: a target word still counts when the text inflects it ─────────
 * Eval 2026-11-18: 4 of 115 words were reported «missing» although present — looks forward to, barata (barato),
 * prestarle (prestar), tenía muchas ganas de (tener ganas de). Rules are deliberately small and conservative:
 *  EN: -s/-es/-'s/-ed/-d/-ing, e-drop (make→making), y→ies/ied, doubled final consonant (stop→stopped).
 *  ES: o/a/os/as and plural -s/-es for nouns and adjectives; regular conjugations and enclitic pronouns for -ar/-er/-ir
 *      verbs (stem ≥ 3 letters, so «mar» or «ir» are never conjugated).
 *  Multi-word terms: the FIRST word may inflect and may be followed by one extra word (tenía MUCHAS ganas de); the
 *  rest must follow as written. Accents stay meaningful (está ≠ esta). Irregular forms (woke, tengo) are not guessed. */
const esc=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const prep=(s:string)=>s.normalize('NFC').replace(/[’‘]/g,"'").toLocaleLowerCase();
const CLITIC='(?:me|te|se|le|lo|la|nos|os|les|los|las)';
const ES_AR='o|as|a|amos|áis|an|e|es|en|emos|é|aste|ó|asteis|aron|aba|abas|ábamos|abais|aban|ado|ada|ados|adas|ando|aré|arás|ará|aremos|aréis|arán|aría|arías|aríamos|arían';
const ES_ER='o|es|e|emos|éis|en|a|as|an|amos|í|iste|ió|imos|isteis|ieron|ía|ías|íamos|íais|ían|ido|ida|idos|idas|iendo|yendo';
/** Endings that turn a short stem into another common word (com+o = como, par+a = para, cas+a = casa). */
const RISKY=new Set(['o','a','e','as','es','an','en']);
const SAFE_FOR_SHORT=(endings:string)=>endings.split('|').filter(x=>!RISKY.has(x)).join('|');
/* Different-meaning guards (a form that is ALSO a common, unrelated word is never accepted unless it IS the target):
 *  - frequent function words / homographs a rule could generate: como (comer), para (parar), casa (casar), news (new)…;
 *  - short verb stems (< 4 letters) do not get the endings o/a/e/as/es/an/en (com+o, par+a, cas+a); tenía, comió still count;
 *  - Spanish o/a noun pairs with different meanings never swap gender (puerto ≠ puerta, libro ≠ libra);
 *  - English 3-letter CVC words only take doubled forms (hop → hopping, never «hoping»); -d only after -e (car ≠ card);
 *    no -er (but ≠ butter); English function words are not inflected at all. */
const NOT_A_FORM:Record<string,string[]>={
  en:['news','card','cards','being','things','wanted'],
  es:['como','para','casa','casas','sobre','entre','cara','nada','todo','toda','todos','todas','solo','sola','este','esta','ese','esa','eso','esto','otro','otra','cada','pero','ante','bajo','baja','tras','hasta','desde','contra','mismo','misma','poco','poca','mucho','mucha','cosa','cama','vale','era','son','sea','fue','vino','pasa','cura'],
};
const EN_FUNCTION=new Set(['but','and','not','for','the','can','will','was','has','had','are','you','she','her','his','its','our','who','how','why','yes','all','any','off','out','too','yet','nor','one','two','ten','may','own']);
const ES_PAIRS=new Set(['puerto','puerta','libro','libra','caso','casa','cesto','cesta','bolso','bolsa','manzano','manzana','ramo','rama','cuento','cuenta','modo','moda','fruto','fruta','suelo','suela','punto','punta','plazo','plaza','banco','banca','gorro','gorra','pato','pata','foco','foca','tallo','talla','cuadro','cuadra','palo','pala','marco','marca','bando','banda','río','ría','seno','sena','lomo','loma','cerco','cerca','giro','gira','hoyo','hoya','leño','leña','barco','barca','huerto','huerta','pozo','poza','sueldo','suelda']);
function formsOf(word:string,lang:string):string{
  const w=prep(word),e=esc(w);
  if(w.length<3||!/^[\p{L}]+$/u.test(w))return e;
  const block=(NOT_A_FORM[lang]??[]).filter(x=>x!==w);
  const guard=(pattern:string)=>block.length?`(?:${e}|(?!(?:${block.map(esc).join('|')})(?![\\p{L}\\p{M}]))${pattern})`:pattern;
  if(lang==='en'){
    if(EN_FUNCTION.has(w))return e;
    const alts=[`${e}(?:s|'s)?`];
    if(/(s|x|z|ch|sh|o)$/.test(w))alts.push(`${e}es`);
    if(w.endsWith('e'))alts.push(`${e}d`,`${esc(w.slice(0,-1))}ing`);
    else if(/[^aeiou]y$/.test(w))alts.push(`${esc(w.slice(0,-1))}(?:ies|ied)`,`${e}ing`);
    else{
      const cvc=/[^aeiou][aeiou][bdgklmnprt]$/.test(w);
      if(cvc)alts.push(`${e}${w.at(-1)}(?:ed|ing)`);
      if(!(cvc&&w.length===3))alts.push(`${e}(?:ed|ing)`);
    }
    return guard(`(?:${alts.join('|')})`);
  }
  if(lang==='es'){
    const verb=/(ar|er|ir)$/.exec(w),stem=verb?w.slice(0,-2):'';
    if(verb&&stem.length>=3){
      const ends=verb[1]==='ar'?ES_AR:ES_ER,allowed=stem.length>=4?ends:SAFE_FOR_SHORT(ends);
      return guard(`(?:${e}${CLITIC}{0,2}|${esc(stem)}(?:${allowed}))`);
    }
    if(/[oa]$/.test(w))return guard(ES_PAIRS.has(w)?`${e}s?`:`${esc(w.slice(0,-1))}(?:o|a|os|as)`);
    if(/[aeiouáéíóú]$/.test(w))return guard(`${e}s?`);
    return guard(`${e}(?:es)?`);
  }
  return e;
}
/** The pattern for one target term in `lang` (base language, e.g. 'en'); `inflect=false` = exactly as written. */
export function termPattern(term:string,lang:string,inflect=true):string{
  const words=prep(term).trim().split(/\s+/).filter(Boolean),b=baseLang(lang);
  if(!words.length)return '(?!)';
  if(!inflect)return words.map(esc).join('\\s+');
  const [first,...rest]=words;
  // Only the first word may inflect and be followed by ONE extra word (tenía muchas ganas de); the rest is as written.
  return formsOf(first,b)+(rest.length?'(?:\\s+[\\p{L}\\p{M}]+)?\\s+'+rest.map(esc).join('\\s+'):'');
}
const EDGE_L='(?<![\\p{L}\\p{N}\\p{M}])',EDGE_R='(?![\\p{L}\\p{N}\\p{M}])';
const termRe=(term:string,lang:string,flags:string,inflect=true)=>new RegExp(`${EDGE_L}${termPattern(term,lang,inflect)}${EDGE_R}`,flags);
/** Which of the requested terms really occur in `text`: whole words, Unicode-aware, case-insensitive, inflected forms allowed. */
export function termsIn(text:string,terms:readonly string[],lang:string):string[]{
  const body=prep(text).replace(/\s+/g,' ');
  return terms.filter(t=>!!prep(t).trim()&&termRe(t,lang,'u').test(body));
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
    if(wordCount(answer)>MAX_ANSWER_WORDS)issues.push({code:'answerTooLong',index});
    for(const code of answerProblems(question,answer,lang,req.genre))issues.push({code,index});
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

/** Splits `text` into plain runs and runs that are one of `terms`, for highlighting. Uses the SAME matcher as coverage
 *  (inflected forms count when `lang` is given), so «Your words in the story» and the highlights always agree.
 *  Longer terms win («wake up» before «up»); every character of `text` is kept. */
export function highlightParts(text:string,terms:readonly string[],lang=''):{text:string;term?:string}[]{
  const t=text.normalize('NFC'),low=prep(t),list=[...new Set(terms.map(x=>x.normalize('NFC').trim()).filter(Boolean))].sort((a,b)=>b.length-a.length);
  if(!list.length)return [{text:t}];
  const taken:{a:number;b:number;term:string}[]=[];
  for(const term of list)for(const m of low.matchAll(termRe(term,lang,'gu',!!lang))){
    const a=m.index!,b=a+m[0].length;
    if(b>a&&!taken.some(x=>a<x.b&&b>x.a))taken.push({a,b,term});
  }
  taken.sort((x,y)=>x.a-y.a);
  const out:{text:string;term?:string}[]=[];let at=0;
  for(const x of taken){if(x.a>at)out.push({text:t.slice(at,x.a)});out.push({text:t.slice(x.a,x.b),term:x.term});at=x.b;}
  if(at<t.length)out.push({text:t.slice(at)});
  return out;
}

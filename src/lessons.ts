/**
 * #24 «أنشئ درسًا» — optional AI lesson generation: architecture only. See docs/AI_LESSONS.md.
 *
 * Separate from the local rule-based Practice engine (practice.ts): a provider plugs in by implementing
 * `LessonGenerator`; Practice never changes. NO provider is connected in this codebase — nothing here sends anything.
 * The entry point is shown only when the build flag `VITE_AI_LESSONS=on` is set AND a generator is registered.
 */
import {PASSAGE_LIMITS,type Deck,type PassageInput,type Word} from './data.ts';
import {normalize} from './practice.ts';

export type LessonLevel='A1'|'A2'|'B1';
export type LessonMode='reading'|'listening'|'both';
export const LESSON_LEVELS:readonly LessonLevel[]=['A1','A2','B1'];
export const LESSON_MODES:readonly LessonMode[]=['reading','listening','both'];
export const LESSON_QUESTION_COUNTS=[3,5,10] as const;
export type LessonQuestionCount=typeof LESSON_QUESTION_COUNTS[number];
export const LESSON_MAX_CARDS=30;

/** Exactly what would leave the device — and nothing else (no ids, notes, examples, FSRS, due dates or reviews). */
export type LessonRequest={
  contentLanguage:string;meaningLanguage:string;level:LessonLevel;mode:LessonMode;questionCount:LessonQuestionCount;
  vocabulary:{term:string;meanings:string[]}[];
};
export type LessonQuestion={question:string;answer:string;quote:string};
export type GeneratedLesson={title:string;text:string;translation:string;questions:LessonQuestion[]};

export interface LessonGenerator{
  /** Stable id, e.g. the provider name; shown nowhere sensitive. */
  readonly id:string;
  /** Human name shown on the consent screen («سيُرسل إلى …»). */
  readonly label:string;
  /** Cost / usage-limit note shown before consent (owner-approved text once a provider is chosen). */
  readonly costNote:string;
  /** Returns the provider's raw structured output; it is validated by `validateLesson` before anyone sees it. */
  generate(request:LessonRequest,signal:AbortSignal):Promise<unknown>;
}

let configured:LessonGenerator|null=null;
/** The single plug point for a future, owner-approved provider. Nothing in the app calls this today. */
export function registerLessonGenerator(g:LessonGenerator|null){configured=g;}
export function lessonGenerator():LessonGenerator|null{return configured;}
/** Build-time flag; undefined outside Vite (tests) → off. */
export const AI_LESSONS_FLAG:boolean=(import.meta as unknown as {env?:Record<string,string|undefined>}).env?.VITE_AI_LESSONS==='on';
/** The entry point exists only with the flag on AND a generator configured. */
export function aiLessonsAvailable(flag=AI_LESSONS_FLAG):boolean{return flag&&!!configured;}

/** The payload for the chosen cards: term + meanings only, capped, in the deck's languages. */
export function buildLessonRequest(deck:Pick<Deck,'contentLanguage'|'meaningLanguage'>,cards:readonly Pick<Word,'term'|'meanings'|'archived'>[],o:{level:LessonLevel;mode:LessonMode;questionCount:LessonQuestionCount}):LessonRequest{
  if(!LESSON_LEVELS.includes(o.level)||!LESSON_MODES.includes(o.mode)||!LESSON_QUESTION_COUNTS.includes(o.questionCount))throw Error('lesson options');
  const vocabulary=cards.filter(c=>!c.archived).slice(0,LESSON_MAX_CARDS).map(c=>({term:c.term,meanings:[...c.meanings]}));
  if(!vocabulary.length)throw Error('lesson needs cards');
  return {contentLanguage:deck.contentLanguage,meaningLanguage:deck.meaningLanguage,level:o.level,mode:o.mode,questionCount:o.questionCount,vocabulary};
}

export type LessonIssueCode='shape'|'title'|'text'|'tooLong'|'count'|'question'|'answer'|'quote'|'quoteNotInText'|'answerNotInQuote'|'duplicateQuestion'|'answerInQuestion'|'noVocabulary';
export type LessonIssue={code:LessonIssueCode;index?:number};
const flat=(v:string)=>v.normalize('NFC').replace(/\s+/g,' ').trim().toLocaleLowerCase();
const str=(v:unknown):v is string=>typeof v==='string';
/**
 * Checks a lesson (raw provider output, or the learner's edits) before it can be shown or saved. Structural checks
 * only — they cannot prove the content is right, which is why the learner reviews it before saving.
 */
export function validateLesson(raw:unknown,req:Pick<LessonRequest,'questionCount'|'vocabulary'|'contentLanguage'>,{exactCount=true}:{exactCount?:boolean}={}):{ok:true;lesson:GeneratedLesson;usedTerms:string[]}|{ok:false;issues:LessonIssue[]}{
  const L=PASSAGE_LIMITS,issues:LessonIssue[]=[];
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return {ok:false,issues:[{code:'shape'}]};
  const x=raw as Record<string,unknown>;
  if(!str(x.title)||!str(x.text)||!Array.isArray(x.questions)||(x.translation!==undefined&&!str(x.translation)))return {ok:false,issues:[{code:'shape'}]};
  const title=x.title.trim().replace(/\s+/g,' '),text=x.text.trim().replace(/\r\n?/g,'\n'),translation=str(x.translation)?x.translation.trim():'';
  if(!title)issues.push({code:'title'});
  if(!text)issues.push({code:'text'});
  if(title.length>L.title||text.length>L.body||translation.length>L.translation)issues.push({code:'tooLong'});
  if(exactCount?x.questions.length!==req.questionCount:(x.questions.length<1||x.questions.length>L.questions))issues.push({code:'count'});
  const questions:LessonQuestion[]=[],seen=new Set<string>(),lang=req.contentLanguage;
  x.questions.forEach((q,index)=>{
    if(!q||typeof q!=='object'||!str((q as LessonQuestion).question)||!str((q as LessonQuestion).answer)||!str((q as LessonQuestion).quote)){issues.push({code:'shape',index});return;}
    const question=(q as LessonQuestion).question.trim(),answer=(q as LessonQuestion).answer.trim(),quote=(q as LessonQuestion).quote.trim();
    if(!question)issues.push({code:'question',index});
    if(!answer)issues.push({code:'answer',index});
    if(!quote)issues.push({code:'quote',index});
    if(question.length>L.question||answer.length>L.answer||quote.length>L.quote)issues.push({code:'tooLong',index});
    if(quote&&text&&!flat(text).includes(flat(quote)))issues.push({code:'quoteNotInText',index});
    else if(quote&&answer&&!normalize(quote,lang).includes(normalize(answer,lang)))issues.push({code:'answerNotInQuote',index});
    if(question&&answer&&normalize(question,lang).includes(normalize(answer,lang)))issues.push({code:'answerInQuestion',index});
    const k=normalize(question,lang);if(k&&seen.has(k))issues.push({code:'duplicateQuestion',index});seen.add(k);
    questions.push({question,answer,quote});
  });
  const body=` ${normalize(text,lang)} `,usedTerms=req.vocabulary.map(v=>v.term).filter(t=>{const n=normalize(t,lang);return n&&body.includes(` ${n} `);});
  if(text&&!usedTerms.length)issues.push({code:'noVocabulary'});
  if(issues.length)return {ok:false,issues};
  return {ok:true,lesson:{title,text,translation,questions},usedTerms};
}

/** An accepted lesson becomes an ordinary Learning Passage in the deck (#21): Reading/Listening practice use it offline. */
export function lessonToPassageInput(lesson:GeneratedLesson,deck:Pick<Deck,'id'|'contentLanguage'>):PassageInput{
  return {deckId:deck.id,title:lesson.title,body:lesson.text,contentLanguage:deck.contentLanguage,translation:lesson.translation,
    questions:lesson.questions.map(q=>({question:q.question,answer:q.answer,alternatives:[],quote:q.quote}))};
}

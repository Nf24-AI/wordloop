/**
 * #64 Practice 2.0 — word selection, the multi-batch plan, consent, and the call to the story endpoint.
 * Everything here is local (localStorage) except `requestStory`, which runs only after explicit consent and sends
 * exactly a validated `StoryRequest` (languages, chosen level, story/conversation, the batch's term+meaning pairs).
 * Nothing here reads or writes FSRS state, due dates or reviews (dueAt is only READ to pick a sensible default).
 */
import type {Deck,Word} from './data';
import {accessFetch,PushNetworkError} from './net.ts';
import {BATCH_SIZE,CEFR_LEVELS,STORY_GENRES,STORY_MAX_WORDS,completeBatch,nextBatch,startPlan,storyLanguageSupported,validateStory,validateStoryRequest,type Cefr,type PlanState,type Story,type StoryGenre,type StoryRequest} from './story.ts';

/* ───────── which cards can be practised ───────── */
const meaningOf=(w:Pick<Word,'meaning'|'meanings'>)=>((w.meanings?.length?w.meanings:[w.meaning])??[]).map(m=>m.trim()).filter(Boolean).join(', ').slice(0,80);
/** Active vocabulary of a deck: not archived, not a Q&A card, with a term and a meaning. De-duplicated by term. */
export function eligibleWords(words:readonly Word[],deckId:string):Word[]{
  const seen=new Set<string>(),out:Word[]=[];
  for(const w of words){
    if(w.deckId!==deckId||w.archived||w.contentType==='question_answer')continue;
    const term=w.term.trim(),k=term.normalize('NFC').toLocaleLowerCase();
    if(!term||term.length>60||!meaningOf(w)||seen.has(k))continue;
    seen.add(k);out.push(w);
  }
  return out;
}
/** The default «useful subset»: the batch size for the level, soonest-due first (read-only use of dueAt). */
export function defaultSelection(words:readonly Word[],level:Cefr):string[]{
  return [...words].sort((a,b)=>a.dueAt.localeCompare(b.dueAt)||b.createdAt.localeCompare(a.createdAt)).slice(0,BATCH_SIZE[level]).map(w=>w.id);
}
export type SelectAllState='none'|'some'|'all';
export function selectState(selected:ReadonlySet<string>,all:readonly Word[]):SelectAllState{
  const n=all.filter(w=>selected.has(w.id)).length;return n===0?'none':n===all.length?'all':'some';
}
/** Only ids that are still eligible survive (an archived/deleted card leaves the selection). */
export const keepEligible=(ids:readonly string[],eligible:readonly Word[])=>{const ok=new Set(eligible.map(w=>w.id));return [...new Set(ids)].filter(id=>ok.has(id));};

/* ───────── the request ───────── */
export function buildStoryRequest(deck:Pick<Deck,'contentLanguage'|'meaningLanguage'>,cards:readonly Word[],level:Cefr,genre:StoryGenre):StoryRequest{
  if(cards.length>STORY_MAX_WORDS)throw Error('batch too large');
  const req={v:1 as const,contentLanguage:deck.contentLanguage,meaningLanguage:deck.meaningLanguage,level,genre,words:cards.map(w=>({term:w.term.trim(),meaning:meaningOf(w)}))};
  const v=validateStoryRequest(req);if(!v.ok)throw Error('request:'+v.problem);
  return v.request;
}

/* ───────── local settings / plan (this device only) ───────── */
const SETTINGS='wordloop-practice-settings',PLAN='wordloop-practice-plan',SEL='wordloop-practice-selection',CONSENT='wordloop-ai-consent';
export const CONSENT_VERSION='v1';
const read=<T>(k:string,fallback:T):T=>{try{const v=JSON.parse(localStorage.getItem(k)||'null');return v??fallback;}catch{return fallback;}};
const write=(k:string,v:unknown)=>{try{if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,JSON.stringify(v));}catch{/* private mode */}};
export type PracticeSettings={level:Cefr;genre:StoryGenre;deckId:string|null};
export function readSettings():PracticeSettings{
  const s=read<Partial<PracticeSettings>>(SETTINGS,{});
  return {level:(CEFR_LEVELS as readonly unknown[]).includes(s.level)?s.level as Cefr:'A2',genre:(STORY_GENRES as readonly unknown[]).includes(s.genre)?s.genre as StoryGenre:'story',deckId:typeof s.deckId==='string'?s.deckId:null};
}
export const writeSettings=(s:PracticeSettings)=>write(SETTINGS,s);
/** The learner's own selection per deck (survives Reading ↔ Listening and reloads). null = never chosen → default. */
export function readSelection(deckId:string):string[]|null{const m=read<Record<string,string[]>>(SEL,{});return Array.isArray(m[deckId])?m[deckId].filter(x=>typeof x==='string'):null;}
export function writeSelection(deckId:string,ids:string[]|null){const m=read<Record<string,string[]>>(SEL,{});if(ids)m[deckId]=ids;else delete m[deckId];write(SEL,m);}
export const hasConsent=()=>read<string|null>(CONSENT,null)===CONSENT_VERSION;
export const giveConsent=(yes:boolean)=>write(CONSENT,yes?CONSENT_VERSION:null);

/** The current multi-story plan: the whole selected queue + which saved story covers which batch. */
export type PlanStory={passageId:string;batch:string[];used:string[];demo?:boolean};
/** `demo`: Demo Mode — every story of this plan is the local demo text (no network). */
export type Plan={deckId:string;genre:StoryGenre;state:PlanState;stories:PlanStory[];pending:string[]|null;demo?:boolean};
export function readPlan():Plan|null{const p=read<Plan|null>(PLAN,null);return p&&typeof p.deckId==='string'&&p.state&&Array.isArray(p.state.queue)&&Array.isArray(p.stories)?p:null;}
export const writePlan=(p:Plan|null)=>write(PLAN,p);
export function newPlan(deckId:string,ids:readonly string[],level:Cefr,genre:StoryGenre,demo=false):Plan{return {deckId,genre,state:startPlan(ids,level),stories:[],pending:null,demo};}
/** The next batch to generate (or the batch already waiting for a story). */
export function batchToGenerate(p:Plan):string[]{return p.pending??nextBatch(p.state);}
export function recordStory(p:Plan,passageId:string,batch:string[],usedIds:string[]):Plan{
  return {...p,state:completeBatch(p.state,batch,usedIds),stories:[...p.stories,{passageId,batch,used:usedIds,...(p.demo?{demo:true}:{})}],pending:null};
}
export const storyLanguageOk=(deck:Pick<Deck,'contentLanguage'>)=>storyLanguageSupported(deck.contentLanguage);

/* ───────── the network call ───────── */
export type StoryFailure='offline'|'signin'|'off'|'quota'|'rate'|'busy'|'timeout'|'invalid'|'provider'|'cancelled'|'request';
export type StoryResult={ok:true;story:Story;used:string[];missing:string[]}|{ok:false;reason:StoryFailure};
const CODES:StoryFailure[]=['off','quota','rate','busy','timeout','invalid','provider','cancelled','request'];
/** One request, no automatic retries (the server already did its one bounded repair). The reply is validated AGAIN here. */
export async function requestStory(req:StoryRequest,signal:AbortSignal,locale:'ar'|'en',fetcher=accessFetch):Promise<StoryResult>{
  if(typeof navigator!=='undefined'&&navigator.onLine===false)return {ok:false,reason:'offline'};
  let res:Response;
  try{res=await fetcher('/api/practice/story',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(req),signal},locale);}
  catch(e){
    if(signal.aborted)return {ok:false,reason:'cancelled'};
    if(e instanceof PushNetworkError)return {ok:false,reason:e.reason};
    return {ok:false,reason:'offline'};
  }
  let data:unknown=null;try{data=await res.json();}catch{/* not JSON */}
  if(!res.ok){const c=(data as {code?:unknown}|null)?.code;return {ok:false,reason:CODES.includes(c as StoryFailure)?c as StoryFailure:res.status===404?'off':'provider'};}
  const v=validateStory((data as {story?:unknown}|null)?.story,req);
  return v.ok?{ok:true,story:v.story,used:v.used,missing:v.missing}:{ok:false,reason:'invalid'};
}

/** Whether AI stories are switched on for this deployment. 'unknown' (offline, signed out, old Worker) → behave as
 *  before: Start tries, and the generator explains whatever comes back. Cached for the page session. */
export type StoryStatus='on'|'off'|'unknown';
let statusCache:Promise<StoryStatus>|null=null;
export function storyStatus(locale:'ar'|'en',fetcher=accessFetch,fresh=false):Promise<StoryStatus>{
  if(statusCache&&!fresh)return statusCache;
  statusCache=(async()=>{
    try{const r=await fetcher('/api/practice/story/status',{method:'GET'},locale);if(!r.ok)return 'unknown';
      const j=await r.json() as {ai?:unknown};return j.ai==='on'?'on':j.ai==='off'?'off':'unknown';}
    catch{statusCache=null;return 'unknown';}
  })();
  return statusCache;
}

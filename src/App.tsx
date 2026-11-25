import {createPortal} from 'react-dom';
import {useCallback,useEffect,useId,useLayoutEffect,useMemo,useRef,useState,type CSSProperties,type FocusEvent as ReactFocusEvent,type FormEvent,type KeyboardEvent as ReactKeyboardEvent,type ReactNode} from 'react';
import {Archive,ArrowDownUp,ArrowDownToLine,CheckSquare,ClipboardPaste,Sparkles,ArrowLeft,ArrowRight,ArrowUpFromLine,Bell,BellOff,BookOpen,CalendarClock,Check,ChevronDown,CloudOff,Download,Folder as FolderIcon,FolderInput,FolderPlus,HardDrive,Headphones,Home,Languages,Layers3,Lightbulb,LineChart,MoreHorizontal,Pencil,Plus,RotateCcw,Search,Send,Settings,ShieldCheck,Smartphone,Snail,Square,Trash2,Volume2,Wifi,WifiOff,X,FileText,Eye,EyeOff,Pause,Play,LogOut,PenLine} from 'lucide-react';
import {addWord,addWords,archiveWord,archiveWords,moveWords,sortWords,CARD_SORTS,type CardSort,buildBackup,cardLanguages,CONTENT_TYPES,createDeck,createFolder,DEFAULT_CONTENT_LANGUAGE,DEFAULT_DECK_ID,DEFAULT_DECK_NAME,DEFAULT_FOLDER_ID,DEFAULT_FOLDER_NAME,DEFAULT_MEANING_LANGUAGE,deleteDeck,deleteFolder,dueInScope,editWord,inScope,inferContentType,lastBackupDate,libraryCounts,listLibrary,listReviews,listWords,MAX_MEANINGS,moveWord,normalizeTerm,NOTE_LIMIT,onOtherTabChange,rememberBackup,renameFolder,restoreBackup,reviewWord,scopedSummary,summary,TERM_LIMIT,updateDeck,validateBackup,type CardEdit,type ContentType,type Deck,type Folder,type Grade,type Review,type ReviewScope,type Word,createPassage,deletePassage,listPassages,PASSAGE_LIMITS,updatePassage,type Passage} from './data';
import {pickVoice,RATE} from './voice';
import {buildListening,buildReading,cardsInPassage,checkAnswer,compareDictation,listeningAvailability,readingAvailability,score,type Answered,type DictationItem,type ListeningKind,type PracticeItem,type ReadingKind} from './practice';
import {applyUpdate,dismissUpdate,onUpdateStatus,updateStatus,type UpdateStatus} from './update';
import {disablePush,enablePush,markPracticed,practiceReminders,pushState,pushSupported,setPracticeAvailable,setPracticeReminders,syncPush,testPush} from './push';
import {dictionaries,errorKeys,LOCALES,storedLocale,storeLocale,type Dict,type Locale} from './i18n';
import {readContinue,rememberContinue,resolveContinue} from './continue';
import {bulkCounts,checkRows,parseBulk,splitMeanings,BULK_EXAMPLE_LIMIT,BULK_MAX_LINES,type BulkRow} from './bulk';
import {VOCAB_SOURCES,chooseLanguage,decksOf,homeDeck,langKey,languageGroups,poolFor,selectionFor,selectionKey,type LangGroup} from './practiceSetup';
import {batchToGenerate,buildStoryRequest,giveConsent,hasConsent,keepEligible,newPlan,readPlan,readSelection,readSettings,recordStory,requestStory,selectState,storyStatus,type StoryStatus,writePlan,writeSelection,writeSettings,type Plan,type PracticeSettings,type StoryFailure} from './practicePlan';
import {batchesLeft,highlightParts,planFinished,storyLanguageSupported,termsIn,BATCH_SIZE,CEFR_LEVELS,STORY_GENRES,type StoryRequest} from './story';
import {buildDemoStory,isDemoTitle} from './demoStory';
import {accessState,signOut} from './access';
import {aiLessonsAvailable,buildLessonRequest,lessonGenerator,lessonToPassageInput,validateLesson,LESSON_LEVELS,LESSON_MAX_CARDS,LESSON_MODES,LESSON_QUESTION_COUNTS,type GeneratedLesson,type LessonIssue,type LessonLevel,type LessonMode,type LessonQuestionCount,type LessonRequest} from './lessons';
import {ALargeSmall,Highlighter,Maximize2,Minimize2,Minus,Moon,Sun} from 'lucide-react';
import {FONT_SCALES,READER_FONTS,READER_THEMES,isRead,markRead,readPrefs,readerParagraphs,readingMinutes,suggestionsFor,writePrefs,type ReaderPrefs,type Suggestion} from './reader';

/* ───────────── Language (#6) ─────────────
 * The active dictionary. App sets it from its `locale` state on every render and remounts the tree
 * when the language changes, so every component reads the current language without prop threading. */
let T:Dict=dictionaries[storedLocale()];

/* ───────────── Navigation ───────────── */
type Page='home'|'review'|'words'|'add'|'stats'|'settings';
const PAGES:Page[]=['home','review','words','add','stats','settings'];
/** #74: «الممارسة» is a first-class destination. It is not a separate page: it opens the existing Practice hub inside
 *  the Library route (`#/words/practice`), so there is exactly one Practice screen. */
type NavId=Page|'practice';
const navItems:{id:NavId;icon:typeof Home}[]=[
  {id:'home',icon:Home},{id:'review',icon:Layers3},{id:'practice',icon:Headphones},{id:'words',icon:BookOpen},{id:'stats',icon:LineChart},{id:'settings',icon:Settings},
];
const PRACTICE_KINDS=new Set(['landing','hub','listen','pick','gen','story','practice']);
/** Practice screens: the hub, word picking, generation, stories, and reading/listening a saved text. */
function isPracticeRoute(page:Page,sub:string){return page==='words'&&PRACTICE_KINDS.has(parseLibrary(sub).kind);}
/** Which navigation item is the current place. On a Practice screen it is «الممارسة», not «مكتبتي». */
function navActive(id:NavId,page:Page,sub:string){
  if(id==='practice')return isPracticeRoute(page,sub);
  if(id==='words')return page==='words'&&!isPracticeRoute(page,sub);
  return page===id;
}
/** Route = page + optional sub-path, e.g. `#/words/d/<deck>` → page `words`, sub `d/<deck>`; `#/add/<deck>` → add to that deck. */
function hashParts(){const [h,...rest]=window.location.hash.replace(/^#\/?/,'').split('/');return {page:(PAGES.includes(h as Page)?h:'home') as Page,sub:PAGES.includes(h as Page)?rest.join('/'):''};}
function readHash():Page{return hashParts().page;}
function readSub():string{return hashParts().sub;}
/**
 * #42 — in-app trail of routes visited in this session (newest last), so «رجوع» can use the real history when it is
 * known to stay inside the app, and a parent route otherwise. history.back() is never called blindly: in an installed
 * PWA it can leave the app, or land on the Cloudflare Access page.
 */
const TRAIL_KEY='wordloop-trail';
let trail:string[]=(()=>{try{const t=JSON.parse(sessionStorage.getItem(TRAIL_KEY)||'[]');return Array.isArray(t)?t.filter((x):x is string=>typeof x==='string').slice(-30):[];}catch{return [];}})();
let replacingRoute=false;
const currentRoute=()=>window.location.hash.replace(/^#\/?/,'');
/** Called on every route change: a step back pops the trail, a replace swaps its top, anything else pushes. */
function recordRoute(){
  const r=currentRoute();
  if(replacingRoute){replacingRoute=false;trail[Math.max(0,trail.length-1)]=r;}
  else if(trail.length>=2&&trail[trail.length-2]===r)trail.pop();
  else if(trail[trail.length-1]!==r)trail.push(r);
  trail=trail.slice(-30);
  try{sessionStorage.setItem(TRAIL_KEY,JSON.stringify(trail));}catch{/* private mode: the trail lasts for this page only */}
}
const previousRoute=():string|null=>trail.length>=2?trail[trail.length-2]:null;
/** Go to `target` as a step back: the real Back when the previous in-app entry is that route, otherwise replace (no history loops). */
function stepBackTo(target:string){
  if(previousRoute()===target&&history.length>1){history.back();return;}
  replacingRoute=true;window.location.replace('#/'+target);
}
/** #42: a form with typed, unsaved text marks itself data-unsaved="true"; leaving asks first. */
const hasUnsaved=()=>!!document.querySelector('[data-unsaved="true"]');
let askLeave:(proceed:()=>void)=>void=proceed=>proceed();
/** Set when the learner chose «الخروج بدون حفظ»: the route change that follows is not questioned again. */
let leaveConfirmedAt=0;
const confirmLeave=()=>{leaveConfirmedAt=Date.now();};
/** Run `proceed` now, or after the learner confirms leaving unsaved text. */
function guardLeave(proceed:()=>void){if(hasUnsaved())askLeave(()=>{confirmLeave();proceed();});else proceed();}
recordRoute();
/** "Back" arrow: points right in Arabic (RTL), left in English (LTR). */
function BackArrow({size=20}:{size?:number}){return T.dir==='rtl'?<ArrowRight size={size} aria-hidden="true"/>:<ArrowLeft size={size} aria-hidden="true"/>;}
/** "Forward" arrow: points left in Arabic (RTL), right in English (LTR). */
function Fwd({size=20}:{size?:number}){return T.dir==='rtl'?<ArrowLeft size={size} aria-hidden="true"/>:<ArrowRight size={size} aria-hidden="true"/>;}

const gradeIds:{id:Grade;key:string}[]=[{id:'again',key:'1'},{id:'hard',key:'2'},{id:'good',key:'3'},{id:'easy',key:'4'}];

/* Friendly, localized versions of messages thrown by data.ts / push.ts / the push Worker. */
function getError(e:unknown){
  const E=T.errors;
  if(e instanceof DOMException&&e.name==='QuotaExceededError')return E.quota;
  if(e instanceof DOMException&&(e.name==='InvalidStateError'||e.name==='UnknownError'))return E.connection;
  if(e instanceof SyntaxError)return E.unreadableFile;
  if(e instanceof TypeError&&/fetch|network|load failed/i.test(e.message))return E.network; // Safari says «Load failed»
  if(e instanceof Error){
    const key=errorKeys[e.message];if(key)return E[key];
    if(e.message.startsWith('هذا المتصفح لا يدعم الإشعارات'))return E.pushUnsupported;
    if(T.locale==='ar'&&/[؀-ۿ]/.test(e.message))return e.message;
  }
  return E.unexpected;
}

/* ───────────── Formatting helpers ───────────── */
const TZ='Asia/Riyadh',DAY=86_400_000;
const keyFmt=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'});
const dayKey=(d:Date|string)=>keyFmt.format(typeof d==='string'?new Date(d):d);
const fmtCache=new Map<string,Intl.DateTimeFormat>();
function fmt(name:string,opts:Intl.DateTimeFormatOptions){const k=T.intl+'|'+name;let f=fmtCache.get(k);if(!f){f=new Intl.DateTimeFormat(T.intl,{...opts,timeZone:TZ});fmtCache.set(k,f);}return f;}
const localDate=(iso:string)=>fmt('date',{day:'numeric',month:'long'}).format(new Date(iso));
const weekday=(d:Date)=>fmt('weekday',{weekday:'short'}).format(d);
/** Relative due time, anchored to Riyadh calendar days (same rule in both languages). */
function relative(iso:string,now=Date.now()){
  const diff=new Date(iso).getTime()-now;
  if(diff<=0)return T.now;
  if(diff<3_600_000)return T.inMinutes(Math.max(1,Math.round(diff/60_000)));
  if(diff<DAY)return T.inHours(Math.round(diff/3_600_000));
  const days=Math.round((new Date(dayKey(new Date(iso))).getTime()-new Date(dayKey(new Date(now))).getTime())/DAY);
  if(days<=1)return T.tomorrow;
  if(days<30)return T.inDays(days);
  if(days<365)return T.inMonths(Math.round(days/30));
  return T.inYears(Math.round(days/365));
}
const daysBetween=(iso:string,now=Date.now())=>Math.round((new Date(dayKey(new Date(now))).getTime()-new Date(dayKey(new Date(iso))).getTime())/DAY);
const isDue=(w:Word,now=Date.now())=>new Date(w.dueAt).getTime()<=now;
const canSpeak=typeof window!=='undefined'&&'speechSynthesis' in window&&'SpeechSynthesisUtterance' in window;
/* #19/#20 speech engine (ranking lives in voice.ts). The device voice list arrives late on Chrome/Safari and changes when
   a voice is installed, so it is refreshed on `voiceschanged`. Leaving the app stops speech. */
let deviceVoices:SpeechSynthesisVoice[]=[];
if(canSpeak){
  const load=()=>{deviceVoices=window.speechSynthesis.getVoices();};load();
  window.speechSynthesis.addEventListener?.('voiceschanged',load);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)window.speechSynthesis.cancel();});
}
/** Where speech problems are reported (the app toast); set by the shell. */
let speechNotice:(text:string)=>void=()=>{};
/**
 * Speaks `text` in the card's language with the best local voice. If the device has no voice for that language it says
 * so and stays silent — never the wrong language. Before the voice list is known the browser picks by `lang`.
 */
function speak(text:string,lang:string,{slow=false,onEnd}:{slow?:boolean;onEnd?:()=>void}={}):boolean{
  const synth=window.speechSynthesis;
  if(!deviceVoices.length)deviceVoices=synth.getVoices();
  const v=deviceVoices.length?pickVoice(deviceVoices,lang):undefined;
  if(v===null){speechNotice(T.speech.noVoice(langName(lang)));return false;}
  synth.cancel();
  const u=new SpeechSynthesisUtterance(text);u.lang=v?.lang||lang;if(v)u.voice=v;u.rate=slow?RATE.slow:RATE.normal;
  u.onend=()=>onEnd?.();
  u.onerror=e=>{if(e.error!=='interrupted'&&e.error!=='canceled')speechNotice(T.speech.failed);onEnd?.();};
  if(synth.paused)synth.resume(); // iOS can stay paused after an interruption (call, other audio)
  synth.speak(u);return true;
}
type Stage='new'|'learning'|'growing'|'strong';
const STAGES:Stage[]=['new','learning','growing','strong'];
function stageOf(w:Word):Stage{const s=Number(w.fsrsState.state),st=Number(w.fsrsState.stability);if(!s)return 'new';if(s===1||s===3)return 'learning';return st>=21?'strong':'growing';}

/* ───────────── Small shared pieces ───────────── */
type Notify=(text:string,tone?:'ok'|'error')=>void;
function Mark(){return <span className="mark" aria-hidden="true"/>;}
function Logo(){return <span className="brand" dir="ltr"><Mark/><span>WordLoop</span></span>;}
function Wash({tone='full'}:{tone?:'full'|'soft'|'cool'|'warm'}){return <div className={'wash wash-'+tone} aria-hidden="true"><i/><i/><i/><i/></div>;}
/**
 * One listen button (#20: اسمع → افهم → كرّر). Tap = natural speed; tap again while it plays = stop. After the first
 * listen a light «أبطأ» replay appears next to it (`slower={false}` where space is tight). No voice/speed settings.
 */
function SpeakButton({text,label,lang,className='icon-btn',slower=true,showLabel=false}:{text:string;label:string;lang:string;className?:string;slower?:boolean;showLabel?:boolean}){
  const [playing,setPlaying]=useState<null|'normal'|'slow'>(null),[heard,setHeard]=useState(false);
  const run=useRef(0);
  useEffect(()=>{setHeard(false);},[text,lang]);
  useEffect(()=>()=>{if(run.current<0)window.speechSynthesis.cancel();},[]);
  if(!canSpeak)return null;
  function play(mode:'normal'|'slow'){
    if(playing){window.speechSynthesis.cancel();run.current=Math.abs(run.current)+1;setPlaying(null);if(playing===mode)return;}
    const id=Math.abs(run.current)+1;run.current=-id; // negative = this button is speaking
    const ok=speak(text,lang,{slow:mode==='slow',onEnd:()=>{if(run.current===-id){run.current=id;setPlaying(null);}}});
    if(ok){setPlaying(mode);setHeard(true);}else run.current=id;
  }
  const main=<button type="button" className={className+(playing==='normal'?' is-playing':'')} aria-label={playing==='normal'?T.speech.stop:label} title={playing==='normal'?T.speech.stop:label} onClick={()=>play('normal')} disabled={!text.trim()}>
    {playing==='normal'?<Square size={16} strokeWidth={2.2}/>:<Volume2 size={19} strokeWidth={1.8}/>}{showLabel&&<span>{playing==='normal'?T.speech.stop:label}</span>}</button>;
  if(!slower)return main;
  return <span className="speak-group">{main}{heard&&<button type="button" className={'slow-btn'+(playing==='slow'?' is-playing':'')} aria-label={playing==='slow'?T.speech.stop:T.speech.slowerLabel(text)} onClick={()=>play('slow')}>
    {playing==='slow'?<Square size={13} strokeWidth={2.4}/>:<Snail size={15} strokeWidth={1.9}/>}<span>{T.speech.slower}</span></button>}</span>;
}
function PageHead({title,lead,children}:{title:string;lead?:string;children?:ReactNode}){
  return <header className="page-head"><div><h1 tabIndex={-1}>{title}</h1>{lead&&<p className="lead">{lead}</p>}</div>{children}</header>;
}
function ConfirmDialog({open,title,body,confirm,cancel,onConfirm,onCancel}:{open:boolean;title:string;body:string;confirm:string;cancel:string;onConfirm:()=>void;onCancel:()=>void}){
  // #29: two confirm dialogs can share a page (one card / several cards), so each needs its own title id.
  const ref=useRef<HTMLDialogElement>(null),titleId=useId();
  useEffect(()=>{const d=ref.current;if(!d)return;if(open&&!d.open)d.showModal();if(!open&&d.open)d.close();},[open]);
  return <dialog ref={ref} className="sheet" onCancel={e=>{e.preventDefault();onCancel();}} aria-labelledby={titleId}>
    <h2 id={titleId}>{title}</h2><p>{body}</p>
    <div className="sheet-actions"><button type="button" className="btn btn-danger" onClick={onConfirm}>{confirm}</button><button type="button" className="btn btn-quiet" onClick={onCancel} autoFocus>{cancel}</button></div>
  </dialog>;
}

/* ───────────── Home ───────────── */
function HomePage({words,reviews,lib,lastBackup,onNavigate,go}:{words:Word[];reviews:Review[];lib:Library;lastBackup:string|null;onNavigate:(p:Page)=>void;go:(path:string)=>void}){
  const decks=lib.decks;
  const termProps=(w:Word)=>{const l=contentLang(w,decks);return {dir:termDir(w,l),lang:l};};
  const H=T.home;
  const stats=summary(words,reviews),now=Date.now();
  const active=useMemo(()=>words.filter(w=>!w.archived),[words]);
  const dueWords=active.filter(w=>isDue(w,now));
  const upcoming=active.filter(w=>!isDue(w,now)).sort((a,b)=>a.dueAt.localeCompare(b.dueAt));
  const lastAdded=active.reduce<Word|undefined>((a,w)=>!a||w.createdAt>a.createdAt?w:a,undefined);
  const dayIndex=Math.floor(new Date(dayKey(new Date(now))).getTime()/DAY);
  const backupStale=active.length>=5&&(!lastBackup||now-new Date(lastBackup).getTime()>14*DAY);
  // #27: the last deck/folder the learner meant to work on, re-checked against today's data (never a stale «Continue»).
  const cont=resolveContinue(readContinue(),lib,words,now);
  const contPlace=cont&&(cont.kind==='deck'?lib.decks.find(d=>d.id===cont.id):lib.folders.find(f=>f.id===cont.id));
  const contName=!cont||!contPlace?'':cont.kind==='deck'?deckName(contPlace as Deck):folderName(contPlace as Folder);
  const contPath=!cont?'':cont.action==='review'?scopePath(cont):cont.action==='add'?'add/'+encodeURIComponent(cont.id):cont.kind==='deck'?deckPath(cont.id):folderPath(cont.id);

  if(!active.length)return <div className="home">
    <section className="hero hero-first">
      <Wash/>
      <div className="hero-copy">
        <h1 tabIndex={-1}>{H.firstTitle[0]}<br/>{H.firstTitle[1]}</h1>
        <p className="lead">{H.firstLead}</p>
        <button type="button" className="btn btn-ink btn-lg" onClick={()=>onNavigate('add')}>{T.addCard}<Fwd/></button>
      </div>
      <div className="paper-stack" aria-hidden="true"><div className="paper p1"><span>{H.paperFirst}</span><b>{H.paperWord}</b></div><div className="paper p2"><b>?</b></div></div>
    </section>
    <section className="how" aria-labelledby="how-title">
      <h2 id="how-title">{H.howTitle}</h2>
      <ol className="steps">{H.steps.map(([b,s])=><li key={b}><b>{b}</b><span>{s}</span></li>)}</ol>
      <button type="button" className="privacy-line" onClick={()=>onNavigate('settings')}><ShieldCheck size={16} aria-hidden="true"/>{H.privacyLink}</button>
    </section>
  </div>;

  const hasDue=stats.dueNow>0;
  const next=upcoming[0];
  const preview=(hasDue?dueWords:upcoming).slice(0,3);
  return <div className="home">
    <section className={'hero '+(hasDue?'hero-due':'hero-calm')}>
      <Wash tone={hasDue?'full':'cool'}/>
      <div className="hero-copy">
        <h1 tabIndex={-1}>{hasDue?T.due:T.noDue}</h1>
        <p className="lead">{hasDue?T.dueLead:next?H.nextLead(relative(next.dueAt,now)):H.addNowLead}</p>
        <div className="hero-actions">
          <button type="button" className="btn btn-ink btn-lg" onClick={()=>onNavigate(hasDue?'review':'add')}>{hasDue?T.startReview:T.addCard}<Fwd/></button>
          {hasDue&&<p className="hero-count"><b>{stats.dueNow}</b><span>{T.cardUnit(stats.dueNow)} {H.waitingNow}</span></p>}
        </div>
      </div>
      <div className="paper-stack" aria-hidden="true">{preview.map((w,i)=><div key={w.id} className={'paper p'+(i+1)}><span>{hasDue?H.readyPaper:relative(w.dueAt,now)}</span><b {...termProps(w)}>{w.term}</b></div>)}</div>
    </section>

    <dl className="facts">
      <div><dt>{H.inLibrary}</dt><dd>{stats.inLibrary}<small>{T.cardUnit(stats.inLibrary)}</small></dd></div>
      <div><dt>{H.reviewedToday}</dt><dd>{stats.cardsReviewedToday}<small>{T.cardUnit(stats.cardsReviewedToday)}</small></dd>{stats.reviewAttemptsToday>stats.cardsReviewedToday&&<p className="fact-note">{H.attemptsNote(T.attempts(stats.reviewAttemptsToday))}</p>}</div>
      <div><dt>{H.scheduled7}</dt><dd>{stats.scheduledNext7Days}<small>{T.cardUnit(stats.scheduledNext7Days)}</small></dd></div>
    </dl>

    <div className="home-row">
      {cont&&contName&&<button type="button" className="nudge home-wide home-continue" data-home="continue" data-action={cont.action} onClick={()=>go(contPath)}>
        <span className="nudge-icon mint">{cont.action==='review'?<Layers3 size={20}/>:cont.action==='add'?<Plus size={20}/>:cont.kind==='deck'?<Layers3 size={20}/>:<FolderIcon size={20}/>}</span>
        <span><small className="eyebrow">{H.continueTitle}</small><b dir="auto" className="home-term">{contName}</b><small>{cont.action==='review'?H.continueReview(cont.due):cont.action==='add'?H.continueAdd:H.continueOpen(cont.kind)}</small></span>
        <Fwd size={18}/>
      </button>}
      {lastAdded&&<button type="button" className="nudge home-card" data-home="last-added" onClick={()=>onNavigate('words')}>
        <span className="nudge-icon mint"><BookOpen size={20}/></span>
        <span><small className="eyebrow">{H.lastAddedTitle}</small><b {...termProps(lastAdded)} className="home-term">{lastAdded.term}</b><small><i className="kind-badge">{kindLabel(lastAdded.contentType)}</i> {lastAdded.meanings.some(m=>m.trim())?<span dir="auto">{lastAdded.meanings.filter(m=>m.trim()).join('؛ ')}</span>:<span className="home-no-meaning">{H.noMeaning}</span>}</small><small>{H.addedWhen(daysBetween(lastAdded.createdAt,now),localDate(lastAdded.createdAt))}</small></span>
        <Fwd size={18}/>
      </button>}
      {/* When nothing is due the hero already names the next review; show it here only when it would otherwise be hidden. */}
      {hasDue&&<div className="nudge static home-card" data-home="next">
        <span className="nudge-icon warm"><CalendarClock size={20}/></span>
        <span><small className="eyebrow">{H.nextTitle}</small>{next?<><b {...termProps(next)} className="home-term">{next.term}</b><small>{H.nextIn(relative(next.dueAt,now))} · {localDate(next.dueAt)}</small></>:<small>{H.allDueNow}</small>}</span>
      </div>}
      {backupStale&&<button type="button" className="nudge home-wide" onClick={()=>onNavigate('settings')}><span className="nudge-icon warm"><Download size={20}/></span><span><b>{H.backupStaleTitle}</b><small>{lastBackup?H.backupLast(localDate(lastBackup)):H.backupNever} {H.backupWhy}</small></span><Fwd size={18}/></button>}
    </div>
    <aside className="tip" aria-labelledby="tip-title"><span className="tip-icon" aria-hidden="true"><Lightbulb size={18}/></span><p><b id="tip-title">{H.tipTitle}</b> {H.tips[dayIndex%H.tips.length]}</p></aside>
  </div>;
}

/* ───────────── Card kinds (#5 / #12) ───────────── */
const kindLabel=(k:ContentType)=>T.kinds[k].label;
/** The built-in default tag is stored as «عام»; show it in the UI language without changing what is saved. */
const DEFAULT_TAG='عام';
const tagText=(t:string)=>t===DEFAULT_TAG?T.add.defaultTag:t;
/* ───────────── Add card (#26: one unified form) ───────────── */
const LAST_DECK='wordloop-last-deck';
/** #16/#9: the deck a new card goes to — the deck it was opened from, else the last deck used on this device, else the default deck. */
function initialDeck(lib:Library,fromRoute:string){
  const ok=(id:string|null|undefined):id is string=>!!id&&lib.decks.some(d=>d.id===id);
  if(ok(fromRoute))return fromRoute;
  let last:string|null=null;try{last=localStorage.getItem(LAST_DECK);}catch{/* private mode */}
  return ok(last)?last:DEFAULT_DECK_ID;
}
const RTL_LANGS=new Set(['ar','fa','he','ur','ps','yi']);
const isRtl=(tag:string)=>RTL_LANGS.has(tag.split('-')[0].toLowerCase());
const dirOf=(tag:string)=>isRtl(tag)?'rtl':'ltr';
/** #18: a question may be written in any language whatever the deck says, so its direction follows its own text. */
const termDir=(w:Pick<Word,'contentType'>,lang:string)=>w.contentType==='question_answer'?'auto':dirOf(lang);
/** #19: the language a card is read and spoken in — card override → its deck → defaults. Never the interface locale. */
const contentLang=(w:Word,decks:readonly Deck[])=>cardLanguages(w,decks).content;
/** A sentence/example with its own listen button, in the card's language. */
function ExampleLine({text,lang,className='example'}:{text:string;lang:string;className?:string}){
  return <p className={className+' example-line'}><span dir={dirOf(lang)} lang={lang}>{text}</span><SpeakButton text={text} lang={lang} label={T.speech.listenExample} className="icon-btn ghost example-speak"/></p>;
}
/** Native-language name of a BCP-47 tag in the interface language (falls back to the tag). */
function langName(tag:string){try{return new Intl.DisplayNames([T.locale],{type:'language'}).of(tag)||tag;}catch{return tag;}}
/** Short examples shown as placeholders only for common languages; otherwise the box stays empty. */
const TERM_PH:Record<string,string>={en:'show',es:'mostrar',fr:'montrer',de:'zeigen',it:'mostrare',pt:'mostrar',tr:'göstermek'};
const MEANING_PH:Record<string,string>={ar:'يُظهر',en:'to show'};
const EXAMPLE_PH:Record<string,string>={en:'I’ll show you around.',es:'Te mostraré la ciudad.',fr:'Je vais te montrer la ville.'};
const phFor=(map:Record<string,string>,tag:string)=>map[tag.split('-')[0].toLowerCase()]||'';

/**
 * One box style for content, every meaning and the optional sentence (#26 points 4–5): the language badge and the
 * listen button sit inside the box; the text direction follows the box language. Enter saves, Shift+Enter adds a line.
 */
function LangBox({id,lang,label,value,onChange,placeholder,maxLength,invalid,describedBy,boxRef,onRemove,removeLabel,autoDir=false}:{id:string;lang:string;label:string;value:string;onChange:(v:string)=>void;placeholder?:string;maxLength:number;invalid?:boolean;describedBy?:string;boxRef?:(el:HTMLTextAreaElement|null)=>void;onRemove?:()=>void;removeLabel?:string;autoDir?:boolean}){
  const ref=useRef<HTMLTextAreaElement|null>(null);
  useLayoutEffect(()=>{const el=ref.current;if(el){el.style.height='auto';el.style.height=el.scrollHeight+'px';}},[value]);
  return <div className={'lang-box'+(invalid?' invalid':'')}>
    <label htmlFor={id} className="visually-hidden">{label} · {langName(lang)}</label>
    <span className="lang-badge" dir="ltr" aria-hidden="true">{langCode(lang)}</span>
    <textarea ref={el=>{ref.current=el;boxRef?.(el);}} id={id} rows={1} dir={autoDir?(value.trim()?'auto':T.dir):isRtl(lang)?'rtl':'ltr'} lang={lang} autoComplete="off" autoCapitalize="none" spellCheck={false}
      maxLength={maxLength} placeholder={placeholder} value={value} onChange={e=>onChange(e.target.value)} aria-invalid={invalid||undefined} aria-describedby={describedBy}
      onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();e.currentTarget.form?.requestSubmit();}}}/>
    <SpeakButton text={value} lang={lang} label={T.listen(value.trim()||label)} className="icon-btn box-icon" slower={false}/>
    {onRemove&&<button type="button" className="icon-btn box-icon" aria-label={removeLabel} title={removeLabel} onClick={onRemove}><X size={18}/></button>}
  </div>;
}

/** #42: the Add form's unsaved text, kept on this device only (localStorage), never in IndexedDB or the cloud. */
const ADD_DRAFT='wordloop-add-draft';
type AddMode='word'|'qa';
type AddDraft={deckParam:string;term:string;meanings:string[];example:string;mode?:AddMode};
function readAddDraft(deckParam:string):AddDraft|null{
  try{const d=JSON.parse(localStorage.getItem(ADD_DRAFT)||'null');
    if(d&&d.deckParam===deckParam&&typeof d.term==='string'&&Array.isArray(d.meanings)&&d.meanings.length&&d.meanings.every((m:unknown)=>typeof m==='string')&&typeof d.example==='string')return {...d,meanings:d.meanings.slice(0,MAX_MEANINGS),mode:d.mode==='qa'?'qa':'word'};
  }catch{/* unreadable draft: start empty */}
  return null;
}
function writeAddDraft(d:AddDraft|null){try{if(d)localStorage.setItem(ADD_DRAFT,JSON.stringify(d));else localStorage.removeItem(ADD_DRAFT);}catch{/* private mode */}}
/** #18: the Add mode last used in each deck (a networking deck opens on «سؤال وجواب»). Device-local, never synced. */
const ADD_MODES='wordloop-add-mode';
function readAddMode(deckId:string):AddMode{try{const m=JSON.parse(localStorage.getItem(ADD_MODES)||'{}');return m&&m[deckId]==='qa'?'qa':'word';}catch{return 'word';}}
function writeAddMode(deckId:string,mode:AddMode){try{const m=JSON.parse(localStorage.getItem(ADD_MODES)||'{}')||{};if(mode==='qa')m[deckId]='qa';else delete m[deckId];localStorage.setItem(ADD_MODES,JSON.stringify(m));}catch{/* private mode */}}
function AddPage({words,lib,deckParam,onSaved,notify,go}:{words:Word[];lib:Library;deckParam:string;onSaved:()=>Promise<Word[]|null>;notify:Notify;go:(path:string)=>void}){
  const A=T.add,F=T.addForm,Q=T.qa;
  const [deckId,setDeckId]=useState(()=>initialDeck(lib,deckParam));
  const deck=lib.decks.find(d=>d.id===deckId)??lib.decks.find(d=>d.id===DEFAULT_DECK_ID);
  // Languages come from the deck (#15/#16); an optional override applies to the cards saved from this form until reset.
  const [override,setOverride]=useState<{content:string;meaning:string}|null>(null),[langOpen,setLangOpen]=useState(false);
  const content=override?.content??deck?.contentLanguage??DEFAULT_CONTENT_LANGUAGE,meaningLang=override?.meaning??deck?.meaningLanguage??DEFAULT_MEANING_LANGUAGE;
  const [lastDeck,setLastDeck]=useState<string|null>(null);
  // #42: typed text survives Back, a refresh or iOS closing the PWA in the background; cleared on save or when leaving the page.
  const [draft]=useState(()=>readAddDraft(deckParam));
  const [term,setTerm]=useState(draft?.term??''),[meanings,setMeanings]=useState<string[]>(draft?.meanings??['']),[example,setExample]=useState(draft?.example??''),[showExample,setShowExample]=useState(!!draft?.example);
  // #18: «سؤال وجواب» reuses the same boxes: question = term, answer = meaning, explanation (stored as the note) = the optional third box.
  const [mode,setMode]=useState<AddMode>(()=>draft?.mode??readAddMode(initialDeck(lib,deckParam))),qa=mode==='qa';
  const unsaved=!!(term.trim()||meanings.some(m=>m.trim())||example.trim());
  useEffect(()=>{writeAddDraft(unsaved?{deckParam,term,meanings,example,mode}:null);},[unsaved,deckParam,term,meanings,example,mode]);
  useEffect(()=>()=>{if(!document.hidden)writeAddDraft(null);},[]);
  const [loading,setLoading]=useState(false),[error,setError]=useState(''),[tried,setTried]=useState(false),[saved,setSaved]=useState<string|null>(null),[unsynced,setUnsynced]=useState<Word|null>(null);
  const termRef=useRef<HTMLTextAreaElement|null>(null),meaningRefs=useRef<(HTMLTextAreaElement|null)[]>([]),focusMeaning=useRef<number|null>(null),exampleRef=useRef<HTMLTextAreaElement|null>(null);
  const kind:ContentType=qa?'question_answer':inferContentType(term),limit=TERM_LIMIT[kind];
  // A question is only a duplicate of another question; a word only of another word (the kinds never mix, #18).
  const duplicate=term.trim()?words.find(w=>!w.archived&&(w.contentType==='question_answer')===qa&&normalizeTerm(w.term)===normalizeTerm(term)):undefined;
  const tooLong=term.trim().length>limit,hasMeaning=meanings.some(m=>m.trim());
  useEffect(()=>{if(focusMeaning.current!==null){meaningRefs.current[focusMeaning.current]?.focus();focusMeaning.current=null;}},[meanings.length]);
  useEffect(()=>{if(showExample&&!example)exampleRef.current?.focus();},[showExample]); // eslint-disable-line react-hooks/exhaustive-deps
  const touched=()=>{setSaved(null);setError('');};
  function addMeaning(){if(meanings.length>=MAX_MEANINGS)return;focusMeaning.current=meanings.length;setMeanings(m=>[...m,'']);touched();}
  function removeMeaning(i:number){setMeanings(m=>m.length>1?m.filter((_,j)=>j!==i):m);meaningRefs.current[Math.max(0,i-1)]?.focus();touched();}
  async function submit(e:FormEvent){
    e.preventDefault();setTried(true);setError('');
    if(!term.trim()||tooLong||duplicate){termRef.current?.focus();return;}
    if(!hasMeaning){meaningRefs.current[0]?.focus();return;}
    setLoading(true);setUnsynced(null);
    const target=lib.decks.some(d=>d.id===deckId)?deckId:DEFAULT_DECK_ID;
    let word:Word;
    try{
      word=await addWord({contentType:kind,deckId:target,term,meanings:qa?meanings.slice(0,1):meanings,example:!qa&&showExample?example:'',note:qa&&showExample?example:'',translation:'',tag:'',
        ...(override&&override.content!==deck?.contentLanguage?{contentLanguage:override.content}:{}),...(override&&override.meaning!==deck?.meaningLanguage?{meaningLanguage:override.meaning}:{})});
      try{localStorage.setItem(LAST_DECK,target);}catch{/* private mode */}setLastDeck(target);writeAddMode(target,mode);rememberContinue('deck',target);
    }catch(err){setError(getError(err));setLoading(false);return;}
    // Ready for the next card: same deck and languages, empty boxes (#26 point 8).
    setTerm('');setMeanings(['']);setExample('');setShowExample(false);setTried(false);
    await confirmVisible(word);setLoading(false);termRef.current?.focus();
  }
  /** #4: success is announced only once the saved card is in the refreshed list. */
  async function confirmVisible(word:Word){
    const list=await onSaved();
    if(list?.some(w=>w.id===word.id)){setUnsynced(null);setSaved(word.term);notify(F.saved(word.term));}
    else{setSaved(null);setUnsynced(word);}
  }
  const termHint=tried&&!term.trim()?(qa?Q.missingQuestion:F.missingTerm):tooLong?(qa?Q.tooLong(limit):F.tooLong(limit)):duplicate?(qa?Q.duplicate:F.duplicate):'';
  /** A question has one answer box; extra meaning boxes typed in word mode are folded into it (never dropped silently). */
  function chooseMode(m:AddMode){if(m===mode)return;setMode(m);touched();if(m==='qa')setMeanings(ms=>{const kept=ms.filter(x=>x.trim());return [kept.join('؛ ')];});}
  function changeDeck(id:string){setDeckId(id);setOverride(null);if(!unsaved)setMode(readAddMode(id));}
  return <div className="page add-page">
    <PageHead title={qa?Q.title:F.title} lead={qa?Q.lead:F.lead}/>
    <form className="word-form add-form" onSubmit={submit} data-unsaved={unsaved&&!loading?'true':undefined} noValidate>
      <div className="add-target">
        <DeckPicker lib={lib} value={deckId} onChange={changeDeck}/>
        <button type="button" className="lang-pair" aria-expanded={langOpen} aria-controls="lang-override" onClick={()=>setLangOpen(o=>!o)}>
          <span dir="ltr">{langCode(content)} → {langCode(meaningLang)}</span><small>{F.changeLang}</small><ChevronDown size={16} className="chev" aria-hidden="true"/>
        </button>
      </div>
      {langOpen&&<div className="lang-override" id="lang-override">
        <div className="field"><label htmlFor="add-content-lang">{F.contentLangShort}</label><LanguageSelect id="add-content-lang" value={content} onChange={v=>setOverride({content:v,meaning:meaningLang})}/></div>
        <div className="field"><label htmlFor="add-meaning-lang">{F.meaningLangShort}</label><LanguageSelect id="add-meaning-lang" value={meaningLang} onChange={v=>setOverride({content,meaning:v})}/></div>
        <p className="hint">{override?<>{F.overrideNote} <button type="button" className="link-btn" onClick={()=>setOverride(null)}>{F.useDeckLang}</button></>:F.deckLangNote}</p>
      </div>}
      <div className="chips add-mode" role="group" aria-label={Q.mode}>
        {(['word','qa'] as AddMode[]).map(m=><button type="button" key={m} className={'chip'+(mode===m?' on':'')} aria-pressed={mode===m} data-mode={m} onClick={()=>chooseMode(m)}>{m==='qa'?Q.modeQa:Q.modeWord}</button>)}
      </div>
      <LangBox id="term" lang={content} label={qa?Q.question:F.termLabel} value={term} onChange={v=>{setTerm(v);touched();}} placeholder={qa?Q.questionPh:phFor(TERM_PH,content)} maxLength={TERM_LIMIT.sentence}
        invalid={!!termHint} describedBy={termHint?'term-hint':undefined} boxRef={el=>{termRef.current=el;}} autoDir={qa}/>
      {termHint&&<p id="term-hint" className="hint box-hint" role="alert">{termHint}</p>}
      {meanings.map((m,i)=><LangBox key={i} id={i?'meaning-'+i:'meaning'} lang={meaningLang} label={qa?Q.answer:F.meaningLabel(i+1,meanings.length)} value={m} placeholder={i?'':qa?Q.answerPh:phFor(MEANING_PH,meaningLang)} maxLength={240} autoDir={qa}
        onChange={v=>{setMeanings(ms=>ms.map((x,j)=>j===i?v:x));touched();}} invalid={tried&&!hasMeaning&&i===0} describedBy={tried&&!hasMeaning&&i===0?'meaning-hint':undefined}
        boxRef={el=>{meaningRefs.current[i]=el;}} onRemove={meanings.length>1?()=>removeMeaning(i):undefined} removeLabel={F.removeMeaning(i+1)}/>)}
      {tried&&!hasMeaning&&<p id="meaning-hint" className="hint box-hint" role="alert">{qa?Q.missingAnswer:F.missingMeaning}</p>}
      <div className="add-more-row">
        {!qa&&meanings.length<MAX_MEANINGS&&<button type="button" className="add-more" onClick={addMeaning}><Plus size={18} aria-hidden="true"/>{F.addMeaning}</button>}
        {!showExample&&<button type="button" className="add-more" onClick={()=>setShowExample(true)}><Plus size={18} aria-hidden="true"/>{qa?Q.addExplanation:F.addExample}</button>}
      </div>
      {showExample&&<LangBox id="example" lang={qa?meaningLang:content} label={qa?Q.explanation:F.exampleLabel} value={example} onChange={setExample} placeholder={qa?Q.explanationPh:phFor(EXAMPLE_PH,content)} maxLength={qa?NOTE_LIMIT:500}
        boxRef={el=>{exampleRef.current=el;}} onRemove={()=>{setExample('');setShowExample(false);}} removeLabel={qa?Q.removeExplanation:F.removeExample} autoDir={qa}/>}
      {error&&<p className="inline-error" role="alert">{error}</p>}
      {unsynced&&<div className="inline-error soft" role="alert"><p>{A.unsynced[0]}<span dir="auto">{unsynced.term}</span>{A.unsynced[1]}</p><button type="button" className="btn btn-quiet sm" disabled={loading} onClick={()=>{setLoading(true);void confirmVisible(unsynced).finally(()=>setLoading(false));}}><RotateCcw size={16}/>{A.refreshList}</button></div>}
      <div className="form-foot">
        <button disabled={loading} type="submit" className="btn btn-save btn-lg">{!loading&&<Check size={20} aria-hidden="true"/>}{loading?F.saving:F.save}</button>
        {saved&&<button type="button" className="btn btn-quiet" onClick={()=>go(lastDeck?deckPath(lastDeck):'words')}>{A.seeLibrary}</button>}
      </div>
      {/* #28: a secondary way in, for many words at once. */}
      {!qa&&<p className="add-alt"><button type="button" className="link-btn" onClick={()=>go(bulkPath(deckId))}><ClipboardPaste size={16} aria-hidden="true"/>{T.bulk.open}</button></p>}
    </form>
  </div>;
}

/* ───────────── Bulk Add (#28): paste → editable preview → one save ───────────── */
const bulkPath=(deckId:string)=>'add/bulk/'+encodeURIComponent(deckId);
/** The pasted text survives Back, a refresh or iOS closing the PWA (device only); cleared after a confirmed save. */
const BULK_DRAFT='wordloop-bulk-draft';
function readBulkDraft():string{try{const d=JSON.parse(localStorage.getItem(BULK_DRAFT)||'null');return d&&typeof d.text==='string'?d.text:'';}catch{return '';}}
function writeBulkDraft(text:string){try{if(text.trim())localStorage.setItem(BULK_DRAFT,JSON.stringify({text}));else localStorage.removeItem(BULK_DRAFT);}catch{/* private mode */}}
type UiRow=BulkRow&{meaningText:string};
function BulkAddPage({words,lib,deckParam,onSaved,notify,go}:{words:Word[];lib:Library;deckParam:string;onSaved:()=>Promise<Word[]|null>;notify:Notify;go:(path:string)=>void}){
  const B=T.bulk;
  const [deckId,setDeckId]=useState(()=>initialDeck(lib,deckParam));
  const deck=lib.decks.find(d=>d.id===deckId);
  const lang=deck?.contentLanguage??DEFAULT_CONTENT_LANGUAGE;
  const [text,setText]=useState(readBulkDraft),[rows,setRows]=useState<UiRow[]|null>(null),[info,setInfo]=useState<{truncated:boolean;skippedHeader:boolean}>({truncated:false,skippedHeader:false});
  const [saving,setSaving]=useState(false),[error,setError]=useState(''),[unsynced,setUnsynced]=useState(false),[savedTo,setSavedTo]=useState<string|null>(null);
  const busy=useRef(false);
  useEffect(()=>{writeBulkDraft(text);},[text]);
  useEffect(()=>{if(savedTo)go(deckPath(savedTo));},[savedTo]); // eslint-disable-line react-hooks/exhaustive-deps
  const view=useMemo(()=>rows?checkRows(rows,words,deckId):null,[rows,words,deckId]);
  const counts=view?bulkCounts(view):null,ready=view?view.filter(r=>r.status==='ok'&&r.include):[];
  const unsaved=!!text.trim()&&!savedTo;
  function preview(e:FormEvent){e.preventDefault();setError('');setUnsynced(false);const p=parseBulk(text);setRows(p.rows.map(r=>({...r,meaningText:r.meanings.join('; ')})));setInfo({truncated:p.truncated,skippedHeader:p.skippedHeader});}
  /** Editing a row brings it back in (a fixed duplicate is included again). */
  const edit=(id:string,patch:Partial<UiRow>)=>{setError('');setRows(rs=>rs&&rs.map(r=>r.id===id?{...r,...patch,include:patch.include??true}:r));};
  async function save(){
    if(busy.current||!ready.length)return;
    busy.current=true;setSaving(true);setError('');setUnsynced(false);
    try{
      await addWords(ready.map(r=>({id:r.id,deckId,term:r.term,meanings:r.meanings,example:r.example})));
      // #4: success only once every saved card is really in the refreshed list.
      const list=await onSaved();
      if(list&&ready.every(r=>list.some(w=>w.id===r.id))){
        try{localStorage.setItem(LAST_DECK,deckId);}catch{/* private mode */}rememberContinue('deck',deckId);
        notify(B.saved(ready.length,deck?deckName(deck):''));setText('');setRows(null);writeBulkDraft('');setSavedTo(deckId);
      }else setUnsynced(true);
    }catch(e){
      const row=(e as {row?:unknown}).row,line=typeof row==='number'?ready[row]?.line:undefined;
      setError((line?B.rowError(line):'')+getError(e)+' '+B.nothingSaved);
    }finally{busy.current=false;setSaving(false);}
  }
  return <div className="page add-page bulk-page">
    <PageHead title={B.title} lead={B.lead}/>
    <form className="word-form bulk-form" onSubmit={preview} data-unsaved={unsaved&&!saving?'true':undefined} noValidate>
      <div className="add-target"><DeckPicker lib={lib} value={deckId} onChange={id=>{setDeckId(id);setError('');}}/></div>
      {!deck&&<p className="hint" role="alert">{B.deckGone}</p>}
      <div className="field">
        <label htmlFor="bulk-text">{B.textLabel}</label>
        <textarea id="bulk-text" className="bulk-text" rows={6} dir="auto" lang={lang} spellCheck={false} autoCapitalize="none" value={text} placeholder={B.textPh}
          onChange={e=>{setText(e.target.value);setError('');}}/>
        <p className="hint">{B.formats(BULK_MAX_LINES)}</p>
      </div>
      <div className="form-foot"><button type="submit" className="btn btn-ink" disabled={!text.trim()||saving}>{B.preview}</button></div>
    </form>
    {view&&counts&&<section className="bulk-preview" aria-labelledby="bulk-preview-title">
      <h2 id="bulk-preview-title" className="results-title">{B.previewTitle}</h2>
      <p className="bulk-counts" role="status">{B.counts(counts.ready,counts.errors,counts.duplicates)}</p>
      {info.skippedHeader&&<p className="hint">{B.header}</p>}
      {info.truncated&&<p className="hint">{B.truncated(BULK_MAX_LINES)}</p>}
      {view.length===0?<p className="hint">{B.empty}</p>:<ol className="bulk-list">{view.map(r=>{return <li key={r.id} className={'bulk-row is-'+r.status} data-status={r.status}>
        <div className="bulk-head"><span className="bulk-line">{B.line(r.line)}</span>
          <label className="bulk-include"><input type="checkbox" checked={r.include&&r.status==='ok'} disabled={r.status!=='ok'} onChange={e=>edit(r.id,{include:e.target.checked})}/>{B.include}</label></div>
        <div className="bulk-fields">
          <input className="bulk-term" aria-label={B.termN(r.line)} dir={r.term.trim()?'auto':T.dir} lang={lang} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={TERM_LIMIT.sentence} value={r.term} onChange={e=>edit(r.id,{term:e.target.value})}/>
          <input className="bulk-meanings" aria-label={B.meaningsN(r.line)} dir="auto" autoComplete="off" placeholder={B.meaningsPh} value={r.meaningText} onChange={e=>edit(r.id,{meaningText:e.target.value,meanings:splitMeanings(e.target.value)})}/>
          {(r.example||r.source.includes('\t'))&&<input className="bulk-example" aria-label={B.exampleN(r.line)} dir={r.example.trim()?'auto':T.dir} lang={lang} maxLength={BULK_EXAMPLE_LIMIT} placeholder={B.examplePh} value={r.example} onChange={e=>edit(r.id,{example:e.target.value})}/>}
        </div>
        {r.status!=='ok'&&<small className="bulk-note">{r.status==='error'&&r.problem?B.problem[r.problem]:B.status[r.status]}</small>}
      </li>;})}</ol>}
      {error&&<p className="inline-error" role="alert">{error}</p>}
      {unsynced&&<div className="inline-error soft" role="alert"><p>{B.unsynced}</p><button type="button" className="btn btn-quiet sm" disabled={saving} onClick={()=>void save()}><RotateCcw size={16}/>{B.retry}</button></div>}
      <div className="form-foot">
        <button type="button" className="btn btn-save btn-lg" disabled={saving||!ready.length} aria-busy={saving||undefined} onClick={()=>void save()}>{!saving&&<Check size={20} aria-hidden="true"/>}{saving?B.saving:ready.length?B.save(ready.length):B.nothingReady}</button>
      </div>
      <p className="passage-note">{B.privacy}</p>
    </section>}
  </div>;
}

/* ───────────── Review ───────────── */
/** #17: `review` all due · `review/f/<id>` a folder · `review/d/<id>` a deck. An unknown place falls back to all (never an empty queue by mistake). */
function parseScope(sub:string,lib:Library):ReviewScope{
  const [k,raw]=sub.split('/'),id=raw?decodeURIComponent(raw):'';
  if(k==='d'&&lib.decks.some(d=>d.id===id))return {kind:'deck',id};
  if(k==='f'&&lib.folders.some(f=>f.id===id))return {kind:'folder',id};
  return {kind:'all'};
}
const scopePath=(s:{kind:'folder'|'deck';id:string})=>'review/'+(s.kind==='deck'?'d/':'f/')+encodeURIComponent(s.id);
function scopeName(s:ReviewScope,lib:Library):string{
  if(s.kind==='deck'){const d=lib.decks.find(x=>x.id===s.id);return d?deckName(d):'';}
  if(s.kind==='folder'){const f=lib.folders.find(x=>x.id===s.id);return f?folderName(f):'';}
  return '';
}
/** «تراجع: …» + a way back to the full review. Shown only inside a folder/deck review. */
function ScopeBar({scope,lib,go}:{scope:ReviewScope;lib:Library;go:(path:string)=>void}){
  if(scope.kind==='all')return null;const R=T.review,Icon=scope.kind==='deck'?Layers3:FolderIcon;
  return <div className="scope-bar"><span className="scope-chip"><Icon size={16} aria-hidden="true"/>{R.scopeLabel(scope.kind)} <b dir="auto">{scopeName(scope,lib)}</b></span><button type="button" className="link-btn" onClick={()=>go('review')}>{R.reviewAll}</button></div>;
}

function ReviewPage({words,lib,scope,onReviewed,onNavigate,go}:{words:Word[];lib:Library;scope:ReviewScope;onReviewed:()=>Promise<unknown>;onNavigate:(p:Page)=>void;go:(path:string)=>void}){
  const R=T.review;
  const dueIds=useCallback(()=>dueInScope(words,scope,lib.decks).map(w=>w.id),[words,scope,lib.decks]);
  const [queue,setQueue]=useState<string[]>(dueIds),[revealed,setRevealed]=useState(false),[busy,setBusy]=useState(false),[done,setDone]=useState(0),[msg,setMsg]=useState(''),[last,setLast]=useState<{term:string;next:string}|null>(null);
  const active=queue.length?words.find(w=>w.id===queue[0]):undefined;
  const revealRef=useRef<HTMLButtonElement>(null),gradesRef=useRef<HTMLDivElement>(null);
  const review=useCallback(async(g:Grade)=>{
    if(!active||busy)return;setBusy(true);setMsg('');
    try{const next=await reviewWord(active.id,g);if(scope.kind!=='all')rememberContinue(scope.kind,scope.id); // #27: a graded card in a deck/folder review
      setLast({term:active.term,next});setQueue(v=>v.slice(1));setDone(n=>n+1);setRevealed(false);await onReviewed();}
    catch(e){setMsg(getError(e));setQueue(v=>v.slice(1));setRevealed(false);}
    finally{setBusy(false);}
  },[active,busy,onReviewed,scope]);
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      const t=e.target as HTMLElement;if(t.closest('input,textarea,select,dialog')||e.metaKey||e.ctrlKey||e.altKey)return;
      if(!revealed&&e.key===' '&&(t.tagName!=='BUTTON'||t.classList.contains('reveal'))){e.preventDefault();setRevealed(true);}
      if(revealed){const g=gradeIds.find(x=>x.key===e.key);if(g){e.preventDefault();void review(g.id);}}
    };
    window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
  },[revealed,review]);
  useEffect(()=>{
    if(revealed){const g=gradesRef.current;g?.scrollIntoView({block:'nearest',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});g?.focus({preventScroll:true});}
    else revealRef.current?.focus({preventScroll:true});
  },[revealed,active?.id]);
  const comesBack=(l:{term:string;next:string})=><>«<bdi>{l.term}</bdi>» {R.comesBack} {relative(l.next)}.</>;

  if(!active){
    const moreDue=dueIds().length;
    if(scope.kind!=='all'){
      // Nothing (more) due here: say so for this place, show when its next card is due, and offer the full review / the way back.
      const t=Date.now(),allDue=dueInScope(words,{kind:'all'},lib.decks,t).length;
      const next=words.filter(w=>!w.archived&&Date.parse(w.dueAt)>t&&inScope(w,scope,lib.decks)).map(w=>w.dueAt).sort()[0];
      const back=scope.kind==='deck'?deckPath(scope.id):folderPath(scope.id);
      return <section className="finish">
        <ScopeBar scope={scope} lib={lib} go={go}/>
        <div className="finish-orb" aria-hidden="true"><Wash/></div>
        <h1 tabIndex={-1}>{done?R.done:R.scopeNoDue(scope.kind)}</h1>
        <p className="lead">{done?R.doneLead(done):next?R.scopeNext(relative(next)):R.restLead}</p>
        {msg&&<p className="inline-error" role="alert">{msg}</p>}
        {last&&<p className="finish-note">{comesBack(last)}</p>}
        <div className="finish-actions">
          {moreDue>0&&<button type="button" className="btn btn-ink btn-lg" onClick={()=>{setQueue(dueIds());setDone(0);setLast(null);setMsg('');}}>{R.again(moreDue)}<RotateCcw size={18}/></button>}
          {allDue>0&&<button type="button" className={'btn btn-lg '+(moreDue?'btn-quiet':'btn-ink')} onClick={()=>go('review')}>{R.reviewAllN(allDue)}<Fwd/></button>}
          <button type="button" className="btn btn-lg btn-quiet" onClick={()=>go(back)}>{R.backTo(scope.kind)}</button>
        </div>
      </section>;
    }
    return <section className="finish">
      <div className="finish-orb" aria-hidden="true"><Wash/></div>
      <h1 tabIndex={-1}>{done?R.done:T.noDue}</h1>
      <p className="lead">{done?R.doneLead(done):R.restLead}</p>
      {msg&&<p className="inline-error" role="alert">{msg}</p>}
      {last&&<p className="finish-note">{comesBack(last)}</p>}
      <div className="finish-actions">
        {moreDue>0&&<button type="button" className="btn btn-ink btn-lg" onClick={()=>{setQueue(dueIds());setDone(0);setLast(null);setMsg('');}}>{R.again(moreDue)}<RotateCcw size={18}/></button>}
        <button type="button" className={'btn btn-lg '+(moreDue?'btn-quiet':'btn-ink')} onClick={()=>onNavigate(done?'home':'add')}>{done?R.backHome:T.addCard}<Fwd/></button>
      </div>
    </section>;
  }
  const total=done+queue.length,cl=contentLang(active,lib.decks),meaningLang=cardLanguages(active,lib.decks).meaning,isQa=active.contentType==='question_answer';
  return <section className="review" aria-labelledby="review-title">
    <ScopeBar scope={scope} lib={lib} go={go}/>
    <div className="review-top">
      <h1 id="review-title" tabIndex={-1} className="visually-hidden">{R.title}</h1>
      <div className="progress" role="progressbar" aria-label={R.progress} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-valuetext={R.of(done,total)}><span style={{inlineSize:`${Math.max(4,100*done/total)}%`}}/></div>
      <p className="review-count"><b>{done+1}</b> {R.ofWord} {total}</p>
    </div>
    <div className="last-line" aria-live="polite">{last?comesBack(last):isQa?T.qa.think:R.think}</div>
    <article key={active.id} className={'card'+(revealed?' is-open':'')+(isQa?' card-qa':'')} aria-live="polite" data-kind={active.contentType}>
      <Wash tone="soft"/>
      <div className="card-top"><span className="card-labels"><span className="kind-badge">{kindLabel(active.contentType)}</span><span className="tag" dir="auto">{tagText(active.tag)}</span></span><SpeakButton text={active.term} lang={cl} label={T.listen(active.term)}/></div>
      <h2 dir={termDir(active,cl)} lang={cl} className={'term'+(active.term.length>40?' term-long':'')+(isQa?' term-question':'')}>{active.term}</h2>
      {/* #18: a Q&A card shows only the question until «شوف الإجابة»; anything else could give the answer away. */}
      {active.example&&!isQa&&<ExampleLine text={active.example} lang={cl}/>}
      {revealed?<div className="answer">{active.contentType==='idiom'&&<small className="answer-label">{R.idiomMeaning}</small>}{isQa&&<small className="answer-label">{T.qa.answer}</small>}<strong dir={isQa?'auto':dirOf(meaningLang)} lang={meaningLang}>{active.meanings.join('؛ ')}</strong>{active.note&&<p className="note" dir="auto">{isQa&&<b>{T.qa.explanationLabel}: </b>}{active.note}</p>}{isQa&&active.example&&<p className="note" dir="auto">{active.example}</p>}{active.translation&&<p dir="auto">{active.translation}</p>}</div>
        :<button ref={revealRef} type="button" className="btn btn-ink btn-lg reveal" onClick={()=>setRevealed(true)}>{R.reveal}</button>}
    </article>
    {msg&&<p className="inline-error" role="alert">{msg}</p>}
    {revealed&&<div ref={gradesRef} tabIndex={-1} className="grades" role="group" aria-labelledby="grades-title">
      <h2 id="grades-title">{R.howWell}</h2>
      <div className="grade-row">{gradeIds.map(g=><button type="button" key={g.id} className={'grade g-'+g.id} disabled={busy} onClick={()=>void review(g.id)}><b>{T.grades[g.id].label}</b><span>{T.grades[g.id].note}</span><kbd aria-hidden="true">{g.key}</kbd></button>)}</div>
    </div>}
    <p className="keys-hint" aria-hidden="true">{R.keys}</p>
  </section>;
}

/* ───────────── Library (#16): «مكتبتي» — folders → decks → cards ───────────── */
type Library={folders:Folder[];decks:Deck[]};
type LibView={kind:'root';tab:'folders'|'all'|'due'}|{kind:'folder';id:string}|{kind:'deck';id:string}
  |{kind:'texts';deckId:string}|{kind:'passage';deckId:string;id:string}|{kind:'passageEdit';deckId:string;id:string|null}|{kind:'practice';mode:'read'|'listen';deckId:string;id:string}
  |{kind:'lesson';deckId:string}|{kind:'hub';deckId:string|null}|{kind:'landing'}|{kind:'listen'}
  |{kind:'pick';deckId:string}|{kind:'gen';deckId:string}|{kind:'story';deckId:string;id:string};
/** `''` folders grid · `all` / `due` card tabs · `f/<id>` a folder's decks · `d/<id>` a deck's cards. Tabs are routes, so Back works. */
function parseLibrary(sub:string):LibView{
  const [k,id,t,pid,e]=sub.split('/');
  if(k==='practice'){ // Practice 2.0: `practice` landing · `practice/read` · `practice/listen`; #61/#64: `practice/<deck>` (Reading for that deck's language) · `…/words` · `…/new` · `…/s/<story>`
    if(!id||(id==='write'&&!t))return {kind:'landing'};
    if(id==='read'&&!t)return {kind:'hub',deckId:null};
    if(id==='listen'&&!t)return {kind:'listen'};
    const deckId=decodeURIComponent(id);
    if(deckId&&t==='words'&&!pid)return {kind:'pick',deckId};
    if(deckId&&t==='new'&&!pid)return {kind:'gen',deckId};
    if(deckId&&t==='s'&&pid)return {kind:'story',deckId,id:decodeURIComponent(pid)};
    return {kind:'hub',deckId};
  }
  // #21: `d/<deck>/texts` · `d/<deck>/texts/new` · `d/<deck>/texts/<id>` · `d/<deck>/texts/<id>/edit`
  if(k==='d'&&id&&t==='texts'){const deckId=decodeURIComponent(id);
    if(!pid)return {kind:'texts',deckId};if(pid==='new')return {kind:'passageEdit',deckId,id:null};
    if(e==='read'||e==='listen')return {kind:'practice',mode:e,deckId,id:decodeURIComponent(pid)}; // #22 / #23
    return e==='edit'?{kind:'passageEdit',deckId,id:decodeURIComponent(pid)}:{kind:'passage',deckId,id:decodeURIComponent(pid)};}
  if(k==='d'&&id&&t==='lesson'&&!pid)return {kind:'lesson',deckId:decodeURIComponent(id)}; // #24
  if(k==='f'&&id)return {kind:'folder',id:decodeURIComponent(id)};
  if(k==='d'&&id)return {kind:'deck',id:decodeURIComponent(id)};
  return {kind:'root',tab:k==='all'?'all':k==='due'?'due':'folders'};
}
const folderPath=(id:string)=>'words/f/'+encodeURIComponent(id),deckPath=(id:string)=>'words/d/'+encodeURIComponent(id);
/** The default folder/deck are stored with Arabic names; show them in the UI language until the learner renames them. */
const folderName=(f:Folder)=>f.id===DEFAULT_FOLDER_ID&&f.name===DEFAULT_FOLDER_NAME?T.lib.defaultFolder:f.name;
const deckName=(d:Deck)=>d.id===DEFAULT_DECK_ID&&d.name===DEFAULT_DECK_NAME?T.lib.defaultDeck:d.name;
/** Learning languages offered for a deck (BCP-47 → native name). Independent of the AR/EN interface (#19). */
const LEARN_LANGUAGES:[string,string][]=[['en-US','English (US)'],['en-GB','English (UK)'],['es-ES','Español'],['fr-FR','Français'],['de-DE','Deutsch'],['it-IT','Italiano'],['pt-BR','Português'],['tr-TR','Türkçe'],['ru-RU','Русский'],['zh-CN','中文'],['ja-JP','日本語'],['ko-KR','한국어'],['ar-SA','العربية']];
const langCode=(tag:string)=>tag.split('-')[0].toUpperCase();
/** A card's deck, falling back to the default deck when its deck is missing (never dropped). */
const deckIdOf=(w:Word,lib:Library)=>lib.decks.some(d=>d.id===w.deckId)?w.deckId:DEFAULT_DECK_ID;
const ZERO={decks:0,cards:0,due:0};

function LibraryPage({words,reviews,lib,passages,sub,onChanged,notify,go}:{words:Word[];reviews:Review[];lib:Library;passages:Passage[];sub:string;onChanged:()=>Promise<unknown>;notify:Notify;go:(path:string)=>void}){
  const view=parseLibrary(sub);
  // The default folder always exists once loaded, so no folders = IndexedDB not read yet: render nothing rather than a false «not found» or an empty grid.
  const counts=useMemo(()=>libraryCounts(words,lib.decks),[words,lib.decks]);
  if(!lib.folders.length)return <div className="page library" aria-busy="true"><PageHead title={T.lib.title}/></div>;
  const shared={words,reviews,lib,passages,counts,onChanged,notify,go};
  if(view.kind==='landing')return <PracticeLanding go={go}/>;
  if(view.kind==='listen')return <ListenSetup lib={lib} words={words} passages={passages} go={go}/>;
  if(view.kind==='hub')return <ReadingSetup key={view.deckId??''} deckId={view.deckId} lib={lib} words={words} passages={passages} notify={notify} go={go}/>;
  if(view.kind==='pick')return <WordPicker key={view.deckId} deckId={view.deckId} lib={lib} words={words} go={go}/>;
  if(view.kind==='gen')return <StoryGenerate key={view.deckId} deckId={view.deckId} lib={lib} words={words} onChanged={onChanged} go={go}/>;
  if(view.kind==='story')return <StoryView key={view.id} deckId={view.deckId} id={view.id} lib={lib} words={words} passages={passages} onChanged={onChanged} go={go}/>;
  if(view.kind==='texts')return <TextsView deckId={view.deckId} lib={lib} passages={passages} go={go}/>;
  if(view.kind==='passage')return <PassageView key={view.id} deckId={view.deckId} id={view.id} lib={lib} passages={passages} onChanged={onChanged} notify={notify} go={go}/>;
  if(view.kind==='practice'&&view.mode==='read')return <ReadingPractice key={view.id} deckId={view.deckId} id={view.id} lib={lib} passages={passages} words={words} go={go}/>;
  if(view.kind==='practice')return <ListeningPractice key={view.id} deckId={view.deckId} id={view.id} lib={lib} passages={passages} words={words} go={go}/>;
  if(view.kind==='passageEdit')return <PassageEditor key={view.id??'new'} deckId={view.deckId} id={view.id} lib={lib} passages={passages} onChanged={onChanged} notify={notify} go={go}/>;
  if(view.kind==='lesson')return <LessonPage key={view.deckId} deckId={view.deckId} lib={lib} words={words} onChanged={onChanged} notify={notify} go={go}/>;
  if(view.kind==='folder')return <FolderView key={view.id} id={view.id} {...shared}/>;
  if(view.kind==='deck')return <DeckView key={view.id} id={view.id} {...shared}/>;
  return <LibraryRoot tab={view.tab} {...shared}/>;
}
type LibShared={words:Word[];reviews:Review[];lib:Library;passages:Passage[];counts:ReturnType<typeof libraryCounts>;onChanged:()=>Promise<unknown>;notify:Notify;go:(path:string)=>void};

/** #29: the chosen order is remembered on this device (display only; never written to the cards). */
const SORT_KEY='wordloop-sort';
function useCardSort():[CardSort,(s:CardSort)=>void]{
  const [sort,setSort]=useState<CardSort>(()=>{try{const v=localStorage.getItem(SORT_KEY);return CARD_SORTS.includes(v as CardSort)?v as CardSort:'newest';}catch{return 'newest';}});
  return [sort,s=>{setSort(s);try{localStorage.setItem(SORT_KEY,s);}catch{/* private mode */}}];
}
/** #29: one quiet row above a card list — the order, and «تحديد» to act on several cards. */
function ListTools({sort,onSort,selecting,onSelecting}:{sort:CardSort;onSort:(s:CardSort)=>void;selecting:boolean;onSelecting:(v:boolean)=>void}){
  const L=T.lib;
  return <div className="list-tools">
    <label className="sort-pick"><ArrowDownUp size={16} aria-hidden="true"/><span className="visually-hidden">{L.sortLabel}</span>
      <select value={sort} onChange={e=>onSort(e.target.value as CardSort)} aria-label={L.sortLabel}>{CARD_SORTS.map(s=><option key={s} value={s}>{L.sort[s]}</option>)}</select></label>
    <button type="button" className={'chip select-toggle'+(selecting?' on':'')} aria-pressed={selecting} onClick={()=>onSelecting(!selecting)}><CheckSquare size={16} aria-hidden="true"/>{selecting?L.selectDone:L.select}</button>
  </div>;
}
function SearchBox({value,onChange,placeholder,label}:{value:string;onChange:(v:string)=>void;placeholder:string;label:string}){
  return <label className="search"><Search size={19}/><span className="visually-hidden">{label}</span><input type="search" dir="auto" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} enterKeyHint="search"/>{value&&<button type="button" className="icon-btn ghost" aria-label={T.library.clearSearch} onClick={()=>onChange('')}><X size={17}/></button>}</label>;
}

function LibraryRoot({tab,words,reviews,lib,counts,onChanged,notify,go}:LibShared&{tab:'folders'|'all'|'due'}){
  const L=T.lib;
  const [q,setQ]=useState(''),[kind,setKind]=useState<ContentType|'all'>('all'),[newFolder,setNewFolder]=useState(false);
  const [sort,setSort]=useCardSort(),[selecting,setSelecting]=useState(false);
  const active=useMemo(()=>words.filter(w=>!w.archived),[words]);
  const now=Date.now(),dueN=active.filter(w=>isDue(w,now)).length;
  const s=q.trim().toLocaleLowerCase(),has=(x:string)=>x.toLocaleLowerCase().includes(s);
  const placeOf=useMemo(()=>{const folders=new Map(lib.folders.map(f=>[f.id,f]));return (w:Word)=>{const d=lib.decks.find(x=>x.id===deckIdOf(w,lib));const f=d&&folders.get(d.folderId);return [d?deckName(d):'',f?folderName(f):''];};},[lib]);
  const cardMatch=(w:Word)=>!s||[w.term,...w.meanings,w.example,w.translation,w.note,...placeOf(w)].some(has);
  const byNewest=(a:Word,b:Word)=>b.createdAt.localeCompare(a.createdAt);
  const kindCounts=useMemo(()=>{const m=new Map<ContentType,number>();for(const w of active)m.set(w.contentType,(m.get(w.contentType)||0)+1);return m;},[active]);
  const folders=[...lib.folders].sort((a,b)=>a.id===DEFAULT_FOLDER_ID?-1:b.id===DEFAULT_FOLDER_ID?1:0);
  const tabs:[typeof tab,string,string][]=[['folders',L.folders,'words'],['all',L.allCards,'words/all'],['due',L.due,'words/due']];
  async function create(name:string){const f=await createFolder(name);await onChanged();notify(L.created(f.name));setNewFolder(false);go(folderPath(f.id));}
  let body:ReactNode;
  if(tab==='folders'&&!s){
    body=<ul className="folder-grid" aria-label={L.folders}>
      {folders.map(f=>{const c=counts.folder.get(f.id)??ZERO;return <li key={f.id}><button type="button" className="folder-card" onClick={()=>go(folderPath(f.id))}>
        <span className="folder-icon" aria-hidden="true"><FolderIcon size={22} strokeWidth={1.8}/></span><b dir="auto">{folderName(f)}</b><small>{L.decksCount(c.decks)} · {L.cardsCount(c.cards)}</small></button></li>;})}
      <li><button type="button" className="folder-card new" onClick={()=>setNewFolder(true)}><span className="folder-icon" aria-hidden="true"><FolderPlus size={22} strokeWidth={1.8}/></span><b>{L.newFolder}</b></button></li>
    </ul>;
  }else if(tab==='folders'){
    const fs=folders.filter(f=>has(folderName(f))),ds=lib.decks.filter(d=>has(deckName(d))),cs=active.filter(cardMatch).sort(byNewest);
    body=!fs.length&&!ds.length&&!cs.length?<NoMatch onClear={()=>setQ('')}/>:<div className="results">
      {fs.length>0&&<section><h2 className="results-title">{L.resultsFolders}</h2><DeckRows items={fs.map(f=>({id:f.id,name:folderName(f),line:`${L.decksCount((counts.folder.get(f.id)??ZERO).decks)} · ${L.cardsCount((counts.folder.get(f.id)??ZERO).cards)}`,icon:'folder',path:folderPath(f.id)}))} go={go}/></section>}
      {ds.length>0&&<section><h2 className="results-title">{L.resultsDecks}</h2><DeckRows items={ds.map(d=>deckRow(d,counts))} go={go}/></section>}
      {cs.length>0&&<section><h2 className="results-title">{L.resultsCards}</h2><CardList list={cs} reviews={reviews} lib={lib} onChanged={onChanged} notify={notify} showPlace/></section>}
    </div>;
  }else{
    const pool=sortWords(active.filter(w=>(tab==='all'||isDue(w,now))&&(kind==='all'||w.contentType===kind)&&cardMatch(w)),sort);
    body=<>
      {tab==='all'&&kindCounts.size>1&&<div className="chips kind-chips" role="group" aria-label={T.kindsLabel}>
        <button type="button" className={'chip'+(kind==='all'?' on':'')} aria-pressed={kind==='all'} onClick={()=>setKind('all')}>{T.library.allKinds}</button>
        {CONTENT_TYPES.filter(k=>kindCounts.has(k)).map(k=><button type="button" key={k} className={'chip'+(kind===k?' on':'')} aria-pressed={kind===k} onClick={()=>setKind(kind===k?'all':k)}>{kindLabel(k)} <span className="chip-n">{kindCounts.get(k)}</span></button>)}
      </div>}
      {!active.length?<div className="empty"><Wash tone="soft"/><BookOpen size={30} strokeWidth={1.6}/><h2>{T.library.emptyTitle}</h2><p>{T.library.emptyBody}</p><button type="button" className="btn btn-ink" onClick={()=>go('add')}>{T.addCard}<Fwd size={18}/></button></div>
        :tab==='due'&&!dueN?<div className="empty small"><CalendarClock size={26} strokeWidth={1.6}/><h2>{L.noDueTitle}</h2><p>{L.noDueBody}</p></div>
        :!pool.length?<NoMatch onClear={()=>{setQ('');setKind('all');}}/>
        :<><ListTools sort={sort} onSort={setSort} selecting={selecting} onSelecting={setSelecting}/>
          <CardList list={pool} reviews={reviews} lib={lib} onChanged={onChanged} notify={notify} showPlace selecting={selecting} onSelectingDone={()=>setSelecting(false)}/></>}
    </>;
  }
  return <div className="page library head-inline">
    <PageHead title={L.title} lead={L.lead}><button type="button" className="btn btn-ink head-add" onClick={()=>setNewFolder(true)}><FolderPlus size={18} aria-hidden="true"/>{L.newFolder}</button></PageHead>
    <div className="library-tools">
      <SearchBox value={q} onChange={setQ} placeholder={L.searchPh} label={L.search}/>
      <div className="chips lib-tabs" role="group" aria-label={L.views}>
        {tabs.map(([id,label,path])=><button type="button" key={id} className={'chip'+(tab===id?' on':'')} aria-pressed={tab===id} onClick={()=>go(path)}>{label}{id==='due'&&dueN>0&&<span className="chip-n">{dueN}</span>}</button>)}
      </div>
    </div>
    {body}
    <NameSheet open={newFolder} title={L.newFolder} label={L.nameLabel} placeholder={L.folderNamePh} submit={L.create} onSubmit={create} onClose={()=>setNewFolder(false)}/>
  </div>;
}
function NoMatch({onClear}:{onClear:()=>void}){
  const Lb=T.library;
  return <div className="empty small"><Search size={26} strokeWidth={1.6}/><h2>{Lb.noMatchTitle}</h2><p>{Lb.noMatchBody}</p><button type="button" className="btn btn-quiet" onClick={onClear}>{Lb.showAll}</button></div>;
}
type Row={id:string;name:string;line:ReactNode;icon:'folder'|'deck';path:string;lang?:string};
function deckRow(d:Deck,counts:ReturnType<typeof libraryCounts>):Row{
  const c=counts.deck.get(d.id)??{cards:0,due:0};
  return {id:d.id,name:deckName(d),icon:'deck',path:deckPath(d.id),lang:`${langCode(d.contentLanguage)} → ${langCode(d.meaningLanguage)}`,
    line:<>{T.lib.cardsCount(c.cards)}{c.due>0&&<> · <em className="due-mini">{T.lib.dueCount(c.due)}</em></>}</>};
}
function DeckRows({items,go}:{items:Row[];go:(path:string)=>void}){
  return <ul className="deck-list">{items.map(r=><li key={r.id}><button type="button" className="deck-row" onClick={()=>go(r.path)}>
    <span className="folder-icon sm" aria-hidden="true">{r.icon==='folder'?<FolderIcon size={19} strokeWidth={1.8}/>:<Layers3 size={19} strokeWidth={1.8}/>}</span>
    <span className="deck-text"><b dir="auto">{r.name}</b><small>{r.line}</small></span>
    {r.lang&&<span className="lang-chip" dir="ltr">{r.lang}</span>}<Fwd size={18}/>
  </button></li>)}</ul>;
}
function NotFound({go}:{go:(path:string)=>void}){
  return <div className="page"><div className="empty"><Wash tone="soft"/><FolderIcon size={30} strokeWidth={1.6}/><h1 tabIndex={-1} className="empty-h1">{T.lib.notFoundTitle}</h1><p>{T.lib.notFoundBody}</p><button type="button" className="btn btn-ink" onClick={()=>go('words')}>{T.lib.title}<Fwd size={18}/></button></div></div>;
}

/**
 * #17: real counters for this folder/deck (#10 rules: unique cards vs attempts) and «راجع …» for what is due *here*.
 * No mastery bar and no free study: free study is approved for later and must not touch FSRS.
 */
function ScopePanel({scope,words,reviews,lib,go}:{scope:{kind:'folder'|'deck';id:string};words:Word[];reviews:Review[];lib:Library;go:(path:string)=>void}){
  const L=T.lib,H=T.home;
  const s=scopedSummary(words,reviews,lib.decks,scope),t=Date.now();
  if(!s.inLibrary)return null; // the empty state already explains an empty folder/deck
  const next=s.dueNow?undefined:words.filter(w=>!w.archived&&Date.parse(w.dueAt)>t&&inScope(w,scope,lib.decks)).map(w=>w.dueAt).sort()[0];
  const allDue=s.dueNow?0:dueInScope(words,{kind:'all'},lib.decks,t).length;
  return <section className="scope-panel" aria-label={L.scopeStats(scope.kind)}>
    <dl className="facts scope-facts">
      <div><dt>{L.dueNow}</dt><dd>{s.dueNow}<small>{T.cardUnit(s.dueNow)}</small></dd></div>
      <div><dt>{H.reviewedToday}</dt><dd>{s.cardsReviewedToday}<small>{T.cardUnit(s.cardsReviewedToday)}</small></dd>{s.reviewAttemptsToday>s.cardsReviewedToday&&<p className="fact-note">{H.attemptsNote(T.attempts(s.reviewAttemptsToday))}</p>}</div>
      <div><dt>{L.next7}</dt><dd>{s.scheduledNext7Days}<small>{T.cardUnit(s.scheduledNext7Days)}</small></dd></div>
    </dl>
    {s.dueNow?<button type="button" className="btn btn-ink btn-lg scope-review" onClick={()=>go(scopePath(scope))}><Layers3 size={19} aria-hidden="true"/>{L.reviewHere(scope.kind,s.dueNow)}</button>
      :<p className="scope-rest"><span>{next?L.restUntil(relative(next)):L.restNone}</span>{allDue>0&&<button type="button" className="link-btn" onClick={()=>go('review')}>{T.review.reviewAllN(allDue)}</button>}</p>}
  </section>;
}

function FolderView({id,words,reviews,lib,counts,onChanged,notify,go}:LibShared&{id:string}){
  const L=T.lib;
  const [sheet,setSheet]=useState<null|'deck'|'settings'>(null),[confirmDelete,setConfirmDelete]=useState(false);
  const folder=lib.folders.find(f=>f.id===id);
  if(!folder)return <NotFound go={go}/>;
  const decks=lib.decks.filter(d=>d.folderId===id),c=counts.folder.get(id)??ZERO;
  const blocked=id===DEFAULT_FOLDER_ID?L.defaultLocked:decks.length?L.folderNotEmpty:'';
  async function addDeck(v:DeckForm){const d=await createDeck({folderId:id,name:v.name,contentLanguage:v.contentLanguage,meaningLanguage:v.meaningLanguage});await onChanged();notify(L.created(d.name));setSheet(null);go(deckPath(d.id));}
  async function rename(name:string){await renameFolder(id,name);await onChanged();notify(L.saved);setSheet(null);}
  async function remove(){setConfirmDelete(false);try{await deleteFolder(id);await onChanged();notify(L.deleted(folderName(folder!)));go('words');}catch(e){notify(getError(e),'error');}}
  return <div className="page library head-inline">
    <PageHead title={folderName(folder)} lead={`${L.decksCount(c.decks)} · ${L.cardsCount(c.cards)}`}>
      <div className="head-actions">
        <button type="button" className="icon-btn" aria-label={L.folderSettings} title={L.folderSettings} onClick={()=>setSheet('settings')}><MoreHorizontal size={20}/></button>
        <button type="button" className="btn btn-ink head-add" onClick={()=>setSheet('deck')}><Plus size={18} aria-hidden="true"/>{L.newDeck}</button>
      </div>
    </PageHead>
    <ScopePanel scope={{kind:'folder',id}} words={words} reviews={reviews} lib={lib} go={go}/>
    {decks.length?<DeckRows items={decks.map(d=>deckRow(d,counts))} go={go}/>
      :<div className="empty small"><Layers3 size={26} strokeWidth={1.6}/><h2>{L.folderEmptyTitle}</h2><p>{L.folderEmptyBody}</p></div>}
    <button type="button" className="deck-row new" onClick={()=>setSheet('deck')}><span className="folder-icon sm" aria-hidden="true"><Plus size={19}/></span><span className="deck-text"><b>{L.newDeck}</b></span></button>
    <DeckSheet open={sheet==='deck'} title={L.newDeck} lib={lib} submit={L.create} onSubmit={addDeck} onClose={()=>setSheet(null)}/>
    <NameSheet open={sheet==='settings'} title={L.folderSettings} label={L.nameLabel} placeholder={L.folderNamePh} initial={folderName(folder)} submit={L.save} onSubmit={rename} onClose={()=>setSheet(null)}
      extra={<DangerZone label={L.deleteFolder} blocked={blocked} onDelete={()=>{setSheet(null);setConfirmDelete(true);}}/>}/>
    <ConfirmDialog open={confirmDelete} title={L.deleteFolderTitle(folderName(folder))} body={L.deleteEmptyBody} confirm={L.deleteYes} cancel={L.deleteNo} onConfirm={()=>void remove()} onCancel={()=>setConfirmDelete(false)}/>
  </div>;
}

function DeckView({id,words,reviews,lib,passages,counts,onChanged,notify,go}:LibShared&{id:string}){
  const L=T.lib;
  const [q,setQ]=useState(''),[settings,setSettings]=useState(false),[confirmDelete,setConfirmDelete]=useState(false);
  const [sort,setSort]=useCardSort(),[selecting,setSelecting]=useState(false);
  const deck=lib.decks.find(d=>d.id===id);
  const cards=useMemo(()=>words.filter(w=>!w.archived&&deckIdOf(w,lib)===id),[words,lib,id]);
  if(!deck)return <NotFound go={go}/>;
  const s=q.trim().toLocaleLowerCase(),list=sortWords(cards.filter(w=>!s||[w.term,...w.meanings,w.example,w.translation,w.note].some(x=>x.toLocaleLowerCase().includes(s))),sort);
  const hasAny=words.some(w=>deckIdOf(w,lib)===id); // archived cards still belong to the deck
  const textCount=passages.filter(p=>p.deckId===id).length;
  const blocked=id===DEFAULT_DECK_ID?L.defaultLocked:hasAny?L.deckNotEmpty:textCount?T.texts.deckHasTexts:'';
  async function save(v:DeckForm){await updateDeck(id,v);await onChanged();notify(L.saved);setSettings(false);}
  async function remove(){setConfirmDelete(false);try{await deleteDeck(id);await onChanged();notify(L.deleted(deckName(deck!)));go(folderPath(deck!.folderId));}catch(e){notify(getError(e),'error');}}
  return <div className="page library">
    <PageHead title={deckName(deck)} lead={(c=>c?`${L.cardsCount(cards.length)} · ${L.dueCount(c)}`:L.cardsCount(cards.length))(counts.deck.get(id)?.due??0)}>
      <div className="head-actions">
        <span className="lang-chip" dir="ltr" title={`${deck.contentLanguage} → ${deck.meaningLanguage}`}>{langCode(deck.contentLanguage)} → {langCode(deck.meaningLanguage)}</span>
        <button type="button" className="icon-btn" aria-label={L.deckSettings} title={L.deckSettings} onClick={()=>setSettings(true)}><MoreHorizontal size={20}/></button>
      </div>
    </PageHead>
    <ScopePanel scope={{kind:'deck',id}} words={words} reviews={reviews} lib={lib} go={go}/>
    <div className="deck-actions"><button type="button" className={'btn '+(counts.deck.get(id)?.due?'btn-quiet':'btn-ink')} onClick={()=>go('add/'+encodeURIComponent(id))}><Plus size={18}/>{L.addCard}</button>
      {/* #24: only with the build flag AND a configured generator — neither exists in shipped builds. */}
      {aiLessonsAvailable()&&cards.length>0&&<button type="button" className="btn btn-quiet" onClick={()=>go(deckPath(id)+'/lesson')}><Sparkles size={18} aria-hidden="true"/>{T.lesson.entry}</button>}</div>
    <TextsRow deckId={id} count={textCount} go={go}/>
    {(textCount>0||cards.some(c=>!c.archived))&&<button type="button" className="deck-row practice-row" onClick={()=>go(HUB+'/'+encodeURIComponent(id))}>
      <span className="folder-icon sm" aria-hidden="true"><Headphones size={19} strokeWidth={1.8}/></span>
      <span className="deck-text"><b>{T.hub.entry}</b><small>{T.story.lead}</small></span><Fwd size={18}/></button>}
    {cards.length>0&&<div className="library-tools"><SearchBox value={q} onChange={setQ} placeholder={T.library.searchPh} label={T.library.search}/></div>}
    {!cards.length?<div className="empty small"><Layers3 size={26} strokeWidth={1.6}/><h2>{L.deckEmptyTitle}</h2><p>{L.deckEmptyBody}</p></div>
      :!list.length?<NoMatch onClear={()=>setQ('')}/>
      :<><ListTools sort={sort} onSort={setSort} selecting={selecting} onSelecting={setSelecting}/>
        <CardList list={list} reviews={reviews} lib={lib} onChanged={onChanged} notify={notify} selecting={selecting} onSelectingDone={()=>setSelecting(false)}/></>}
    <DeckSheet open={settings} title={L.deckSettings} lib={lib} deck={deck} submit={L.save} onSubmit={save} onClose={()=>setSettings(false)}
      extra={<DangerZone label={L.deleteDeck} blocked={blocked} onDelete={()=>{setSettings(false);setConfirmDelete(true);}}/>}/>
    <ConfirmDialog open={confirmDelete} title={L.deleteDeckTitle(deckName(deck))} body={L.deleteEmptyBody} confirm={L.deleteYes} cancel={L.deleteNo} onConfirm={()=>void remove()} onCancel={()=>setConfirmDelete(false)}/>
  </div>;
}

/* ───────────── Passages (#21): texts inside a deck, read and listened to (Practice #22/#23 builds on them) ───────────── */
const textsPath=(deckId:string)=>deckPath(deckId)+'/texts',passagePath=(deckId:string,id:string)=>textsPath(deckId)+'/'+encodeURIComponent(id);
/** The compact entry in a deck page: one row, so the #16 deck layout stays about cards. */
function TextsRow({deckId,count,go}:{deckId:string;count:number;go:(path:string)=>void}){
  const Tx=T.texts;
  return <button type="button" className="deck-row texts-row" onClick={()=>go(textsPath(deckId))}>
    <span className="folder-icon sm" aria-hidden="true"><FileText size={19} strokeWidth={1.8}/></span>
    <span className="deck-text"><b>{Tx.title}</b><small>{count?Tx.count(count):Tx.none}</small></span><Fwd size={18}/>
  </button>;
}
function TextsView({deckId,lib,passages,go}:{deckId:string;lib:Library;passages:Passage[];go:(path:string)=>void}){
  const Tx=T.texts,deck=lib.decks.find(d=>d.id===deckId);
  if(!deck)return <NotFound go={go}/>;
  const list=passages.filter(p=>p.deckId===deckId);
  return <div className="page library head-inline">
    <PageHead title={Tx.title} lead={Tx.lead}>
      <div className="head-actions"><button type="button" className="btn btn-ink head-add" onClick={()=>go(textsPath(deckId)+'/new')}><Plus size={18} aria-hidden="true"/>{Tx.add}</button></div>
    </PageHead>
    {list.length?<ul className="deck-list">{list.map(p=><li key={p.id}><button type="button" className="deck-row" onClick={()=>go(passagePath(deckId,p.id))}>
        <span className="folder-icon sm" aria-hidden="true"><FileText size={19} strokeWidth={1.8}/></span>
        <span className="deck-text"><b dir="auto">{p.title}</b><small dir={dirOf(p.contentLanguage)} lang={p.contentLanguage} className="passage-snippet">{p.body.replace(/\s+/g,' ').slice(0,90)}</small></span>
        <span className="lang-chip" dir="ltr">{langCode(p.contentLanguage)}</span><Fwd size={18}/>
      </button></li>)}</ul>
      :<div className="empty small"><FileText size={26} strokeWidth={1.6}/><h2>{Tx.emptyTitle}</h2><p>{Tx.emptyBody}</p>
        <button type="button" className="btn btn-ink" onClick={()=>go(textsPath(deckId)+'/new')}><Plus size={18}/>{Tx.add}</button></div>}
  </div>;
}

/* ───────────── Practice 2.0 (#64): Practice → deck → words → Start → AI story → Reading / Listening → result ─────────────
 * One obvious action (Start). Deck, words, level and story/conversation have sensible defaults; changing them is optional.
 * The story is generated only after explicit consent, validated twice (server + here), and saved as an ordinary local
 * Passage (#21), so Reading/Listening, backup/restore and offline use all work unchanged. Practice never touches FSRS. */
const HUB='words/practice';
const hubDeck=(id:string)=>HUB+'/'+encodeURIComponent(id);
const storyPath=(deckId:string,id:string)=>hubDeck(deckId)+'/s/'+encodeURIComponent(id);
/** Replace the current route (no history entry): used after generation so Back never lands on the generator again. */
function replaceRoute(path:string){replacingRoute=true;window.location.replace('#/'+path);}
const meaningText=(w:Word)=>(w.meanings?.length?w.meanings:[w.meaning]).filter(Boolean).join('، ');
function planIndex(plan:Plan,passageId:string){const i=plan.stories.findIndex(s=>s.passageId===passageId);return {i,total:plan.stories.length+batchesLeft(plan.state)};}

const PRACTICE_SKILLS=[{id:'read',icon:BookOpen,ready:true},{id:'listen',icon:Headphones,ready:true},{id:'write',icon:PenLine,ready:false}] as const;
/** Practice 2.0 landing: a calm introduction and the three skills. Choosing a skill opens its setup — nothing starts yet. */
function PracticeLanding({go}:{go:(path:string)=>void}){
  const L=T.landing;
  return <div className="page practice-landing">
    <header className="landing-intro"><h1>{L.title}</h1><p className="lead">{L.lead}</p></header>
    <ul className="skill-grid" aria-label={L.choose}>
      {PRACTICE_SKILLS.map(({id,icon:Icon,ready})=>{
        const s=L.skills[id];
        const inner=<><span className="skill-icon" aria-hidden="true"><Icon size={26} strokeWidth={1.7}/></span>
          <span className="skill-text"><b>{s.title}</b><small>{s.body}</small></span>
          {ready?<span className="skill-go" aria-hidden="true"><Fwd size={18}/></span>:<span className="skill-soon">{L.soon}</span>}</>;
        return <li key={id}>{ready
          ?<button type="button" className={'skill-card skill-'+id} onClick={()=>go(HUB+'/'+id)}>{inner}</button>
          :<div className={'skill-card skill-'+id+' soon'} role="group" aria-label={`${s.title} · ${L.soon}`} aria-disabled="true">{inner}</div>}</li>;
      })}
    </ul>
  </div>;
}

/** Shared configuration state (Practice 2.0): learning language → its decks → the practisable pool. */
function usePracticeScope(lib:Library,words:Word[],deckId:string|null){
  const [settings,setSettings]=useState(readSettings);
  const save=(s:PracticeSettings)=>{setSettings(s);writeSettings(s);};
  const groups=useMemo(()=>languageGroups(words,lib.decks),[words,lib.decks]);
  const routeDeck=deckId?lib.decks.find(d=>d.id===deckId)??null:null;
  const legacy=settings.deckId?lib.decks.find(d=>d.id===settings.deckId)??null:null;
  const lang=chooseLanguage(groups,settings.lang??legacy?.contentLanguage??null,routeDeck);
  const langDecks=useMemo(()=>lang?decksOf(lib.decks,lang):[],[lib.decks,lang]);
  const pool=useMemo(()=>poolFor(words,langDecks),[words,langDecks]);
  return {settings,save,groups,lang,langDecks,pool,routeDeck};
}
function LangChips({groups,lang,onPick}:{groups:LangGroup[];lang:string|null;onPick:(lang:string)=>void}){
  if(groups.length<2)return null;
  return <div className="deck-chips lang-chips" role="group" aria-label={T.setup.language}>{groups.map(g=>{const on=!!lang&&langKey(g.lang)===langKey(lang);
    return <button type="button" key={g.lang} className={'chip'+(on?' on':'')} aria-pressed={on} onClick={()=>onPick(g.lang)}>
      <span>{langName(g.lang)}</span><span className="chip-n" dir="ltr">{g.words}</span></button>;})}</div>;
}

/** Reading setup (Practice 2.0): language · words (automatic / whole library / hand-picked) · level, then one Start. */
function ReadingSetup({deckId,lib,words,passages,notify,go}:{deckId:string|null;lib:Library;words:Word[];passages:Passage[];notify:Notify;go:(path:string)=>void}){
  const S=T.story,P=T.practice,U=T.setup;
  const {settings,save,groups,lang,langDecks,pool,routeDeck}=usePracticeScope(lib,words,deckId);
  const [consent,setConsentState]=useState(hasConsent);
  // #64: ask the Worker once whether AI stories are on, so «off» is explained BEFORE Start (not as a failure after it).
  const [ai,setAi]=useState<StoryStatus>('unknown');
  useEffect(()=>{let live=true;void storyStatus(T.locale==='en'?'en':'ar').then(v=>{if(live)setAi(v);});return ()=>{live=false;};},[]);
  if(deckId&&!routeDeck)return <NotFound go={go}/>;
  const pickLang=(l:string)=>{save({...settings,lang:l});if(deckId)stepBackTo(HUB+'/read');};
  const selected=lang?selectionFor(settings.source,pool,settings.level,readSelection(selectionKey(lang))):[];
  const home=lang?homeDeck(selected,pool,langDecks):null;
  const firstDeck=routeDeck??langDecks[0]??null;
  const plan=readPlan(),planDeck=plan?lib.decks.find(d=>d.id===plan.deckId):undefined;
  const planHere=plan&&planDeck&&lang&&langKey(planDeck.contentLanguage)===langKey(lang)&&!planFinished(plan.state)?plan:null;
  const langOk=!!lang&&storyLanguageSupported(lang);
  const texts=passages.filter(p=>langDecks.some(d=>d.id===p.deckId));
  const nBatches=Math.ceil(selected.length/BATCH_SIZE[settings.level]);
  const byId=new Map(pool.map(w=>[w.id,w]));
  const preview=selected.slice(0,8).map(id=>byId.get(id)).filter((w):w is Word=>!!w);
  function start(demo=false){if(!home||!selected.length)return;writePlan(newPlan(home,selected,settings.level,settings.genre,demo));go(hubDeck(home)+'/new');}
  return <div className="page library practice-hub practice2 reading-setup">
    <PageHead title={U.read.title} lead={U.read.lead}/>
    <LangChips groups={groups} lang={lang} onPick={pickLang}/>
    {!lang||!pool.length
      ?<div className="empty small"><BookOpen size={26} strokeWidth={1.6}/><h2>{S.noWordsTitle}</h2><p>{S.noWordsBody}</p>
        {firstDeck&&<button type="button" className="btn btn-ink" onClick={()=>go('add/'+encodeURIComponent(firstDeck.id))}><Plus size={18}/>{S.addWords}</button>}</div>
      :!langOk?<p className="practice-note story-soon" role="status">{S.langSoon(langName(lang))}</p>
      :<section className="story-start" aria-labelledby="story-start-h">
        {planHere&&<div className="plan-banner" role="status"><div><b>{S.plan(planHere.stories.length+1,planHere.stories.length+batchesLeft(planHere.state))}</b><small>{S.planLeft(planHere.state.queue.length)}</small></div>
          <div className="btn-row"><button type="button" className="btn btn-ink sm" onClick={()=>go(hubDeck(planHere.deckId)+'/new')}>{S.continuePlan}</button>
            <button type="button" className="btn btn-quiet sm" onClick={()=>{writePlan(null);save({...settings});}}>{S.restart}</button></div></div>}
        <h2 id="story-start-h" className="sr-only">{S.start}</h2>
        <fieldset className="practice-field source-field"><legend>{U.source}</legend>
          <div className="chips" role="group" aria-label={U.source}>{VOCAB_SOURCES.map(v=><button type="button" key={v} className={'chip'+(settings.source===v?' on':'')} aria-pressed={settings.source===v} onClick={()=>save({...settings,source:v,lang})}>{U.sources[v]}</button>)}</div>
          <p className="practice-note">{U.sourceHint[settings.source]}</p></fieldset>
        <button type="button" className="word-summary" onClick={()=>firstDeck&&go(hubDeck(firstDeck.id)+'/words')}>
          <span className="word-summary-top"><b>{S.selected(selected.length,pool.length)}</b><span className="link-like">{S.chooseWords}<Fwd size={16}/></span></span>
          <span className="word-pills" lang={lang} dir={dirOf(lang)}>{preview.map(w=><span key={w.id} className="word-pill">{w.term}</span>)}{selected.length>preview.length&&<span className="word-pill more" dir="ltr">+{selected.length-preview.length}</span>}</span>
        </button>
        {nBatches>1&&<p className="practice-note">{S.batches(nBatches)}</p>}
        <fieldset className="practice-field"><legend>{S.level}</legend>
          <div className="chips">{CEFR_LEVELS.map(l=><button type="button" key={l} dir="ltr" className={'chip'+(settings.level===l?' on':'')} aria-pressed={settings.level===l} onClick={()=>save({...settings,level:l})}>{l}</button>)}</div>
          <p className="practice-note">{S.levelHint}</p></fieldset>
        <details className="learn-details story-custom"><summary>{U.more} · {S.genres[settings.genre]}</summary>
          <fieldset className="practice-field"><legend>{S.genre}</legend>
            <div className="chips">{STORY_GENRES.map(g=><button type="button" key={g} className={'chip'+(settings.genre===g?' on':'')} aria-pressed={settings.genre===g} onClick={()=>save({...settings,genre:g})}>{S.genres[g]}</button>)}</div></fieldset>
          {consent&&<button type="button" className="btn btn-quiet sm" onClick={()=>{giveConsent(false);setConsentState(false);notify(S.withdrawn);}}>{S.withdraw}</button>}
        </details>
        {ai==='off'&&<div className="story-off-note" role="note"><b>{S.off.title}</b><p>{S.off.body}</p></div>}
        {ai==='off'
          ?<button type="button" className="btn btn-ink btn-lg practice-start story-go story-demo-go" disabled={!selected.length} onClick={()=>start(true)}><FileText size={18} aria-hidden="true"/>{S.off.demoStart}</button>
          :<button type="button" className="btn btn-ink btn-lg practice-start story-go" disabled={!selected.length} onClick={()=>start()}><Sparkles size={18} aria-hidden="true"/>{S.start}</button>}
        <p className="practice-note">{P.noFsrs}</p>
      </section>}
    {firstDeck&&<section className="story-texts" aria-labelledby="story-texts-h">
      <div className="section-head"><h2 id="story-texts-h" className="hub-heading">{S.yourTexts}</h2>
        <button type="button" className="btn btn-quiet sm" onClick={()=>go(textsPath(firstDeck.id)+'/new')}><Plus size={16} aria-hidden="true"/>{S.addText}</button></div>
      {texts.length?<TextList texts={texts} go={go}/>:<p className="practice-note empty-texts">{T.hub.deckEmptyBody}</p>}
    </section>}
  </div>;
}
function TextList({texts,go,listenOnly=false}:{texts:Passage[];go:(path:string)=>void;listenOnly?:boolean}){
  const P=T.practice;
  return <ul className="hub-list">{texts.map(p=><li key={p.id} className="hub-item">
    <div className="hub-text"><b dir="auto">{p.title}</b><small dir={dirOf(p.contentLanguage)} lang={p.contentLanguage} className="passage-snippet">{p.body.replace(/\s+/g,' ').slice(0,90)}</small></div>
    <div className="hub-actions">
      {!listenOnly&&<button type="button" className="btn btn-ink sm" aria-label={`${P.readAction}: ${p.title}`} onClick={()=>go(passagePath(p.deckId,p.id)+'/read')}><BookOpen size={16} aria-hidden="true"/>{P.readAction}</button>}
      <button type="button" className={'btn sm '+(listenOnly?'btn-ink':'btn-quiet')} aria-label={`${T.listening.action}: ${p.title}`} onClick={()=>go(passagePath(p.deckId,p.id)+'/listen')}><Headphones size={16} aria-hidden="true"/>{T.listening.action}</button>
    </div></li>)}</ul>;
}

/** Listening (until its own player lands): the saved stories and texts of the chosen language, each opens the existing Listening practice. */
function ListenSetup({lib,words,passages,go}:{lib:Library;words:Word[];passages:Passage[];go:(path:string)=>void}){
  const L=T.setup.listen;
  const {settings,save,groups,lang,langDecks}=usePracticeScope(lib,words,null);
  const items=passages.filter(p=>langDecks.some(d=>d.id===p.deckId)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  return <div className="page library practice2 listen-setup">
    <PageHead title={L.title} lead={L.lead}/>
    <LangChips groups={groups} lang={lang} onPick={l=>save({...settings,lang:l})}/>
    {items.length?<TextList texts={items} go={go} listenOnly/>
      :<div className="empty small"><Headphones size={26} strokeWidth={1.6}/><h2>{L.emptyTitle}</h2><p>{L.emptyBody}</p>
        <button type="button" className="btn btn-ink" onClick={()=>go(HUB+'/read')}><BookOpen size={18} aria-hidden="true"/>{L.toRead}</button></div>}
  </div>;
}

/** Word selection: every practisable word of the learning language (all its decks), a deck filter, search, select/deselect
 *  the visible list, a live counter; stays fast with 1,000+ cards. Choosing here switches the source to «hand-picked». */
function WordPicker({deckId,lib,words,go}:{deckId:string;lib:Library;words:Word[];go:(path:string)=>void}){
  const S=T.story,X=S.picker,deck=lib.decks.find(d=>d.id===deckId);
  const langDecks=useMemo(()=>deck?decksOf(lib.decks,deck.contentLanguage):[],[lib.decks,deck]);
  const eligible=useMemo(()=>poolFor(words,langDecks),[words,langDecks]);
  const start=readSettings(),level=start.level,key=deck?selectionKey(deck.contentLanguage):'';
  const [sel,setSel]=useState<Set<string>>(()=>new Set(deck?selectionFor(start.source,eligible,level,readSelection(key)):[]));
  const [q,setQ]=useState(''),[only,setOnly]=useState<string|null>(null);
  if(!deck)return <NotFound go={go}/>;
  const keepLang=(source?:'manual')=>{const s=readSettings();writeSettings({...s,lang:deck.contentLanguage,...(source?{source}:{})});};
  const commit=(next:Set<string>)=>{setSel(next);writeSelection(key,eligible.filter(w=>next.has(w.id)).map(w=>w.id));keepLang('manual');};
  const n=eligible.filter(w=>sel.has(w.id)).length;
  const needle=q.trim().normalize('NFC').toLocaleLowerCase();
  const shown=eligible.filter(w=>(!only||w.deckId===only)&&(!needle||w.term.normalize('NFC').toLocaleLowerCase().includes(needle)||meaningText(w).toLocaleLowerCase().includes(needle)));
  const state=selectState(sel,shown);
  const toggle=(id:string)=>{const next=new Set(sel);if(next.has(id))next.delete(id);else next.add(id);commit(next);};
  return <div className="page library word-picker">
    <PageHead title={X.title} lead={langDecks.length>1?langName(deck.contentLanguage):deckName(deck)}/>
    {langDecks.length>1&&<div className="deck-chips" role="group" aria-label={S.deck}>
      {[null,...langDecks.map(d=>d.id)].map(id=>{const d=id?langDecks.find(x=>x.id===id)!:null;
        return <button type="button" key={id??'all'} className={'chip'+(only===id?' on':'')} aria-pressed={only===id} onClick={()=>setOnly(id)}>
          <span dir="auto">{d?deckName(d):X.allDecks}</span><span className="chip-n" dir="ltr">{d?eligible.filter(w=>w.deckId===d.id).length:eligible.length}</span></button>;})}</div>}
    <div className="pick-tools">
      <div className="pick-all" role="group" aria-label={X.title}>
        <button type="button" className="btn btn-quiet sm" disabled={state==='all'} onClick={()=>commit(new Set([...sel,...shown.map(w=>w.id)]))}><CheckSquare size={16} aria-hidden="true"/>{X.selectAll}</button>
        <button type="button" className="btn btn-quiet sm" disabled={state==='none'} onClick={()=>{const next=new Set(sel);for(const w of shown)next.delete(w.id);commit(next);}}><Square size={16} aria-hidden="true"/>{X.deselectAll}</button>
      </div>
      {eligible.length>12&&<SearchBox value={q} onChange={setQ} placeholder={X.search} label={X.search}/>}
      <p className="practice-note">{X.scope}</p>
    </div>
    {shown.length?<ul className="pick-list">{shown.map(w=><li key={w.id}><label className={'pick-row'+(sel.has(w.id)?' on':'')}>
        <input type="checkbox" checked={sel.has(w.id)} onChange={()=>toggle(w.id)}/>
        <span className="pick-text"><b dir={dirOf(deck.contentLanguage)} lang={deck.contentLanguage}>{w.term}</b><small dir="auto">{meaningText(w)}</small></span></label></li>)}</ul>
      :<p className="practice-note">{X.noMatch}</p>}
    {/* Portalled to <body>: `.content` animates with a transform, and WebKit (iPhone Safari) then pins position:fixed
        to that box instead of the screen — the bar ended up after the last word. */}
    {createPortal(<div className="pick-bar" dir={T.dir} lang={T.locale}>
      <span className="pick-count" aria-live="polite"><b>{X.count(n,eligible.length)}</b>{n>0&&<small>{X.batches(n,Math.ceil(n/BATCH_SIZE[level]))}</small>}{n===0&&<small>{X.none}</small>}</span>
      {/* A real step back when a Reading setup is the previous screen; otherwise an ordinary navigation (no history replace). */}
      <button type="button" className="btn btn-ink" onClick={()=>{keepLang();const prev=previousRoute();
        if(prev&&(prev===HUB+'/read'||prev===hubDeck(deckId))&&history.length>1)history.back();else window.location.hash='/'+HUB+'/read';}}>{X.done}</button>
    </div>,document.body)}
  </div>;
}

/** Consent → generating (cancellable) → saved story, or one clear failure with a way forward. Never shows unvalidated text. */
function StoryGenerate({deckId,lib,words,onChanged,go}:{deckId:string;lib:Library;words:Word[];onChanged:()=>Promise<unknown>;go:(path:string)=>void}){
  const S=T.story,G=S.gen,deck=lib.decks.find(d=>d.id===deckId);
  const [plan,setPlan]=useState(readPlan);
  // The plan's words may come from every deck of this language (Practice 2.0); the story is saved in this deck.
  const eligible=useMemo(()=>deck?poolFor(words,decksOf(lib.decks,deck.contentLanguage)):[],[words,lib.decks,deck]);
  const batch=useMemo(()=>plan&&plan.deckId===deckId?keepEligible(batchToGenerate(plan),eligible):[],[plan,deckId,eligible]);
  const cards=useMemo(()=>batch.map(id=>eligible.find(w=>w.id===id)!).filter(Boolean),[batch,eligible]);
  // Demo Mode sends nothing, so it needs no consent.
  const [phase,setPhase]=useState<'consent'|'working'|'failed'>(plan?.demo||hasConsent()?'working':'consent');
  const [reason,setReason]=useState<StoryFailure|null>(null),[slow,setSlow]=useState(false),[attempt,setAttempt]=useState(0);
  const ctl=useRef<AbortController|null>(null);
  useEffect(()=>{
    if(phase!=='working'||!plan||!deck||!cards.length)return;
    const c=new AbortController();ctl.current=c;setSlow(false);
    const t=setTimeout(()=>setSlow(true),5000);
    // Started on the next tick: a remount (React StrictMode in development) clears it before any request is sent.
    const kick=setTimeout(()=>void (async()=>{
      let req:StoryRequest;
      try{req=buildStoryRequest(deck,cards,plan.state.level,plan.genre);}catch{setReason('request');setPhase('failed');return;}
      writePlan({...plan,pending:batch});
      const loc=T.locale==='en'?'en':'ar';
      // Demo Mode: the local template, never the network (and never labelled as AI).
      const r=plan.demo?(()=>{const d=buildDemoStory(req,loc);return d?{ok:true as const,...d}:{ok:false as const,reason:'request' as StoryFailure};})()
        :await requestStory(req,c.signal,loc);
      if(c.signal.aborted)return; // left the screen or cancelled: nothing is saved
      if(!r.ok){setReason(r.reason);setPhase('failed');return;}
      try{
        const p=await createPassage({deckId,title:r.story.title,body:r.story.story,contentLanguage:deck.contentLanguage,translation:r.story.translation,
          questions:r.story.questions.map(q=>({question:q.question,answer:q.answer,quote:q.quote}))});
        const usedIds=cards.filter((_,i)=>r.used.includes(req.words[i].term)).map(w=>w.id);
        writePlan(recordStory({...plan,pending:batch},p.id,batch,usedIds));
        await onChanged();
        replaceRoute(storyPath(deckId,p.id));
      }catch{setReason('provider');setPhase('failed');}
    })(),0);
    return ()=>{clearTimeout(t);clearTimeout(kick);c.abort();};
  },[phase,attempt]); // eslint-disable-line react-hooks/exhaustive-deps
  if(!deck)return <NotFound go={go}/>;
  if(!plan||plan.deckId!==deckId||!cards.length)return <div className="page practice"><div className="practice-empty"><h2>{G.failTitle}</h2><p>{S.err.request}</p>
    <div className="btn-row"><button type="button" className="btn btn-ink" onClick={()=>stepBackTo(HUB+'/read')}>{S.title}</button></div></div></div>;
  const n=planIndex(plan,'');
  const label=S.plan(plan.stories.length+1,Math.max(n.total,plan.stories.length+1));
  if(phase==='consent')return <div className="page practice story-consent">
    <PageHead title={S.consent.title} lead={label}/>
    <div className="consent-card">
      <p>{S.consent.body}</p>
      <ul className="checks">{S.consent.sends.map(x=><li key={x} className="ok"><span className="check-dot" aria-hidden="true"><Check size={14}/></span><span>{x}</span></li>)}</ul>
      <p className="practice-note">{S.consent.never}</p>
      <h2 className="consent-words-h">{S.consent.words}</h2>
      <ul className="consent-words">{cards.map(w=><li key={w.id}><b dir={dirOf(deck.contentLanguage)} lang={deck.contentLanguage}>{w.term}</b><small dir="auto">{meaningText(w)}</small></li>)}</ul>
      <p className="practice-note" dir="ltr">{langName(deck.contentLanguage)} → {langName(deck.meaningLanguage)} · {plan.state.level} · {S.genres[plan.genre]}</p>
    </div>
    <div className="btn-row story-consent-actions">
      <button type="button" className="btn btn-ink btn-lg" onClick={()=>{giveConsent(true);setPhase('working');}}>{S.consent.agree}</button>
      <button type="button" className="btn btn-quiet" onClick={()=>stepBackTo(HUB+'/read')}>{S.consent.decline}</button>
    </div>
  </div>;
  if(phase==='failed'&&reason==='off')return <div className="page practice"><div className="practice-empty story-off" role="status">
    <h2>{S.off.title}</h2><p>{S.off.body}</p>
    <div className="btn-row"><button type="button" className="btn btn-ink" onClick={()=>{const d={...plan,demo:true};writePlan(d);setPlan(d);setReason(null);setPhase('working');setAttempt(a=>a+1);}}><FileText size={16} aria-hidden="true"/>{S.off.demoTry}</button>
      <button type="button" className="btn btn-quiet" onClick={()=>stepBackTo(HUB+'/read')}>{G.useTexts}</button></div></div></div>;
  if(phase==='failed'&&reason){
    const canRetry=!['off','request','quota'].includes(reason);
    return <div className="page practice"><div className="practice-empty story-failed" role="alert"><h2>{reason==='cancelled'?S.err.cancelled:G.failTitle}</h2>
      {reason!=='cancelled'&&<p>{S.err[reason]}</p>}
      <div className="btn-row">{canRetry&&<button type="button" className="btn btn-ink" onClick={()=>{setReason(null);setPhase('working');setAttempt(a=>a+1);}}><RotateCcw size={16} aria-hidden="true"/>{G.retry}</button>}
        <button type="button" className="btn btn-quiet" onClick={()=>stepBackTo(HUB+'/read')}>{G.useTexts}</button></div></div></div>;
  }
  return <div className="page practice story-working" aria-busy="true">
    <section className="finish"><div className="finish-orb story-orb" aria-hidden="true"><Wash/></div>
      <p className="lead">{label}</p><h1 role="status">{plan.demo?S.demo.working:slow?G.checking:G.writing}</h1>
      <div className="word-pills center" lang={deck.contentLanguage}>{cards.map(w=><span key={w.id} className="word-pill">{w.term}</span>)}</div>
      <div className="finish-actions"><button type="button" className="btn btn-quiet" onClick={()=>{ctl.current?.abort();setReason('cancelled');setPhase('failed');}}><X size={16} aria-hidden="true"/>{G.cancel}</button></div>
    </section>
  </div>;
}

/** A story: finds the learner's cards that really occur in it, then hands the page to the book reader (#77). */
function StoryView({deckId,id,lib,words,passages,onChanged,go}:{deckId:string;id:string;lib:Library;words:Word[];passages:Passage[];onChanged:()=>Promise<unknown>;go:(path:string)=>void}){
  const p=passages.find(x=>x.id===id&&x.deckId===deckId),deck=lib.decks.find(d=>d.id===deckId);
  const plan=readPlan(),entry=plan?.deckId===deckId?plan.stories.find(s=>s.passageId===id):undefined;
  // Exact matches (the practice engine's rule) plus inflected forms (barata ← barato), the same matcher as story coverage.
  const inText=useMemo(()=>{
    if(!p)return [];
    const exact=cardsInPassage(p,words),same=new Set(decksOf(lib.decks,p.contentLanguage).map(d=>d.id).concat(p.deckId)),rest=words.filter(w=>same.has(w.deckId)&&!w.archived&&w.contentType!=='question_answer'&&!exact.includes(w));
    const hit=new Set(termsIn(p.body,rest.map(w=>w.term),p.contentLanguage));
    return [...exact,...rest.filter(w=>hit.has(w.term))];
  },[p,words,lib.decks]);
  if(!p||!deck)return <NotFound go={go}/>;
  const byTerm=new Map(inText.map(w=>[w.term.normalize('NFC').trim().toLocaleLowerCase(),w]));
  const parts=highlightParts(p.body,inText.map(w=>w.term),p.contentLanguage);
  return <BookReader p={p} deck={deck} lib={lib} words={words} passages={passages} byTerm={byTerm} parts={parts} plan={plan} entry={entry} onChanged={onChanged} go={go}/>;
}

/* ───────────── Reading 2.0 — the book reader (#77) ─────────────
 * The story is the page: a warm sheet, a serif column, almost no chrome. The app's own bars are hidden while it is
 * open (`html[data-reader]`), and the reader brings its own Back. Preferences and «finished» marks are local
 * (reader.ts); nothing here grades a card or touches FSRS. */
type OpenWord={at:string;term:string};
function BookReader({p,deck,lib,words,passages,byTerm,parts,plan,entry,onChanged,go}:{p:Passage;deck:Deck;lib:Library;words:Word[];passages:Passage[];byTerm:Map<string,Word>;parts:{text:string;term?:string}[];plan:Plan|null;entry:Plan['stories'][number]|undefined;onChanged:()=>Promise<unknown>;go:(path:string)=>void}){
  const R=T.reader,S=T.story,V=S.view,P=T.practice,deckId=p.deckId,id=p.id;
  const [prefs,setPrefs]=useState<ReaderPrefs>(()=>readPrefs());
  const [panel,setPanel]=useState(false),[tr,setTr]=useState(false),[open,setOpen]=useState<OpenWord|null>(null);
  const [done,setDone]=useState(()=>isRead(id)),[justDone,setJustDone]=useState(false),[away,setAway]=useState(false);
  const article=useRef<HTMLElement>(null),bar=useRef<HTMLDivElement>(null),typeBtn=useRef<HTMLButtonElement>(null),doneHead=useRef<HTMLHeadingElement>(null);
  const trigger=useRef<HTMLElement|null>(null),anchor=useRef<{el:Element;top:number}|null>(null);
  // The app's bars step aside while the reader is open; the appearance applies to the whole page behind it.
  useLayoutEffect(()=>{const h=document.documentElement;h.dataset.reader='on';return ()=>{delete h.dataset.reader;delete h.dataset.readerTheme;};},[]);
  useLayoutEffect(()=>{document.documentElement.dataset.readerTheme=prefs.theme;},[prefs.theme]);
  /** Change a preference without losing the place: the paragraph at the top of the screen stays where it is. */
  const change=(patch:Partial<ReaderPrefs>)=>{
    const a=article.current;anchor.current=null;
    if(a&&a.getBoundingClientRect().top<0){const el=[...a.children].find(c=>c.getBoundingClientRect().bottom>0);if(el)anchor.current={el,top:el.getBoundingClientRect().top};}
    const next={...prefs,...patch};setPrefs(next);writePrefs(next);
  };
  useLayoutEffect(()=>{const a=anchor.current;anchor.current=null;if(a&&a.el.isConnected)window.scrollBy(0,a.el.getBoundingClientRect().top-a.top);},[prefs]);
  // Focused reading: the bar slides away while reading down and comes back on the way up, on a tap, or on keyboard focus.
  useEffect(()=>{
    if(!prefs.focus){setAway(false);return;}
    let last=window.scrollY;
    const on=()=>{const y=window.scrollY;if(Math.abs(y-last)<8)return;setAway(y>last&&y>96);last=y;};
    window.addEventListener('scroll',on,{passive:true});return ()=>window.removeEventListener('scroll',on);
  },[prefs.focus]);
  // The settings panel is not modal: Escape or a tap outside closes it.
  useEffect(()=>{
    if(!panel)return;
    const out=(e:PointerEvent)=>{if(!bar.current?.contains(e.target as Node))setPanel(false);};
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setPanel(false);typeBtn.current?.focus();}};
    document.addEventListener('pointerdown',out);document.addEventListener('keydown',key);
    return ()=>{document.removeEventListener('pointerdown',out);document.removeEventListener('keydown',key);};
  },[panel]);
  useEffect(()=>{if(justDone)doneHead.current?.focus();},[justDone]);
  const closeWord=useCallback(()=>setOpen(null),[]);
  // When the word's sheet closes, focus goes back to the word (in the same commit, so nothing is focus-less in between).
  const wasOpen=useRef(false);
  useLayoutEffect(()=>{if(wasOpen.current&&!open)trigger.current?.focus({preventScroll:true});wasOpen.current=!!open;},[open]);

  const owned=useMemo(()=>words.filter(w=>!w.archived).map(w=>w.term),[words]);
  const suggestions=useMemo(()=>suggestionsFor(p.contentLanguage,deck.meaningLanguage),[p.contentLanguage,deck.meaningLanguage]);
  const paras=readerParagraphs(parts,suggestions,owned);
  const hasSaved=paras.some(x=>x.some(s=>s.kind==='saved')),hasSuggested=paras.some(x=>x.some(s=>s.kind==='suggested'));
  const nameOf=(wid:string)=>words.find(w=>w.id===wid)?.term;
  const missing=entry?entry.batch.filter(x=>!entry.used.includes(x)).map(nameOf).filter(Boolean):[];
  const lost=plan&&entry?plan.state.missedTwice.filter(x=>entry.batch.includes(x)).map(nameOf).filter(Boolean):[];
  const pos=plan&&entry?planIndex(plan,id):null,more=!!plan&&!!entry&&!planFinished(plan.state)&&plan.stories[plan.stories.length-1]?.passageId===id;
  const avail=readingAvailability(p,words),quiz=avail.cloze+avail.meaning+avail.comprehension>0;
  const back=backFor('words',readSub(),lib,passages);
  const leave=()=>guardLeave(()=>stepBackTo(back?.target??HUB));
  const finish=()=>{markRead(id);setDone(true);setJustDone(true);};
  const openCard=open?byTerm.get(open.term.normalize('NFC').trim().toLocaleLowerCase())??words.find(w=>!w.archived&&normalizeTerm(w.term)===normalizeTerm(open.term))??null:null;
  const sizes=FONT_SCALES.length;
  return <div className={'page story-view reader'+(prefs.font==='sans'?' sans':'')+(prefs.focus?' focus':'')} style={{'--rd-scale':FONT_SCALES[prefs.size]} as CSSProperties}>
    <div ref={bar} className={'reader-bar'+(away&&!panel?' away':'')} onFocus={e=>{if((e.target as HTMLElement).matches(':focus-visible'))setAway(false);}}>
      <button type="button" className="reader-back" aria-label={back?T.backTo(back.label):T.back} onClick={leave}><BackArrow size={20}/><span>{T.back}</span></button>
      <div className="reader-tools" role="group" aria-label={R.controls}>
        <button type="button" className={'reader-tool'+(prefs.highlights?' on':'')} aria-pressed={prefs.highlights} aria-label={R.highlights} title={R.highlights} onClick={()=>change({highlights:!prefs.highlights})}><Highlighter size={19} strokeWidth={1.8} aria-hidden="true"/></button>
        <button type="button" ref={typeBtn} className={'reader-tool'+(panel?' on':'')} aria-expanded={panel} aria-controls="reader-panel" aria-label={R.type} title={R.type} onClick={()=>setPanel(v=>!v)}><ALargeSmall size={21} strokeWidth={1.8} aria-hidden="true"/></button>
        <button type="button" className={'reader-tool'+(prefs.focus?' on':'')} aria-pressed={prefs.focus} aria-label={R.focus} title={R.focus} onClick={()=>change({focus:!prefs.focus})}>{prefs.focus?<Minimize2 size={18} strokeWidth={1.8} aria-hidden="true"/>:<Maximize2 size={18} strokeWidth={1.8} aria-hidden="true"/>}</button>
      </div>
      {panel&&<div id="reader-panel" className="reader-panel" role="group" aria-label={R.type}>
        <div className="reader-row"><span id="rd-size">{R.fontSize}</span>
          <div className="reader-stepper" role="group" aria-labelledby="rd-size">
            <button type="button" className="reader-tool" aria-label={R.smaller} disabled={prefs.size===0} onClick={()=>change({size:prefs.size-1})}><Minus size={18} aria-hidden="true"/></button>
            <output aria-live="polite" aria-label={R.sizeOf(prefs.size+1,sizes)} dir="ltr">{prefs.size+1}/{sizes}</output>
            <button type="button" className="reader-tool" aria-label={R.larger} disabled={prefs.size===sizes-1} onClick={()=>change({size:prefs.size+1})}><Plus size={18} aria-hidden="true"/></button>
          </div></div>
        <div className="reader-row"><span id="rd-font">{R.fontStyle}</span>
          <div className="reader-seg" role="group" aria-labelledby="rd-font">{READER_FONTS.map(f=><button type="button" key={f} className={f} aria-pressed={prefs.font===f} onClick={()=>change({font:f})}>{R.fonts[f]}</button>)}</div></div>
        <div className="reader-row"><span id="rd-theme">{R.theme}</span>
          <div className="reader-seg" role="group" aria-labelledby="rd-theme">{READER_THEMES.map(t=><button type="button" key={t} aria-pressed={prefs.theme===t} onClick={()=>change({theme:t})}>{t==='light'?<Sun size={15} aria-hidden="true"/>:t==='dark'?<Moon size={15} aria-hidden="true"/>:null}{R.themes[t]}</button>)}</div></div>
        <div className="reader-row"><span id="rd-hl">{R.highlights}</span>
          <button type="button" className="reader-switch" role="switch" aria-checked={prefs.highlights} aria-labelledby="rd-hl" onClick={()=>change({highlights:!prefs.highlights})}><i aria-hidden="true"/></button></div>
      </div>}
    </div>
    <header className="page-head reader-head"><div>
      <h1 tabIndex={-1} dir="auto">{p.title}</h1>
      <p className="lead"><span>{pos?S.plan(pos.i+1,pos.total):deckName(deck)}</span><span>{R.minutes(readingMinutes(p.body))}</span>{plan&&entry&&<span title={R.yourLevel}><span className="sr-only">{R.yourLevel} </span><bdi dir="ltr">{plan.state.level}</bdi></span>}</p>
    </div></header>
    {(entry?.demo||isDemoTitle(p.title))&&<p className="story-demo-banner" role="note"><FileText size={16} aria-hidden="true"/>{S.demo.banner}</p>}
    <div className="reader-aids story-tools">
      <SpeakButton text={p.body} label={V.listen} lang={p.contentLanguage} className="reader-link" showLabel/>
      {p.translation&&<button type="button" className="reader-link" aria-expanded={tr} onClick={()=>setTr(v=>!v)}><Languages size={16} aria-hidden="true"/>{tr?V.hideTranslation:V.translation}</button>}
    </div>
    <span id="rd-hint-saved" className="sr-only">{R.hintSaved}</span><span id="rd-hint-suggested" className="sr-only">{R.hintSuggested}</span>
    <article ref={article} className="reader-body story-body" dir={dirOf(p.contentLanguage)} lang={p.contentLanguage}
      onClick={e=>{if(prefs.focus&&!(e.target as HTMLElement).closest('.story-word')&&!window.getSelection()?.toString())setAway(v=>!v);}}>
      {paras.map((para,i)=><p key={i}>{para.map((x,j)=>x.kind&&prefs.highlights
        ?<span role="button" tabIndex={0} key={j} className={'story-word '+x.kind+(open?.at===i+':'+j?' on':'')} aria-haspopup="dialog" aria-describedby={'rd-hint-'+x.kind}
          onClick={e=>{trigger.current=e.currentTarget;setOpen({at:i+':'+j,term:x.term!});}}
          onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();trigger.current=e.currentTarget;setOpen({at:i+':'+j,term:x.term!});}}}>{x.text}</span>
        :<span key={j}>{x.text}</span>)}</p>)}
    </article>
    {tr&&p.translation&&<article className="passage-translation reader-translation" dir={dirOf(deck.meaningLanguage)} lang={deck.meaningLanguage}>{p.translation.split(/\n+/).map((x,i)=><p key={i}>{x}</p>)}</article>}
    {prefs.highlights&&(hasSaved||hasSuggested)&&<ul className="reader-legend" aria-label={R.legend}>
      {hasSaved&&<li><i className="saved" aria-hidden="true"/>{R.legendSaved}</li>}{hasSuggested&&<li><i className="suggested" aria-hidden="true"/>{R.legendSuggested}</li>}</ul>}
    {!done
      ?<div className="reader-finish"><button type="button" className="reader-finish-btn" onClick={finish}>{R.finish}</button></div>
      :<section className="reader-done story-actions" aria-labelledby="reader-done-h">
        <h2 id="reader-done-h" ref={doneHead} tabIndex={-1}><Check size={18} aria-hidden="true"/>{justDone?R.doneTitle:R.doneBefore}</h2>
        <p>{quiz?R.quizOffer:R.noQuiz}</p>
        <div className="reader-done-actions">
          {quiz&&<button type="button" className="btn btn-ink btn-lg" onClick={()=>go(passagePath(deckId,id)+'/read')}><BookOpen size={18} aria-hidden="true"/>{P.readAction}</button>}
          <button type="button" className="btn btn-quiet btn-lg" onClick={()=>go(passagePath(deckId,id)+'/listen')}><Headphones size={18} aria-hidden="true"/>{T.listening.action}</button>
          {more&&<button type="button" className="btn btn-quiet btn-lg" onClick={()=>go(hubDeck(deckId)+'/new')}><Sparkles size={16} aria-hidden="true"/>{V.next}</button>}
          <button type="button" className="btn btn-quiet btn-lg" onClick={leave}>{R.enough}</button>
        </div>
        {quiz&&<p className="reader-small">{P.noFsrs}</p>}
        {plan&&entry&&planFinished(plan.state)&&<p className="reader-small">{V.allDone}</p>}
      </section>}
    {entry&&<details className="story-coverage reader-coverage">
      <summary>{V.used} <bdi dir="ltr">({entry.used.length})</bdi></summary>
      <div className="word-pills" lang={p.contentLanguage}>{entry.used.map(nameOf).filter(Boolean).map(t=><span key={t} className="word-pill ok"><Check size={13} aria-hidden="true"/>{t}</span>)}</div>
      {missing.length>0&&lost.length<missing.length&&<p className="reader-small">{V.missing} <span lang={p.contentLanguage}>{missing.filter(t=>!lost.includes(t)).join('، ')}</span></p>}
      {lost.length>0&&<p className="reader-small">{V.missedTwice} <span lang={p.contentLanguage}>{lost.join('، ')}</span></p>}
    </details>}
    {open&&<WordSheet key={open.at} term={open.term} card={openCard} suggestion={suggestions.find(s=>normalizeTerm(s.term)===normalizeTerm(open.term))??null}
      passage={p} deck={deck} lib={lib} anchor={trigger.current} onClose={closeWord} onChanged={onChanged}/>}
  </div>;
}

/**
 * What a highlighted word opens: a bottom sheet on phones, a small anchored card on wide screens. A dialog: focus moves
 * in and stays in, Escape / the close button / a tap outside / Back close it, and focus returns to the word.
 * It shows only what is stored: the card's own meaning(s), or the bundled phrase list's meaning. Nothing is guessed.
 */
function WordSheet({term,card,suggestion,passage,deck,lib,anchor,onClose,onChanged}:{term:string;card:Word|null;suggestion:Suggestion|null;passage:Passage;deck:Deck;lib:Library;anchor:HTMLElement|null;onClose:()=>void;onChanged:()=>Promise<unknown>}){
  const R=T.reader,box=useRef<HTMLDivElement>(null),pushed=useRef(false),titleId=useId();
  const [place,setPlace]=useState<CSSProperties|null>(null),[busy,setBusy]=useState(false),[added,setAdded]=useState(false),[error,setError]=useState('');
  const wide=()=>window.innerWidth>=720;
  // An extra history entry lets Back (button or gesture) close the sheet instead of leaving the story (same as the quick sheet).
  useEffect(()=>{
    if(!history.state?.wlSheet)history.pushState({wlSheet:true},'',location.href);
    pushed.current=true;
    const onPop=()=>{if(pushed.current){pushed.current=false;onClose();}};
    window.addEventListener('popstate',onPop);return ()=>window.removeEventListener('popstate',onPop);
  },[onClose]);
  const dismiss=useCallback(()=>{if(pushed.current&&history.state?.wlSheet)history.back();else{pushed.current=false;onClose();}},[onClose]);
  useLayoutEffect(()=>{
    const el=box.current;if(!el)return;
    if(wide()&&anchor){
      const r=anchor.getBoundingClientRect(),w=el.offsetWidth,h=el.offsetHeight,gap=10;
      const left=Math.min(Math.max(12,r.left+r.width/2-w/2),window.innerWidth-w-12);
      const below=r.bottom+gap+h<=window.innerHeight-12||r.top-gap-h<12;
      setPlace({left,top:Math.max(12,below?r.bottom+gap:r.top-gap-h)});
    }else if(wide())setPlace({left:(window.innerWidth-el.offsetWidth)/2,top:window.innerHeight/3});
    else setPlace(null);
  },[anchor]);
  // Focus moves into the card once it is placed (it is not focusable while still hidden on wide screens).
  useEffect(()=>{box.current?.focus({preventScroll:true});},[place]);
  // Anchored card: it belongs to the word, so it closes when the page scrolls or resizes away from it.
  useEffect(()=>{
    if(!wide())return;
    // (A few pixels of settling scroll right after the tap do not count.)
    const y0=window.scrollY,go=()=>{if(Math.abs(window.scrollY-y0)>32)dismiss();},size=()=>dismiss();
    window.addEventListener('scroll',go,{passive:true});window.addEventListener('resize',size,{once:true});
    return ()=>{window.removeEventListener('scroll',go);window.removeEventListener('resize',size);};
  },[dismiss]);
  // Escape closes the sheet wherever focus happens to be.
  useEffect(()=>{const esc=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();dismiss();}};document.addEventListener('keydown',esc);return ()=>document.removeEventListener('keydown',esc);},[dismiss]);
  function keys(e:ReactKeyboardEvent){
    if(e.key!=='Tab')return;
    const f=[...(box.current?.querySelectorAll<HTMLElement>('button:not(:disabled)')??[])];if(!f.length){e.preventDefault();return;}
    const first=f[0],last=f[f.length-1],at=document.activeElement;
    if(e.shiftKey&&(at===first||at===box.current)){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&at===last){e.preventDefault();first.focus();}
  }
  const langs=card?cardLanguages(card,lib.decks):{content:passage.contentLanguage,meaning:deck.meaningLanguage};
  const meanings=card?(card.meanings?.length?card.meanings:[card.meaning]).map(m=>m.trim()).filter(Boolean):suggestion?[suggestion.meaning]:[];
  async function add(){
    if(!suggestion||card||busy)return;
    setBusy(true);setError('');
    try{await addWord({deckId:passage.deckId,contentType:inferContentType(suggestion.term),term:suggestion.term,meanings:[suggestion.meaning],example:'',translation:'',tag:''});setAdded(true);await onChanged();box.current?.focus({preventScroll:true}); /* the Add button is gone: keep focus in the sheet */}
    catch(e){setError(getError(e));}
    finally{setBusy(false);}
  }
  return createPortal(<div className="reader-layer" dir={T.dir} lang={T.locale} onPointerDown={e=>{if(e.target===e.currentTarget)dismiss();}}>
    <div ref={box} className={'word-pop'+(place?' anchored':'')} style={place??undefined} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={keys}>
      <div className="pop-head">
        <b id={titleId} dir={dirOf(langs.content)} lang={langs.content}>{card?.term??term}</b>
        <SpeakButton text={card?.term??term} label={T.listen(card?.term??term)} lang={langs.content} slower={false}/>
        <button type="button" className="icon-btn" aria-label={T.close} onClick={dismiss}><X size={18}/></button>
      </div>
      <p className={'pop-kind '+(card?'saved':'suggested')}><i aria-hidden="true"/>{card?(added?R.added:R.inLibrary):R.suggested}</p>
      {meanings.length===0?<p className="pop-missing">{R.noMeaning}</p>
        :meanings.length===1?<p className="pop-meaning" dir="auto" lang={langs.meaning}>{meanings[0]}</p>
        :<ol className="pop-meaning" lang={langs.meaning} aria-label={R.meanings}>{meanings.map((m,i)=><li key={i} dir="auto">{m}</li>)}</ol>}
      <p className="pop-langs">{langName(langs.content.split('-')[0])} · {R.meaningIn(langName(langs.meaning.split('-')[0]))}</p>
      {!card&&suggestion&&<><p className="pop-source">{R.source}</p>
        <button type="button" className="btn btn-ink pop-add" disabled={busy} aria-busy={busy||undefined} onClick={()=>void add()}><Plus size={17} aria-hidden="true"/>{busy?R.adding:R.add}</button></>}
      {error&&<p className="pop-error" role="alert">{error}</p>}
      <span className="sr-only" role="status">{added?R.added:''}</span>
    </div>
  </div>,document.body);
}

/** Read and listen to one passage: the whole text in its own language, one listen button (with «أبطأ»), optional translation and facts. */
function PassageView({deckId,id,lib,passages,onChanged,notify,go}:{deckId:string;id:string;lib:Library;passages:Passage[];onChanged:()=>Promise<unknown>;notify:Notify;go:(path:string)=>void}){
  const Tx=T.texts,p=passages.find(x=>x.id===id&&x.deckId===deckId),deck=lib.decks.find(d=>d.id===deckId);
  const [showTr,setShowTr]=useState(false),[confirm,setConfirm]=useState(false);
  if(!p||!deck)return <NotFound go={go}/>;
  async function remove(){setConfirm(false);try{await deletePassage(p!.id);await onChanged();notify(Tx.deleted(p!.title));go(textsPath(deckId));}catch(e){notify(getError(e),'error');}}
  return <div className="page library passage-page">
    <PageHead title={p.title}>
      <div className="head-actions"><span className="lang-chip" dir="ltr" title={p.contentLanguage}>{langCode(p.contentLanguage)}</span></div>
    </PageHead>
    <div className="passage-actions">
      <SpeakButton text={p.body} lang={p.contentLanguage} label={Tx.listen} className="btn btn-ink passage-listen" showLabel/>
      <button type="button" className="btn btn-quiet sm" onClick={()=>go(passagePath(deckId,p.id)+'/read')}><BookOpen size={16}/>{T.practice.readAction}</button>
      <button type="button" className="btn btn-quiet sm" onClick={()=>go(passagePath(deckId,p.id)+'/listen')}><Headphones size={16}/>{T.listening.action}</button>
      <button type="button" className="btn btn-quiet sm" onClick={()=>go(passagePath(deckId,p.id)+'/edit')}><Pencil size={16}/>{Tx.edit}</button>
      <button type="button" className="btn btn-quiet sm danger-text" onClick={()=>setConfirm(true)}><Trash2 size={16}/>{Tx.delete}</button>
    </div>
    <article className="passage-body" dir={dirOf(p.contentLanguage)} lang={p.contentLanguage}>{p.body.split(/\n+/).map((para,i)=><p key={i}>{para}</p>)}</article>
    {p.translation&&<div className="passage-extra">
      <button type="button" className="link-btn" aria-expanded={showTr} onClick={()=>setShowTr(v=>!v)}>{showTr?Tx.hideTranslation:Tx.showTranslation}</button>
      {showTr&&<p className="passage-translation" dir="auto">{p.translation}</p>}
    </div>}
    {p.questions.length>0&&<details className="learn-details passage-facts"><summary>{Tx.factsTitle(p.questions.length)}</summary>
      <ol className="fact-list">{p.questions.map(q=><li key={q.id}><b dir="auto">{q.question}</b><span dir="auto">{q.answer}{q.alternatives.length>0&&<small> · {q.alternatives.join('، ')}</small>}</span>{q.quote&&<q dir={dirOf(p.contentLanguage)} lang={p.contentLanguage}>{q.quote}</q>}</li>)}</ol>
    </details>}
    <p className="passage-note">{Tx.localNote}</p>
    <ConfirmDialog open={confirm} title={Tx.deleteTitle(p.title)} body={Tx.deleteBody} confirm={Tx.deleteYes} cancel={Tx.deleteNo} onConfirm={()=>void remove()} onCancel={()=>setConfirm(false)}/>
  </div>;
}

/* ───────────── AI lesson (#24): architecture + UI only; no provider is connected (see docs/AI_LESSONS.md) ───────────── */
type LessonStep='setup'|'consent'|'generating'|'review';
function issueText(i:LessonIssue){const X=T.lesson;return (i.index!==undefined?X.questionN(i.index+1)+': ':'')+X.issue[i.code];}
function LessonPage({deckId,lib,words,onChanged,notify,go}:{deckId:string;lib:Library;words:Word[];onChanged:()=>Promise<unknown>;notify:Notify;go:(path:string)=>void}){
  const X=T.lesson,deck=lib.decks.find(d=>d.id===deckId),generator=lessonGenerator();
  const cards=useMemo(()=>words.filter(w=>!w.archived&&w.contentType!=='question_answer'&&deckIdOf(w,lib)===deckId),[words,lib,deckId]);
  const [step,setStep]=useState<LessonStep>('setup'),[level,setLevel]=useState<LessonLevel>('A1'),[mode,setMode]=useState<LessonMode>('both'),[count,setCount]=useState<LessonQuestionCount>(5);
  const [picked,setPicked]=useState<Set<string>>(()=>new Set(cards.slice(0,LESSON_MAX_CARDS).map(w=>w.id)));
  const [consent,setConsent]=useState(false),[request,setRequest]=useState<LessonRequest|null>(null),[error,setError]=useState(''),[issues,setIssues]=useState<LessonIssue[]>([]);
  const [draft,setDraft]=useState<GeneratedLesson|null>(null),[saving,setSaving]=useState(false),[leaving,setLeaving]=useState<string|null>(null);
  const abort=useRef<AbortController|null>(null);
  useEffect(()=>()=>abort.current?.abort(),[]);
  useEffect(()=>{if(leaving)go(leaving);},[leaving]); // eslint-disable-line react-hooks/exhaustive-deps
  // Typing the URL never bypasses the switch: no flag or no generator → this page does not exist.
  if(!deck||!aiLessonsAvailable()||!generator)return <NotFound go={go}/>;
  const chosen=cards.filter(w=>picked.has(w.id));
  function toConsent(){setError('');setIssues([]);setConsent(false);setRequest(buildLessonRequest(deck!,chosen,{level,mode,questionCount:count}));setStep('consent');}
  async function generate(){
    if(!request||!consent||!generator)return;
    const ctl=new AbortController();abort.current=ctl;setStep('generating');setError('');setIssues([]);
    try{
      const raw=await generator.generate(request,ctl.signal);
      if(ctl.signal.aborted)return;
      const v=validateLesson(raw,request);
      if(!v.ok){setIssues(v.issues);setError(X.invalid);setStep('setup');return;}
      setDraft(v.lesson);setStep('review');
    }catch(e){if(ctl.signal.aborted)return;setError(getError(e)+' '+X.localWorks);setStep('setup');}
    finally{if(abort.current===ctl)abort.current=null;}
  }
  function cancel(){abort.current?.abort();abort.current=null;setError(X.cancelled);setStep('setup');}
  async function save(){
    if(!draft||!request||saving)return;
    const v=validateLesson(draft,request,{exactCount:false});
    if(!v.ok){setIssues(v.issues);return;}
    setSaving(true);setIssues([]);setError('');
    try{const p=await createPassage(lessonToPassageInput(v.lesson,deck!));await onChanged();notify(X.saved(p.title));setDraft(null);setLeaving(passagePath(deckId,p.id));}
    catch(e){setError(getError(e));}finally{setSaving(false);}
  }
  const setQ=(i:number,patch:Partial<GeneratedLesson['questions'][number]>)=>setDraft(d=>d&&{...d,questions:d.questions.map((q,j)=>j===i?{...q,...patch}:q)});
  const issueList=issues.length>0&&<ul className="practice-why lesson-issues">{issues.slice(0,12).map((i,k)=><li key={k}>{issueText(i)}</li>)}</ul>;
  return <div className="page practice lesson-page">
    <PageHead title={X.title} lead={deckName(deck)}/>
    {step==='setup'&&<div className="practice-setup">
      {error&&<div className="inline-error" role="alert"><p>{error}</p>{issueList}</div>}
      {!cards.length?<p className="hint">{X.noCards}</p>:<>
        <fieldset className="practice-field"><legend>{X.level}</legend>
          <div className="chips" role="group" aria-label={X.level}>{LESSON_LEVELS.map(l=><button type="button" key={l} className={'chip'+(level===l?' on':'')} aria-pressed={level===l} onClick={()=>setLevel(l)} dir="ltr">{l}</button>)}</div></fieldset>
        <fieldset className="practice-field"><legend>{X.mode}</legend>
          <div className="chips" role="group" aria-label={X.mode}>{LESSON_MODES.map(m=><button type="button" key={m} className={'chip'+(mode===m?' on':'')} aria-pressed={mode===m} onClick={()=>setMode(m)}>{X.modes[m]}</button>)}</div></fieldset>
        <fieldset className="practice-field"><legend>{T.practice.howMany}</legend>
          <div className="chips" role="group" aria-label={T.practice.howMany}>{LESSON_QUESTION_COUNTS.map(n=><button type="button" key={n} className={'chip'+(count===n?' on':'')} aria-pressed={count===n} onClick={()=>setCount(n)}>{n}</button>)}</div></fieldset>
        <fieldset className="practice-field"><legend>{X.cards}</legend>
          <p className="hint">{X.cardsHint(LESSON_MAX_CARDS)}</p>
          <ul className="lesson-cards">{cards.map(w=>{const on=picked.has(w.id),full=!on&&picked.size>=LESSON_MAX_CARDS;return <li key={w.id}><label className="lesson-card">
            <input type="checkbox" checked={on} disabled={full} onChange={()=>setPicked(p=>{const n=new Set(p);if(n.has(w.id))n.delete(w.id);else n.add(w.id);return n;})}/>
            <b dir="auto">{w.term}</b><small dir="auto">{w.meanings.join('؛ ')}</small></label></li>;})}</ul>
        </fieldset>
        <button type="button" className="btn btn-ink btn-lg practice-start" disabled={!chosen.length} onClick={toConsent}>{X.next}</button>
      </>}
    </div>}
    {step==='consent'&&request&&<section className="lesson-consent" aria-labelledby="lesson-consent-title">
      <h2 id="lesson-consent-title">{X.consentTitle}</h2>
      <p>{X.consentLead(generator.label)}</p>
      <ul className="practice-why"><li>{X.sumLanguages(langName(request.contentLanguage),langName(request.meaningLanguage))}</li><li>{X.sumOptions(request.level,X.modes[request.mode],request.questionCount)}</li><li>{X.sumCards(request.vocabulary.length)}</li></ul>
      <pre className="lesson-payload" dir="ltr" tabIndex={0} aria-label={X.payloadLabel}>{JSON.stringify(request,null,2)}</pre>
      <p className="hint">{X.notSent}</p>
      {generator.costNote&&<p className="hint"><b>{X.cost}</b> <span dir="auto">{generator.costNote}</span></p>}
      <p className="hint">{X.notGuaranteed}</p>
      <label className="lesson-agree"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{X.agree}</label>
      <div className="finish-actions">
        <button type="button" className="btn btn-ink btn-lg" disabled={!consent} onClick={()=>void generate()}>{X.generate}</button>
        <button type="button" className="btn btn-quiet" onClick={()=>setStep('setup')}>{X.back}</button>
      </div>
    </section>}
    {step==='generating'&&<section className="lesson-wait" role="status" aria-live="polite"><p>{X.generating}</p><button type="button" className="btn btn-quiet" onClick={cancel}>{X.cancel}</button></section>}
    {step==='review'&&draft&&<form className="word-form lesson-review" onSubmit={e=>{e.preventDefault();void save();}} data-unsaved={!saving&&!leaving?'true':undefined} noValidate>
      <h2>{X.reviewTitle}</h2>
      <p className="hint">{X.reviewNote}</p>
      <div className="field"><label htmlFor="lesson-title">{X.titleLabel}</label><input id="lesson-title" dir="auto" maxLength={PASSAGE_LIMITS.title} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></div>
      <div className="field"><label htmlFor="lesson-text">{X.textLabel}</label><textarea id="lesson-text" className="passage-input" rows={6} dir={dirOf(deck.contentLanguage)} lang={deck.contentLanguage} maxLength={PASSAGE_LIMITS.body} value={draft.text} onChange={e=>setDraft({...draft,text:e.target.value})}/></div>
      <ol className="fact-list lesson-questions">{draft.questions.map((q,i)=><li key={i}><fieldset className="practice-field"><legend>{X.questionN(i+1)}</legend>
        <div className="field"><label htmlFor={'lq-'+i}>{X.question}</label><input id={'lq-'+i} dir="auto" maxLength={PASSAGE_LIMITS.question} value={q.question} onChange={e=>setQ(i,{question:e.target.value})}/></div>
        <div className="field"><label htmlFor={'la-'+i}>{X.answer}</label><input id={'la-'+i} dir="auto" maxLength={PASSAGE_LIMITS.answer} value={q.answer} onChange={e=>setQ(i,{answer:e.target.value})}/></div>
        <div className="field"><label htmlFor={'lz-'+i}>{X.quote}</label><input id={'lz-'+i} dir={dirOf(deck.contentLanguage)} lang={deck.contentLanguage} maxLength={PASSAGE_LIMITS.quote} value={q.quote} onChange={e=>setQ(i,{quote:e.target.value})}/></div>
      </fieldset></li>)}</ol>
      {issues.length>0&&<div className="inline-error" role="alert"><p>{X.fixFirst}</p>{issueList}</div>}
      {error&&<p className="inline-error" role="alert">{error}</p>}
      <div className="form-foot">
        <button type="submit" className="btn btn-save btn-lg" disabled={saving}><Check size={20} aria-hidden="true"/>{X.save}</button>
        <button type="button" className="btn btn-quiet" disabled={saving} onClick={()=>{setDraft(null);setLeaving(deckPath(deckId));}}>{X.reject}</button>
      </div>
      <p className="passage-note">{X.rejectNote}</p>
    </form>}
  </div>;
}

/* ───────────── Reading Practice (#22): questions only from saved data; never touches FSRS ───────────── */
const READING_KINDS:ReadingKind[]=['cloze','meaning','comprehension'];
const COUNTS=[5,10,0] as const;
function ReadingPractice({deckId,id,lib,passages,words,go}:{deckId:string;id:string;lib:Library;passages:Passage[];words:Word[];go:(path:string)=>void}){
  const P=T.practice,p=passages.find(x=>x.id===id&&x.deckId===deckId),deck=lib.decks.find(d=>d.id===deckId);
  const avail=useMemo(()=>p?readingAvailability(p,words):{cloze:0,meaning:0,comprehension:0},[p,words]);
  const [kinds,setKinds]=useState<ReadingKind[]>(READING_KINDS);
  const [count,setCount]=useState<number>(5),[items,setItems]=useState<PracticeItem[]|null>(null);
  const [idx,setIdx]=useState(0),[answers,setAnswers]=useState<Answered[]>([]);
  if(!p||!deck)return <NotFound go={go}/>;
  const total=READING_KINDS.reduce((n,k)=>n+avail[k],0),chosen=kinds.filter(k=>avail[k]>0);
  const start=()=>{setItems(buildReading(p,words,chosen,count));setIdx(0);setAnswers([]);rememberContinue('deck',deckId);};
  const done=items!==null&&idx>=items.length;
  const inProgress=items!==null&&!done&&answers.length>0;
  if(items===null)return <div className="page practice">
    <PageHead title={P.readTitle} lead={p.title}/>
    {total===0?<div className="practice-empty"><h2>{P.notEnoughTitle}</h2><p>{P.notEnoughBody}</p>
        <div className="btn-row"><button type="button" className="btn btn-ink" onClick={()=>go(passagePath(deckId,p.id)+'/edit')}><Pencil size={16}/>{P.addQuestions}</button>
        <button type="button" className="btn btn-quiet" onClick={()=>go('add/'+encodeURIComponent(deckId))}><Plus size={16}/>{P.addCards}</button></div></div>
    :<div className="practice-setup">
      <fieldset className="practice-field"><legend>{P.activities}</legend>
        <div className="chips">{READING_KINDS.map(k=><button type="button" key={k} className={'chip'+(chosen.includes(k)?' on':'')} aria-pressed={chosen.includes(k)} disabled={!avail[k]}
          onClick={()=>setKinds(ks=>ks.includes(k)?ks.filter(x=>x!==k):[...ks,k])}>{P.kind[k]} <span className="chip-n">{avail[k]}</span></button>)}</div>
        {READING_KINDS.some(k=>!avail[k])&&<ul className="practice-why">{READING_KINDS.filter(k=>!avail[k]).map(k=><li key={k}>{P.why[k]}</li>)}</ul>}
      </fieldset>
      <fieldset className="practice-field"><legend>{P.howMany}</legend>
        <div className="chips">{COUNTS.map(n=><button type="button" key={n} className={'chip'+(count===n?' on':'')} aria-pressed={count===n} onClick={()=>setCount(n)}>{n?String(n):P.all}</button>)}</div>
      </fieldset>
      <p className="practice-note">{P.noFsrs}</p>
      <button type="button" className="btn btn-ink btn-lg practice-start" disabled={!chosen.length} onClick={start}>{P.start}</button>
    </div>}
  </div>;
  if(done){const next=planNextFor(p.id),story=readPlan()?.stories.some(x=>x.passageId===p.id);
    return <PracticeResult items={items} answers={answers} wordsPractised={cardsInPassage(p,words).length} onAgain={()=>setItems(null)} onBack={()=>go(story?storyPath(deckId,p.id):passagePath(deckId,p.id))}
    onSwitch={()=>go(passagePath(deckId,p.id)+'/listen')} switchLabel={T.listening.action} onNextStory={next?()=>go(hubDeck(next)+'/new'):null} onDeck={()=>go(deckPath(deckId))}/>;}
  const item=items[idx];
  return <div className="page practice" data-unsaved={inProgress?'true':undefined}>
    <div className="review-top"><span className="review-count">{P.of(idx+1,items.length)}</span>
      <div className="progress" role="progressbar" aria-label={P.progress} aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={idx}><span style={{inlineSize:`${Math.max(4,100*idx/items.length)}%`}}/></div></div>
    {/* The cloze sentence comes from the text, so the text stays folded during a cloze question. */}
    <details key={item.kind==='cloze'?'c':'t'} className="learn-details practice-text" open={item.kind!=='cloze'}><summary>{P.theText}</summary>
      <article className="passage-body" dir={dirOf(p.contentLanguage)} lang={p.contentLanguage}>{p.body.split(/\n+/).map((para,i)=><p key={i}>{para}</p>)}</article></details>
    <PracticeQuestion key={item.id} item={item} lang={p.contentLanguage} meaningLang={deck.meaningLanguage} last={idx===items.length-1}
      onAnswer={v=>setAnswers(a=>[...a.filter(x=>x.id!==item.id),{id:item.id,verdict:v}])} onNext={()=>setIdx(i=>i+1)}/>
  </div>;
}

/** #64: what to offer after a session — the next story of the plan, if this passage belongs to one that isn't finished. */
function planNextFor(passageId:string){const p=readPlan();return p&&p.stories.some(s=>s.passageId===passageId)&&!planFinished(p.state)?p.deckId:null;}
function PracticeResult({items,answers,wordsPractised,onAgain,onBack,onSwitch,switchLabel,onNextStory,onDeck}:{items:PracticeItem[];answers:Answered[];wordsPractised:number;onAgain:()=>void;onBack:()=>void;onSwitch:()=>void;switchLabel:string;onNextStory:(()=>void)|null;onDeck:()=>void}){
  useEffect(()=>{markPracticed();},[]); // #30: practised today → no practice nudge today (only the day is synced)
  const P=T.practice,R=T.story.result,sc=score(answers),wrong=Math.max(0,sc.total-sc.right-sc.almost),missed=items.filter(it=>{const a=answers.find(x=>x.id===it.id);return a&&a.verdict!=='correct'&&a.verdict!=='knew';});
  return <div className="page practice"><section className="finish">
    <div className="finish-orb" aria-hidden="true"><Wash/></div>
    <h1>{P.result(sc.right,sc.total)}</h1>
    <dl className="result-counts"><div className="ok"><dt>{R.right}</dt><dd>{sc.right}</dd></div><div className="no"><dt>{R.wrong}</dt><dd>{wrong}</dd></div><div className="near"><dt>{R.almost}</dt><dd>{sc.almost}</dd></div></dl>
    {sc.almost>0&&<p className="lead">{P.almostCount(sc.almost)}</p>}
    {wordsPractised>0&&<p className="finish-note">{R.words(wordsPractised)}</p>}
    <p className="finish-note">{P.noFsrs}</p>
    {missed.length>0&&<ul className="checks practice-missed">{missed.map(it=><li key={it.id} className="no"><span className="check-dot" aria-hidden="true"><X size={14}/></span>
      <span><b dir="auto">{it.kind==='dictation'?T.listening.kind.dictation:promptOf(it)}</b><small dir="auto">{answerOf(it)}</small></span></li>)}</ul>}
    <div className="finish-actions">
      {onNextStory&&<button type="button" className="btn btn-ink" onClick={onNextStory}><Sparkles size={16} aria-hidden="true"/>{R.nextBatch}</button>}
      <button type="button" className={'btn '+(onNextStory?'btn-quiet':'btn-ink')} onClick={onAgain}>{R.retry}</button>
      <button type="button" className="btn btn-quiet" onClick={onSwitch}>{switchLabel}</button>
      <button type="button" className="btn btn-quiet" onClick={onBack}>{P.backToText}</button>
      <button type="button" className="btn btn-quiet" onClick={onDeck}>{R.backToDeck}</button></div>
  </section></div>;
}

/* ───────────── Listening Practice (#23): the same passage, spoken on the device in its own language ───────────── */
type VoiceState='ok'|'none'|'unsupported';
/** Whether this device can speak `lang` (local voices only, #19/#20). An empty list = not known yet → the browser picks by `lang`. */
function useVoiceState(lang:string):VoiceState{
  const get=():VoiceState=>{if(!canSpeak)return 'unsupported';const v=window.speechSynthesis.getVoices();return !v.length||pickVoice(v,lang)?'ok':'none';};
  const [state,setState]=useState<VoiceState>(get);
  useEffect(()=>{if(!canSpeak)return;const on=()=>setState(get());on();window.speechSynthesis.addEventListener?.('voiceschanged',on);return ()=>window.speechSynthesis.removeEventListener?.('voiceschanged',on);},[lang]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}
/** Play / pause / replay, normal or slower. Stops when the screen goes away. */
function usePlayer(lang:string){
  const [status,setStatus]=useState<'idle'|'playing'|'paused'>('idle'),[slow,setSlow]=useState(false);
  const run=useRef(0);
  useEffect(()=>()=>{run.current++;if(canSpeak)window.speechSynthesis.cancel();},[]);
  function play(text:string,opts:{slow?:boolean}={}){
    const id=++run.current;
    const ok=speak(text,lang,{slow:opts.slow??slow,onEnd:()=>{if(run.current===id)setStatus('idle');}});
    setStatus(ok?'playing':'idle');return ok;
  }
  function toggle(text:string){
    const synth=window.speechSynthesis;
    if(status==='playing'){synth.pause();setStatus('paused');return;}
    if(status==='paused'){synth.resume();setStatus('playing');return;}
    play(text);
  }
  function stop(){run.current++;window.speechSynthesis.cancel();setStatus('idle');}
  return {status,slow,setSlow,play,toggle,stop};
}

const LISTENING_KINDS:ListeningKind[]=['dictation','comprehension'];
function ListeningPractice({deckId,id,lib,passages,words,go}:{deckId:string;id:string;lib:Library;passages:Passage[];words:Word[];go:(path:string)=>void}){
  const P=T.practice,L=T.listening,p=passages.find(x=>x.id===id&&x.deckId===deckId),deck=lib.decks.find(d=>d.id===deckId);
  const lang=p?.contentLanguage??DEFAULT_CONTENT_LANGUAGE,voice=useVoiceState(lang),player=usePlayer(lang);
  const avail=useMemo(()=>p?listeningAvailability(p):{dictation:0,comprehension:0},[p]);
  const [kinds,setKinds]=useState<ListeningKind[]>(LISTENING_KINDS),[count,setCount]=useState<number>(5);
  const [items,setItems]=useState<PracticeItem[]|null>(null),[idx,setIdx]=useState(0),[answers,setAnswers]=useState<Answered[]>([]);
  const [showText,setShowText]=useState(false);
  if(!p||!deck)return <NotFound go={go}/>;
  const chosen=kinds.filter(k=>avail[k]>0),canListen=voice==='ok';
  const done=items!==null&&idx>=items.length,inProgress=items!==null&&!done&&answers.length>0;
  const start=()=>{player.stop();setItems(buildListening(p,chosen,count));setIdx(0);setAnswers([]);setShowText(false);rememberContinue('deck',deckId);};
  const playerBar=<div className="listen-player" role="group" aria-label={L.player}>
    <button type="button" className="btn btn-ink listen-play" disabled={!canListen} onClick={()=>player.toggle(p.body)} aria-label={player.status==='playing'?L.pause:player.status==='paused'?L.resume:L.play}>
      {player.status==='playing'?<Pause size={18} aria-hidden="true"/>:<Play size={18} aria-hidden="true"/>}<span>{player.status==='playing'?L.pause:player.status==='paused'?L.resume:L.play}</span></button>
    <button type="button" className="btn btn-quiet sm" disabled={!canListen} onClick={()=>player.play(p.body)}><RotateCcw size={16} aria-hidden="true"/>{L.replay}</button>
    <button type="button" className={'chip'+(player.slow?' on':'')} aria-pressed={player.slow} disabled={!canListen} onClick={()=>player.setSlow(v=>!v)}>{L.slower}</button>
    <button type="button" className="btn btn-quiet sm" aria-expanded={showText} onClick={()=>setShowText(v=>!v)}>{showText?<EyeOff size={16} aria-hidden="true"/>:<Eye size={16} aria-hidden="true"/>}{showText?L.hideText:L.showText}</button>
  </div>;
  const textBox=showText&&<article className="passage-body listen-text" dir={dirOf(lang)} lang={lang}>{p.body.split(/\n+/).map((para,i)=><p key={i}>{para}</p>)}</article>;
  const noVoice=!canListen&&<div className="practice-empty listen-novoice" role="status"><h2>{voice==='unsupported'?L.unsupportedTitle:L.noVoiceTitle(langName(lang))}</h2><p>{voice==='unsupported'?L.unsupportedBody:L.noVoiceBody(langName(lang))}</p></div>;
  if(items===null)return <div className="page practice">
    <PageHead title={L.title} lead={p.title}/>
    {noVoice}{playerBar}{textBox}
    {canListen&&<div className="practice-setup">
      <fieldset className="practice-field"><legend>{P.activities}</legend>
        <div className="chips">{LISTENING_KINDS.map(k=><button type="button" key={k} className={'chip'+(chosen.includes(k)?' on':'')} aria-pressed={chosen.includes(k)} disabled={!avail[k]}
          onClick={()=>setKinds(ks=>ks.includes(k)?ks.filter(x=>x!==k):[...ks,k])}>{L.kind[k]} <span className="chip-n">{avail[k]}</span></button>)}</div>
        {!avail.comprehension&&<ul className="practice-why"><li>{L.whyComprehension}</li></ul>}
      </fieldset>
      <fieldset className="practice-field"><legend>{P.howMany}</legend>
        <div className="chips">{COUNTS.map(n=><button type="button" key={n} className={'chip'+(count===n?' on':'')} aria-pressed={count===n} onClick={()=>setCount(n)}>{n?String(n):P.all}</button>)}</div>
      </fieldset>
      <p className="practice-note">{L.privacy} {P.noFsrs}</p>
      <button type="button" className="btn btn-ink btn-lg practice-start" disabled={!chosen.length} onClick={start}>{P.start}</button>
    </div>}
  </div>;
  if(done){const next=planNextFor(p.id),story=readPlan()?.stories.some(x=>x.passageId===p.id);
    return <PracticeResult items={items} answers={answers} wordsPractised={cardsInPassage(p,words).length} onAgain={()=>setItems(null)} onBack={()=>go(story?storyPath(deckId,p.id):passagePath(deckId,p.id))}
    onSwitch={()=>go(passagePath(deckId,p.id)+'/read')} switchLabel={T.practice.readAction} onNextStory={next?()=>go(hubDeck(next)+'/new'):null} onDeck={()=>go(deckPath(deckId))}/>;}
  const item=items[idx];
  return <div className="page practice" data-unsaved={inProgress?'true':undefined}>
    <div className="review-top"><span className="review-count">{P.of(idx+1,items.length)}</span>
      <div className="progress" role="progressbar" aria-label={P.progress} aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={idx}><span style={{inlineSize:`${Math.max(4,100*idx/items.length)}%`}}/></div></div>
    {noVoice}
    {item.kind==='dictation'
      ?<DictationQuestion key={item.id} item={item} lang={lang} player={player} canListen={canListen} last={idx===items.length-1}
          onAnswer={v=>setAnswers(a=>[...a.filter(x=>x.id!==item.id),{id:item.id,verdict:v}])} onNext={()=>{player.stop();setIdx(i=>i+1);}}/>
      :<>{playerBar}{textBox}
        <PracticeQuestion key={item.id} item={item} lang={lang} meaningLang={deck.meaningLanguage} last={idx===items.length-1}
          onAnswer={v=>setAnswers(a=>[...a.filter(x=>x.id!==item.id),{id:item.id,verdict:v}])} onNext={()=>{player.stop();setIdx(i=>i+1);}}/></>}
  </div>;
}

function DictationQuestion({item,lang,player,canListen,last,onAnswer,onNext}:{item:DictationItem;lang:string;player:ReturnType<typeof usePlayer>;canListen:boolean;last:boolean;onAnswer:(v:Answered['verdict'])=>void;onNext:()=>void}){
  const P=T.practice,L=T.listening,[input,setInput]=useState(''),[result,setResult]=useState<ReturnType<typeof compareDictation>|null>(null),[revealed,setRevealed]=useState(false);
  const nextRef=useRef<HTMLButtonElement|null>(null);
  useEffect(()=>{if(result||revealed)nextRef.current?.focus({preventScroll:true});},[result,revealed]);
  const check=(e:FormEvent)=>{e.preventDefault();if(result||revealed||!input.trim())return;const r=compareDictation(input,item.text,lang);setResult(r);onAnswer(r.verdict);};
  const reveal=()=>{setRevealed(true);onAnswer('revealed');};
  const answered=!!result||revealed;
  return <section className="practice-q">
    <span className="kind-badge">{L.kind.dictation}</span>
    <p className="practice-prompt question">{L.dictationPrompt}</p>
    <div className="listen-player" role="group" aria-label={L.player}>
      <button type="button" className="btn btn-ink listen-play" disabled={!canListen} onClick={()=>player.play(item.text,{slow:false})}><Play size={18} aria-hidden="true"/><span>{L.playSentence}</span></button>
      <button type="button" className="btn btn-quiet sm" disabled={!canListen} onClick={()=>player.play(item.text,{slow:true})}>{L.slower}</button>
    </div>
    {!answered&&<form className="practice-answer field" onSubmit={check} noValidate>
      <label className="visually-hidden" htmlFor="practice-input">{L.typeWhatYouHear}</label>
      <textarea id="practice-input" rows={2} dir={dirOf(lang)} lang={lang} value={input} onChange={e=>setInput(e.target.value)} placeholder={L.typeWhatYouHear}
        autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} enterKeyHint="done" onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();e.currentTarget.form?.requestSubmit();}}}/>
      <div className="btn-row"><button type="submit" className="btn btn-ink" disabled={!input.trim()}>{P.check}</button>
        <button type="button" className="btn btn-quiet" onClick={reveal}>{P.reveal}</button></div>
    </form>}
    {result&&<>
      <p className={'practice-feedback '+(result.verdict==='correct'?'good':result.verdict==='accent'?'close':'bad')} role="status"><b>{result.verdict==='correct'?P.correct:result.verdict==='accent'?L.accentNote:L.wordsNote}</b></p>
      <p className="dictation-marks" dir={dirOf(lang)} lang={lang}>{result.words.map((w,i)=><span key={i} className={'dw '+w.status} title={w.status==='ok'?undefined:L.mark[w.status]}>
        {w.status==='wrong'&&w.typed&&<del>{w.typed}</del>}{w.status!=='ok'&&<span className="visually-hidden">{L.mark[w.status]}: </span>}{w.word}</span>)}
        {result.extra.map((x,i)=><span key={'x'+i} className="dw extra"><span className="visually-hidden">{L.mark.extra}: </span><del>{x}</del></span>)}</p>
      <ul className="dictation-legend"><li><span className="dw accent">á</span>{L.mark.accent}</li><li><span className="dw wrong">a</span>{L.mark.wrong}</li><li><span className="dw missing">a</span>{L.mark.missing}</li></ul>
    </>}
    {revealed&&<p className="practice-feedback bad" role="status"><b>{P.answerIs}</b> <span dir={dirOf(lang)} lang={lang}>{item.text}</span></p>}
    {answered&&<button ref={nextRef} type="button" className="btn btn-ink practice-next" onClick={onNext}>{last?P.seeResult:P.next}</button>}
  </section>;
}

const promptOf=(it:PracticeItem)=>it.kind==='cloze'?it.parts.join('____'):it.kind==='meaning'?it.term:it.kind==='comprehension'?it.question:it.text;
const answerOf=(it:PracticeItem)=>it.kind==='dictation'?it.text:it.answer;

function PracticeQuestion({item,lang,meaningLang,last,onAnswer,onNext}:{item:PracticeItem;lang:string;meaningLang:string;last:boolean;onAnswer:(v:Answered['verdict'])=>void;onNext:()=>void}){
  const P=T.practice,[input,setInput]=useState(''),[result,setResult]=useState<Answered['verdict']|null>(null),[expected,setExpected]=useState(''),[picked,setPicked]=useState(-1);
  const [shown,setShown]=useState(false);
  const nextRef=useRef<HTMLButtonElement|null>(null);
  useEffect(()=>{if(result)nextRef.current?.focus({preventScroll:true});},[result]);
  if(item.kind==='dictation')return null;
  const finish=(v:Answered['verdict'],exp:string)=>{setResult(v);setExpected(exp);onAnswer(v);};
  const check=(e:FormEvent)=>{e.preventDefault();if(result||item.kind==='meaning')return;
    const r=checkAnswer(input,item.accepted,item.kind==='cloze'?lang:'und');finish(r.verdict,r.verdict==='wrong'?item.answer:r.expected);};
  const typed=item.kind==='cloze'||item.kind==='comprehension';
  const inputLang=item.kind==='cloze'?lang:undefined;
  return <section className="practice-q">
    <span className="kind-badge">{P.kind[item.kind]}</span>
    {item.kind==='cloze'&&<><p className="practice-prompt" dir={dirOf(lang)} lang={lang}>{item.parts.map((part,i)=><span key={i}>{part}{i<item.parts.length-1&&<span className={'blank'+(result?' filled':'')}>{result?item.answer:<span className="visually-hidden">{P.blank}</span>}</span>}</span>)}</p>
      <p className="practice-hint"><small>{P.hint}</small> <span dir={dirOf(meaningLang)} lang={meaningLang}>{item.hint}</span></p></>}
    {item.kind==='comprehension'&&<p className="practice-prompt question" dir="auto">{item.question}</p>}
    {item.kind==='meaning'&&<><p className="practice-prompt term-prompt" dir={dirOf(lang)} lang={lang}>{item.term}</p>
      {item.options?<div className="practice-options" role="group" aria-label={P.chooseMeaning}>{item.options.map((o,i)=>{
          const cls=result?(i===item.correct?' right':i===picked?' wrong':''):'';
          return <button type="button" key={i} className={'practice-option'+cls} disabled={!!result} dir={dirOf(meaningLang)} lang={meaningLang}
            onClick={()=>{setPicked(i);finish(i===item.correct?'correct':'wrong',item.answer);}}>{o}</button>;})}</div>
      :!shown?<button type="button" className="btn btn-ink reveal" onClick={()=>setShown(true)}>{P.showMeaning}</button>
      :<div className="answer"><strong dir={dirOf(meaningLang)} lang={meaningLang}>{item.answer}</strong>
        {!result&&<div className="btn-row"><button type="button" className="btn btn-save" onClick={()=>finish('knew','')}><Check size={16}/>{P.knew}</button>
          <button type="button" className="btn btn-quiet" onClick={()=>finish('missed','')}>{P.missed}</button></div>}</div>}</>}
    {typed&&!result&&<form className="practice-answer field" onSubmit={check} noValidate>
      <label className="visually-hidden" htmlFor="practice-input">{P.yourAnswer}</label>
      <input id="practice-input" dir={inputLang?dirOf(inputLang):'auto'} lang={inputLang} value={input} onChange={e=>setInput(e.target.value)} placeholder={P.yourAnswer}
        autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} enterKeyHint="done"/>
      <div className="btn-row"><button type="submit" className="btn btn-ink" disabled={!input.trim()}>{P.check}</button>
        <button type="button" className="btn btn-quiet" onClick={()=>finish('revealed',item.answer)}>{P.reveal}</button></div>
    </form>}
    {result&&<Feedback verdict={result} expected={expected} lang={item.kind==='cloze'?lang:item.kind==='meaning'?meaningLang:undefined}/>}
    {result&&item.kind==='comprehension'&&item.quote&&<p className="practice-source"><small>{P.source}</small> <q dir={dirOf(lang)} lang={lang}>{item.quote}</q></p>}
    {result&&<button ref={nextRef} type="button" className="btn btn-ink practice-next" onClick={onNext}>{last?P.seeResult:P.next}</button>}
  </section>;
}
/** One calm line: what happened, and the right form when it helps. */
function Feedback({verdict,expected,lang}:{verdict:Answered['verdict'];expected:string;lang?:string}){
  const P=T.practice,good=verdict==='correct'||verdict==='knew';
  const text=verdict==='correct'?P.correct:verdict==='knew'?P.knewIt:verdict==='accent'?P.almost:verdict==='revealed'?P.answerIs:verdict==='missed'?P.nextTime:P.notQuite;
  return <p className={'practice-feedback '+(good?'good':verdict==='accent'?'close':'bad')} role="status">
    <b>{text}</b>{!good&&expected&&<> <span dir={lang?dirOf(lang):'auto'} lang={lang}>{expected}</span></>}</p>;
}

type FactDraft={key:string;id?:string;question:string;answer:string;alternatives:string;quote:string};
const newFact=():FactDraft=>({key:crypto.randomUUID(),question:'',answer:'',alternatives:'',quote:''});
/** Create or edit a passage. Facts are optional: comprehension practice (#22) only ever asks these, never invented ones. */
function PassageEditor({deckId,id,lib,passages,onChanged,notify,go}:{deckId:string;id:string|null;lib:Library;passages:Passage[];onChanged:()=>Promise<unknown>;notify:Notify;go:(path:string)=>void}){
  const Tx=T.texts,deck=lib.decks.find(d=>d.id===deckId),old=id?passages.find(p=>p.id===id&&p.deckId===deckId):undefined;
  const [title,setTitle]=useState(old?.title??''),[body,setBody]=useState(old?.body??''),[lang,setLang]=useState(old?.contentLanguage??deck?.contentLanguage??DEFAULT_CONTENT_LANGUAGE);
  const [translation,setTranslation]=useState(old?.translation??''),[showTr,setShowTr]=useState(!!old?.translation);
  const [facts,setFacts]=useState<FactDraft[]>(()=>old?.questions.map(q=>({key:q.id,id:q.id,question:q.question,answer:q.answer,alternatives:q.alternatives.join('، '),quote:q.quote}))??[]);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  const bodyRef=useRef<HTMLTextAreaElement|null>(null);
  // #42: the editor counts as «changed» once anything differs from what it opened with; leaving then asks first.
  const snapshot=()=>JSON.stringify([title,body,lang,showTr?translation:'',facts.map(({key:_k,...f})=>f)]);
  const [initial]=useState(snapshot);
  const changed=snapshot()!==initial;
  useLayoutEffect(()=>{const el=bodyRef.current;if(el){el.style.height='auto';el.style.height=Math.max(160,el.scrollHeight)+'px';}},[body]);
  if(!deck||(id&&!old))return <NotFound go={go}/>;
  const setFact=(i:number,patch:Partial<FactDraft>)=>setFacts(fs=>fs.map((f,j)=>j===i?{...f,...patch}:f));
  async function submit(e:FormEvent){
    e.preventDefault();if(busy)return;setError('');setBusy(true);
    const questions=facts.filter(f=>f.question.trim()||f.answer.trim()||f.quote.trim()).map(f=>({id:f.id,question:f.question,answer:f.answer,quote:f.quote,alternatives:f.alternatives.split(/[,،\n]/).map(a=>a.trim()).filter(Boolean)}));
    try{
      const input={deckId,title,body,contentLanguage:lang,translation:showTr?translation:'',questions};
      const saved=old?await updatePassage(old.id,input):await createPassage(input);
      await onChanged();notify(Tx.saved(saved.title));go(passagePath(deckId,saved.id));
    }catch(err){setError(getError(err));}finally{setBusy(false);}
  }
  return <div className="page library passage-editor">
    <PageHead title={old?Tx.editTitle:Tx.newTitle} lead={Tx.editorLead}/>
    <form className="add-form" onSubmit={e=>void submit(e)} data-unsaved={changed&&!busy?'true':undefined} noValidate>
      <div className="field"><label htmlFor="passage-title">{Tx.titleLabel}</label><input id="passage-title" dir="auto" maxLength={PASSAGE_LIMITS.title} value={title} onChange={e=>setTitle(e.target.value)} placeholder={Tx.titlePh} autoFocus={!old}/></div>
      <div className="field"><label htmlFor="passage-lang">{Tx.langLabel}</label><LanguageSelect id="passage-lang" value={lang} onChange={setLang}/></div>
      <div className="field"><label htmlFor="passage-body">{Tx.bodyLabel}</label>
        <textarea ref={bodyRef} id="passage-body" className="passage-input" dir={dirOf(lang)} lang={lang} maxLength={PASSAGE_LIMITS.body} value={body} onChange={e=>setBody(e.target.value)} placeholder={Tx.bodyPh(lang)} spellCheck={false}/>
        <small className="field-hint">{Tx.bodyHint(body.length,PASSAGE_LIMITS.body)}</small></div>
      {showTr?<div className="field"><label htmlFor="passage-translation">{Tx.translationLabel}</label>
          <div className="with-remove"><textarea id="passage-translation" dir="auto" rows={3} maxLength={PASSAGE_LIMITS.translation} value={translation} onChange={e=>setTranslation(e.target.value)}/>
          <button type="button" className="icon-btn ghost" aria-label={Tx.removeTranslation} title={Tx.removeTranslation} onClick={()=>{setTranslation('');setShowTr(false);}}><X size={18}/></button></div></div>
        :<div className="add-more-row"><button type="button" className="add-more" onClick={()=>setShowTr(true)}><Plus size={16}/>{Tx.addTranslation}</button></div>}
      <fieldset className="facts-fields"><legend>{Tx.factsLegend}</legend><p className="field-hint">{Tx.factsHint}</p>
        {facts.map((f,i)=><div key={f.key} className="fact-card">
          <div className="fact-head"><b>{Tx.factN(i+1)}</b><button type="button" className="icon-btn ghost" aria-label={Tx.removeFact(i+1)} title={Tx.removeFact(i+1)} onClick={()=>setFacts(fs=>fs.filter((_,j)=>j!==i))}><X size={18}/></button></div>
          <div className="field"><label htmlFor={'fq-'+i}>{Tx.question}</label><input id={'fq-'+i} dir="auto" maxLength={PASSAGE_LIMITS.question} value={f.question} onChange={e=>setFact(i,{question:e.target.value})} placeholder={Tx.questionPh}/></div>
          <div className="field"><label htmlFor={'fa-'+i}>{Tx.answer}</label><input id={'fa-'+i} dir="auto" maxLength={PASSAGE_LIMITS.answer} value={f.answer} onChange={e=>setFact(i,{answer:e.target.value})} placeholder={Tx.answerPh}/></div>
          <div className="field"><label htmlFor={'fl-'+i}>{Tx.alternatives}</label><input id={'fl-'+i} dir="auto" value={f.alternatives} onChange={e=>setFact(i,{alternatives:e.target.value})}/></div>
          <div className="field"><label htmlFor={'fs-'+i}>{Tx.quote}</label><input id={'fs-'+i} dir={dirOf(lang)} lang={lang} maxLength={PASSAGE_LIMITS.quote} value={f.quote} onChange={e=>setFact(i,{quote:e.target.value})}/></div>
        </div>)}
        {facts.length<PASSAGE_LIMITS.questions&&<div className="add-more-row"><button type="button" className="add-more" onClick={()=>setFacts(fs=>[...fs,newFact()])}><Plus size={16}/>{Tx.addFact}</button></div>}
      </fieldset>
      {error&&<p className="inline-error" role="alert">{error}</p>}
      <div className="form-foot"><button type="submit" className="btn btn-save" disabled={busy}>{busy?Tx.saving:Tx.save}</button>
        <button type="button" className="btn btn-quiet" onClick={()=>go(old?passagePath(deckId,old.id):textsPath(deckId))}>{Tx.cancel}</button></div>
    </form>
  </div>;
}

/**
 * #25: a card shows what helps learning — term, meanings, one due pill; expanded: example, translation, note and its deck.
 * Listen and Edit are visible; Move and Remove live in the ••• sheet (remove = archive, after confirmation).
 * «تفاصيل التعلم» is optional and human-worded (no raw FSRS). Editing and moving never change dueAt, FSRS or history.
 */
function CardList({list,reviews,lib,onChanged,notify,showPlace=false,selecting=false,onSelectingDone}:{list:Word[];reviews:Review[];lib:Library;onChanged:()=>Promise<unknown>;notify:Notify;showPlace?:boolean;selecting?:boolean;onSelectingDone?:()=>void}){
  const Lb=T.library,L=T.lib,C=T.card;
  const [open,setOpen]=useState<string|null>(null),[pending,setPending]=useState<Word|null>(null),[moving,setMoving]=useState<Word|null>(null),[menu,setMenu]=useState<Word|null>(null),[editing,setEditing]=useState<Word|null>(null);
  // #29: selection is scoped to what is listed now — a search or filter that hides a card also unselects it.
  const [picked,setPicked]=useState<Set<string>>(()=>new Set()),[bulk,setBulk]=useState<null|'move'|'archive'>(null);
  const listedKey=list.map(w=>w.id).join('|');
  useEffect(()=>{setPicked(p=>{const ids=new Set(list.map(w=>w.id));const next=new Set([...p].filter(id=>ids.has(id)));return next.size===p.size?p:next;});},[listedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{if(!selecting){setPicked(new Set());setBulk(null);}else setOpen(null);},[selecting]);
  const toggle=(id:string)=>setPicked(p=>{const n=new Set(p);if(n.has(id))n.delete(id);else n.add(id);return n;});
  const allPicked=list.length>0&&list.every(w=>picked.has(w.id));
  async function bulkMove(deckId:string){const ids=[...picked];await moveWords(ids,deckId);await onChanged();const d=lib.decks.find(x=>x.id===deckId);notify(L.bulkMoved(ids.length,d?deckName(d):''));setBulk(null);onSelectingDone?.();}
  async function bulkArchive(){const ids=[...picked];setBulk(null);try{await archiveWords(ids);await onChanged();notify(L.bulkArchived(ids.length));onSelectingDone?.();}catch(e){notify(getError(e),'error');}}
  const history=useMemo(()=>{const m=new Map<string,{n:number;last:string}>();for(const r of reviews){const h=m.get(r.wordId);if(!h)m.set(r.wordId,{n:1,last:r.reviewedAt});else{h.n++;if(r.reviewedAt>h.last)h.last=r.reviewedAt;}}return m;},[reviews]);
  const now=Date.now();
  const place=(w:Word)=>{const d=lib.decks.find(x=>x.id===deckIdOf(w,lib));const f=d&&lib.folders.find(x=>x.id===d.folderId);return d?(f?`${folderName(f)} · ${deckName(d)}`:deckName(d)):'';};
  async function confirmArchive(){const w=pending;setPending(null);if(!w)return;try{await archiveWord(w.id);await onChanged();notify(Lb.removed(w.term));}catch(e){notify(getError(e),'error');}}
  async function move(deckId:string){const w=moving;if(!w)return;await moveWord(w.id,deckId);await onChanged();const d=lib.decks.find(x=>x.id===deckId);notify(L.moved(w.term,d?deckName(d):''));setMoving(null);}
  async function save(v:CardEdit){const w=editing;if(!w)return;const next=await editWord(w.id,v);await onChanged();notify(C.saved(next.term));setEditing(null);}
  return <>
    {selecting&&<p className="select-hint" role="status">{picked.size?L.selectedCount(picked.size):L.selectHint}</p>}
    <ul className={'word-list'+(selecting?' selecting':'')} aria-label={Lb.listLabel}>{list.map(w=>{const due=isDue(w,now),isOpen=open===w.id,h=history.get(w.id),cl=contentLang(w,lib.decks);
      if(selecting){const on=picked.has(w.id);return <li key={w.id} className={'word'+(on?' picked':'')}>
        <label className="word-main word-pick"><span className="word-text"><i className="kind-badge">{kindLabel(w.contentType)}</i><b dir={termDir(w,cl)} lang={cl}>{w.term}</b><span dir="auto">{w.meanings.join('؛ ')}</span>{showPlace&&<small className="word-place" dir="auto">{place(w)}</small>}</span>
          <span className={'due-pill'+(due?' is-due':'')}>{due?Lb.dueNow:relative(w.dueAt,now)}</span>
          <input type="checkbox" className="pick-box" checked={on} onChange={()=>toggle(w.id)} aria-label={L.pickLabel(w.term)}/></label>
      </li>;}
      return <li key={w.id} className={'word'+(isOpen?' open':'')}>
      <button type="button" className="word-main" aria-expanded={isOpen} aria-controls={'wd-'+w.id} onClick={()=>setOpen(isOpen?null:w.id)}>
        <span className="word-text"><i className="kind-badge">{kindLabel(w.contentType)}</i><b dir={termDir(w,cl)} lang={cl}>{w.term}</b><span dir="auto">{w.meanings.join('؛ ')}</span>{showPlace&&!isOpen&&<small className="word-place" dir="auto">{place(w)}</small>}</span>
        <span className={'due-pill'+(due?' is-due':'')}>{due?Lb.dueNow:relative(w.dueAt,now)}</span>
        <ChevronDown size={18} className="chev" aria-hidden="true"/>
      </button>
      {isOpen&&<div className="word-detail" id={'wd-'+w.id}>
        {w.example&&<ExampleLine text={w.example} lang={cl}/>}
        {w.translation&&<p className="translation" dir="auto">{w.translation}</p>}
        {w.note&&<p className="note"><b>{T.kindForm[w.contentType].note?.label||Lb.noteFallback}</b> <span dir="auto">{w.note}</span></p>}
        <p className="word-deck"><Layers3 size={16} aria-hidden="true"/><span>{C.deck}</span> <b dir="auto">{place(w)}</b></p>
        <div className="word-actions">
          <SpeakButton text={w.term} lang={cl} label={T.listen(w.term)} className="btn btn-quiet sm"/>
          <button type="button" className="btn btn-quiet sm" onClick={()=>setEditing(w)}><Pencil size={16}/>{C.edit}</button>
          <button type="button" className="icon-btn more-btn" aria-haspopup="dialog" aria-label={C.more(w.term)} title={C.more(w.term)} onClick={()=>setMenu(w)}><MoreHorizontal size={20}/></button>
        </div>
        <details className="learn-details" onToggle={e=>{const d=e.currentTarget;if(d.open)requestAnimationFrame(()=>d.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}));}}>
          <summary>{C.learn}</summary>
          <dl className="word-meta">
            <div><dt>{C.stage}</dt><dd>{T.stages[stageOf(w)]}</dd></div>
            <div><dt>{C.last}</dt><dd>{h?localDate(h.last):C.never}</dd></div>
            <div><dt>{C.count}</dt><dd>{h?T.times(h.n):C.never}</dd></div>
            <div><dt>{C.next}</dt><dd>{due?T.now:localDate(w.dueAt)}</dd></div>
          </dl>
        </details>
      </div>}
    </li>;})}</ul>
    {selecting&&<div className="select-bar" role="group" aria-label={L.selectActions}>
      <button type="button" className="btn btn-quiet sm" onClick={()=>setPicked(allPicked?new Set():new Set(list.map(w=>w.id)))}>{allPicked?L.selectNone:L.selectAll(list.length)}</button>
      <span className="select-actions">
        <button type="button" className="btn btn-quiet sm" disabled={!picked.size} onClick={()=>setBulk('move')}><FolderInput size={16} aria-hidden="true"/>{L.moveSelected}</button>
        <button type="button" className="btn btn-quiet sm danger" disabled={!picked.size} onClick={()=>setBulk('archive')}><Archive size={16} aria-hidden="true"/>{L.archiveSelected}</button>
      </span>
    </div>}
    <BulkMoveSheet open={bulk==='move'} count={picked.size} lib={lib} onMove={bulkMove} onClose={()=>setBulk(null)}/>
    <ConfirmDialog open={bulk==='archive'} title={L.bulkArchiveTitle(picked.size)} body={Lb.removeBody} confirm={L.bulkArchiveYes} cancel={Lb.removeNo} onConfirm={()=>void bulkArchive()} onCancel={()=>setBulk(null)}/>
    <ActionSheet word={menu} onClose={()=>setMenu(null)} onMove={w=>{setMenu(null);setMoving(w);}} onRemove={w=>{setMenu(null);setPending(w);}}/>
    <ConfirmDialog open={!!pending} title={Lb.removeTitle(pending?.term||'')} body={Lb.removeBody} confirm={Lb.removeYes} cancel={Lb.removeNo} onConfirm={()=>void confirmArchive()} onCancel={()=>setPending(null)}/>
    <MoveSheet word={moving} lib={lib} onMove={move} onClose={()=>setMoving(null)}/>
    <EditSheet word={editing} lang={editing?contentLang(editing,lib.decks):DEFAULT_CONTENT_LANGUAGE} onSave={save} onClose={()=>setEditing(null)}/>
  </>;
}
/** The ••• menu: secondary and destructive actions, out of the way of everyday use (#25). */
function ActionSheet({word,onClose,onMove,onRemove}:{word:Word|null;onClose:()=>void;onMove:(w:Word)=>void;onRemove:(w:Word)=>void}){
  const C=T.card,ref=useRef<HTMLDialogElement>(null),open=!!word;
  useEffect(()=>{const d=ref.current;if(!d)return;if(open&&!d.open)d.showModal();if(!open&&d.open)d.close();},[open]);
  return <dialog ref={ref} className="sheet action-sheet" aria-labelledby="as-title" onCancel={e=>{e.preventDefault();onClose();}}>
    {word&&<>
      <h2 id="as-title">{C.moreTitle(word.term)}</h2>
      <div className="action-list">
        <button type="button" className="action-row" onClick={()=>onMove(word)}><FolderInput size={20} aria-hidden="true"/>{C.move}</button>
        <button type="button" className="action-row archive" onClick={()=>onRemove(word)}><Archive size={20} aria-hidden="true"/>{C.remove}</button>
      </div>
      <div className="sheet-actions"><button type="button" className="btn btn-quiet" onClick={onClose}>{T.lib.cancel}</button></div>
    </>}
  </dialog>;
}
/** Edit content only (#25 + #26 data): term, existing meanings, example/translation/note where the kind has them or the card already does. */
function EditSheet({word,lang,onSave,onClose}:{word:Word|null;lang:string;onSave:(v:CardEdit)=>Promise<void>;onClose:()=>void}){
  const C=T.card,open=!!word;
  const [term,setTerm]=useState(''),[meanings,setMeanings]=useState<string[]>([]),[example,setExample]=useState(''),[translation,setTranslation]=useState(''),[note,setNote]=useState('');
  const {busy,error,run}=useSheetAction(open);
  // #42: «changed» is judged only once the fields hold this card's text — never in the first render, before they are filled.
  const [loadedId,setLoadedId]=useState<string|null>(null);
  useEffect(()=>{if(word){setTerm(word.term);setMeanings([...word.meanings]);setExample(word.example);setTranslation(word.translation);setNote(word.note);}setLoadedId(word?.id??null);},[word]);
  if(!word)return <FormSheet open={false} title="" onClose={onClose} onSubmit={()=>undefined} submit="" busy error=""><span/></FormSheet>;
  const f=T.kindForm[word.contentType],has={example:!!f.example||!!word.example,translation:!!f.translation||!!word.translation,note:!!f.note||!!word.note};
  const submit=()=>run(()=>onSave({term,meanings,...(has.example?{example}:{}),...(has.translation?{translation}:{}),...(has.note?{note}:{})}));
  return <FormSheet open={open} title={C.editTitle(word.term)} onClose={onClose} onSubmit={()=>void submit()} submit={T.lib.save} busy={busy} error={error}
    dirty={loadedId===word.id&&(term!==word.term||meanings.join('\n')!==word.meanings.join('\n')||example!==word.example||translation!==word.translation||note!==word.note)}>
    <div className="field"><label htmlFor="edit-term">{f.term.label}</label><input id="edit-term" name="edit-term" dir={termDir(word,lang)} lang={lang} autoComplete="off" maxLength={TERM_LIMIT[word.contentType]} value={term} onChange={e=>setTerm(e.target.value)}/></div>
    {meanings.map((m,i)=><div className="field" key={i}><label htmlFor={'edit-meaning-'+i}>{meanings.length>1?C.meaningN(i+1):f.meaning.label}</label><input id={'edit-meaning-'+i} name={'edit-meaning-'+i} dir="auto" autoComplete="off" maxLength={240} value={m} onChange={e=>setMeanings(ms=>ms.map((x,j)=>j===i?e.target.value:x))}/></div>)}
    {has.example&&<div className="field"><label htmlFor="edit-example">{f.example?.label||C.example}</label><textarea id="edit-example" dir={dirOf(lang)} lang={lang} maxLength={500} value={example} onChange={e=>setExample(e.target.value)}/></div>}
    {has.translation&&<div className="field"><label htmlFor="edit-translation">{f.translation?.label||C.translation}</label><textarea id="edit-translation" dir="auto" maxLength={400} value={translation} onChange={e=>setTranslation(e.target.value)}/></div>}
    {has.note&&<div className="field"><label htmlFor="edit-note">{f.note?.label||T.library.noteFallback}</label><textarea id="edit-note" dir="auto" maxLength={NOTE_LIMIT} value={note} onChange={e=>setNote(e.target.value)}/></div>}
    <p className="hint">{C.editNote}</p>
  </FormSheet>;
}

/* ── Sheets (native <dialog>: focus trap, Esc, backdrop) ── */
const isTouch=()=>window.matchMedia?.('(pointer:coarse)').matches??false;
/** #43: after the on-screen keyboard settles, keep the focused field inside the part of the sheet the user can see. */
function keepFieldVisible(e:ReactFocusEvent){
  const el=e.target as HTMLElement;if(!el.matches('input,textarea,select')||!isTouch())return;
  setTimeout(()=>{if(document.activeElement===el)el.scrollIntoView({block:'nearest',inline:'nearest'});},320);
}
/**
 * #43: publishes the on-screen keyboard height (--kb) and the visible height (--vvh) as CSS variables.
 * iOS (Safari and the installed PWA) does not shrink the layout viewport for the keyboard, so a bottom sheet
 * anchored to the layout bottom ends up behind it; the sheet CSS lifts itself by --kb and caps its height to --vvh.
 */
function useKeyboardInset(){
  useEffect(()=>{
    const vv=window.visualViewport;if(!vv)return;
    const root=document.documentElement;let raf=0;
    const set=()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{
      const kb=Math.max(0,Math.round(window.innerHeight-vv.height-vv.offsetTop));
      root.style.setProperty('--kb',(kb>60?kb:0)+'px');root.style.setProperty('--vvh',Math.round(vv.height)+'px');
      root.classList.toggle('kb-open',kb>60);
    });};
    set();vv.addEventListener('resize',set);vv.addEventListener('scroll',set);window.addEventListener('orientationchange',set);document.addEventListener('visibilitychange',set);
    return()=>{cancelAnimationFrame(raf);vv.removeEventListener('resize',set);vv.removeEventListener('scroll',set);window.removeEventListener('orientationchange',set);document.removeEventListener('visibilitychange',set);};
  },[]);
}
function FormSheet({open,title,onClose,onSubmit,submit,busy,error,children,extra,dirty=false}:{open:boolean;title:string;onClose:()=>void;onSubmit:()=>void;submit:string;busy:boolean;error:string;children:ReactNode;extra?:ReactNode;dirty?:boolean}){
  const ref=useRef<HTMLDialogElement>(null);
  /** #42: Cancel, Esc and Back never drop typed text silently. */
  const cancel=()=>{if(dirty)askLeave(onClose);else onClose();};
  useEffect(()=>{
    const d=ref.current;if(!d)return;
    if(open&&!d.open){
      // #43: on a phone, focusing the field inside showModal() raises the keyboard over the sheet before it is even seen.
      // Touch: focus the title (the sheet is read first, the field is one tap away). Mouse/keyboard: focus the first field.
      const target=isTouch()?d.querySelector<HTMLElement>('h2'):d.querySelector<HTMLElement>('input,textarea,select');
      d.querySelectorAll('[autofocus]').forEach(e=>e.removeAttribute('autofocus'));
      target?.setAttribute('autofocus','');
      d.showModal();target?.focus({preventScroll:true});d.scrollTop=0;
    }
    if(!open&&d.open)d.close();
  },[open]);
  return <dialog ref={ref} className="sheet form-sheet" onCancel={e=>{e.preventDefault();cancel();}} aria-labelledby="fs-title">
    {open&&<form onSubmit={e=>{e.preventDefault();onSubmit();}} onFocus={keepFieldVisible} data-unsaved={dirty&&!busy?'true':undefined} noValidate>
      <h2 id="fs-title" tabIndex={-1}>{title}</h2>
      <div className="sheet-fields">{children}</div>
      {error&&<p className="inline-error" role="alert">{error}</p>}
      <div className="sheet-actions"><button type="submit" className="btn btn-ink" disabled={busy}>{submit}</button><button type="button" className="btn btn-quiet" onClick={cancel}>{T.lib.cancel}</button></div>
      {extra}
    </form>}
  </dialog>;
}
function useSheetAction(open:boolean){
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{if(open){setError('');setBusy(false);}},[open]);
  const run=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');try{await fn();}catch(e){setError(getError(e));}finally{setBusy(false);}};
  return {busy,error,run};
}
function NameSheet({open,title,label,placeholder,initial='',submit,onSubmit,onClose,extra}:{open:boolean;title:string;label:string;placeholder:string;initial?:string;submit:string;onSubmit:(name:string)=>Promise<void>;onClose:()=>void;extra?:ReactNode}){
  const [name,setName]=useState(initial),{busy,error,run}=useSheetAction(open);
  useEffect(()=>{if(open)setName(initial);},[open,initial]);
  return <FormSheet open={open} title={title} onClose={onClose} onSubmit={()=>void run(()=>onSubmit(name))} submit={submit} busy={busy} error={error} extra={extra} dirty={name.trim()!==initial.trim()}>
    <div className="field"><label htmlFor="folder-title">{label}</label><input id="folder-title" name="folder-title" dir="auto" autoComplete="off" autoCorrect="off" enterKeyHint="done" maxLength={60} placeholder={placeholder} value={name} onChange={e=>setName(e.target.value)}/></div>
  </FormSheet>;
}
type DeckForm={name:string;folderId:string;contentLanguage:string;meaningLanguage:string};
function LanguageSelect({id,value,onChange}:{id:string;value:string;onChange:(v:string)=>void}){
  const options=LEARN_LANGUAGES.some(([t])=>t===value)?LEARN_LANGUAGES:[...LEARN_LANGUAGES,[value,value] as [string,string]];
  return <select id={id} className="select" value={value} onChange={e=>onChange(e.target.value)}>{options.map(([t,n])=><option key={t} value={t} lang={t}>{n}</option>)}</select>;
}
function DeckSheet({open,title,lib,deck,submit,onSubmit,onClose,extra}:{open:boolean;title:string;lib:Library;deck?:Deck;submit:string;onSubmit:(v:DeckForm)=>Promise<void>;onClose:()=>void;extra?:ReactNode}){
  const L=T.lib;
  const blank=():DeckForm=>({name:deck?deckName(deck):'',folderId:deck?.folderId??DEFAULT_FOLDER_ID,contentLanguage:deck?.contentLanguage??'en-US',meaningLanguage:deck?.meaningLanguage??'ar-SA'});
  const [v,setV]=useState<DeckForm>(blank),{busy,error,run}=useSheetAction(open);
  useEffect(()=>{if(open)setV(blank());},[open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set=(k:keyof DeckForm)=>(x:string)=>setV(o=>({...o,[k]:x}));
  return <FormSheet open={open} title={title} onClose={onClose} onSubmit={()=>void run(()=>onSubmit(v))} submit={submit} busy={busy} error={error} extra={extra} dirty={JSON.stringify(v)!==JSON.stringify(blank())}>
    <div className="field"><label htmlFor="deck-title">{L.nameLabel}</label><input id="deck-title" name="deck-title" dir="auto" autoComplete="off" autoCorrect="off" enterKeyHint="done" maxLength={60} placeholder={L.deckNamePh} value={v.name} onChange={e=>set('name')(e.target.value)}/></div>
    {deck&&<div className="field"><label htmlFor="deck-folder">{L.folderLabel}</label><select id="deck-folder" className="select" value={v.folderId} onChange={e=>set('folderId')(e.target.value)}>{lib.folders.map(f=><option key={f.id} value={f.id}>{folderName(f)}</option>)}</select></div>}
    <div className="field"><label htmlFor="deck-content-lang">{L.contentLang}</label><LanguageSelect id="deck-content-lang" value={v.contentLanguage} onChange={set('contentLanguage')}/><p className="hint">{L.langHint}</p></div>
    <div className="field"><label htmlFor="deck-meaning-lang">{L.meaningLang}</label><LanguageSelect id="deck-meaning-lang" value={v.meaningLanguage} onChange={set('meaningLanguage')}/></div>
  </FormSheet>;
}
/** Delete is offered only when it cannot lose anything; otherwise the reason is shown instead (no cascade, #15). */
function DangerZone({label,blocked,onDelete}:{label:string;blocked:string;onDelete:()=>void}){
  return <div className="danger-zone">{blocked?<p className="hint">{blocked}</p>:<button type="button" className="btn btn-quiet sm danger" onClick={onDelete}><Trash2 size={16}/>{label}</button>}</div>;
}
function DeckOptions({lib}:{lib:Library}){
  return <>{lib.folders.map(f=>{const ds=lib.decks.filter(d=>d.folderId===f.id);return ds.length?<optgroup key={f.id} label={folderName(f)}>{ds.map(d=><option key={d.id} value={d.id}>{deckName(d)}</option>)}</optgroup>:null;})}</>;
}
function MoveSheet({word,lib,onMove,onClose}:{word:Word|null;lib:Library;onMove:(deckId:string)=>Promise<void>;onClose:()=>void}){
  const L=T.lib,open=!!word;
  const [target,setTarget]=useState(''),{busy,error,run}=useSheetAction(open);
  useEffect(()=>{if(word)setTarget(deckIdOf(word,lib));},[word]); // eslint-disable-line react-hooks/exhaustive-deps
  return <FormSheet open={open} title={L.moveTitle(word?.term||'')} onClose={onClose} onSubmit={()=>void run(()=>onMove(target))} submit={L.move} busy={busy||!word||target===deckIdOf(word,lib)} error={error}>
    <div className="field"><label htmlFor="move-deck">{L.moveTo}</label><select id="move-deck" className="select" value={target} onChange={e=>setTarget(e.target.value)}><DeckOptions lib={lib}/></select><p className="hint">{L.moveNote}</p></div>
  </FormSheet>;
}
/** #29: move the selected cards to one deck. Their review dates and history stay as they are. */
function BulkMoveSheet({open,count,lib,onMove,onClose}:{open:boolean;count:number;lib:Library;onMove:(deckId:string)=>Promise<void>;onClose:()=>void}){
  const L=T.lib;
  const [target,setTarget]=useState(DEFAULT_DECK_ID),{busy,error,run}=useSheetAction(open);
  useEffect(()=>{if(open&&!lib.decks.some(d=>d.id===target))setTarget(lib.decks[0]?.id??DEFAULT_DECK_ID);},[open]); // eslint-disable-line react-hooks/exhaustive-deps
  return <FormSheet open={open} title={L.bulkMoveTitle(count)} onClose={onClose} onSubmit={()=>void run(()=>onMove(target))} submit={L.move} busy={busy||!count} error={error}>
    <div className="field"><label htmlFor="bulk-move-deck">{L.moveTo}</label><select id="bulk-move-deck" className="select" value={target} onChange={e=>setTarget(e.target.value)}><DeckOptions lib={lib}/></select><p className="hint">{L.bulkMoveNote}</p></div>
  </FormSheet>;
}
/** #16: where a new card is saved, visible before saving. */
function DeckPicker({lib,value,onChange}:{lib:Library;value:string;onChange:(id:string)=>void}){
  if(!lib.decks.length)return null;
  return <div className="field deck-picker"><label htmlFor="add-deck">{T.lib.destination}</label><select id="add-deck" className="select" value={value} onChange={e=>onChange(e.target.value)}><DeckOptions lib={lib}/></select></div>;
}

/* ───────────── Progress / stats ───────────── */
const gradeColor:Record<Grade,string>={again:'#d6513f',hard:'#d99a1c',good:'#2f9a6a',easy:'#2f6fb8'};
function StatsPage({words,reviews,onNavigate}:{words:Word[];reviews:Review[];onNavigate:(p:Page)=>void}){
  const S=T.stats;
  const now=new Date(),today=dayKey(now);
  const active=useMemo(()=>words.filter(w=>!w.archived),[words]);
  const data=useMemo(()=>{
    const days=(n:number,dir:1|-1)=>Array.from({length:n},(_,i)=>new Date(now.getTime()+dir*i*DAY));
    const ahead=days(7,1).map((d,i)=>{const k=dayKey(d);return {k,label:i===0?T.today:i===1?T.tomorrow:weekday(d),n:active.filter(w=>{const wk=dayKey(w.dueAt);return i===0?wk<=k:wk===k;}).length};});
    const perDay=new Map<string,number>();for(const r of reviews){const k=dayKey(r.reviewedAt);perDay.set(k,(perDay.get(k)||0)+1);}
    const past=days(28,-1).reverse().map(d=>({k:dayKey(d),date:d,n:perDay.get(dayKey(d))||0}));
    const gradeN:Record<Grade,number>={again:0,hard:0,good:0,easy:0};for(const r of reviews)gradeN[r.grade]++;
    const stages:Record<Stage,number>={new:0,learning:0,growing:0,strong:0};for(const w of active)stages[stageOf(w)]++;
    return {ahead,past,gradeN,stages,activeDays:past.filter(p=>p.n>0).length};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[active,reviews,today]);
  if(!active.length&&!reviews.length)return <div className="page"><PageHead title={S.title} lead={S.emptyLead}/><div className="empty"><Wash tone="soft"/><LineChart size={30} strokeWidth={1.6}/><h2>{S.emptyTitle}</h2><p>{S.emptyBody}</p><button type="button" className="btn btn-ink" onClick={()=>onNavigate('add')}>{T.addCard}<Fwd size={18}/></button></div></div>;
  const maxAhead=Math.max(1,...data.ahead.map(d=>d.n)),maxPast=Math.max(1,...data.past.map(d=>d.n));
  const totalGrades=reviews.length,stageTotal=Math.max(1,active.length);
  return <div className="page stats">
    <PageHead title={S.title} lead={data.activeDays?S.lead(T.days(data.activeDays)):S.leadNone}/>
    <div className="stats-grid">
      <section className="panel panel-wide">
        <h2>{S.weekTitle}</h2><p className="panel-note">{S.weekNote}</p>
        <ol className="bars" aria-label={S.weekAria}>{data.ahead.map((d,i)=><li key={d.k} style={{'--i':i} as CSSProperties} title={`${d.label}: ${T.cards(d.n)}`}><span className="bar-n">{d.n}</span><span className="bar" style={{blockSize:`${Math.max(d.n?8:2,100*d.n/maxAhead)}%`}} data-zero={d.n===0||undefined}/><span className="bar-label">{d.label}</span></li>)}</ol>
      </section>
      <section className="panel">
        <h2>{S.daysTitle}</h2><p className="panel-note">{S.daysNote}</p>
        <ol className="heat" aria-label={S.daysAria}>{data.past.map(p=>{const lvl=p.n===0?0:Math.min(4,Math.ceil(4*p.n/maxPast));return <li key={p.k} className={'lv'+lvl+(p.k===today?' today':'')} title={`${localDate(p.date.toISOString())}: ${T.attempts(p.n)}`}><span className="visually-hidden">{localDate(p.date.toISOString())}: {p.n}</span></li>;})}</ol>
        <div className="heat-legend" aria-hidden="true"><span>{S.less}</span><i className="lv0"/><i className="lv1"/><i className="lv2"/><i className="lv3"/><i className="lv4"/><span>{S.more}</span></div>
      </section>
      <section className="panel">
        <h2>{S.stagesTitle}</h2><p className="panel-note">{S.stagesNote}</p>
        <ul className="stages">{STAGES.map((s,i)=><li key={s}><span className="stage-name">{T.stages[s]}</span><span className="stage-track"><span className={'stage-fill s'+i} style={{inlineSize:`${100*data.stages[s]/stageTotal}%`}}/></span><b>{data.stages[s]}</b></li>)}</ul>
      </section>
      <section className="panel panel-wide">
        <h2>{S.gradesTitle}</h2>
        {totalGrades?<>
          <p className="panel-note">{S.gradesNote(T.attempts(totalGrades))}</p>
          <div className="stack" aria-hidden="true">{gradeIds.map(g=>data.gradeN[g.id]>0&&<span key={g.id} style={{flexGrow:data.gradeN[g.id],background:gradeColor[g.id]}} title={`${T.grades[g.id].label}: ${data.gradeN[g.id]}`}/>)}</div>
          <ul className="legend">{gradeIds.map(g=><li key={g.id}><i style={{background:gradeColor[g.id]}}/><span>{T.grades[g.id].label}</span><span className="lv"><b>{data.gradeN[g.id]}</b><small>{Math.round(100*data.gradeN[g.id]/totalGrades)}%</small></span></li>)}</ul>
        </>:<p className="panel-note">{S.gradesEmpty}</p>}
      </section>
    </div>
  </div>;
}

/* ───────────── Settings ───────────── */
type InstallPrompt=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
function withTimeout<T>(p:Promise<T>,ms:number,fallback:T){return Promise.race([p,new Promise<T>(r=>setTimeout(()=>r(fallback),ms))]);}
function LanguagePicker({locale,onChange}:{locale:Locale;onChange:(l:Locale)=>void}){
  const refs=useRef<(HTMLButtonElement|null)[]>([]);
  function onKey(e:ReactKeyboardEvent,i:number){
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;
    e.preventDefault();const to=e.key==='Home'?0:e.key==='End'?LOCALES.length-1:(i+1)%LOCALES.length;onChange(LOCALES[to]);
  }
  return <div className="lang-switch" role="radiogroup" aria-label={T.settings.languageTitle}>
    {LOCALES.map((l,i)=><button key={l} ref={el=>{refs.current[i]=el;}} type="button" role="radio" lang={l} dir={dictionaries[l].dir} data-locale={l} aria-checked={locale===l} tabIndex={locale===l?0:-1} onClick={()=>onChange(l)} onKeyDown={e=>onKey(e,i)}>{dictionaries[l].langName}</button>)}
  </div>;
}
function SettingsPage({words,online,lastBackup,setLastBackup,installPrompt,onInstalled,onRestored,notify,locale,onLocale}:{words:Word[];online:boolean;lastBackup:string|null;setLastBackup:(v:string)=>void;installPrompt:InstallPrompt|null;onInstalled:()=>void;onRestored:()=>Promise<unknown>;notify:Notify;locale:Locale;onLocale:(l:Locale)=>void}){
  const St=T.settings;
  const input=useRef<HTMLInputElement>(null);
  const [push,setPush]=useState<string>('checking'),[busy,setBusy]=useState(false),[persisted,setPersisted]=useState<'yes'|'no'|'unsupported'|'checking'>('checking');
  const [permission,setPermission]=useState<string>(typeof Notification!=='undefined'?Notification.permission:'unsupported');
  const [practiceOn,setPracticeOn]=useState(practiceReminders);
  const supported=pushSupported();
  const standalone=typeof window!=='undefined'&&(window.matchMedia('(display-mode: standalone)').matches||(navigator as Navigator&{standalone?:boolean}).standalone===true);
  const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const activeCount=words.filter(w=>!w.archived).length;
  useEffect(()=>{
    void withTimeout(pushState(),4000,'disabled').then(setPush).catch(()=>setPush('disabled'));
    if(navigator.storage?.persisted)void navigator.storage.persisted().then(v=>setPersisted(v?'yes':'no')).catch(()=>setPersisted('no'));else setPersisted('unsupported');
  },[]);
  async function exportWords(){
    try{const backup=await buildBackup();const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`wordloop-backup-${new Date().toISOString().slice(0,10)}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);await rememberBackup();setLastBackup(new Date().toISOString());notify(St.exported);}
    catch(e){notify(getError(e),'error');}
  }
  async function importWords(file?:File){
    if(!file)return;
    try{
      if(file.size>20*1024*1024){notify(St.tooBig,'error');return;}
      const data=validateBackup(JSON.parse(await file.text()));
      if(!window.confirm(St.confirmRestore(T.cards(data.words.length))))return;
      await restoreBackup(data);await onRestored();notify(St.restored(T.cards(data.words.length)));
    }catch(e){notify(getError(e),'error');}
    finally{if(input.current)input.current.value='';}
  }
  async function notifications(action:'enable'|'disable'|'test'){
    setBusy(true);
    try{
      if(action==='enable'){await enablePush(words);setPush('enabled');notify(St.pushEnabled);}
      else if(action==='disable'){await disablePush();setPush('disabled');notify(St.pushDisabled);}
      else{await testPush();notify(St.pushTested);}
    }catch(e){notify(getError(e),'error');}
    finally{setBusy(false);if(typeof Notification!=='undefined')setPermission(Notification.permission);}
  }
  async function protectStorage(){
    try{if(!navigator.storage?.persist){setPersisted('unsupported');notify(St.storageUnsupported,'error');return;}
      const granted=await navigator.storage.persist();setPersisted(granted?'yes':'no');
      notify(granted?St.storageGranted:St.storageDenied,granted?'ok':'error');
    }catch(e){notify(getError(e),'error');}
  }
  async function install(){if(!installPrompt)return;await installPrompt.prompt();const c=await installPrompt.userChoice;if(c.outcome==='accepted')onInstalled();}
  const checks:{ok:boolean|null;label:string;help?:string}[]=[
    {ok:supported,label:St.checkSupport,help:supported?undefined:ios?St.checkSupportIos:St.checkSupportOther},
    ...(ios?[{ok:standalone,label:St.checkHome,help:standalone?undefined:St.checkHomeHelp}]:[]),
    {ok:permission==='granted'?true:permission==='denied'?false:null,label:permission==='denied'?St.permDenied:permission==='granted'?St.permGranted:St.permAsk,help:permission==='denied'?St.permDeniedHelp:permission==='granted'?undefined:St.permAskHelp},
    {ok:online,label:online?St.onlineLabel:T.offline,help:online?undefined:St.offlineHelp},
  ];
  return <div className="page settings">
    <PageHead title={St.title} lead={St.lead}/>
    <section className="privacy-hero" id="privacy" aria-labelledby="privacy-title"><Wash tone="cool"/><ShieldCheck size={28} strokeWidth={1.6} aria-hidden="true"/><div>
      <h2 id="privacy-title">{St.privacyTitle}</h2><p>{St.privacyBody}</p>
      <dl className="privacy-list">{St.privacyItems.map(([dt,dd])=><div key={dt}><dt>{dt}</dt><dd>{dd}</dd></div>)}</dl>
    </div></section>

    <div className="settings-grid">
      {accessState().mode==='pin'&&<section className="panel" aria-labelledby="access-title">
        <div className="panel-head"><h2 id="access-title"><LogOut size={19} aria-hidden="true"/> {St.accessTitle}</h2></div>
        <p className="panel-note">{St.accessNote}</p>
        <button type="button" className="btn btn-quiet" onClick={()=>void signOut()}><LogOut size={18} aria-hidden="true"/>{St.accessOut}</button>
      </section>}
      <section className="panel" aria-labelledby="lang-title">
        <div className="panel-head"><h2 id="lang-title"><Languages size={19} aria-hidden="true"/> {St.languageTitle}</h2></div>
        <p className="panel-note">{St.languageNote}</p>
        <LanguagePicker locale={locale} onChange={onLocale}/>
      </section>

      <section className="panel" aria-labelledby="backup-title">
        <h2 id="backup-title">{St.backupTitle}</h2>
        <p className="panel-note">{lastBackup?St.lastBackup(localDate(lastBackup)):St.noBackup} {activeCount>0&&St.youHave(T.cards(activeCount))}</p>
        <div className="tiles">
          <button type="button" className="tile" onClick={()=>void exportWords()} disabled={!words.length}><span className="tile-icon warm"><ArrowDownToLine size={21}/></span><span><b>{St.backup}</b><small>{words.length?St.backupHelp:St.backupEmpty}</small></span></button>
          <button type="button" className="tile" onClick={()=>input.current?.click()}><span className="tile-icon mint"><ArrowUpFromLine size={21}/></span><span><b>{St.restore}</b><small>{St.restoreHelp}</small></span></button>
          <input className="visually-hidden" tabIndex={-1} aria-hidden="true" type="file" accept=".json,application/json" ref={input} onChange={e=>void importWords(e.target.files?.[0])}/>
        </div>
        <p className="caution">{St.caution}</p>
      </section>

      <section className="panel" aria-labelledby="push-title">
        <div className="panel-head"><h2 id="push-title">{St.pushTitle}</h2><span className={'state '+(push==='enabled'?'on':'')}>{St.pushState[push]??St.pushState.disabled}</span></div>
        <p className="panel-note">{St.pushNote}</p>
        <ul className="checks">{checks.map(c=><li key={c.label} className={c.ok===true?'ok':c.ok===false?'no':'wait'}><span className="check-dot" aria-hidden="true">{c.ok===true?<Check size={13}/>:c.ok===false?<X size={13}/>:null}</span><span><b>{c.label}</b>{c.help&&<small>{c.help}</small>}</span></li>)}</ul>
        <div className="btn-row">
          {push==='enabled'?<><button type="button" className="btn btn-ink" disabled={busy||!online} onClick={()=>void notifications('test')}><Send size={17}/>{St.testPush}</button><button type="button" className="btn btn-quiet" disabled={busy} onClick={()=>void notifications('disable')}><BellOff size={17}/>{St.disablePush}</button></>
            :<button type="button" className="btn btn-ink" disabled={busy||!supported||!online||permission==='denied'||push==='checking'} onClick={()=>void notifications('enable')}><Bell size={17}/>{busy?St.enabling:St.enablePush}</button>}
        </div>
        {push==='enabled'&&<label className="check-row"><input type="checkbox" checked={practiceOn} disabled={busy} onChange={e=>{const on=e.target.checked;setPracticeOn(on);void setPracticeReminders(on).catch(console.warn);}}/><span><b>{St.practiceReminder}</b><small>{St.practiceReminderHelp}</small></span></label>}
        <p className="fine">{St.pushFine}</p>
      </section>

      <section className="panel" aria-labelledby="storage-title">
        <div className="panel-head"><h2 id="storage-title">{St.storageTitle}</h2><span className={'state '+(persisted==='yes'?'on':'')}>{St.storageState[persisted]}</span></div>
        <p className="panel-note">{St.storageNote}</p>
        {persisted!=='yes'&&persisted!=='unsupported'&&<button type="button" className="btn btn-quiet" onClick={()=>void protectStorage()}><HardDrive size={17}/>{St.storageAsk}</button>}
      </section>

      <section className="panel" aria-labelledby="install-title">
        <div className="panel-head"><h2 id="install-title">{St.installTitle}</h2><span className={'state '+(standalone?'on':'')}>{standalone?St.installed:St.inBrowser}</span></div>
        <p className="panel-note">{standalone?St.installedNote:ios?St.installIos:St.installOther}</p>
        {installPrompt&&!standalone&&<button type="button" className="btn btn-quiet" onClick={()=>void install()}><Smartphone size={17}/>{St.installButton}</button>}
      </section>
    </div>
  </div>;
}

/* ───────────── Quick actions (#9) ───────────── */
/**
 * The central + (and the desktop rail button) opens this sheet instead of jumping straight to Add.
 * Native <dialog> gives focus containment and Esc; the browser/phone Back button closes it too.
 * Practice is visible but disabled ("قريبًا") until #13 is approved and built: it never navigates.
 */
function QuickActions({open,onClose,due,nextDue,returnFocus}:{open:boolean;onClose:()=>void;due:number;nextDue:string|null;returnFocus:()=>HTMLElement|null}){
  const Q=T.quick;
  const ref=useRef<HTMLDialogElement>(null);
  const pushed=useRef(false);
  useEffect(()=>{
    const d=ref.current;if(!d)return;
    if(open&&!d.open){
      d.showModal();
      // An extra history entry lets the hardware/browser Back button close the sheet instead of leaving the page.
      history.pushState({wlSheet:true},'',location.href);pushed.current=true;
      d.querySelector<HTMLButtonElement>('.qa-item:not([aria-disabled=true])')?.focus();
    }
    if(!open&&d.open){d.close();returnFocus()?.focus();}
  },[open,returnFocus]);
  useEffect(()=>{
    const onPop=()=>{if(pushed.current){pushed.current=false;onClose();}};
    window.addEventListener('popstate',onPop);return()=>window.removeEventListener('popstate',onPop);
  },[onClose]);
  /** Dismiss: undo our history entry (its popstate closes the sheet). */
  const dismiss=useCallback(()=>{if(pushed.current&&history.state?.wlSheet)history.back();else{pushed.current=false;onClose();}},[onClose]);
  /** Choose: replace our history entry with the destination so Back returns to where the user was. */
  function choose(p:Page|typeof HUB){
    pushed.current=false;onClose();
    const target=p==='home'?'#/':'#/'+p;
    if(location.hash===target||(p==='home'&&!location.hash)){history.replaceState(null,'',location.href.split('#')[0]+target);return;}
    location.replace(target); // fires hashchange → page switch
  }
  const items:{id:string;label:string;note:string;icon:typeof Home;tone:string;onSelect?:()=>void;soon?:boolean}[]=[
    {id:'add',label:Q.add,note:Q.addNote,icon:Plus,tone:'ink',onSelect:()=>choose('add')},
    due>0
      ?{id:'review',label:Q.reviewNow,note:Q.waiting(due),icon:Layers3,tone:'mint',onSelect:()=>choose('review')}
      :{id:'review',label:Q.review,note:nextDue?Q.nothingDue(relative(nextDue)):Q.noCards,icon:Layers3,tone:'mint',onSelect:()=>choose('review')},
    {id:'practice',label:Q.practice,note:Q.practiceNote,icon:Headphones,tone:'warm',onSelect:()=>choose(HUB)},
  ];
  return <dialog ref={ref} className="sheet quick-sheet" aria-labelledby="qa-title"
    onCancel={e=>{e.preventDefault();dismiss();}}
    onClick={e=>{if(e.target===e.currentTarget)dismiss();}}>
    <div className="qa-head"><h2 id="qa-title">{Q.title}</h2><button type="button" className="icon-btn ghost" aria-label={T.close} onClick={dismiss}><X size={18}/></button></div>
    <ul className="qa-list">{items.map(it=><li key={it.id}>
      <button type="button" className={'qa-item'+(it.soon?' soon':'')} data-action={it.id} aria-disabled={it.soon||undefined} aria-describedby={'qa-'+it.id} onClick={()=>{if(!it.soon)it.onSelect?.();}}>
        <span className={'nudge-icon '+it.tone}><it.icon size={21}/></span>
        <span className="qa-text"><b>{it.label}{it.soon&&<i className="soon-badge">{Q.soon}</i>}</b><small id={'qa-'+it.id}>{it.note}</small></span>
        {!it.soon&&<Fwd size={18}/>}
      </button>
    </li>)}</ul>
  </dialog>;
}

/* ───────────── Back (#42) ───────────── */
type BackTo={target:string;label:string};
/** Human name of an in-app route, for «رجوع إلى …». */
function routeLabel(route:string,lib:Library,passages:readonly Passage[]=[]):string{
  const [h,...rest]=route.split('/'),page=(PAGES.includes(h as Page)?h:'home') as Page,sub=rest.join('/');
  if(page==='words'){
    const v=parseLibrary(sub);
    if(v.kind==='folder'){const f=lib.folders.find(x=>x.id===v.id);if(f)return folderName(f);}
    if(v.kind==='deck'){const d=lib.decks.find(x=>x.id===v.id);if(d)return deckName(d);}
    if(v.kind==='texts')return T.texts.title;
    if(v.kind==='landing')return T.nav.practice;
    if(v.kind==='hub')return T.setup.read.title;
    if(v.kind==='listen')return T.setup.listen.title;
    if(v.kind==='passage'||v.kind==='story'){const p=passages.find(x=>x.id===v.id);if(p)return p.title;}
    if(v.kind==='pick')return T.story.picker.title;
    if(v.kind==='gen')return T.story.title;
  }
  return T.nav[page];
}
/**
 * Where «رجوع» leads from each screen: a clear parent when there is one (folder → library, deck → its folder,
 * add-to-deck → that deck, scoped review → its folder/deck); otherwise the previous in-app screen, or Home.
 * Top-level tabs (Home, Library, Progress) have no Back — the tab bar is their navigation.
 */
function backFor(page:Page,sub:string,lib:Library,passages:readonly Passage[]=[]):BackTo|null{
  const to=(target:string):BackTo=>({target,label:routeLabel(target,lib,passages)});
  const previousOr=(fallback:string)=>{const p=previousRoute();return to(p!==null&&p!==currentRoute()?p:fallback);};
  if(page==='words'){
    const v=parseLibrary(sub);
    if(v.kind==='folder')return to('words');
    // #61: a deck's texts in Practice → Practice; Practice itself → wherever the learner came from.
    if(v.kind==='landing')return previousOr('');
    if(v.kind==='hub'||v.kind==='listen')return to(HUB);
    // #64: word selection, generation and a story → Reading.
    if(v.kind==='pick'||v.kind==='gen'||v.kind==='story')return to(HUB+'/read');
    // #21: texts → their deck; a text → the deck's texts; the editor → the text (or the list for a new one).
    if(v.kind==='texts'||v.kind==='lesson')return to(deckPath(v.deckId));
    if(v.kind==='passage')return to(textsPath(v.deckId));
    if(v.kind==='practice'){const s=readPlan()?.stories.some(x=>x.passageId===v.id);return to(s?storyPath(v.deckId,v.id):passagePath(v.deckId,v.id));}
    if(v.kind==='passageEdit')return to(v.id&&passages.some(p=>p.id===v.id)?passagePath(v.deckId,v.id):textsPath(v.deckId));
    if(v.kind==='deck'){const d=lib.decks.find(x=>x.id===v.id);return to(d&&lib.folders.some(f=>f.id===d.folderId)?folderPath(d.folderId):'words');}
    return null;
  }
  if(page==='add'){
    // #28: the bulk page steps back to the single-card Add of the same deck.
    if(sub==='bulk'||sub.startsWith('bulk/')){const id=decodeURIComponent(sub.slice(5));return to(id&&lib.decks.some(d=>d.id===id)?'add/'+encodeURIComponent(id):'add');}
    const id=decodeURIComponent(sub);return id&&lib.decks.some(d=>d.id===id)?to(deckPath(id)):previousOr('');
  }
  if(page==='review'){
    const [k,raw]=sub.split('/'),id=raw?decodeURIComponent(raw):'';
    if(k==='d'&&lib.decks.some(d=>d.id===id))return to(deckPath(id));
    if(k==='f'&&lib.folders.some(f=>f.id===id))return to(folderPath(id));
    return previousOr('');
  }
  if(page==='settings')return previousOr('');
  return null;
}
function BackBar({back}:{back:BackTo}){
  const label=T.backTo(back.label);
  return <nav className="backbar" aria-label={T.backNav}>
    <button type="button" className="back-btn" aria-label={label} onClick={()=>guardLeave(()=>stepBackTo(back.target))}>
      <BackArrow size={20}/><span className="back-word">{T.back}</span><span className="back-dest" dir="auto">{back.label}</span>
    </button>
  </nav>;
}

/* ───────────── App update (#41) ───────────── */
/** A calm card above the tab bar when a new version is ready. One action; «لاحقًا» hides it until the next launch. */
function UpdatePrompt(){
  const U=T.update;
  const [status,setStatus]=useState<UpdateStatus>(updateStatus);
  useEffect(()=>onUpdateStatus(setStatus),[]);
  if(status==='idle')return null;
  const now=()=>guardLeave(applyUpdate); // unsaved text first asks (#42); nothing reloads by itself
  return <section className={'update-card'+(status==='failed'?' failed':'')} role="status" aria-live="polite" aria-labelledby="upd-title">
    <span className="update-icon" aria-hidden="true"><RotateCcw size={18}/></span>
    <div className="update-text">
      <b id="upd-title">{status==='elsewhere'?U.elsewhereTitle:U.title}</b>
      <small>{status==='failed'?U.failed:status==='elsewhere'?U.elsewhereBody:status==='updating'?U.updating:U.body}</small>
    </div>
    <div className="update-actions">
      <button type="button" className="btn btn-ink sm" onClick={now} disabled={status==='updating'} aria-busy={status==='updating'||undefined}>
        {status==='failed'?U.retry:status==='elsewhere'?U.reload:U.now}</button>
      {status!=='updating'&&<button type="button" className="btn btn-quiet sm" onClick={dismissUpdate}>{U.later}</button>}
    </div>
  </section>;
}

/* ───────────── Shell ───────────── */
export default function App(){
  const [locale,setLocaleState]=useState<Locale>(storedLocale);
  T=dictionaries[locale];
  const [page,setPage]=useState<Page>(readHash),[sub,setSub]=useState(readSub),[lib,setLib]=useState<Library>({folders:[],decks:[]}),[words,setWords]=useState<Word[]>([]),[reviews,setReviews]=useState<Review[]>([]),[passages,setPassages]=useState<Passage[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [online,setOnline]=useState(()=>navigator.onLine),[toast,setToast]=useState<{id:number;text:string;tone:'ok'|'error'}|null>(null),[lastBackup,setLastBackup]=useState<string|null>(null),[installPrompt,setInstallPrompt]=useState<InstallPrompt|null>(null);
  const first=useRef(true);
  useKeyboardInset();
  const latest=useRef(0),[loadedOnce,setLoadedOnce]=useState(false);
  const fetchLocal=useCallback(async():Promise<Word[]|null>=>{
    // #4: overlapping refreshes (focus, resume, other tab, after save) must not let an older read overwrite a newer one.
    const ticket=++latest.current;
    try{const [w,r,l,p]=await Promise.all([listWords(),listReviews(),listLibrary(),listPassages()]);if(ticket===latest.current){setWords(w);setReviews(r);setLib(l);setPassages(p);setError('');setLoadedOnce(true);setPracticeAvailable(p.length>0);void syncPush(w).catch(console.warn);}return w;}
    catch(e){if(ticket===latest.current)setError(getError(e));return null;}
    finally{if(ticket===latest.current)setLoading(false);}
  },[]);
  useEffect(()=>{
    void fetchLocal();void lastBackupDate().then(setLastBackup).catch(()=>null);
    // #4: iOS PWAs often resume without a window "focus" event, so also refresh on visibility/pageshow and on writes from other tabs.
    const focus=()=>{void fetchLocal();},visible=()=>{if(document.visibilityState==='visible')void fetchLocal();},hash=()=>{
      // #42: Back gesture, browser Back or a link left a form with typed text: put the route back and ask first.
      const next=currentRoute(),here=trail[trail.length-1];
      if(here!==undefined&&next!==here&&hasUnsaved()&&Date.now()-leaveConfirmedAt>1500){
        history.pushState(null,'','#/'+here);
        askLeave(()=>{confirmLeave();if(previousRoute()===next)history.back();else{replacingRoute=true;window.location.replace('#/'+next);}});
        return;
      }
      recordRoute();setPage(readHash());setSub(readSub());
    },on=()=>{setOnline(true);void fetchLocal();},off=()=>setOnline(false);
    const stopListening=onOtherTabChange(()=>{void fetchLocal();});
    const bip=(e:Event)=>{e.preventDefault();setInstallPrompt(e as InstallPrompt);};
    window.addEventListener('focus',focus);document.addEventListener('visibilitychange',visible);window.addEventListener('pageshow',focus);window.addEventListener('hashchange',hash);window.addEventListener('online',on);window.addEventListener('offline',off);window.addEventListener('beforeinstallprompt',bip);
    // A hash navigation during initial hydration can precede registration of hashchange.
    // Reconcile the current URL once after listeners mount, preventing URL/UI mismatch in WebKit.
    hash();
    return()=>{stopListening();window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',visible);window.removeEventListener('pageshow',focus);window.removeEventListener('hashchange',hash);window.removeEventListener('online',on);window.removeEventListener('offline',off);window.removeEventListener('beforeinstallprompt',bip);};
  },[fetchLocal]);
  // #6: the document itself follows the UI language (screen readers, hyphenation, scrollbars, form controls).
  useEffect(()=>{document.documentElement.lang=locale;document.documentElement.dir=T.dir;},[locale]);
  useEffect(()=>{document.title=page==='home'?T.docTitleHome:`${T.nav[page]} · WordLoop`;if(first.current){first.current=false;return;}window.scrollTo({top:0});requestAnimationFrame(()=>{
    // Move focus to the new page's heading for screen readers, but never steal it from a field the user already focused on this page.
    const main=document.querySelector('main'),active=document.activeElement;
    if(main&&active&&active!==document.body&&main.contains(active)&&!active.matches('h1'))return;
    main?.querySelector<HTMLElement>('h1')?.focus({preventScroll:true});
  });},[page,sub,locale]);
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(null),toast.tone==='error'?7000:4200);return()=>clearTimeout(t);},[toast]);
  const notify=useCallback<Notify>((text,tone='ok')=>setToast({id:Date.now(),text,tone}),[]);
  useEffect(()=>{speechNotice=text=>notify(text,'error');},[notify]);
  const changeLocale=useCallback((l:Locale)=>{if(l===locale)return;storeLocale(l);setLocaleState(l);setError('');setToast({id:Date.now(),text:dictionaries[l].settings.languageChanged,tone:'ok'});void syncPush(words).catch(console.warn); /* #30: notification language follows the interface */},[locale,words]);
  const navigate=(to:Page)=>{if(to===page&&!sub){window.scrollTo({top:0,behavior:'smooth'});return;}guardLeave(()=>{window.location.hash=to==='home'?'/':'/'+to;});};
  const go=useCallback((path:string)=>{guardLeave(()=>{window.location.hash='/'+path;});},[]);
  /** #74: navigation items. «الممارسة» opens the existing Practice hub; tapping it there again just scrolls to the top. */
  const navTo=(id:NavId)=>{if(id!=='practice'){navigate(id);return;}if(page==='words'&&sub==='practice'){window.scrollTo({top:0,behavior:'smooth'});return;}go(HUB);};
  // #42: one «unsaved changes» question for every way out (Back button, tabs, Back gesture, Cancel on a sheet).
  const [leave,setLeave]=useState<{proceed:()=>void}|null>(null);
  useEffect(()=>{askLeave=proceed=>setLeave({proceed});return()=>{askLeave=proceed=>proceed();};},[]);
  const back=loading?null:backFor(page,sub,lib,passages);
  // #9 (contextual +): inside a deck, + adds a card to that deck directly, with no intermediate menu.
  const ctxView=page==='words'?parseLibrary(sub):null,ctxDeck=ctxView?.kind==='deck'&&lib.decks.some(d=>d.id===ctxView.id)?ctxView.id:null;
  const onAdd=(e:{currentTarget:HTMLElement})=>{if(ctxDeck)go('add/'+encodeURIComponent(ctxDeck));else openQuick(e);};
  const due=summary(words,reviews).dueNow;
  const nextDue=useMemo(()=>{const t=Date.now();return words.filter(w=>!w.archived&&Date.parse(w.dueAt)>t).map(w=>w.dueAt).sort()[0]??null;},[words]);
  const [quickOpen,setQuickOpen]=useState(false);
  const quickTrigger=useRef<HTMLElement|null>(null);
  const openQuick=(e:{currentTarget:HTMLElement})=>{quickTrigger.current=e.currentTarget;setQuickOpen(true);};
  const closeQuick=useCallback(()=>setQuickOpen(false),[]);
  const quickReturn=useCallback(()=>quickTrigger.current,[]);

  let content:ReactNode;
  if(loading)content=<div className="skeleton" aria-busy="true" aria-label={T.loading}><span className="sk sk-hero"/><span className="sk sk-row"/><span className="sk sk-row short"/></div>;
  else if(error&&!loadedOnce)content=<div className="empty fatal" role="alert"><Wash tone="warm"/><CloudOff size={30} strokeWidth={1.6}/><h2>{T.fatalTitle}</h2><p>{error}</p><button type="button" className="btn btn-ink" onClick={()=>{setLoading(true);void fetchLocal();}}><RotateCcw size={17}/>{T.tryAgain}</button></div>;
  else content=page==='home'?<HomePage words={words} reviews={reviews} lib={lib} lastBackup={lastBackup} onNavigate={navigate} go={go}/>
    :page==='add'&&(sub==='bulk'||sub.startsWith('bulk/'))?<BulkAddPage key={sub} words={words} lib={lib} deckParam={decodeURIComponent(sub.slice(5))} onSaved={fetchLocal} notify={notify} go={go}/>
    :page==='add'?<AddPage key={sub} words={words} lib={lib} deckParam={decodeURIComponent(sub)} onSaved={fetchLocal} notify={notify} go={go}/>
    :page==='review'?<ReviewPage key={sub} words={words} lib={lib} scope={parseScope(sub,lib)} onReviewed={fetchLocal} onNavigate={navigate} go={go}/>
    :page==='words'?<LibraryPage words={words} reviews={reviews} lib={lib} passages={passages} sub={sub} onChanged={fetchLocal} notify={notify} go={go}/>
    :page==='stats'?<StatsPage words={words} reviews={reviews} onNavigate={navigate}/>
    :<SettingsPage words={words} online={online} lastBackup={lastBackup} setLastBackup={setLastBackup} installPrompt={installPrompt} onInstalled={()=>setInstallPrompt(null)} onRestored={fetchLocal} notify={notify} locale={locale} onLocale={changeLocale}/>;

  // key={locale}: switching language remounts the UI so every component reads the new dictionary. Card data lives in this component and is untouched.
  return <div className="app" dir={T.dir} lang={locale} key={locale}>
    <a href="#main" className="skip">{T.skip}</a>
    <aside className="rail">
      <a href="#/" className="rail-brand" aria-label={T.homeLink}><Logo/></a>
      <p className="rail-tagline">{T.tagline}</p>
      <button type="button" className="btn btn-ink rail-add" aria-haspopup={ctxDeck?undefined:'dialog'} aria-expanded={ctxDeck?undefined:quickOpen} onClick={onAdd}><Plus size={18}/>{ctxDeck?T.lib.addCard:T.addOrReview}</button>
      <nav aria-label={T.navMain}><ul>{navItems.map(item=><li key={item.id}><button type="button" onClick={()=>navTo(item.id)} className={'rail-link'+(navActive(item.id,page,sub)?' on':'')} aria-current={navActive(item.id,page,sub)?'page':undefined}><item.icon size={20} strokeWidth={1.8}/><span>{T.nav[item.id]}</span>{item.id==='review'&&due>0&&<b className="count" aria-label={T.dueBadge(due)}>{due}</b>}</button></li>)}</ul></nav>
      <div className="rail-foot"><span className={'net'+(online?'':' off')}>{online?<Wifi size={14}/>:<WifiOff size={14}/>}{online?T.online:T.offline}</span><button type="button" className="rail-privacy" onClick={()=>navigate('settings')}><ShieldCheck size={14} aria-hidden="true"/>{T.settings.privacyTitle}</button></div>
    </aside>
    <div className="main-col">
      <header className="topbar">
        <a href="#/" aria-label={T.homeLink}><Logo/></a>
        <div className="topbar-end">
          {import.meta.env.VITE_WORDLOOP_STAGE==='true'&&<span className="staging-pill" title={T.stagingTitle}>{T.staging}</span>}
          {!online&&<span className="net off"><WifiOff size={14}/>{T.offline}</span>}
          <button type="button" className={'icon-btn'+(page==='settings'?' on':'')} aria-label={T.nav.settings} title={T.nav.settings} aria-current={page==='settings'?'page':undefined} onClick={()=>navigate('settings')}><Settings size={21} strokeWidth={1.8}/></button>
        </div>
      </header>
      {!online&&<p className="offline-note" role="status"><WifiOff size={15}/>{T.offlineNote}</p>}
      <main id="main" className="content" key={page}>
        {error&&loadedOnce&&<div className="banner" role="alert"><span>{error}</span><button type="button" className="icon-btn ghost" onClick={()=>setError('')} aria-label={T.close}><X size={16}/></button></div>}
        {back&&<BackBar back={back}/>}
        {content}
      </main>
    </div>
    <nav className="tabbar" aria-label={T.navTabs}>
      {(['home','review','add','practice','words','stats'] as (NavId)[]).map(id=>{
        if(id==='add')return <button key={id} type="button" className="tab-add" aria-haspopup={ctxDeck?undefined:'dialog'} aria-expanded={ctxDeck?undefined:quickOpen} onClick={onAdd} aria-label={ctxDeck?T.lib.addCard:T.quickLabel} aria-current={page==='add'?'page':undefined}><Plus size={26}/></button>;
        const item=navItems.find(n=>n.id===id)!;
        return <button key={id} type="button" className={'tab'+(navActive(id,page,sub)?' on':'')} aria-current={navActive(id,page,sub)?'page':undefined} onClick={()=>navTo(id)}><span className="tab-icon"><item.icon size={21} strokeWidth={1.8}/>{id==='review'&&due>0&&<b className="dot-count">{due>99?'99+':due}</b>}</span><span>{T.nav[id]}</span></button>;
      })}
    </nav>
    <ConfirmDialog open={!!leave} title={T.leave.title} body={T.leave.body} confirm={T.leave.yes} cancel={T.leave.stay}
      onConfirm={()=>{const l=leave;setLeave(null);l?.proceed();}} onCancel={()=>setLeave(null)}/>
    <QuickActions open={quickOpen} onClose={closeQuick} due={due} nextDue={nextDue} returnFocus={quickReturn}/>
    <UpdatePrompt/>
    <div className="toast-zone" aria-live="polite">{toast&&<div key={toast.id} className={'toast '+toast.tone} role={toast.tone==='error'?'alert':'status'}><span>{toast.text}</span><button type="button" className="icon-btn ghost" aria-label={T.closeToast} onClick={()=>setToast(null)}><X size={16}/></button></div>}</div>
  </div>;
}

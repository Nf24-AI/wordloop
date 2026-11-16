import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState,type CSSProperties,type FocusEvent as ReactFocusEvent,type FormEvent,type KeyboardEvent as ReactKeyboardEvent,type ReactNode} from 'react';
import {Archive,ArrowDownToLine,ArrowLeft,ArrowRight,ArrowUpFromLine,Bell,BellOff,BookOpen,CalendarClock,Check,ChevronDown,CloudOff,Download,Folder as FolderIcon,FolderInput,FolderPlus,HardDrive,Headphones,Home,Languages,Layers3,Lightbulb,LineChart,MoreHorizontal,Pencil,Plus,RotateCcw,Search,Send,Settings,ShieldCheck,Smartphone,Snail,Square,Trash2,Volume2,Wifi,WifiOff,X} from 'lucide-react';
import {addWord,archiveWord,buildBackup,cardLanguages,CONTENT_TYPES,createDeck,createFolder,DEFAULT_CONTENT_LANGUAGE,DEFAULT_DECK_ID,DEFAULT_DECK_NAME,DEFAULT_FOLDER_ID,DEFAULT_FOLDER_NAME,DEFAULT_MEANING_LANGUAGE,deleteDeck,deleteFolder,dueInScope,editWord,inScope,inferContentType,lastBackupDate,libraryCounts,listLibrary,listReviews,listWords,MAX_MEANINGS,moveWord,normalizeTerm,NOTE_LIMIT,onOtherTabChange,rememberBackup,renameFolder,restoreBackup,reviewWord,scopedSummary,summary,TERM_LIMIT,updateDeck,validateBackup,type CardEdit,type ContentType,type Deck,type Folder,type Grade,type Review,type ReviewScope,type Word} from './data';
import {pickVoice,RATE} from './voice';
import {applyUpdate,dismissUpdate,onUpdateStatus,updateStatus,type UpdateStatus} from './update';
import {disablePush,enablePush,pushState,pushSupported,syncPush,testPush} from './push';
import {dictionaries,errorKeys,LOCALES,storedLocale,storeLocale,type Dict,type Locale} from './i18n';

/* ───────────── Language (#6) ─────────────
 * The active dictionary. App sets it from its `locale` state on every render and remounts the tree
 * when the language changes, so every component reads the current language without prop threading. */
let T:Dict=dictionaries[storedLocale()];

/* ───────────── Navigation ───────────── */
type Page='home'|'review'|'words'|'add'|'stats'|'settings';
const PAGES:Page[]=['home','review','words','add','stats','settings'];
const navItems:{id:Page;icon:typeof Home}[]=[
  {id:'home',icon:Home},{id:'review',icon:Layers3},{id:'words',icon:BookOpen},{id:'stats',icon:LineChart},{id:'settings',icon:Settings},
];
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
  if(e instanceof TypeError&&/fetch|network/i.test(e.message))return E.network;
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
function SpeakButton({text,label,lang,className='icon-btn',slower=true}:{text:string;label:string;lang:string;className?:string;slower?:boolean}){
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
    {playing==='normal'?<Square size={16} strokeWidth={2.2}/>:<Volume2 size={19} strokeWidth={1.8}/>}</button>;
  if(!slower)return main;
  return <span className="speak-group">{main}{heard&&<button type="button" className={'slow-btn'+(playing==='slow'?' is-playing':'')} aria-label={playing==='slow'?T.speech.stop:T.speech.slowerLabel(text)} onClick={()=>play('slow')}>
    {playing==='slow'?<Square size={13} strokeWidth={2.4}/>:<Snail size={15} strokeWidth={1.9}/>}<span>{T.speech.slower}</span></button>}</span>;
}
function PageHead({title,lead,children}:{title:string;lead?:string;children?:ReactNode}){
  return <header className="page-head"><div><h1 tabIndex={-1}>{title}</h1>{lead&&<p className="lead">{lead}</p>}</div>{children}</header>;
}
function ConfirmDialog({open,title,body,confirm,cancel,onConfirm,onCancel}:{open:boolean;title:string;body:string;confirm:string;cancel:string;onConfirm:()=>void;onCancel:()=>void}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const d=ref.current;if(!d)return;if(open&&!d.open)d.showModal();if(!open&&d.open)d.close();},[open]);
  return <dialog ref={ref} className="sheet" onCancel={e=>{e.preventDefault();onCancel();}} aria-labelledby="sheet-title">
    <h2 id="sheet-title">{title}</h2><p>{body}</p>
    <div className="sheet-actions"><button type="button" className="btn btn-danger" onClick={onConfirm}>{confirm}</button><button type="button" className="btn btn-quiet" onClick={onCancel} autoFocus>{cancel}</button></div>
  </dialog>;
}

/* ───────────── Home ───────────── */
function HomePage({words,reviews,decks,lastBackup,onNavigate}:{words:Word[];reviews:Review[];decks:readonly Deck[];lastBackup:string|null;onNavigate:(p:Page)=>void}){
  const termProps=(w:Word)=>{const l=contentLang(w,decks);return {dir:dirOf(l),lang:l};};
  const H=T.home;
  const stats=summary(words,reviews),now=Date.now();
  const active=useMemo(()=>words.filter(w=>!w.archived),[words]);
  const dueWords=active.filter(w=>isDue(w,now));
  const upcoming=active.filter(w=>!isDue(w,now)).sort((a,b)=>a.dueAt.localeCompare(b.dueAt));
  const lastAdded=active.reduce<Word|undefined>((a,w)=>!a||w.createdAt>a.createdAt?w:a,undefined);
  const dayIndex=Math.floor(new Date(dayKey(new Date(now))).getTime()/DAY);
  const backupStale=active.length>=5&&(!lastBackup||now-new Date(lastBackup).getTime()>14*DAY);

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
      {lastAdded&&<button type="button" className="nudge home-card" data-home="last-added" onClick={()=>onNavigate('words')}>
        <span className="nudge-icon mint"><BookOpen size={20}/></span>
        <span><small className="eyebrow">{H.lastAddedTitle}</small><b {...termProps(lastAdded)} className="home-term">{lastAdded.term}</b><small><i className="kind-badge">{kindLabel(lastAdded.contentType)}</i> <span dir="auto">{lastAdded.meanings.join('؛ ')}</span></small><small>{H.addedWhen(daysBetween(lastAdded.createdAt,now),localDate(lastAdded.createdAt))}</small></span>
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
function LangBox({id,lang,label,value,onChange,placeholder,maxLength,invalid,describedBy,boxRef,onRemove,removeLabel}:{id:string;lang:string;label:string;value:string;onChange:(v:string)=>void;placeholder?:string;maxLength:number;invalid?:boolean;describedBy?:string;boxRef?:(el:HTMLTextAreaElement|null)=>void;onRemove?:()=>void;removeLabel?:string}){
  const ref=useRef<HTMLTextAreaElement|null>(null);
  useLayoutEffect(()=>{const el=ref.current;if(el){el.style.height='auto';el.style.height=el.scrollHeight+'px';}},[value]);
  return <div className={'lang-box'+(invalid?' invalid':'')}>
    <label htmlFor={id} className="visually-hidden">{label} · {langName(lang)}</label>
    <span className="lang-badge" dir="ltr" aria-hidden="true">{langCode(lang)}</span>
    <textarea ref={el=>{ref.current=el;boxRef?.(el);}} id={id} rows={1} dir={isRtl(lang)?'rtl':'ltr'} lang={lang} autoComplete="off" autoCapitalize="none" spellCheck={false}
      maxLength={maxLength} placeholder={placeholder} value={value} onChange={e=>onChange(e.target.value)} aria-invalid={invalid||undefined} aria-describedby={describedBy}
      onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();e.currentTarget.form?.requestSubmit();}}}/>
    <SpeakButton text={value} lang={lang} label={T.listen(value.trim()||label)} className="icon-btn box-icon" slower={false}/>
    {onRemove&&<button type="button" className="icon-btn box-icon" aria-label={removeLabel} title={removeLabel} onClick={onRemove}><X size={18}/></button>}
  </div>;
}

/** #42: the Add form's unsaved text, kept on this device only (localStorage), never in IndexedDB or the cloud. */
const ADD_DRAFT='wordloop-add-draft';
type AddDraft={deckParam:string;term:string;meanings:string[];example:string};
function readAddDraft(deckParam:string):AddDraft|null{
  try{const d=JSON.parse(localStorage.getItem(ADD_DRAFT)||'null');
    if(d&&d.deckParam===deckParam&&typeof d.term==='string'&&Array.isArray(d.meanings)&&d.meanings.length&&d.meanings.every((m:unknown)=>typeof m==='string')&&typeof d.example==='string')return {...d,meanings:d.meanings.slice(0,MAX_MEANINGS)};
  }catch{/* unreadable draft: start empty */}
  return null;
}
function writeAddDraft(d:AddDraft|null){try{if(d)localStorage.setItem(ADD_DRAFT,JSON.stringify(d));else localStorage.removeItem(ADD_DRAFT);}catch{/* private mode */}}
function AddPage({words,lib,deckParam,onSaved,notify,go}:{words:Word[];lib:Library;deckParam:string;onSaved:()=>Promise<Word[]|null>;notify:Notify;go:(path:string)=>void}){
  const A=T.add,F=T.addForm;
  const [deckId,setDeckId]=useState(()=>initialDeck(lib,deckParam));
  const deck=lib.decks.find(d=>d.id===deckId)??lib.decks.find(d=>d.id===DEFAULT_DECK_ID);
  // Languages come from the deck (#15/#16); an optional override applies to the cards saved from this form until reset.
  const [override,setOverride]=useState<{content:string;meaning:string}|null>(null),[langOpen,setLangOpen]=useState(false);
  const content=override?.content??deck?.contentLanguage??DEFAULT_CONTENT_LANGUAGE,meaningLang=override?.meaning??deck?.meaningLanguage??DEFAULT_MEANING_LANGUAGE;
  const [lastDeck,setLastDeck]=useState<string|null>(null);
  // #42: typed text survives Back, a refresh or iOS closing the PWA in the background; cleared on save or when leaving the page.
  const [draft]=useState(()=>readAddDraft(deckParam));
  const [term,setTerm]=useState(draft?.term??''),[meanings,setMeanings]=useState<string[]>(draft?.meanings??['']),[example,setExample]=useState(draft?.example??''),[showExample,setShowExample]=useState(!!draft?.example);
  const unsaved=!!(term.trim()||meanings.some(m=>m.trim())||example.trim());
  useEffect(()=>{writeAddDraft(unsaved?{deckParam,term,meanings,example}:null);},[unsaved,deckParam,term,meanings,example]);
  useEffect(()=>()=>{if(!document.hidden)writeAddDraft(null);},[]);
  const [loading,setLoading]=useState(false),[error,setError]=useState(''),[tried,setTried]=useState(false),[saved,setSaved]=useState<string|null>(null),[unsynced,setUnsynced]=useState<Word|null>(null);
  const termRef=useRef<HTMLTextAreaElement|null>(null),meaningRefs=useRef<(HTMLTextAreaElement|null)[]>([]),focusMeaning=useRef<number|null>(null),exampleRef=useRef<HTMLTextAreaElement|null>(null);
  const kind=inferContentType(term),limit=TERM_LIMIT[kind];
  const duplicate=term.trim()?words.find(w=>!w.archived&&normalizeTerm(w.term)===normalizeTerm(term)):undefined;
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
      word=await addWord({contentType:kind,deckId:target,term,meanings,example:showExample?example:'',translation:'',tag:'',
        ...(override&&override.content!==deck?.contentLanguage?{contentLanguage:override.content}:{}),...(override&&override.meaning!==deck?.meaningLanguage?{meaningLanguage:override.meaning}:{})});
      try{localStorage.setItem(LAST_DECK,target);}catch{/* private mode */}setLastDeck(target);
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
  const termHint=tried&&!term.trim()?F.missingTerm:tooLong?F.tooLong(limit):duplicate?F.duplicate:'';
  return <div className="page add-page">
    <PageHead title={F.title} lead={F.lead}/>
    <form className="word-form add-form" onSubmit={submit} data-unsaved={unsaved&&!loading?'true':undefined} noValidate>
      <div className="add-target">
        <DeckPicker lib={lib} value={deckId} onChange={id=>{setDeckId(id);setOverride(null);}}/>
        <button type="button" className="lang-pair" aria-expanded={langOpen} aria-controls="lang-override" onClick={()=>setLangOpen(o=>!o)}>
          <span dir="ltr">{langCode(content)} → {langCode(meaningLang)}</span><small>{F.changeLang}</small><ChevronDown size={16} className="chev" aria-hidden="true"/>
        </button>
      </div>
      {langOpen&&<div className="lang-override" id="lang-override">
        <div className="field"><label htmlFor="add-content-lang">{F.contentLangShort}</label><LanguageSelect id="add-content-lang" value={content} onChange={v=>setOverride({content:v,meaning:meaningLang})}/></div>
        <div className="field"><label htmlFor="add-meaning-lang">{F.meaningLangShort}</label><LanguageSelect id="add-meaning-lang" value={meaningLang} onChange={v=>setOverride({content,meaning:v})}/></div>
        <p className="hint">{override?<>{F.overrideNote} <button type="button" className="link-btn" onClick={()=>setOverride(null)}>{F.useDeckLang}</button></>:F.deckLangNote}</p>
      </div>}
      <LangBox id="term" lang={content} label={F.termLabel} value={term} onChange={v=>{setTerm(v);touched();}} placeholder={phFor(TERM_PH,content)} maxLength={TERM_LIMIT.sentence}
        invalid={!!termHint} describedBy={termHint?'term-hint':undefined} boxRef={el=>{termRef.current=el;}}/>
      {termHint&&<p id="term-hint" className="hint box-hint" role="alert">{termHint}</p>}
      {meanings.map((m,i)=><LangBox key={i} id={i?'meaning-'+i:'meaning'} lang={meaningLang} label={F.meaningLabel(i+1,meanings.length)} value={m} placeholder={i?'':phFor(MEANING_PH,meaningLang)} maxLength={240}
        onChange={v=>{setMeanings(ms=>ms.map((x,j)=>j===i?v:x));touched();}} invalid={tried&&!hasMeaning&&i===0} describedBy={tried&&!hasMeaning&&i===0?'meaning-hint':undefined}
        boxRef={el=>{meaningRefs.current[i]=el;}} onRemove={meanings.length>1?()=>removeMeaning(i):undefined} removeLabel={F.removeMeaning(i+1)}/>)}
      {tried&&!hasMeaning&&<p id="meaning-hint" className="hint box-hint" role="alert">{F.missingMeaning}</p>}
      <div className="add-more-row">
        {meanings.length<MAX_MEANINGS&&<button type="button" className="add-more" onClick={addMeaning}><Plus size={18} aria-hidden="true"/>{F.addMeaning}</button>}
        {!showExample&&<button type="button" className="add-more" onClick={()=>setShowExample(true)}><Plus size={18} aria-hidden="true"/>{F.addExample}</button>}
      </div>
      {showExample&&<LangBox id="example" lang={content} label={F.exampleLabel} value={example} onChange={setExample} placeholder={phFor(EXAMPLE_PH,content)} maxLength={500}
        boxRef={el=>{exampleRef.current=el;}} onRemove={()=>{setExample('');setShowExample(false);}} removeLabel={F.removeExample}/>}
      {error&&<p className="inline-error" role="alert">{error}</p>}
      {unsynced&&<div className="inline-error soft" role="alert"><p>{A.unsynced[0]}<span dir="auto">{unsynced.term}</span>{A.unsynced[1]}</p><button type="button" className="btn btn-quiet sm" disabled={loading} onClick={()=>{setLoading(true);void confirmVisible(unsynced).finally(()=>setLoading(false));}}><RotateCcw size={16}/>{A.refreshList}</button></div>}
      <div className="form-foot">
        <button disabled={loading} type="submit" className="btn btn-save btn-lg">{!loading&&<Check size={20} aria-hidden="true"/>}{loading?F.saving:F.save}</button>
        {saved&&<button type="button" className="btn btn-quiet" onClick={()=>go(lastDeck?deckPath(lastDeck):'words')}>{A.seeLibrary}</button>}
      </div>
    </form>
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
    try{const next=await reviewWord(active.id,g);setLast({term:active.term,next});setQueue(v=>v.slice(1));setDone(n=>n+1);setRevealed(false);await onReviewed();}
    catch(e){setMsg(getError(e));setQueue(v=>v.slice(1));setRevealed(false);}
    finally{setBusy(false);}
  },[active,busy,onReviewed]);
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
  const total=done+queue.length,cl=contentLang(active,lib.decks),meaningLang=cardLanguages(active,lib.decks).meaning;
  return <section className="review" aria-labelledby="review-title">
    <ScopeBar scope={scope} lib={lib} go={go}/>
    <div className="review-top">
      <h1 id="review-title" tabIndex={-1} className="visually-hidden">{R.title}</h1>
      <div className="progress" role="progressbar" aria-label={R.progress} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-valuetext={R.of(done,total)}><span style={{inlineSize:`${Math.max(4,100*done/total)}%`}}/></div>
      <p className="review-count"><b>{done+1}</b> {R.ofWord} {total}</p>
    </div>
    <div className="last-line" aria-live="polite">{last?comesBack(last):R.think}</div>
    <article key={active.id} className={'card'+(revealed?' is-open':'')} aria-live="polite">
      <Wash tone="soft"/>
      <div className="card-top"><span className="card-labels"><span className="kind-badge">{kindLabel(active.contentType)}</span><span className="tag" dir="auto">{tagText(active.tag)}</span></span><SpeakButton text={active.term} lang={cl} label={T.listen(active.term)}/></div>
      <h2 dir={dirOf(cl)} lang={cl} className={'term'+(active.term.length>40?' term-long':'')}>{active.term}</h2>
      {active.example&&<ExampleLine text={active.example} lang={cl}/>}
      {revealed?<div className="answer">{active.contentType==='idiom'&&<small className="answer-label">{R.idiomMeaning}</small>}<strong dir={dirOf(meaningLang)} lang={meaningLang}>{active.meanings.join('؛ ')}</strong>{active.note&&<p className="note" dir="auto">{active.note}</p>}{active.translation&&<p dir="auto">{active.translation}</p>}</div>
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
type LibView={kind:'root';tab:'folders'|'all'|'due'}|{kind:'folder';id:string}|{kind:'deck';id:string};
/** `''` folders grid · `all` / `due` card tabs · `f/<id>` a folder's decks · `d/<id>` a deck's cards. Tabs are routes, so Back works. */
function parseLibrary(sub:string):LibView{
  const [k,id]=sub.split('/');
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

function LibraryPage({words,reviews,lib,sub,onChanged,notify,go}:{words:Word[];reviews:Review[];lib:Library;sub:string;onChanged:()=>Promise<unknown>;notify:Notify;go:(path:string)=>void}){
  const view=parseLibrary(sub);
  // The default folder always exists once loaded, so no folders = IndexedDB not read yet: render nothing rather than a false «not found» or an empty grid.
  const counts=useMemo(()=>libraryCounts(words,lib.decks),[words,lib.decks]);
  if(!lib.folders.length)return <div className="page library" aria-busy="true"><PageHead title={T.lib.title}/></div>;
  const shared={words,reviews,lib,counts,onChanged,notify,go};
  if(view.kind==='folder')return <FolderView key={view.id} id={view.id} {...shared}/>;
  if(view.kind==='deck')return <DeckView key={view.id} id={view.id} {...shared}/>;
  return <LibraryRoot tab={view.tab} {...shared}/>;
}
type LibShared={words:Word[];reviews:Review[];lib:Library;counts:ReturnType<typeof libraryCounts>;onChanged:()=>Promise<unknown>;notify:Notify;go:(path:string)=>void};

function SearchBox({value,onChange,placeholder,label}:{value:string;onChange:(v:string)=>void;placeholder:string;label:string}){
  return <label className="search"><Search size={19}/><span className="visually-hidden">{label}</span><input type="search" dir="auto" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} enterKeyHint="search"/>{value&&<button type="button" className="icon-btn ghost" aria-label={T.library.clearSearch} onClick={()=>onChange('')}><X size={17}/></button>}</label>;
}

function LibraryRoot({tab,words,reviews,lib,counts,onChanged,notify,go}:LibShared&{tab:'folders'|'all'|'due'}){
  const L=T.lib;
  const [q,setQ]=useState(''),[kind,setKind]=useState<ContentType|'all'>('all'),[newFolder,setNewFolder]=useState(false);
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
    const pool=active.filter(w=>(tab==='all'||isDue(w,now))&&(kind==='all'||w.contentType===kind)&&cardMatch(w)).sort(byNewest);
    body=<>
      {tab==='all'&&kindCounts.size>1&&<div className="chips kind-chips" role="group" aria-label={T.kindsLabel}>
        <button type="button" className={'chip'+(kind==='all'?' on':'')} aria-pressed={kind==='all'} onClick={()=>setKind('all')}>{T.library.allKinds}</button>
        {CONTENT_TYPES.filter(k=>kindCounts.has(k)).map(k=><button type="button" key={k} className={'chip'+(kind===k?' on':'')} aria-pressed={kind===k} onClick={()=>setKind(kind===k?'all':k)}>{kindLabel(k)} <span className="chip-n">{kindCounts.get(k)}</span></button>)}
      </div>}
      {!active.length?<div className="empty"><Wash tone="soft"/><BookOpen size={30} strokeWidth={1.6}/><h2>{T.library.emptyTitle}</h2><p>{T.library.emptyBody}</p><button type="button" className="btn btn-ink" onClick={()=>go('add')}>{T.addCard}<Fwd size={18}/></button></div>
        :tab==='due'&&!dueN?<div className="empty small"><CalendarClock size={26} strokeWidth={1.6}/><h2>{L.noDueTitle}</h2><p>{L.noDueBody}</p></div>
        :!pool.length?<NoMatch onClear={()=>{setQ('');setKind('all');}}/>
        :<CardList list={pool} reviews={reviews} lib={lib} onChanged={onChanged} notify={notify} showPlace/>}
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

function DeckView({id,words,reviews,lib,counts,onChanged,notify,go}:LibShared&{id:string}){
  const L=T.lib;
  const [q,setQ]=useState(''),[settings,setSettings]=useState(false),[confirmDelete,setConfirmDelete]=useState(false);
  const deck=lib.decks.find(d=>d.id===id);
  const cards=useMemo(()=>words.filter(w=>!w.archived&&deckIdOf(w,lib)===id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),[words,lib,id]);
  if(!deck)return <NotFound go={go}/>;
  const s=q.trim().toLocaleLowerCase(),list=cards.filter(w=>!s||[w.term,...w.meanings,w.example,w.translation,w.note].some(x=>x.toLocaleLowerCase().includes(s)));
  const hasAny=words.some(w=>deckIdOf(w,lib)===id); // archived cards still belong to the deck
  const blocked=id===DEFAULT_DECK_ID?L.defaultLocked:hasAny?L.deckNotEmpty:'';
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
    <div className="deck-actions"><button type="button" className={'btn '+(counts.deck.get(id)?.due?'btn-quiet':'btn-ink')} onClick={()=>go('add/'+encodeURIComponent(id))}><Plus size={18}/>{L.addCard}</button></div>
    {cards.length>0&&<div className="library-tools"><SearchBox value={q} onChange={setQ} placeholder={T.library.searchPh} label={T.library.search}/></div>}
    {!cards.length?<div className="empty small"><Layers3 size={26} strokeWidth={1.6}/><h2>{L.deckEmptyTitle}</h2><p>{L.deckEmptyBody}</p></div>
      :!list.length?<NoMatch onClear={()=>setQ('')}/>
      :<CardList list={list} reviews={reviews} lib={lib} onChanged={onChanged} notify={notify}/>}
    <DeckSheet open={settings} title={L.deckSettings} lib={lib} deck={deck} submit={L.save} onSubmit={save} onClose={()=>setSettings(false)}
      extra={<DangerZone label={L.deleteDeck} blocked={blocked} onDelete={()=>{setSettings(false);setConfirmDelete(true);}}/>}/>
    <ConfirmDialog open={confirmDelete} title={L.deleteDeckTitle(deckName(deck))} body={L.deleteEmptyBody} confirm={L.deleteYes} cancel={L.deleteNo} onConfirm={()=>void remove()} onCancel={()=>setConfirmDelete(false)}/>
  </div>;
}

/**
 * #25: a card shows what helps learning — term, meanings, one due pill; expanded: example, translation, note and its deck.
 * Listen and Edit are visible; Move and Remove live in the ••• sheet (remove = archive, after confirmation).
 * «تفاصيل التعلم» is optional and human-worded (no raw FSRS). Editing and moving never change dueAt, FSRS or history.
 */
function CardList({list,reviews,lib,onChanged,notify,showPlace=false}:{list:Word[];reviews:Review[];lib:Library;onChanged:()=>Promise<unknown>;notify:Notify;showPlace?:boolean}){
  const Lb=T.library,L=T.lib,C=T.card;
  const [open,setOpen]=useState<string|null>(null),[pending,setPending]=useState<Word|null>(null),[moving,setMoving]=useState<Word|null>(null),[menu,setMenu]=useState<Word|null>(null),[editing,setEditing]=useState<Word|null>(null);
  const history=useMemo(()=>{const m=new Map<string,{n:number;last:string}>();for(const r of reviews){const h=m.get(r.wordId);if(!h)m.set(r.wordId,{n:1,last:r.reviewedAt});else{h.n++;if(r.reviewedAt>h.last)h.last=r.reviewedAt;}}return m;},[reviews]);
  const now=Date.now();
  const place=(w:Word)=>{const d=lib.decks.find(x=>x.id===deckIdOf(w,lib));const f=d&&lib.folders.find(x=>x.id===d.folderId);return d?(f?`${folderName(f)} · ${deckName(d)}`:deckName(d)):'';};
  async function confirmArchive(){const w=pending;setPending(null);if(!w)return;try{await archiveWord(w.id);await onChanged();notify(Lb.removed(w.term));}catch(e){notify(getError(e),'error');}}
  async function move(deckId:string){const w=moving;if(!w)return;await moveWord(w.id,deckId);await onChanged();const d=lib.decks.find(x=>x.id===deckId);notify(L.moved(w.term,d?deckName(d):''));setMoving(null);}
  async function save(v:CardEdit){const w=editing;if(!w)return;const next=await editWord(w.id,v);await onChanged();notify(C.saved(next.term));setEditing(null);}
  return <>
    <ul className="word-list" aria-label={Lb.listLabel}>{list.map(w=>{const due=isDue(w,now),isOpen=open===w.id,h=history.get(w.id),cl=contentLang(w,lib.decks);return <li key={w.id} className={'word'+(isOpen?' open':'')}>
      <button type="button" className="word-main" aria-expanded={isOpen} aria-controls={'wd-'+w.id} onClick={()=>setOpen(isOpen?null:w.id)}>
        <span className="word-text"><i className="kind-badge">{kindLabel(w.contentType)}</i><b dir={dirOf(cl)} lang={cl}>{w.term}</b><span dir="auto">{w.meanings.join('؛ ')}</span>{showPlace&&!isOpen&&<small className="word-place" dir="auto">{place(w)}</small>}</span>
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
    <div className="field"><label htmlFor="edit-term">{f.term.label}</label><input id="edit-term" name="edit-term" dir={dirOf(lang)} lang={lang} autoComplete="off" maxLength={TERM_LIMIT[word.contentType]} value={term} onChange={e=>setTerm(e.target.value)}/></div>
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
  function choose(p:Page){
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
    {id:'practice',label:Q.practice,note:Q.practiceNote,icon:Headphones,tone:'warm',soon:true},
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
function routeLabel(route:string,lib:Library):string{
  const [h,...rest]=route.split('/'),page=(PAGES.includes(h as Page)?h:'home') as Page,sub=rest.join('/');
  if(page==='words'){
    const v=parseLibrary(sub);
    if(v.kind==='folder'){const f=lib.folders.find(x=>x.id===v.id);if(f)return folderName(f);}
    if(v.kind==='deck'){const d=lib.decks.find(x=>x.id===v.id);if(d)return deckName(d);}
  }
  return T.nav[page];
}
/**
 * Where «رجوع» leads from each screen: a clear parent when there is one (folder → library, deck → its folder,
 * add-to-deck → that deck, scoped review → its folder/deck); otherwise the previous in-app screen, or Home.
 * Top-level tabs (Home, Library, Progress) have no Back — the tab bar is their navigation.
 */
function backFor(page:Page,sub:string,lib:Library):BackTo|null{
  const to=(target:string):BackTo=>({target,label:routeLabel(target,lib)});
  const previousOr=(fallback:string)=>{const p=previousRoute();return to(p!==null&&p!==currentRoute()?p:fallback);};
  if(page==='words'){
    const v=parseLibrary(sub);
    if(v.kind==='folder')return to('words');
    if(v.kind==='deck'){const d=lib.decks.find(x=>x.id===v.id);return to(d&&lib.folders.some(f=>f.id===d.folderId)?folderPath(d.folderId):'words');}
    return null;
  }
  if(page==='add'){const id=decodeURIComponent(sub);return id&&lib.decks.some(d=>d.id===id)?to(deckPath(id)):previousOr('');}
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
  const [page,setPage]=useState<Page>(readHash),[sub,setSub]=useState(readSub),[lib,setLib]=useState<Library>({folders:[],decks:[]}),[words,setWords]=useState<Word[]>([]),[reviews,setReviews]=useState<Review[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [online,setOnline]=useState(()=>navigator.onLine),[toast,setToast]=useState<{id:number;text:string;tone:'ok'|'error'}|null>(null),[lastBackup,setLastBackup]=useState<string|null>(null),[installPrompt,setInstallPrompt]=useState<InstallPrompt|null>(null);
  const first=useRef(true);
  useKeyboardInset();
  const latest=useRef(0),[loadedOnce,setLoadedOnce]=useState(false);
  const fetchLocal=useCallback(async():Promise<Word[]|null>=>{
    // #4: overlapping refreshes (focus, resume, other tab, after save) must not let an older read overwrite a newer one.
    const ticket=++latest.current;
    try{const [w,r,l]=await Promise.all([listWords(),listReviews(),listLibrary()]);if(ticket===latest.current){setWords(w);setReviews(r);setLib(l);setError('');setLoadedOnce(true);void syncPush(w).catch(console.warn);}return w;}
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
  const changeLocale=useCallback((l:Locale)=>{if(l===locale)return;storeLocale(l);setLocaleState(l);setError('');setToast({id:Date.now(),text:dictionaries[l].settings.languageChanged,tone:'ok'});},[locale]);
  const navigate=(to:Page)=>{if(to===page&&!sub){window.scrollTo({top:0,behavior:'smooth'});return;}guardLeave(()=>{window.location.hash=to==='home'?'/':'/'+to;});};
  const go=useCallback((path:string)=>{guardLeave(()=>{window.location.hash='/'+path;});},[]);
  // #42: one «unsaved changes» question for every way out (Back button, tabs, Back gesture, Cancel on a sheet).
  const [leave,setLeave]=useState<{proceed:()=>void}|null>(null);
  useEffect(()=>{askLeave=proceed=>setLeave({proceed});return()=>{askLeave=proceed=>proceed();};},[]);
  const back=loading?null:backFor(page,sub,lib);
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
  else content=page==='home'?<HomePage words={words} reviews={reviews} decks={lib.decks} lastBackup={lastBackup} onNavigate={navigate}/>
    :page==='add'?<AddPage key={sub} words={words} lib={lib} deckParam={decodeURIComponent(sub)} onSaved={fetchLocal} notify={notify} go={go}/>
    :page==='review'?<ReviewPage key={sub} words={words} lib={lib} scope={parseScope(sub,lib)} onReviewed={fetchLocal} onNavigate={navigate} go={go}/>
    :page==='words'?<LibraryPage words={words} reviews={reviews} lib={lib} sub={sub} onChanged={fetchLocal} notify={notify} go={go}/>
    :page==='stats'?<StatsPage words={words} reviews={reviews} onNavigate={navigate}/>
    :<SettingsPage words={words} online={online} lastBackup={lastBackup} setLastBackup={setLastBackup} installPrompt={installPrompt} onInstalled={()=>setInstallPrompt(null)} onRestored={fetchLocal} notify={notify} locale={locale} onLocale={changeLocale}/>;

  // key={locale}: switching language remounts the UI so every component reads the new dictionary. Card data lives in this component and is untouched.
  return <div className="app" dir={T.dir} lang={locale} key={locale}>
    <a href="#main" className="skip">{T.skip}</a>
    <aside className="rail">
      <a href="#/" className="rail-brand" aria-label={T.homeLink}><Logo/></a>
      <p className="rail-tagline">{T.tagline}</p>
      <button type="button" className="btn btn-ink rail-add" aria-haspopup={ctxDeck?undefined:'dialog'} aria-expanded={ctxDeck?undefined:quickOpen} onClick={onAdd}><Plus size={18}/>{ctxDeck?T.lib.addCard:T.addOrReview}</button>
      <nav aria-label={T.navMain}><ul>{navItems.map(item=><li key={item.id}><button type="button" onClick={()=>navigate(item.id)} className={'rail-link'+(page===item.id?' on':'')} aria-current={page===item.id?'page':undefined}><item.icon size={20} strokeWidth={1.8}/><span>{T.nav[item.id]}</span>{item.id==='review'&&due>0&&<b className="count" aria-label={T.dueBadge(due)}>{due}</b>}</button></li>)}</ul></nav>
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
      {(['home','review','add','words','stats'] as Page[]).map(id=>{
        if(id==='add')return <button key={id} type="button" className="tab-add" aria-haspopup={ctxDeck?undefined:'dialog'} aria-expanded={ctxDeck?undefined:quickOpen} onClick={onAdd} aria-label={ctxDeck?T.lib.addCard:T.quickLabel} aria-current={page==='add'?'page':undefined}><Plus size={26}/></button>;
        const item=navItems.find(n=>n.id===id)!;
        return <button key={id} type="button" className={'tab'+(page===id?' on':'')} aria-current={page===id?'page':undefined} onClick={()=>navigate(id)}><span className="tab-icon"><item.icon size={21} strokeWidth={1.8}/>{id==='review'&&due>0&&<b className="dot-count">{due>99?'99+':due}</b>}</span><span>{T.nav[id]}</span></button>;
      })}
    </nav>
    <ConfirmDialog open={!!leave} title={T.leave.title} body={T.leave.body} confirm={T.leave.yes} cancel={T.leave.stay}
      onConfirm={()=>{const l=leave;setLeave(null);l?.proceed();}} onCancel={()=>setLeave(null)}/>
    <QuickActions open={quickOpen} onClose={closeQuick} due={due} nextDue={nextDue} returnFocus={quickReturn}/>
    <UpdatePrompt/>
    <div className="toast-zone" aria-live="polite">{toast&&<div key={toast.id} className={'toast '+toast.tone} role={toast.tone==='error'?'alert':'status'}><span>{toast.text}</span><button type="button" className="icon-btn ghost" aria-label={T.closeToast} onClick={()=>setToast(null)}><X size={16}/></button></div>}</div>
  </div>;
}

import {useCallback,useEffect,useMemo,useRef,useState,type CSSProperties,type FormEvent,type KeyboardEvent as ReactKeyboardEvent,type ReactNode} from 'react';
import {ArrowDownToLine,ArrowLeft,ArrowRight,ArrowUpFromLine,Bell,BellOff,BookOpen,CalendarClock,Check,ChevronDown,CloudOff,Download,HardDrive,Headphones,Home,Languages,Layers3,Lightbulb,LineChart,Plus,RotateCcw,Search,Send,Settings,ShieldCheck,Smartphone,Trash2,Volume2,Wifi,WifiOff,X} from 'lucide-react';
import {addWord,archiveWord,buildBackup,CONTENT_TYPES,isContentType,lastBackupDate,listReviews,listWords,normalizeTerm,NOTE_LIMIT,onOtherTabChange,rememberBackup,restoreBackup,reviewWord,summary,TERM_LIMIT,validateBackup,type ContentType,type Grade,type Review,type Word} from './data';
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
function readHash():Page{const h=window.location.hash.replace(/^#\/?/,'') as Page;return PAGES.includes(h)?h:'home';}
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
const canSpeak=typeof window!=='undefined'&&'speechSynthesis' in window;
function speak(text:string){if(!canSpeak||!text.trim())return;window.speechSynthesis.cancel();const voice=new SpeechSynthesisUtterance(text);voice.lang='en-US';voice.rate=.87;window.speechSynthesis.speak(voice);}
type Stage='new'|'learning'|'growing'|'strong';
const STAGES:Stage[]=['new','learning','growing','strong'];
function stageOf(w:Word):Stage{const s=Number(w.fsrsState.state),st=Number(w.fsrsState.stability);if(!s)return 'new';if(s===1||s===3)return 'learning';return st>=21?'strong':'growing';}

/* ───────────── Small shared pieces ───────────── */
type Notify=(text:string,tone?:'ok'|'error')=>void;
function Mark(){return <span className="mark" aria-hidden="true"/>;}
function Logo(){return <span className="brand" dir="ltr"><Mark/><span>WordLoop</span></span>;}
function Wash({tone='full'}:{tone?:'full'|'soft'|'cool'|'warm'}){return <div className={'wash wash-'+tone} aria-hidden="true"><i/><i/><i/><i/></div>;}
function SpeakButton({text,label,className='icon-btn'}:{text:string;label:string;className?:string}){
  if(!canSpeak)return null;
  return <button type="button" className={className} aria-label={label} title={label} onClick={()=>speak(text)} disabled={!text.trim()}><Volume2 size={19} strokeWidth={1.8}/></button>;
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
function HomePage({words,reviews,lastBackup,onNavigate}:{words:Word[];reviews:Review[];lastBackup:string|null;onNavigate:(p:Page)=>void}){
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
      <div className="paper-stack" aria-hidden="true">{preview.map((w,i)=><div key={w.id} className={'paper p'+(i+1)}><span>{hasDue?H.readyPaper:relative(w.dueAt,now)}</span><b dir="ltr">{w.term}</b></div>)}</div>
    </section>

    <dl className="facts">
      <div><dt>{H.inLibrary}</dt><dd>{stats.inLibrary}<small>{T.cardUnit(stats.inLibrary)}</small></dd></div>
      <div><dt>{H.reviewedToday}</dt><dd>{stats.cardsReviewedToday}<small>{T.cardUnit(stats.cardsReviewedToday)}</small></dd>{stats.reviewAttemptsToday>stats.cardsReviewedToday&&<p className="fact-note">{H.attemptsNote(T.attempts(stats.reviewAttemptsToday))}</p>}</div>
      <div><dt>{H.scheduled7}</dt><dd>{stats.scheduledNext7Days}<small>{T.cardUnit(stats.scheduledNext7Days)}</small></dd></div>
    </dl>

    <div className="home-row">
      {lastAdded&&<button type="button" className="nudge home-card" data-home="last-added" onClick={()=>onNavigate('words')}>
        <span className="nudge-icon mint"><BookOpen size={20}/></span>
        <span><small className="eyebrow">{H.lastAddedTitle}</small><b dir="ltr" lang="en" className="home-term">{lastAdded.term}</b><small><i className="kind-badge">{kindLabel(lastAdded.contentType)}</i> <span dir="auto">{lastAdded.meaning}</span></small><small>{H.addedWhen(daysBetween(lastAdded.createdAt,now),localDate(lastAdded.createdAt))}</small></span>
        <Fwd size={18}/>
      </button>}
      {/* When nothing is due the hero already names the next review; show it here only when it would otherwise be hidden. */}
      {hasDue&&<div className="nudge static home-card" data-home="next">
        <span className="nudge-icon warm"><CalendarClock size={20}/></span>
        <span><small className="eyebrow">{H.nextTitle}</small>{next?<><b dir="ltr" lang="en" className="home-term">{next.term}</b><small>{H.nextIn(relative(next.dueAt,now))} · {localDate(next.dueAt)}</small></>:<small>{H.allDueNow}</small>}</span>
      </div>}
      {backupStale&&<button type="button" className="nudge home-wide" onClick={()=>onNavigate('settings')}><span className="nudge-icon warm"><Download size={20}/></span><span><b>{H.backupStaleTitle}</b><small>{lastBackup?H.backupLast(localDate(lastBackup)):H.backupNever} {H.backupWhy}</small></span><Fwd size={18}/></button>}
    </div>
    <aside className="tip" aria-labelledby="tip-title"><span className="tip-icon" aria-hidden="true"><Lightbulb size={18}/></span><p><b id="tip-title">{H.tipTitle}</b> {H.tips[dayIndex%H.tips.length]}</p></aside>
  </div>;
}

/* ───────────── Card kinds (#5 / #12) ───────────── */
/** English names stay visible as a learning aid under the Arabic labels. */
const KIND_EN:Record<ContentType,string>={vocabulary:'Vocabulary',phrase:'Phrase',sentence:'Sentence',idiom:'Idiom'};
/** Structure per kind (text lives in the dictionary). */
const kindShape:Record<ContentType,{multiline:boolean;noteFirst?:boolean}>={vocabulary:{multiline:false},phrase:{multiline:false},sentence:{multiline:true},idiom:{multiline:false,noteFirst:true}};
const kindLabel=(k:ContentType)=>T.kinds[k].label;
/** The built-in default tag is stored as «عام»; show it in the UI language without changing what is saved. */
const DEFAULT_TAG='عام';
const tagText=(t:string)=>t===DEFAULT_TAG?T.add.defaultTag:t;
const LAST_KIND='wordloop-last-kind';
function initialKind():ContentType{try{const v=localStorage.getItem(LAST_KIND);return isContentType(v)?v:'vocabulary';}catch{return 'vocabulary';}}

function KindPicker({value,onChange}:{value:ContentType;onChange:(k:ContentType)=>void}){
  const refs=useRef<(HTMLButtonElement|null)[]>([]);
  const kinds=CONTENT_TYPES;
  // Radio-group keyboard behaviour: arrows move and select (mirrored in RTL), Home/End jump.
  function onKey(e:ReactKeyboardEvent,i:number){
    const rtl=getComputedStyle(e.currentTarget).direction==='rtl';
    const step=e.key==='ArrowDown'||e.key===(rtl?'ArrowLeft':'ArrowRight')?1:e.key==='ArrowUp'||e.key===(rtl?'ArrowRight':'ArrowLeft')?-1:0;
    const to=e.key==='Home'?0:e.key==='End'?kinds.length-1:step?(i+step+kinds.length)%kinds.length:-1;
    if(to<0)return;e.preventDefault();onChange(kinds[to]);refs.current[to]?.focus();
  }
  return <div className="kinds" role="radiogroup" aria-label={T.kindsLabel}>
    {kinds.map((k,i)=><button key={k} ref={el=>{refs.current[i]=el;}} type="button" role="radio" data-kind={k} aria-checked={value===k} tabIndex={value===k?0:-1} className="kind" onClick={()=>onChange(k)} onKeyDown={e=>onKey(e,i)}>
      <b>{kindLabel(k)}</b>{T.locale!=='en'&&<span dir="ltr" lang="en">{KIND_EN[k]}</span>}<small>{T.kinds[k].hint}</small>
    </button>)}
  </div>;
}

/* ───────────── Add card ───────────── */
type FieldText={label:string;ph:string;hint?:string};
function AddPage({words,onSaved,notify,onNavigate}:{words:Word[];onSaved:()=>Promise<Word[]|null>;notify:Notify;onNavigate:(p:Page)=>void}){
  const A=T.add;
  const [kind,setKindState]=useState<ContentType>(initialKind);
  const [term,setTerm]=useState(''),[meaning,setMeaning]=useState(''),[example,setExample]=useState(''),[translation,setTranslation]=useState(''),[note,setNote]=useState(''),[tag,setTag]=useState('');
  const [loading,setLoading]=useState(false),[error,setError]=useState(''),[tried,setTried]=useState(false),[saved,setSaved]=useState<string|null>(null),[unsynced,setUnsynced]=useState<Word|null>(null);
  const termRef=useRef<HTMLInputElement&HTMLTextAreaElement>(null);
  const f=T.kindForm[kind],shape=kindShape[kind],limit=TERM_LIMIT[kind];
  const tags=useMemo(()=>[...new Set(words.filter(w=>!w.archived).map(w=>w.tag).filter(Boolean))].slice(0,12),[words]);
  const duplicate=term.trim()&&words.some(w=>!w.archived&&w.contentType===kind&&normalizeTerm(w.term)===normalizeTerm(term));
  const tooLong=term.trim().length>limit;
  function setKind(k:ContentType){setKindState(k);setError('');setSaved(null);try{localStorage.setItem(LAST_KIND,k);}catch{/* private mode */}}
  async function submit(e:FormEvent){
    e.preventDefault();setTried(true);setError('');
    if(!term.trim()||!meaning.trim()){(!term.trim()?termRef.current:document.getElementById('meaning'))?.focus();return;}
    if(tooLong){termRef.current?.focus();return;}
    setLoading(true);setUnsynced(null);
    let word:Word;
    // Only the fields this kind shows are saved; text typed under another kind stays in the form, unsaved.
    try{word=await addWord({contentType:kind,term,meaning,example:f.example?example:'',translation:f.translation?translation:'',note:f.note?note:'',tag});}
    catch(err){setError(getError(err));setLoading(false);return;}
    setTerm('');setMeaning('');setExample('');setTranslation('');setNote('');setTag('');setTried(false);
    await confirmVisible(word);setLoading(false);termRef.current?.focus();
  }
  /** #4: success is announced only once the saved card is in the refreshed list. */
  async function confirmVisible(word:Word){
    const list=await onSaved();
    if(list?.some(w=>w.id===word.id)){setUnsynced(null);setSaved(word.term);notify(A.saved(word.term,kindLabel(word.contentType)));}
    else{setSaved(null);setUnsynced(word);}
  }
  const missing=(v:string)=>tried&&!v.trim();
  const termHint=missing(term)?A.missingTerm(f.noun):tooLong?A.tooLong(f.noun,limit):duplicate?A.duplicate(f.noun,kindLabel(kind)):f.term.hint;
  const termProps={ref:termRef,id:'term',dir:'ltr' as const,lang:'en',autoComplete:'off',autoCapitalize:'none',spellCheck:false,placeholder:f.term.ph,maxLength:limit,value:term,
    onChange:(e:{target:{value:string}})=>{setTerm(e.target.value);setSaved(null);setError('');},'aria-invalid':missing(term)||tooLong,'aria-describedby':'term-hint'};
  // English fields are LTR; the learner's own notes and meanings follow their text direction (dir=auto).
  const optional=(id:'example'|'translation'|'note',field:FieldText|undefined,value:string,set:(v:string)=>void,english:boolean,max:number)=>field&&<div className="field" key={id}>
    <label htmlFor={id}>{field.label} <small>{T.optional}</small></label>
    {english||id==='note'?<textarea id={id} dir={english?'ltr':'auto'} lang={english?'en':undefined} rows={2} maxLength={max} placeholder={field.ph} value={value} onChange={e=>set(e.target.value)} aria-describedby={field.hint?id+'-hint':undefined}/>
      :<input id={id} dir="auto" maxLength={max} placeholder={field.ph} value={value} onChange={e=>set(e.target.value)}/>}
    {field.hint&&<p id={id+'-hint'} className="hint">{field.hint}</p>}
  </div>;
  const noteField=optional('note',f.note,note,setNote,false,NOTE_LIMIT);
  const exampleFields=<>{optional('example',f.example,example,setExample,true,500)}{optional('translation',f.translation,translation,setTranslation,false,400)}</>;
  return <div className="page add-page">
    <PageHead title={f.title} lead={f.lead}/>
    <div className="add-layout">
      <form className="word-form" onSubmit={submit} noValidate>
        <KindPicker value={kind} onChange={setKind}/>
        <div className={'field'+(missing(term)||tooLong?' invalid':'')}>
          <label htmlFor="term">{f.term.label}</label>
          <div className={'input-wrap'+(shape.multiline?' multiline':'')}>{shape.multiline?<textarea {...termProps} rows={3}/>:<input {...termProps}/>}<SpeakButton text={term} label={T.listen(f.noun)} className="icon-btn in-input"/></div>
          <p id="term-hint" className="hint">{termHint}</p>
        </div>
        <div className={'field'+(missing(meaning)?' invalid':'')}>
          <label htmlFor="meaning">{f.meaning.label}</label>
          <input id="meaning" dir="auto" maxLength={240} placeholder={f.meaning.ph} value={meaning} onChange={e=>setMeaning(e.target.value)} aria-invalid={missing(meaning)} aria-describedby="meaning-hint"/>
          <p id="meaning-hint" className="hint">{missing(meaning)?A.missingMeaning(f.noun):f.meaning.hint||''}</p>
        </div>
        {shape.noteFirst?<>{noteField}{exampleFields}</>:<>{exampleFields}{noteField}</>}
        <div className="field">
          <label htmlFor="tag">{A.tag} <small>{T.optional}</small></label>
          <input id="tag" dir="auto" list="tag-list" maxLength={40} placeholder={A.tagPh} value={tag} onChange={e=>setTag(e.target.value)}/>
          <datalist id="tag-list">{tags.map(t=><option key={t} value={t}/>)}</datalist>
          {tags.length>0&&<div className="chips" role="group" aria-label={A.pastTags}>{tags.slice(0,6).map(t=><button type="button" key={t} dir="auto" className={'chip'+(tag===t?' on':'')} aria-pressed={tag===t} onClick={()=>setTag(tag===t?'':t)}>{tagText(t)}</button>)}</div>}
        </div>
        {error&&<p className="inline-error" role="alert">{error}</p>}
        {unsynced&&<div className="inline-error soft" role="alert"><p>{A.unsynced[0]}<span dir="ltr">{unsynced.term}</span>{A.unsynced[1]}</p><button type="button" className="btn btn-quiet sm" disabled={loading} onClick={()=>{setLoading(true);void confirmVisible(unsynced).finally(()=>setLoading(false));}}><RotateCcw size={16}/>{A.refreshList}</button></div>}
        <div className="form-foot">
          <button disabled={loading} type="submit" className="btn btn-ink btn-lg">{loading?A.saving(f.noun):A.save(f.noun)}{!loading&&<Check size={20}/>}</button>
          {saved&&<button type="button" className="btn btn-quiet" onClick={()=>onNavigate('words')}>{A.seeLibrary}</button>}
        </div>
      </form>
      <aside className="add-aside" aria-hidden="true"><Wash tone="warm"/><div className="aside-card"><i className="kind-badge">{kindLabel(kind)}</i><span dir="ltr" className={kind==='sentence'?'is-long':undefined}>{term.trim()||f.term.ph}</span><p dir="auto">{meaning.trim()||f.meaning.ph}</p>{f.note&&(note.trim()||!term.trim())&&<small className="aside-note-text" dir="auto">{note.trim()||f.note.ph}</small>}{f.example&&(example.trim()||!term.trim())&&<em dir="ltr">{example.trim()||f.example.ph}</em>}</div><p className="aside-note">{A.asideNote}</p></aside>
    </div>
  </div>;
}

/* ───────────── Review ───────────── */
function ReviewPage({words,onReviewed,onNavigate}:{words:Word[];onReviewed:()=>Promise<unknown>;onNavigate:(p:Page)=>void}){
  const R=T.review;
  const dueIds=useCallback(()=>words.filter(w=>!w.archived&&isDue(w)).sort((a,b)=>a.dueAt.localeCompare(b.dueAt)).map(w=>w.id),[words]);
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
  const comesBack=(l:{term:string;next:string})=><>«<span dir="ltr">{l.term}</span>» {R.comesBack} {relative(l.next)}.</>;

  if(!active){
    const moreDue=dueIds().length;
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
  const total=done+queue.length;
  return <section className="review" aria-labelledby="review-title">
    <div className="review-top">
      <h1 id="review-title" tabIndex={-1} className="visually-hidden">{R.title}</h1>
      <div className="progress" role="progressbar" aria-label={R.progress} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-valuetext={R.of(done,total)}><span style={{inlineSize:`${Math.max(4,100*done/total)}%`}}/></div>
      <p className="review-count"><b>{done+1}</b> {R.ofWord} {total}</p>
    </div>
    <div className="last-line" aria-live="polite">{last?comesBack(last):R.think}</div>
    <article key={active.id} className={'card'+(revealed?' is-open':'')} aria-live="polite">
      <Wash tone="soft"/>
      <div className="card-top"><span className="card-labels"><span className="kind-badge">{kindLabel(active.contentType)}</span><span className="tag" dir="auto">{tagText(active.tag)}</span></span><SpeakButton text={active.term} label={T.listen(active.term)}/></div>
      <h2 dir="ltr" lang="en" className={'term'+(active.term.length>40?' term-long':'')}>{active.term}</h2>
      {active.example&&<p className="example" dir="ltr" lang="en">{active.example}</p>}
      {revealed?<div className="answer">{active.contentType==='idiom'&&<small className="answer-label">{R.idiomMeaning}</small>}<strong dir="auto">{active.meaning}</strong>{active.note&&<p className="note" dir="auto">{active.note}</p>}{active.translation&&<p dir="auto">{active.translation}</p>}</div>
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

/* ───────────── Library ───────────── */
function WordsPage({words,reviews,onArchived,onNavigate,notify}:{words:Word[];reviews:Review[];onArchived:()=>Promise<unknown>;onNavigate:(p:Page)=>void;notify:Notify}){
  const Lb=T.library;
  const [q,setQ]=useState(''),[filter,setFilter]=useState<string>('all'),[kind,setKind]=useState<ContentType|'all'>('all'),[open,setOpen]=useState<string|null>(null),[pending,setPending]=useState<Word|null>(null);
  const active=useMemo(()=>words.filter(w=>!w.archived),[words]);
  const tags=useMemo(()=>{const m=new Map<string,number>();for(const w of active)m.set(w.tag,(m.get(w.tag)||0)+1);return [...m].sort((a,b)=>b[1]-a[1]).slice(0,6).map(x=>x[0]);},[active]);
  const reviewCount=useMemo(()=>{const m=new Map<string,number>();for(const r of reviews)m.set(r.wordId,(m.get(r.wordId)||0)+1);return m;},[reviews]);
  const kindCounts=useMemo(()=>{const m=new Map<ContentType,number>();for(const w of active)m.set(w.contentType,(m.get(w.contentType)||0)+1);return m;},[active]);
  const now=Date.now(),dueCount=active.filter(w=>isDue(w,now)).length;
  const list=useMemo(()=>{const s=q.trim().toLocaleLowerCase();return active.filter(w=>(kind==='all'||w.contentType===kind)&&(filter==='all'||(filter==='due'?isDue(w):w.tag===filter))&&(!s||[w.term,w.meaning,w.tag,w.example,w.translation,w.note].some(x=>x.toLocaleLowerCase().includes(s)))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));},[active,q,filter,kind]);
  async function confirmArchive(){const w=pending;setPending(null);if(!w)return;try{await archiveWord(w.id);await onArchived();notify(Lb.removed(w.term));}catch(e){notify(getError(e),'error');}}
  return <div className="page">
    <PageHead title={Lb.title} lead={active.length?Lb.lead(active.length):Lb.leadEmpty}/>
    {active.length>0&&<div className="library-tools">
      <label className="search"><Search size={19}/><span className="visually-hidden">{Lb.search}</span><input type="search" dir="auto" value={q} onChange={e=>setQ(e.target.value)} placeholder={Lb.searchPh} enterKeyHint="search"/>{q&&<button type="button" className="icon-btn ghost" aria-label={Lb.clearSearch} onClick={()=>setQ('')}><X size={17}/></button>}</label>
      <div className="chips" role="group" aria-label={Lb.show}>
        <button type="button" className={'chip'+(filter==='all'?' on':'')} aria-pressed={filter==='all'} onClick={()=>setFilter('all')}>{Lb.all}</button>
        <button type="button" className={'chip'+(filter==='due'?' on':'')} aria-pressed={filter==='due'} onClick={()=>setFilter('due')}>{Lb.due} {dueCount>0&&<span className="chip-n">{dueCount}</span>}</button>
        {tags.length>1&&tags.map(t=><button type="button" key={t} dir="auto" className={'chip'+(filter===t?' on':'')} aria-pressed={filter===t} onClick={()=>setFilter(filter===t?'all':t)}>{tagText(t)}</button>)}
      </div>
      {kindCounts.size>1&&<div className="chips kind-chips" role="group" aria-label={T.kindsLabel}>
        <button type="button" className={'chip'+(kind==='all'?' on':'')} aria-pressed={kind==='all'} onClick={()=>setKind('all')}>{Lb.allKinds}</button>
        {CONTENT_TYPES.filter(k=>kindCounts.has(k)).map(k=><button type="button" key={k} className={'chip'+(kind===k?' on':'')} aria-pressed={kind===k} onClick={()=>setKind(kind===k?'all':k)}>{kindLabel(k)} <span className="chip-n">{kindCounts.get(k)}</span></button>)}
      </div>}
    </div>}
    {!active.length?<div className="empty"><Wash tone="soft"/><BookOpen size={30} strokeWidth={1.6}/><h2>{Lb.emptyTitle}</h2><p>{Lb.emptyBody}</p><button type="button" className="btn btn-ink" onClick={()=>onNavigate('add')}>{T.addCard}<Fwd size={18}/></button></div>
    :!list.length?<div className="empty small"><Search size={26} strokeWidth={1.6}/><h2>{Lb.noMatchTitle}</h2><p>{Lb.noMatchBody}</p><button type="button" className="btn btn-quiet" onClick={()=>{setQ('');setFilter('all');setKind('all');}}>{Lb.showAll}</button></div>
    :<ul className="word-list" aria-label={Lb.listLabel}>{list.map(w=>{const due=isDue(w,now),isOpen=open===w.id,n=reviewCount.get(w.id)||0;return <li key={w.id} className={'word'+(isOpen?' open':'')}>
      <button type="button" className="word-main" aria-expanded={isOpen} aria-controls={'wd-'+w.id} onClick={()=>setOpen(isOpen?null:w.id)}>
        <span className="word-text"><i className="kind-badge">{kindLabel(w.contentType)}</i><b dir="ltr" lang="en">{w.term}</b><span dir="auto">{w.meaning}</span></span>
        <span className={'due-pill'+(due?' is-due':'')}>{due?Lb.dueNow:relative(w.dueAt,now)}</span>
        <ChevronDown size={18} className="chev" aria-hidden="true"/>
      </button>
      {isOpen&&<div className="word-detail" id={'wd-'+w.id}>
        {w.example&&<p className="example" dir="ltr" lang="en">{w.example}</p>}
        {w.translation&&<p className="translation" dir="auto">{w.translation}</p>}
        {w.note&&<p className="note"><b>{T.kindForm[w.contentType].note?.label||Lb.noteFallback}</b> <span dir="auto">{w.note}</span></p>}
        <dl className="word-meta"><div><dt>{Lb.kind}</dt><dd>{kindLabel(w.contentType)}</dd></div><div><dt>{Lb.tag}</dt><dd dir="auto">{tagText(w.tag)}</dd></div><div><dt>{Lb.stage}</dt><dd>{T.stages[stageOf(w)]}</dd></div><div><dt>{Lb.reviewed}</dt><dd>{n?T.times(n):Lb.notYet}</dd></div><div><dt>{Lb.next}</dt><dd>{due?T.now:localDate(w.dueAt)}</dd></div></dl>
        <div className="word-actions"><SpeakButton text={w.term} label={T.listen(w.term)} className="btn btn-quiet sm"/><button type="button" className="btn btn-quiet sm danger" onClick={()=>setPending(w)}><Trash2 size={16}/>{Lb.remove}</button></div>
      </div>}
    </li>;})}</ul>}
    <ConfirmDialog open={!!pending} title={Lb.removeTitle(pending?.term||'')} body={Lb.removeBody} confirm={Lb.removeYes} cancel={Lb.removeNo} onConfirm={()=>void confirmArchive()} onCancel={()=>setPending(null)}/>
  </div>;
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

/* ───────────── Shell ───────────── */
export default function App(){
  const [locale,setLocaleState]=useState<Locale>(storedLocale);
  T=dictionaries[locale];
  const [page,setPage]=useState<Page>(readHash),[words,setWords]=useState<Word[]>([]),[reviews,setReviews]=useState<Review[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [online,setOnline]=useState(()=>navigator.onLine),[toast,setToast]=useState<{id:number;text:string;tone:'ok'|'error'}|null>(null),[lastBackup,setLastBackup]=useState<string|null>(null),[installPrompt,setInstallPrompt]=useState<InstallPrompt|null>(null);
  const first=useRef(true);
  const latest=useRef(0),[loadedOnce,setLoadedOnce]=useState(false);
  const fetchLocal=useCallback(async():Promise<Word[]|null>=>{
    // #4: overlapping refreshes (focus, resume, other tab, after save) must not let an older read overwrite a newer one.
    const ticket=++latest.current;
    try{const [w,r]=await Promise.all([listWords(),listReviews()]);if(ticket===latest.current){setWords(w);setReviews(r);setError('');setLoadedOnce(true);void syncPush(w).catch(console.warn);}return w;}
    catch(e){if(ticket===latest.current)setError(getError(e));return null;}
    finally{if(ticket===latest.current)setLoading(false);}
  },[]);
  useEffect(()=>{
    void fetchLocal();void lastBackupDate().then(setLastBackup).catch(()=>null);
    // #4: iOS PWAs often resume without a window "focus" event, so also refresh on visibility/pageshow and on writes from other tabs.
    const focus=()=>{void fetchLocal();},visible=()=>{if(document.visibilityState==='visible')void fetchLocal();},hash=()=>setPage(readHash()),on=()=>{setOnline(true);void fetchLocal();},off=()=>setOnline(false);
    const stopListening=onOtherTabChange(()=>{void fetchLocal();});
    const bip=(e:Event)=>{e.preventDefault();setInstallPrompt(e as InstallPrompt);};
    window.addEventListener('focus',focus);document.addEventListener('visibilitychange',visible);window.addEventListener('pageshow',focus);window.addEventListener('hashchange',hash);window.addEventListener('online',on);window.addEventListener('offline',off);window.addEventListener('beforeinstallprompt',bip);
    return()=>{stopListening();window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',visible);window.removeEventListener('pageshow',focus);window.removeEventListener('hashchange',hash);window.removeEventListener('online',on);window.removeEventListener('offline',off);window.removeEventListener('beforeinstallprompt',bip);};
  },[fetchLocal]);
  // #6: the document itself follows the UI language (screen readers, hyphenation, scrollbars, form controls).
  useEffect(()=>{document.documentElement.lang=locale;document.documentElement.dir=T.dir;},[locale]);
  useEffect(()=>{document.title=page==='home'?T.docTitleHome:`${T.nav[page]} · WordLoop`;if(first.current){first.current=false;return;}window.scrollTo({top:0});requestAnimationFrame(()=>{
    // Move focus to the new page's heading for screen readers, but never steal it from a field the user already focused on this page.
    const main=document.querySelector('main'),active=document.activeElement;
    if(main&&active&&active!==document.body&&main.contains(active)&&!active.matches('h1'))return;
    main?.querySelector<HTMLElement>('h1')?.focus({preventScroll:true});
  });},[page,locale]);
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(null),toast.tone==='error'?7000:4200);return()=>clearTimeout(t);},[toast]);
  const notify=useCallback<Notify>((text,tone='ok')=>setToast({id:Date.now(),text,tone}),[]);
  const changeLocale=useCallback((l:Locale)=>{if(l===locale)return;storeLocale(l);setLocaleState(l);setError('');setToast({id:Date.now(),text:dictionaries[l].settings.languageChanged,tone:'ok'});},[locale]);
  const navigate=(to:Page)=>{if(to===page){window.scrollTo({top:0,behavior:'smooth'});return;}window.location.hash=to==='home'?'/':'/'+to;};
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
  else content=page==='home'?<HomePage words={words} reviews={reviews} lastBackup={lastBackup} onNavigate={navigate}/>
    :page==='add'?<AddPage words={words} onSaved={fetchLocal} notify={notify} onNavigate={navigate}/>
    :page==='review'?<ReviewPage words={words} onReviewed={fetchLocal} onNavigate={navigate}/>
    :page==='words'?<WordsPage words={words} reviews={reviews} onArchived={fetchLocal} onNavigate={navigate} notify={notify}/>
    :page==='stats'?<StatsPage words={words} reviews={reviews} onNavigate={navigate}/>
    :<SettingsPage words={words} online={online} lastBackup={lastBackup} setLastBackup={setLastBackup} installPrompt={installPrompt} onInstalled={()=>setInstallPrompt(null)} onRestored={fetchLocal} notify={notify} locale={locale} onLocale={changeLocale}/>;

  // key={locale}: switching language remounts the UI so every component reads the new dictionary. Card data lives in this component and is untouched.
  return <div className="app" dir={T.dir} lang={locale} key={locale}>
    <a href="#main" className="skip">{T.skip}</a>
    <aside className="rail">
      <a href="#/" className="rail-brand" aria-label={T.homeLink}><Logo/></a>
      <p className="rail-tagline">{T.tagline}</p>
      <button type="button" className="btn btn-ink rail-add" aria-haspopup="dialog" aria-expanded={quickOpen} onClick={openQuick}><Plus size={18}/>{T.addOrReview}</button>
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
        {content}
      </main>
    </div>
    <nav className="tabbar" aria-label={T.navTabs}>
      {(['home','review','add','words','stats'] as Page[]).map(id=>{
        if(id==='add')return <button key={id} type="button" className="tab-add" aria-haspopup="dialog" aria-expanded={quickOpen} onClick={openQuick} aria-label={T.quickLabel} aria-current={page==='add'?'page':undefined}><Plus size={26}/></button>;
        const item=navItems.find(n=>n.id===id)!;
        return <button key={id} type="button" className={'tab'+(page===id?' on':'')} aria-current={page===id?'page':undefined} onClick={()=>navigate(id)}><span className="tab-icon"><item.icon size={21} strokeWidth={1.8}/>{id==='review'&&due>0&&<b className="dot-count">{due>99?'99+':due}</b>}</span><span>{T.nav[id]}</span></button>;
      })}
    </nav>
    <QuickActions open={quickOpen} onClose={closeQuick} due={due} nextDue={nextDue} returnFocus={quickReturn}/>
    <div className="toast-zone" aria-live="polite">{toast&&<div key={toast.id} className={'toast '+toast.tone} role={toast.tone==='error'?'alert':'status'}><span>{toast.text}</span><button type="button" className="icon-btn ghost" aria-label={T.closeToast} onClick={()=>setToast(null)}><X size={16}/></button></div>}</div>
  </div>;
}

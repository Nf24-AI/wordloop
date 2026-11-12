import {useCallback,useEffect,useMemo,useRef,useState,type CSSProperties,type FormEvent,type ReactNode} from 'react';
import {ArrowDownToLine,ArrowLeft,ArrowUpFromLine,Bell,BellOff,BookOpen,Check,ChevronDown,CloudOff,Download,HardDrive,Home,Layers3,LineChart,Plus,RotateCcw,Search,Send,Settings2,ShieldCheck,Smartphone,Trash2,Volume2,Wifi,WifiOff,X} from 'lucide-react';
import {addWord,archiveWord,buildBackup,lastBackupDate,listReviews,listWords,rememberBackup,restoreBackup,reviewWord,summary,validateBackup,type Grade,type Review,type Word} from './data';
import {disablePush,enablePush,pushState,pushSupported,syncPush,testPush} from './push';

/* ───────────── Navigation ───────────── */
type Page='home'|'review'|'words'|'add'|'stats'|'settings';
const PAGES:Page[]=['home','review','words','add','stats','settings'];
const navItems:{id:Page;label:string;icon:typeof Home}[]=[
  {id:'home',label:'الرئيسية',icon:Home},
  {id:'review',label:'المراجعة',icon:Layers3},
  {id:'words',label:'كلماتي',icon:BookOpen},
  {id:'stats',label:'تقدّمك',icon:LineChart},
  {id:'settings',label:'الإعدادات',icon:Settings2},
];
const pageTitle:Record<Page,string>={home:'الرئيسية',review:'المراجعة',words:'كلماتي',add:'كلمة جديدة',stats:'تقدّمك',settings:'الإعدادات'};
function readHash():Page{const h=window.location.hash.replace(/^#\/?/,'') as Page;return PAGES.includes(h)?h:'home';}

/* ───────────── Copy (verbal identity) ───────────── */
const copy={
  due:'حان وقت المراجعة',noDue:'ما عليك مراجعة اليوم!',
  dueLead:'بضع دقائق اليوم تخلي كلماتك أقرب لذاكرتك.',
  startReview:'ابدأ مراجعة اليوم',addWord:'أضف كلمة جديدة',
  done:'خلصت مراجعتك، يعطيك العافية!',
  reveal:'شوف الإجابة',
  backup:'حمّل نسخة من كلماتك',restore:'رجّع كلماتك من ملف',
  privacy:'كلماتك تبقى على جهازك.',
};
const grades:{id:Grade;label:string;note:string;key:string}[]=[
  {id:'again',label:'نسيتها',note:'نرجّعها لك قريب',key:'1'},
  {id:'hard',label:'صعبة',note:'تذكرتها بصعوبة',key:'2'},
  {id:'good',label:'تذكرتها',note:'جت معي',key:'3'},
  {id:'easy',label:'سهلة جدًا',note:'ثابتة عندي',key:'4'},
];

/* Friendly versions of messages thrown by data.ts / push.ts / the push Worker. */
const friendly:Record<string,string>={
  'أحد النصوص أطول من اللازم':'فيه نص أطول من اللازم، اختصره شوي وجرّب.',
  'هذه الكلمة موجودة عندك بالفعل':'هذي الكلمة موجودة عندك من قبل، تلقاها في «كلماتي».',
  'لم نجد الكلمة':'ما لقينا هذي الكلمة. يمكن تغيّرت من تبويب ثاني، حدّث الصفحة.',
  'لم يحن وقت مراجعة هذه الكلمة':'هذي الكلمة راجعتها قبل شوي، بترجع لك في وقتها.',
  'تغيرت هذه الكلمة في تبويب آخر، حدّث الصفحة':'هذي الكلمة تغيّرت في تبويب ثاني. حدّث الصفحة وكمّل.',
  'هذا الملف ليس نسخة WordLoop':'هذا الملف مو نسخة من WordLoop.',
  'صيغة الملف غير مدعومة':'ما نقدر نقرأ هذا النوع من الملفات. اختر ملف نسخة حمّلته من WordLoop.',
  'هذا الملف أكبر من الحد المسموح':'الملف أكبر من الحد اللي نقدر نرجّعه.',
  'بعض البيانات في الملف غير صحيحة':'بعض الكلمات في الملف ناقصة أو متغيّرة، فما رجّعنا شي. جرّب ملف ثاني.',
  'توجد بيانات مكررة أو مراجعات بلا كلمات':'الملف فيه بيانات مكررة أو ناقصة، فما رجّعنا شي. جرّب ملف ثاني.',
  'تعذّر قراءة البيانات المحلية':'ما قدرنا نقرأ كلماتك من هذا المتصفح. حدّث الصفحة وجرّب مرة ثانية.',
  'تعذّر فتح مساحة الكلمات':'ما قدرنا نفتح كلماتك على هذا المتصفح. إذا كنت في التصفح الخفي، جرّب نافذة عادية.',
  'تعذّر حفظ التغيير':'ما انحفظ التغيير. جرّب مرة ثانية.',
  'لم يكتمل الحفظ':'ما انحفظ التغيير. جرّب مرة ثانية.',
  'لم يتم السماح بالإشعارات من إعدادات الجهاز':'ما سمحت بالإشعارات. تقدر تسمح لها من إعدادات المتصفح أو الجوال.',
  'الإشعارات غير مهيأة على الخادم بعد':'التذكيرات مو جاهزة في نسخة الموقع هذي بعد.',
  'تعذر ربط إشعارات هذا الجهاز. أعد المحاولة':'ما قدرنا نربط التذكير بجهازك. تأكد من الإنترنت وجرّب مرة ثانية.',
  'فعّل الإشعارات أولًا':'فعّل التذكير أول، بعدها جرّبه.',
  'جرب مرة أخرى بعد دقيقة':'جرّبته قبل شوي. انتظر دقيقة وجرّب مرة ثانية.',
  'تعذر إرسال الإشعار لهذا الجهاز':'ما وصل الإشعار لهذا الجهاز. أوقف التذكير وفعّله من جديد.',
  'تعذر إرسال الإشعار':'ما وصل الإشعار. جرّب بعد شوي.',
  'خدمة الإشعارات غير جاهزة بعد':'التذكيرات مو جاهزة في نسخة الموقع هذي بعد.',
  'لم تُفعّل الإشعارات بعد':'التذكيرات مو جاهزة في نسخة الموقع هذي بعد.',
  'الإشعارات غير مجهزة':'التذكيرات مو جاهزة في نسخة الموقع هذي بعد.',
  'حصل خطأ في الإشعارات':'صار خلل في التذكيرات. جرّب بعد شوي.',
};
function getError(e:unknown){
  if(e instanceof SyntaxError)return 'هذا الملف ما ينقرأ. تأكد إنه ملف نسخة حمّلته من WordLoop.';
  if(e instanceof TypeError&&/fetch|network/i.test(e.message))return 'هذي الخطوة تحتاج إنترنت. اتصل وجرّب مرة ثانية.';
  if(e instanceof Error){if(friendly[e.message])return friendly[e.message];if(e.message.startsWith('هذا المتصفح لا يدعم الإشعارات'))return 'هذا المتصفح ما يدعم التذكيرات. على الآيفون، أضف WordLoop للشاشة الرئيسية وافتحه منها.';if(/[؀-ۿ]/.test(e.message))return e.message;}
  return 'صار شي ما توقعناه. جرّب مرة ثانية.';
}

/* ───────────── Formatting helpers ───────────── */
const LOCALE='ar-SA-u-ca-gregory-nu-latn',TZ='Asia/Riyadh',DAY=86_400_000;
const dateFmt=new Intl.DateTimeFormat(LOCALE,{day:'numeric',month:'long',timeZone:TZ});
const weekdayFmt=new Intl.DateTimeFormat(LOCALE,{weekday:'short',timeZone:TZ});
const keyFmt=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'});
const dayKey=(d:Date|string)=>keyFmt.format(typeof d==='string'?new Date(d):d);
const localDate=(iso:string)=>dateFmt.format(new Date(iso));
function unit(n:number,one:string,two:string,few:string,many:string){return n<=1?one:n===2?two:n<=10?`${n} ${few}`:`${n} ${many}`;}
function relative(iso:string,now=Date.now()){
  const diff=new Date(iso).getTime()-now;
  if(diff<=0)return 'الحين';
  if(diff<3_600_000)return 'بعد '+unit(Math.max(1,Math.round(diff/60_000)),'دقيقة','دقيقتين','دقايق','دقيقة');
  if(diff<DAY)return 'بعد '+unit(Math.round(diff/3_600_000),'ساعة','ساعتين','ساعات','ساعة');
  const days=Math.round((new Date(dayKey(new Date(iso))).getTime()-new Date(dayKey(new Date(now))).getTime())/DAY);
  if(days<=1)return 'بكرة';
  if(days<30)return 'بعد '+unit(days,'يوم','يومين','أيام','يوم');
  if(days<365)return 'بعد '+unit(Math.round(days/30),'شهر','شهرين','شهور','شهر');
  return 'بعد '+unit(Math.round(days/365),'سنة','سنتين','سنوات','سنة');
}
function countWords(n:number){if(n===0)return 'ولا كلمة';if(n===1)return 'كلمة وحدة';if(n===2)return 'كلمتين';if(n<=10)return `${n} كلمات`;return `${n} كلمة`;}
function wordUnit(n:number){return n===1?'كلمة':n===2?'كلمتين':n>=3&&n<=10?'كلمات':'كلمة';}
const isDue=(w:Word,now=Date.now())=>new Date(w.dueAt).getTime()<=now;
const canSpeak=typeof window!=='undefined'&&'speechSynthesis' in window;
function speak(text:string){if(!canSpeak||!text.trim())return;window.speechSynthesis.cancel();const voice=new SpeechSynthesisUtterance(text);voice.lang='en-US';voice.rate=.87;window.speechSynthesis.speak(voice);}
type Stage='new'|'learning'|'growing'|'strong';
function stageOf(w:Word):Stage{const s=Number(w.fsrsState.state),st=Number(w.fsrsState.stability);if(!s)return 'new';if(s===1||s===3)return 'learning';return st>=21?'strong':'growing';}
const stageLabel:Record<Stage,string>={new:'جديدة',learning:'تتعلمها',growing:'تثبت',strong:'ثابتة'};

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
function ConfirmDialog({open,title,body,confirm,onConfirm,onCancel}:{open:boolean;title:string;body:string;confirm:string;onConfirm:()=>void;onCancel:()=>void}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const d=ref.current;if(!d)return;if(open&&!d.open)d.showModal();if(!open&&d.open)d.close();},[open]);
  return <dialog ref={ref} className="sheet" onCancel={e=>{e.preventDefault();onCancel();}} aria-labelledby="sheet-title">
    <h2 id="sheet-title">{title}</h2><p>{body}</p>
    <div className="sheet-actions"><button type="button" className="btn btn-danger" onClick={onConfirm}>{confirm}</button><button type="button" className="btn btn-quiet" onClick={onCancel} autoFocus>لا، خلها</button></div>
  </dialog>;
}

/* ───────────── Home ───────────── */
function HomePage({words,reviews,lastBackup,onNavigate}:{words:Word[];reviews:Review[];lastBackup:string|null;onNavigate:(p:Page)=>void}){
  const stats=summary(words,reviews),now=Date.now();
  const active=useMemo(()=>words.filter(w=>!w.archived),[words]);
  const dueWords=active.filter(w=>isDue(w,now));
  const upcoming=active.filter(w=>!isDue(w,now));
  const weekAhead=upcoming.filter(w=>new Date(w.dueAt).getTime()<=now+7*DAY).length;
  const backupStale=active.length>=5&&(!lastBackup||now-new Date(lastBackup).getTime()>14*DAY);

  if(!active.length)return <div className="home">
    <section className="hero hero-first">
      <Wash/>
      <div className="hero-copy">
        <h1 tabIndex={-1}>كلمة اليوم،<br/>تبقى معك.</h1>
        <p className="lead">أضف كلمة إنجليزية صادفتها، ونرجّعها لك في الوقت المناسب قبل ما تنساها.</p>
        <button type="button" className="btn btn-ink btn-lg" onClick={()=>onNavigate('add')}>{copy.addWord}<ArrowLeft size={20}/></button>
      </div>
      <div className="paper-stack" aria-hidden="true"><div className="paper p1"><span>your first</span><b>word</b></div><div className="paper p2"><b>?</b></div></div>
    </section>
    <section className="how" aria-labelledby="how-title">
      <h2 id="how-title">كيف تشتغل؟</h2>
      <ol className="steps">
        <li><b>أضف كلمة</b><span>الكلمة ومعناها، وجملة تذكّرك فيها إذا تبي.</span></li>
        <li><b>راجعها في وقتها</b><span>نرجّع لك الكلمة لما تقرب تنساها، وأنت تقيّم تذكّرك لها.</span></li>
        <li><b>احتفظ بنسخة</b><span>كلماتك على هذا الجهاز بس، فحمّل نسخة منها كل فترة.</span></li>
      </ol>
      <p className="privacy-line"><HardDrive size={16}/> {copy.privacy} ما تحتاج حساب.</p>
    </section>
  </div>;

  const hasDue=stats.due>0;
  const next=upcoming[0];
  const preview=(hasDue?dueWords:upcoming).slice(0,3);
  return <div className="home">
    <section className={'hero '+(hasDue?'hero-due':'hero-calm')}>
      <Wash tone={hasDue?'full':'cool'}/>
      <div className="hero-copy">
        <h1 tabIndex={-1}>{hasDue?copy.due:copy.noDue}</h1>
        <p className="lead">{hasDue?copy.dueLead:next?`أقرب مراجعة ${relative(next.dueAt,now)}. لين ذاك الوقت، تقدر تضيف كلمة جديدة.`:'تقدر تضيف كلمة جديدة الحين.'}</p>
        <div className="hero-actions">
          <button type="button" className="btn btn-ink btn-lg" onClick={()=>onNavigate(hasDue?'review':'add')}>{hasDue?copy.startReview:copy.addWord}<ArrowLeft size={20}/></button>
          {hasDue&&<p className="hero-count"><b>{stats.due}</b><span>{wordUnit(stats.due)} تنتظرك</span></p>}
        </div>
      </div>
      <div className="paper-stack" aria-hidden="true">{preview.map((w,i)=><div key={w.id} className={'paper p'+(i+1)}><span>{hasDue?'جاهزة للمراجعة':relative(w.dueAt,now)}</span><b dir="ltr">{w.term}</b></div>)}</div>
    </section>

    <dl className="facts">
      <div><dt>في مكتبتك</dt><dd>{stats.total}<small>{wordUnit(stats.total)}</small></dd></div>
      <div><dt>راجعتها اليوم</dt><dd>{stats.reviewedToday}<small>{stats.reviewedToday===1?'مراجعة':'مراجعات'}</small></dd></div>
      <div><dt>تنتظرك هذا الأسبوع</dt><dd>{weekAhead}<small>{wordUnit(weekAhead)}</small></dd></div>
    </dl>

    <div className="home-row">
      {backupStale?<button type="button" className="nudge" onClick={()=>onNavigate('settings')}><span className="nudge-icon warm"><Download size={20}/></span><span><b>صار لك فترة ما حمّلت نسخة</b><small>{lastBackup?`آخر نسخة ${localDate(lastBackup)}.`:'ما حمّلت نسخة من قبل.'} نسخة وحدة تحمي كلماتك لو انمسحت بيانات المتصفح.</small></span><ArrowLeft size={18}/></button>
        :<div className="nudge static"><span className="nudge-icon mint"><HardDrive size={20}/></span><span><b>{copy.privacy}</b><small>ما نرفع كلماتك ولا مراجعاتك لأي خادم.</small></span></div>}
      <button type="button" className="nudge ink" onClick={()=>onNavigate('add')}><span className="nudge-icon"><Plus size={22}/></span><span><b>تعلّمت كلمة جديدة؟</b><small>أضفها الحين قبل ما تطير.</small></span><ArrowLeft size={18}/></button>
    </div>
  </div>;
}

/* ───────────── Add word ───────────── */
function AddPage({words,onSaved,notify,onNavigate}:{words:Word[];onSaved:()=>Promise<void>;notify:Notify;onNavigate:(p:Page)=>void}){
  const [term,setTerm]=useState(''),[meaning,setMeaning]=useState(''),[example,setExample]=useState(''),[translation,setTranslation]=useState(''),[tag,setTag]=useState('');
  const [loading,setLoading]=useState(false),[error,setError]=useState(''),[tried,setTried]=useState(false),[saved,setSaved]=useState<string|null>(null);
  const termRef=useRef<HTMLInputElement>(null);
  const tags=useMemo(()=>[...new Set(words.filter(w=>!w.archived).map(w=>w.tag).filter(Boolean))].slice(0,12),[words]);
  const duplicate=term.trim()&&words.some(w=>!w.archived&&w.term.toLocaleLowerCase()===term.trim().toLocaleLowerCase());
  async function submit(e:FormEvent){
    e.preventDefault();setTried(true);setError('');
    if(!term.trim()||!meaning.trim()){(!term.trim()?termRef.current:document.getElementById('meaning'))?.focus();return;}
    setLoading(true);
    try{
      await addWord({term,meaning,example,translation,tag});
      const t=term.trim();setTerm('');setMeaning('');setExample('');setTranslation('');setTag('');setTried(false);setSaved(t);
      notify(`حفظنا «${t}». بتطلع لك في المراجعة.`);await onSaved();termRef.current?.focus();
    }catch(err){setError(getError(err));}finally{setLoading(false);}
  }
  const missing=(v:string)=>tried&&!v.trim();
  return <div className="page add-page">
    <PageHead title="وش الكلمة الجديدة؟" lead="اكتب معناها مثل ما فهمته، والباقي علينا."/>
    <div className="add-layout">
      <form className="word-form" onSubmit={submit} noValidate>
        <div className={'field'+(missing(term)?' invalid':'')}>
          <label htmlFor="term">الكلمة بالإنجليزي</label>
          <div className="input-wrap"><input ref={termRef} id="term" dir="ltr" lang="en" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="overlook" maxLength={100} value={term} onChange={e=>{setTerm(e.target.value);setSaved(null);}} aria-invalid={missing(term)} aria-describedby="term-hint"/><SpeakButton text={term} label="اسمع نطق الكلمة" className="icon-btn in-input"/></div>
          <p id="term-hint" className="hint">{missing(term)?'اكتب الكلمة أول.':duplicate?'هذي الكلمة موجودة عندك من قبل.':'كلمة أو عبارة قصيرة.'}</p>
        </div>
        <div className={'field'+(missing(meaning)?' invalid':'')}>
          <label htmlFor="meaning">وش معناها؟</label>
          <input id="meaning" maxLength={240} placeholder="يغفل عن، ما ينتبه له" value={meaning} onChange={e=>setMeaning(e.target.value)} aria-invalid={missing(meaning)} aria-describedby={missing(meaning)?'meaning-hint':undefined}/>
          {missing(meaning)&&<p id="meaning-hint" className="hint">اكتب المعنى عشان نقدر نحفظ الكلمة.</p>}
        </div>
        <div className="field">
          <label htmlFor="example">جملة تذكّرك فيها <small>اختياري</small></label>
          <textarea id="example" dir="ltr" lang="en" rows={2} maxLength={500} placeholder="I overlooked an important email." value={example} onChange={e=>setExample(e.target.value)}/>
        </div>
        <div className="field">
          <label htmlFor="translation">معنى الجملة <small>اختياري</small></label>
          <input id="translation" maxLength={400} placeholder="فاتتني رسالة مهمة." value={translation} onChange={e=>setTranslation(e.target.value)}/>
        </div>
        <div className="field">
          <label htmlFor="tag">التصنيف <small>اختياري</small></label>
          <input id="tag" list="tag-list" maxLength={40} placeholder="عمل، قراءة، سفر…" value={tag} onChange={e=>setTag(e.target.value)}/>
          <datalist id="tag-list">{tags.map(t=><option key={t} value={t}/>)}</datalist>
          {tags.length>0&&<div className="chips" role="group" aria-label="تصنيفات سابقة">{tags.slice(0,6).map(t=><button type="button" key={t} className={'chip'+(tag===t?' on':'')} aria-pressed={tag===t} onClick={()=>setTag(tag===t?'':t)}>{t}</button>)}</div>}
        </div>
        {error&&<p className="inline-error" role="alert">{error}</p>}
        <div className="form-foot">
          <button disabled={loading} type="submit" className="btn btn-ink btn-lg">{loading?'نحفظ الكلمة…':'احفظ الكلمة'}{!loading&&<Check size={20}/>}</button>
          {saved&&<button type="button" className="btn btn-quiet" onClick={()=>onNavigate('words')}>شوف كلماتي</button>}
        </div>
      </form>
      <aside className="add-aside" aria-hidden="true"><Wash tone="warm"/><div className="aside-card"><span dir="ltr">{term.trim()||'overlook'}</span><p>{meaning.trim()||'يغفل عن، ما ينتبه له'}</p>{(example.trim()||!term.trim())&&<em dir="ltr">{example.trim()||'I overlooked an important email.'}</em>}</div><p className="aside-note">مو لازم تحفظها من أول مرة. كل ما رجعت لها في وقتها، تثبت أكثر.</p></aside>
    </div>
  </div>;
}

/* ───────────── Review ───────────── */
function ReviewPage({words,onReviewed,onNavigate}:{words:Word[];onReviewed:()=>Promise<void>;onNavigate:(p:Page)=>void}){
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
      if(revealed){const g=grades.find(x=>x.key===e.key);if(g){e.preventDefault();void review(g.id);}}
    };
    window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
  },[revealed,review]);
  useEffect(()=>{
    if(revealed){const g=gradesRef.current;g?.scrollIntoView({block:'nearest',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});g?.focus({preventScroll:true});}
    else revealRef.current?.focus({preventScroll:true});
  },[revealed,active?.id]);

  if(!active){
    const moreDue=dueIds().length;
    return <section className="finish">
      <div className="finish-orb" aria-hidden="true"><Wash/></div>
      <h1 tabIndex={-1}>{done?copy.done:copy.noDue}</h1>
      <p className="lead">{done?`راجعت ${countWords(done)}. كل مراجعة تخليها تثبت أكثر.`:'كلماتك مرتاحة الحين. نرجّعها لك لما يحين وقتها.'}</p>
      {msg&&<p className="inline-error" role="alert">{msg}</p>}
      {last&&<p className="finish-note">«<span dir="ltr">{last.term}</span>» بترجع لك {relative(last.next)}.</p>}
      <div className="finish-actions">
        {moreDue>0&&<button type="button" className="btn btn-ink btn-lg" onClick={()=>{setQueue(dueIds());setDone(0);setLast(null);setMsg('');}}>راجع اللي رجعت ({moreDue})<RotateCcw size={18}/></button>}
        <button type="button" className={'btn btn-lg '+(moreDue?'btn-quiet':'btn-ink')} onClick={()=>onNavigate(done?'home':'add')}>{done?'ارجع للرئيسية':copy.addWord}<ArrowLeft size={20}/></button>
      </div>
    </section>;
  }
  const total=done+queue.length;
  return <section className="review" aria-labelledby="review-title">
    <div className="review-top">
      <h1 id="review-title" tabIndex={-1} className="visually-hidden">المراجعة</h1>
      <div className="progress" role="progressbar" aria-label="تقدم المراجعة" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-valuetext={`${done} من ${total}`}><span style={{inlineSize:`${Math.max(4,100*done/total)}%`}}/></div>
      <p className="review-count"><b>{done+1}</b> من {total}</p>
    </div>
    <div className="last-line" aria-live="polite">{last?<>«<span dir="ltr">{last.term}</span>» بترجع لك {relative(last.next)}.</>:'فكّر في معناها، بعدين شوف الإجابة.'}</div>
    <article key={active.id} className={'card'+(revealed?' is-open':'')} aria-live="polite">
      <Wash tone="soft"/>
      <div className="card-top"><span className="tag">{active.tag}</span><SpeakButton text={active.term} label={`اسمع نطق ${active.term}`}/></div>
      <h2 dir="ltr" lang="en" className="term">{active.term}</h2>
      {active.example&&<p className="example" dir="ltr" lang="en">{active.example}</p>}
      {revealed?<div className="answer"><strong>{active.meaning}</strong>{active.translation&&<p>{active.translation}</p>}</div>
        :<button ref={revealRef} type="button" className="btn btn-ink btn-lg reveal" onClick={()=>setRevealed(true)}>{copy.reveal}</button>}
    </article>
    {msg&&<p className="inline-error" role="alert">{msg}</p>}
    {revealed&&<div ref={gradesRef} tabIndex={-1} className="grades" role="group" aria-labelledby="grades-title">
      <h2 id="grades-title">كيف كان تذكّرك لها؟</h2>
      <div className="grade-row">{grades.map(g=><button type="button" key={g.id} className={'grade g-'+g.id} disabled={busy} onClick={()=>void review(g.id)}><b>{g.label}</b><span>{g.note}</span><kbd aria-hidden="true">{g.key}</kbd></button>)}</div>
    </div>}
    <p className="keys-hint" aria-hidden="true">من الكيبورد: المسطرة تكشف الإجابة، والأرقام من 1 إلى 4 للتقييم.</p>
  </section>;
}

/* ───────────── Library ───────────── */
function WordsPage({words,reviews,onArchived,onNavigate,notify}:{words:Word[];reviews:Review[];onArchived:()=>Promise<void>;onNavigate:(p:Page)=>void;notify:Notify}){
  const [q,setQ]=useState(''),[filter,setFilter]=useState<string>('all'),[open,setOpen]=useState<string|null>(null),[pending,setPending]=useState<Word|null>(null);
  const active=useMemo(()=>words.filter(w=>!w.archived),[words]);
  const tags=useMemo(()=>{const m=new Map<string,number>();for(const w of active)m.set(w.tag,(m.get(w.tag)||0)+1);return [...m].sort((a,b)=>b[1]-a[1]).slice(0,6).map(x=>x[0]);},[active]);
  const reviewCount=useMemo(()=>{const m=new Map<string,number>();for(const r of reviews)m.set(r.wordId,(m.get(r.wordId)||0)+1);return m;},[reviews]);
  const now=Date.now(),dueCount=active.filter(w=>isDue(w,now)).length;
  const list=useMemo(()=>{const s=q.trim().toLocaleLowerCase();return active.filter(w=>(filter==='all'||(filter==='due'?isDue(w):w.tag===filter))&&(!s||[w.term,w.meaning,w.tag,w.example,w.translation].some(x=>x.toLocaleLowerCase().includes(s)))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));},[active,q,filter]);
  async function confirmArchive(){const w=pending;setPending(null);if(!w)return;try{await archiveWord(w.id);await onArchived();notify(`شلنا «${w.term}» من كلماتك.`);}catch(e){notify(getError(e),'error');}}
  return <div className="page">
    <PageHead title="هذي كلماتك." lead={active.length?`${countWords(active.length)} في مكتبتك. كل وحدة منها خطوة في تعلّمك.`:'كل كلمة تضيفها بتلقاها هنا.'}>
      <button type="button" className="btn btn-ink" onClick={()=>onNavigate('add')}><Plus size={18}/>أضف كلمة</button>
    </PageHead>
    {active.length>0&&<div className="library-tools">
      <label className="search"><Search size={19}/><span className="visually-hidden">ابحث في كلماتك</span><input type="search" value={q} onChange={e=>setQ(e.target.value)} placeholder="دوّر على كلمة أو معنى…" enterKeyHint="search"/>{q&&<button type="button" className="icon-btn ghost" aria-label="امسح البحث" onClick={()=>setQ('')}><X size={17}/></button>}</label>
      <div className="chips" role="group" aria-label="عرض الكلمات">
        <button type="button" className={'chip'+(filter==='all'?' on':'')} aria-pressed={filter==='all'} onClick={()=>setFilter('all')}>الكل</button>
        <button type="button" className={'chip'+(filter==='due'?' on':'')} aria-pressed={filter==='due'} onClick={()=>setFilter('due')}>تنتظر مراجعة {dueCount>0&&<span className="chip-n">{dueCount}</span>}</button>
        {tags.length>1&&tags.map(t=><button type="button" key={t} className={'chip'+(filter===t?' on':'')} aria-pressed={filter===t} onClick={()=>setFilter(filter===t?'all':t)}>{t}</button>)}
      </div>
    </div>}
    {!active.length?<div className="empty"><Wash tone="soft"/><BookOpen size={30} strokeWidth={1.6}/><h2>مكتبتك تنتظر أول كلمة</h2><p>أول كلمة تضيفها بتطلع هنا، ومعها موعد مراجعتها.</p><button type="button" className="btn btn-ink" onClick={()=>onNavigate('add')}>{copy.addWord}<ArrowLeft size={18}/></button></div>
    :!list.length?<div className="empty small"><Search size={26} strokeWidth={1.6}/><h2>ما لقينا شي يطابق بحثك</h2><p>جرّب كلمة ثانية، أو امسح البحث وشوف كل كلماتك.</p><button type="button" className="btn btn-quiet" onClick={()=>{setQ('');setFilter('all');}}>اعرض كل الكلمات</button></div>
    :<ul className="word-list" aria-label="الكلمات">{list.map(w=>{const due=isDue(w,now),isOpen=open===w.id,n=reviewCount.get(w.id)||0;return <li key={w.id} className={'word'+(isOpen?' open':'')}>
      <button type="button" className="word-main" aria-expanded={isOpen} aria-controls={'wd-'+w.id} onClick={()=>setOpen(isOpen?null:w.id)}>
        <span className="word-text"><b dir="ltr" lang="en">{w.term}</b><span>{w.meaning}</span></span>
        <span className={'due-pill'+(due?' is-due':'')}>{due?'وقت مراجعتها':relative(w.dueAt,now)}</span>
        <ChevronDown size={18} className="chev" aria-hidden="true"/>
      </button>
      {isOpen&&<div className="word-detail" id={'wd-'+w.id}>
        {w.example&&<p className="example" dir="ltr" lang="en">{w.example}</p>}
        {w.translation&&<p className="translation">{w.translation}</p>}
        <dl className="word-meta"><div><dt>التصنيف</dt><dd>{w.tag}</dd></div><div><dt>المرحلة</dt><dd>{stageLabel[stageOf(w)]}</dd></div><div><dt>راجعتها</dt><dd>{n?`${n} ${n===1?'مرة':n===2?'مرتين':'مرات'}`:'لسا'}</dd></div><div><dt>المراجعة الجاية</dt><dd>{due?'الحين':localDate(w.dueAt)}</dd></div></dl>
        <div className="word-actions"><SpeakButton text={w.term} label={`اسمع نطق ${w.term}`} className="btn btn-quiet sm"/><button type="button" className="btn btn-quiet sm danger" onClick={()=>setPending(w)}><Trash2 size={16}/>شيلها من كلماتي</button></div>
      </div>}
    </li>;})}</ul>}
    <ConfirmDialog open={!!pending} title={`تبي تشيل «${pending?.term||''}»؟`} body="ما بتطلع لك في المراجعة ولا في مكتبتك. سجل مراجعاتها يبقى محفوظ في النسخ اللي تحمّلها." confirm="إيه، شيلها" onConfirm={()=>void confirmArchive()} onCancel={()=>setPending(null)}/>
  </div>;
}

/* ───────────── Progress / stats ───────────── */
const gradeColor:Record<Grade,string>={again:'#d6513f',hard:'#d99a1c',good:'#2f9a6a',easy:'#2f6fb8'};
function StatsPage({words,reviews,onNavigate}:{words:Word[];reviews:Review[];onNavigate:(p:Page)=>void}){
  const now=new Date(),today=dayKey(now);
  const active=useMemo(()=>words.filter(w=>!w.archived),[words]);
  const data=useMemo(()=>{
    const days=(n:number,dir:1|-1)=>Array.from({length:n},(_,i)=>new Date(now.getTime()+dir*i*DAY));
    const ahead=days(7,1).map((d,i)=>{const k=dayKey(d);return {k,label:i===0?'اليوم':i===1?'بكرة':weekdayFmt.format(d),n:active.filter(w=>{const wk=dayKey(w.dueAt);return i===0?wk<=k:wk===k;}).length};});
    const perDay=new Map<string,number>();for(const r of reviews){const k=dayKey(r.reviewedAt);perDay.set(k,(perDay.get(k)||0)+1);}
    const past=days(28,-1).reverse().map(d=>({k:dayKey(d),date:d,n:perDay.get(dayKey(d))||0}));
    const gradeN:Record<Grade,number>={again:0,hard:0,good:0,easy:0};for(const r of reviews)gradeN[r.grade]++;
    const stages:Record<Stage,number>={new:0,learning:0,growing:0,strong:0};for(const w of active)stages[stageOf(w)]++;
    return {ahead,past,gradeN,stages,activeDays:past.filter(p=>p.n>0).length};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[active,reviews,today]);
  if(!active.length&&!reviews.length)return <div className="page"><PageHead title="تقدّمك" lead="هنا بتشوف كيف تمشي كلماتك مع الوقت."/><div className="empty"><Wash tone="soft"/><LineChart size={30} strokeWidth={1.6}/><h2>ما فيه شي نعرضه للحين</h2><p>أضف كلماتك الأولى وراجعها، وبنوريك هنا كيف تثبت معك.</p><button type="button" className="btn btn-ink" onClick={()=>onNavigate('add')}>{copy.addWord}<ArrowLeft size={18}/></button></div></div>;
  const maxAhead=Math.max(1,...data.ahead.map(d=>d.n)),maxPast=Math.max(1,...data.past.map(d=>d.n));
  const totalGrades=reviews.length,stageTotal=Math.max(1,active.length);
  return <div className="page stats">
    <PageHead title="تقدّمك" lead={data.activeDays?`راجعت في ${data.activeDays===1?'يوم واحد':data.activeDays===2?'يومين':data.activeDays<=10?`${data.activeDays} أيام`:`${data.activeDays} يوم`} من آخر 4 أسابيع. الاستمرار أهم من الكمية.`:'أول مراجعة لك بتبدأ ترسم هذي الصفحة.'}/>
    <div className="stats-grid">
      <section className="panel panel-wide">
        <h2>وش ينتظرك هالأسبوع</h2><p className="panel-note">عدد الكلمات اللي بيحين وقت مراجعتها كل يوم.</p>
        <ol className="bars" aria-label="الكلمات المستحقة في الأيام السبعة الجاية">{data.ahead.map((d,i)=><li key={d.k} style={{'--i':i} as CSSProperties} title={`${d.label}: ${countWords(d.n)}`}><span className="bar-n">{d.n}</span><span className="bar" style={{blockSize:`${Math.max(d.n?8:2,100*d.n/maxAhead)}%`}} data-zero={d.n===0||undefined}/><span className="bar-label">{d.label}</span></li>)}</ol>
      </section>
      <section className="panel">
        <h2>أيام مراجعتك</h2><p className="panel-note">آخر 4 أسابيع. كل مربع يوم، وكل ما غمق راجعت أكثر.</p>
        <ol className="heat" aria-label="عدد المراجعات في آخر 28 يوم">{data.past.map(p=>{const lvl=p.n===0?0:Math.min(4,Math.ceil(4*p.n/maxPast));return <li key={p.k} className={'lv'+lvl+(p.k===today?' today':'')} title={`${localDate(p.date.toISOString())}: ${p.n} ${p.n===1?'مراجعة':'مراجعات'}`}><span className="visually-hidden">{localDate(p.date.toISOString())}: {p.n}</span></li>;})}</ol>
        <div className="heat-legend" aria-hidden="true"><span>أقل</span><i className="lv0"/><i className="lv1"/><i className="lv2"/><i className="lv3"/><i className="lv4"/><span>أكثر</span></div>
      </section>
      <section className="panel">
        <h2>وين وصلت كلماتك</h2><p className="panel-note">كل ما رجعت للكلمة في وقتها، تنتقل لمرحلة أثبت.</p>
        <ul className="stages">{(Object.keys(stageLabel) as Stage[]).map((s,i)=><li key={s}><span className="stage-name">{stageLabel[s]}</span><span className="stage-track"><span className={'stage-fill s'+i} style={{inlineSize:`${100*data.stages[s]/stageTotal}%`}}/></span><b>{data.stages[s]}</b></li>)}</ul>
      </section>
      <section className="panel panel-wide">
        <h2>كيف تقيّم تذكّرك</h2>
        {totalGrades?<>
          <p className="panel-note">من {totalGrades} {totalGrades===1?'مراجعة':'مراجعات'} لحد الحين. «نسيتها» جزء طبيعي من التعلّم.</p>
          <div className="stack" aria-hidden="true">{grades.map(g=>data.gradeN[g.id]>0&&<span key={g.id} style={{flexGrow:data.gradeN[g.id],background:gradeColor[g.id]}} title={`${g.label}: ${data.gradeN[g.id]}`}/>)}</div>
          <ul className="legend">{grades.map(g=><li key={g.id}><i style={{background:gradeColor[g.id]}}/><span>{g.label}</span><span className="lv"><b>{data.gradeN[g.id]}</b><small>{Math.round(100*data.gradeN[g.id]/totalGrades)}%</small></span></li>)}</ul>
        </>:<p className="panel-note">لما تراجع أول كلمة، بنوريك هنا كيف كانت تقييماتك.</p>}
      </section>
    </div>
  </div>;
}

/* ───────────── Settings ───────────── */
type InstallPrompt=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
function withTimeout<T>(p:Promise<T>,ms:number,fallback:T){return Promise.race([p,new Promise<T>(r=>setTimeout(()=>r(fallback),ms))]);}
function SettingsPage({words,online,lastBackup,setLastBackup,installPrompt,onInstalled,onRestored,notify}:{words:Word[];online:boolean;lastBackup:string|null;setLastBackup:(v:string)=>void;installPrompt:InstallPrompt|null;onInstalled:()=>void;onRestored:()=>Promise<void>;notify:Notify}){
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
    try{const backup=await buildBackup();const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`wordloop-backup-${new Date().toISOString().slice(0,10)}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);await rememberBackup();setLastBackup(new Date().toISOString());notify('جهّزنا نسختك. احفظ الملف في مكان آمن برا المتصفح، مثل ملفاتك أو بريدك.');}
    catch(e){notify(getError(e),'error');}
  }
  async function importWords(file?:File){
    if(!file)return;
    try{
      if(file.size>20*1024*1024){notify('الملف أكبر من 20 ميجابايت، ما نقدر نرجّعه.','error');return;}
      const data=validateBackup(JSON.parse(await file.text()));
      if(!window.confirm(`الملف فيه ${countWords(data.words.length)}.\nإذا رجّعته، بيحل محل كل الكلمات والمراجعات اللي على هذا الجهاز الحين.\nتكمل؟`))return;
      await restoreBackup(data);await onRestored();notify(`رجّعنا ${countWords(data.words.length)} مع مراجعاتها.`);
    }catch(e){notify(getError(e),'error');}
    finally{if(input.current)input.current.value='';}
  }
  async function notifications(action:'enable'|'disable'|'test'){
    setBusy(true);
    try{
      if(action==='enable'){await enablePush(words);setPush('enabled');notify('تمام! بنذكّرك إذا حان وقت المراجعة.');}
      else if(action==='disable'){await disablePush();setPush('disabled');notify('أوقفنا التذكير على هذا الجهاز.');}
      else{await testPush();notify('أرسلنا إشعار تجريبي. إذا ما وصلك خلال دقيقة، شيك على إعدادات الإشعارات في جهازك.');}
    }catch(e){notify(getError(e),'error');}
    finally{setBusy(false);if(typeof Notification!=='undefined')setPermission(Notification.permission);}
  }
  async function protectStorage(){
    try{if(!navigator.storage?.persist){setPersisted('unsupported');notify('هذا المتصفح ما يدعم حماية التخزين. حمّل نسخة من كلماتك كل فترة.','error');return;}
      const granted=await navigator.storage.persist();setPersisted(granted?'yes':'no');
      notify(granted?'المتصفح وافق يحمي كلماتك من المسح التلقائي.':'المتصفح ما وافق للحين. غالبًا يوافق بعد ما تثبّت التطبيق أو تستخدمه أكثر. لين ذاك الوقت، حمّل نسخة كل فترة.',granted?'ok':'error');
    }catch(e){notify(getError(e),'error');}
  }
  async function install(){if(!installPrompt)return;await installPrompt.prompt();const c=await installPrompt.userChoice;if(c.outcome==='accepted')onInstalled();}
  const checks:{ok:boolean|null;label:string;help?:string}[]=[
    {ok:supported,label:'المتصفح يدعم التذكيرات',help:supported?undefined:ios?'على الآيفون، التذكيرات تشتغل بس لما تفتح WordLoop من الشاشة الرئيسية (iOS 16.4 أو أحدث).':'جرّب Chrome أو Edge أو Safari بنسخة حديثة.'},
    ...(ios?[{ok:standalone,label:'WordLoop مضاف للشاشة الرئيسية',help:standalone?undefined:'من Safari: اضغط زر المشاركة، بعدين «إضافة إلى الشاشة الرئيسية»، وافتحه من هناك.'}]:[]),
    {ok:permission==='granted'?true:permission==='denied'?false:null,label:permission==='denied'?'الإشعارات مرفوضة':permission==='granted'?'سمحت بالإشعارات':'سماح الإشعارات',help:permission==='denied'?'رفضت الإشعارات قبل. فعّلها من إعدادات الموقع في المتصفح أو من إعدادات الجوال.':permission==='granted'?undefined:'بنطلب منك السماح لما تضغط «فعّل التذكير».'},
    {ok:online,label:online?'متصل بالإنترنت':'بدون إنترنت',help:online?undefined:'التفعيل والتجربة يحتاجون إنترنت. المراجعة نفسها تشتغل بدونه.'},
  ];
  return <div className="page settings">
    <PageHead title="كلماتك، على جهازك." lead="ما تحتاج حساب. أنت المتحكم في كلماتك ونسخها."/>
    <section className="privacy-hero"><Wash tone="cool"/><ShieldCheck size={28} strokeWidth={1.6}/><div><h2>{copy.privacy}</h2><p>كلماتك ومراجعاتك محفوظة في هذا المتصفح بس، وما نرفعها لأي خادم. إذا مسحت بيانات المتصفح أو غيّرت جهازك، ترجّعها من نسخة حمّلتها.</p></div></section>

    <div className="settings-grid">
      <section className="panel" aria-labelledby="backup-title">
        <h2 id="backup-title">نسخة من كلماتك</h2>
        <p className="panel-note">{lastBackup?`آخر نسخة حمّلتها: ${localDate(lastBackup)}.`:'ما حمّلت نسخة من قبل.'} {activeCount>0&&`عندك الحين ${countWords(activeCount)}.`}</p>
        <div className="tiles">
          <button type="button" className="tile" onClick={()=>void exportWords()} disabled={!words.length}><span className="tile-icon warm"><ArrowDownToLine size={21}/></span><span><b>{copy.backup}</b><small>{words.length?'ملف فيه كلماتك ومراجعاتك، تحفظه عندك.':'أضف كلمات أول، بعدين حمّل نسختها.'}</small></span></button>
          <button type="button" className="tile" onClick={()=>input.current?.click()}><span className="tile-icon mint"><ArrowUpFromLine size={21}/></span><span><b>{copy.restore}</b><small>اختر ملف نسخة حمّلته من WordLoop.</small></span></button>
          <input className="visually-hidden" tabIndex={-1} aria-hidden="true" type="file" accept=".json,application/json" ref={input} onChange={e=>void importWords(e.target.files?.[0])}/>
        </div>
        <p className="caution">إذا رجّعت ملف، بيحل محل الكلمات اللي على هذا الجهاز. حمّل نسختك الحالية قبلها إذا تبيها.</p>
      </section>

      <section className="panel" aria-labelledby="push-title">
        <div className="panel-head"><h2 id="push-title">تذكير المراجعة</h2><span className={'state '+(push==='enabled'?'on':'')}>{push==='checking'?'نتأكد…':push==='enabled'?'شغّال':push==='unsupported'?'غير متاح':'متوقف'}</span></div>
        <p className="panel-note">إذا عندك كلمات تنتظر، نرسل لك تذكير الساعة 8 مساءً بتوقيت الرياض. الخادم يعرف موعد مراجعتك الجاية بس، ما يعرف كلماتك.</p>
        <ul className="checks">{checks.map(c=><li key={c.label} className={c.ok===true?'ok':c.ok===false?'no':'wait'}><span className="check-dot" aria-hidden="true">{c.ok===true?<Check size={13}/>:c.ok===false?<X size={13}/>:null}</span><span><b>{c.label}</b>{c.help&&<small>{c.help}</small>}</span></li>)}</ul>
        <div className="btn-row">
          {push==='enabled'?<><button type="button" className="btn btn-ink" disabled={busy||!online} onClick={()=>void notifications('test')}><Send size={17}/>جرّب التذكير</button><button type="button" className="btn btn-quiet" disabled={busy} onClick={()=>void notifications('disable')}><BellOff size={17}/>أوقف التذكير</button></>
            :<button type="button" className="btn btn-ink" disabled={busy||!supported||!online||permission==='denied'||push==='checking'} onClick={()=>void notifications('enable')}><Bell size={17}/>{busy?'نفعّل التذكير…':'فعّل التذكير'}</button>}
        </div>
        <p className="fine">إذا راجعت وأنت بدون إنترنت، يتحدّث موعد التذكير أول ما ترجع تفتح التطبيق وأنت متصل.</p>
      </section>

      <section className="panel" aria-labelledby="storage-title">
        <div className="panel-head"><h2 id="storage-title">حماية التخزين</h2><span className={'state '+(persisted==='yes'?'on':'')}>{persisted==='yes'?'محمي':persisted==='checking'?'نتأكد…':persisted==='unsupported'?'غير متاح':'غير محمي'}</span></div>
        <p className="panel-note">نطلب من المتصفح ما يمسح كلماتك لحاله لو امتلأت مساحة الجهاز. هذا ما يغني عن النسخة.</p>
        {persisted!=='yes'&&persisted!=='unsupported'&&<button type="button" className="btn btn-quiet" onClick={()=>void protectStorage()}><HardDrive size={17}/>اطلب حماية كلماتي</button>}
      </section>

      <section className="panel" aria-labelledby="install-title">
        <div className="panel-head"><h2 id="install-title">ثبّت WordLoop</h2><span className={'state '+(standalone?'on':'')}>{standalone?'مثبّت':'من المتصفح'}</span></div>
        <p className="panel-note">{standalone?'أنت تستخدم WordLoop كتطبيق. يشتغل حتى بدون إنترنت.':ios?'من Safari: اضغط زر المشاركة، بعدين «إضافة إلى الشاشة الرئيسية». يفتح مثل التطبيق ويشتغل بدون إنترنت.':'أضفه لشاشتك الرئيسية عشان يفتح مثل التطبيق ويشتغل بدون إنترنت.'}</p>
        {installPrompt&&!standalone&&<button type="button" className="btn btn-quiet" onClick={()=>void install()}><Smartphone size={17}/>ثبّت التطبيق</button>}
      </section>
    </div>
    <p className="privacy-foot"><CloudOff size={17}/> ما نرفع كلماتك ولا مراجعاتك لأي خادم أو قاعدة بيانات سحابية.</p>
  </div>;
}

/* ───────────── Shell ───────────── */
export default function App(){
  const [page,setPage]=useState<Page>(readHash),[words,setWords]=useState<Word[]>([]),[reviews,setReviews]=useState<Review[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [online,setOnline]=useState(()=>navigator.onLine),[toast,setToast]=useState<{id:number;text:string;tone:'ok'|'error'}|null>(null),[lastBackup,setLastBackup]=useState<string|null>(null),[installPrompt,setInstallPrompt]=useState<InstallPrompt|null>(null);
  const first=useRef(true);
  const fetchLocal=useCallback(async()=>{try{const [w,r]=await Promise.all([listWords(),listReviews()]);setWords(w);setReviews(r);setError('');void syncPush(w).catch(console.warn);}catch(e){setError(getError(e));}finally{setLoading(false);}},[]);
  useEffect(()=>{
    void fetchLocal();void lastBackupDate().then(setLastBackup).catch(()=>null);
    const focus=()=>{void fetchLocal();},hash=()=>setPage(readHash()),on=()=>setOnline(true),off=()=>setOnline(false);
    const bip=(e:Event)=>{e.preventDefault();setInstallPrompt(e as InstallPrompt);};
    window.addEventListener('focus',focus);window.addEventListener('hashchange',hash);window.addEventListener('online',on);window.addEventListener('offline',off);window.addEventListener('beforeinstallprompt',bip);
    return()=>{window.removeEventListener('focus',focus);window.removeEventListener('hashchange',hash);window.removeEventListener('online',on);window.removeEventListener('offline',off);window.removeEventListener('beforeinstallprompt',bip);};
  },[fetchLocal]);
  useEffect(()=>{document.title=page==='home'?'WordLoop — كلمة اليوم، تبقى معك':`${pageTitle[page]} · WordLoop`;if(first.current){first.current=false;return;}window.scrollTo({top:0});requestAnimationFrame(()=>document.querySelector<HTMLElement>('main h1')?.focus({preventScroll:true}));},[page]);
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(null),toast.tone==='error'?7000:4200);return()=>clearTimeout(t);},[toast]);
  const notify=useCallback<Notify>((text,tone='ok')=>setToast({id:Date.now(),text,tone}),[]);
  const navigate=(to:Page)=>{if(to===page){window.scrollTo({top:0,behavior:'smooth'});return;}window.location.hash=to==='home'?'/':'/'+to;};
  const due=summary(words,reviews).due;

  let content:ReactNode;
  if(loading)content=<div className="skeleton" aria-busy="true" aria-label="نجهّز كلماتك"><span className="sk sk-hero"/><span className="sk sk-row"/><span className="sk sk-row short"/></div>;
  else if(error&&!words.length)content=<div className="empty fatal" role="alert"><Wash tone="warm"/><CloudOff size={30} strokeWidth={1.6}/><h2>ما قدرنا نفتح كلماتك</h2><p>{error}</p><button type="button" className="btn btn-ink" onClick={()=>{setLoading(true);void fetchLocal();}}><RotateCcw size={17}/>جرّب مرة ثانية</button></div>;
  else content=page==='home'?<HomePage words={words} reviews={reviews} lastBackup={lastBackup} onNavigate={navigate}/>
    :page==='add'?<AddPage words={words} onSaved={fetchLocal} notify={notify} onNavigate={navigate}/>
    :page==='review'?<ReviewPage words={words} onReviewed={fetchLocal} onNavigate={navigate}/>
    :page==='words'?<WordsPage words={words} reviews={reviews} onArchived={fetchLocal} onNavigate={navigate} notify={notify}/>
    :page==='stats'?<StatsPage words={words} reviews={reviews} onNavigate={navigate}/>
    :<SettingsPage words={words} online={online} lastBackup={lastBackup} setLastBackup={setLastBackup} installPrompt={installPrompt} onInstalled={()=>setInstallPrompt(null)} onRestored={fetchLocal} notify={notify}/>;

  return <div className="app" dir="rtl">
    <a href="#main" className="skip">انتقل للمحتوى</a>
    <aside className="rail">
      <a href="#/" className="rail-brand" aria-label="WordLoop، الرئيسية"><Logo/></a>
      <p className="rail-tagline">كلمة اليوم، تبقى معك.</p>
      <button type="button" className="btn btn-ink rail-add" onClick={()=>navigate('add')}><Plus size={18}/>{copy.addWord}</button>
      <nav aria-label="التنقل الرئيسي"><ul>{navItems.map(item=><li key={item.id}><button type="button" onClick={()=>navigate(item.id)} className={'rail-link'+(page===item.id?' on':'')} aria-current={page===item.id?'page':undefined}><item.icon size={20} strokeWidth={1.8}/><span>{item.label}</span>{item.id==='review'&&due>0&&<b className="count" aria-label={`${due} تنتظر`}>{due}</b>}</button></li>)}</ul></nav>
      <div className="rail-foot"><span className={'net'+(online?'':' off')}>{online?<Wifi size={14}/>:<WifiOff size={14}/>}{online?'متصل':'بدون إنترنت'}</span><span><HardDrive size={14}/>{copy.privacy}</span></div>
    </aside>
    <div className="main-col">
      <header className="topbar">
        <a href="#/" aria-label="WordLoop، الرئيسية"><Logo/></a>
        <div className="topbar-end">
          {!online&&<span className="net off"><WifiOff size={14}/>بدون إنترنت</span>}
          <button type="button" className={'icon-btn'+(page==='settings'?' on':'')} aria-label="الإعدادات" aria-current={page==='settings'?'page':undefined} onClick={()=>navigate('settings')}><Settings2 size={21} strokeWidth={1.8}/></button>
        </div>
      </header>
      {!online&&<p className="offline-note" role="status"><WifiOff size={15}/>أنت بدون إنترنت. كلماتك ومراجعتك شغّالة عادي.</p>}
      <main id="main" className="content" key={page}>
        {error&&words.length>0&&<div className="banner" role="alert"><span>{error}</span><button type="button" className="icon-btn ghost" onClick={()=>setError('')} aria-label="إغلاق"><X size={16}/></button></div>}
        {content}
      </main>
    </div>
    <nav className="tabbar" aria-label="التنقل">
      {(['home','review','add','words','stats'] as Page[]).map(id=>{
        if(id==='add')return <button key={id} type="button" className="tab-add" onClick={()=>navigate('add')} aria-label={copy.addWord} aria-current={page==='add'?'page':undefined}><Plus size={26}/></button>;
        const item=navItems.find(n=>n.id===id)!;
        return <button key={id} type="button" className={'tab'+(page===id?' on':'')} aria-current={page===id?'page':undefined} onClick={()=>navigate(id)}><span className="tab-icon"><item.icon size={21} strokeWidth={1.8}/>{id==='review'&&due>0&&<b className="dot-count">{due>99?'99+':due}</b>}</span><span>{item.label}</span></button>;
      })}
    </nav>
    <div className="toast-zone" aria-live="polite">{toast&&<div key={toast.id} className={'toast '+toast.tone} role={toast.tone==='error'?'alert':'status'}><span>{toast.text}</span><button type="button" className="icon-btn ghost" aria-label="إغلاق التنبيه" onClick={()=>setToast(null)}><X size={16}/></button></div>}</div>
  </div>;
}

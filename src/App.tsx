import {useCallback,useEffect,useMemo,useRef,useState,type FormEvent} from 'react';
import {ArrowDownToLine,ArrowLeft,ArrowUpFromLine,BookOpen,CalendarCheck,CheckCheck,ChevronLeft,CloudOff,Database,Feather,HardDrive,Home,Layers3,Lightbulb,Plus,RotateCcw,Settings2,ShieldCheck,Sparkles,Trash2,Volume2,Bell,BellOff,Send,Search,Menu,X} from 'lucide-react';
import {addWord,archiveWord,buildBackup,lastBackupDate,listReviews,listWords,rememberBackup,restoreBackup,reviewWord,summary,validateBackup,type Grade,type Review,type Word} from './data';
import {disablePush,enablePush,pushState,pushSupported,syncPush,testPush} from './push';

type Page='home'|'review'|'words'|'add'|'settings';
const pages:{id:Page;label:string;icon:typeof Home}[]=[
  {id:'home',label:'الرئيسية',icon:Home},{id:'review',label:'المراجعة',icon:Layers3},{id:'words',label:'كلماتي',icon:BookOpen},{id:'settings',label:'الإعدادات',icon:Settings2}
];
const copy={
  welcome:'حان وقت المراجعة',noReview:'ما عليك مراجعة اليوم!',
  subtitle:'بضع دقائق اليوم تخلي كلماتك أقرب لذاكرتك.',
  emptySubtitle:'خذ راحتك. تقدر تضيف كلمة جديدة وتبدأ رحلتك.',
  done:'خلصت مراجعتك، يعطيك العافية!',
  again:'نسيتها',hard:'صعبة',good:'تذكرتها',easy:'سهلة جدًا',
  backup:'احفظ نسخة من كلماتك',restore:'رجّع كلماتك من نسخة سابقة',
  permission:'فعّل التذكير',test:'جرّب الإشعار'
};
function localDate(date:string){return new Intl.DateTimeFormat('ar-SA',{dateStyle:'medium',timeZone:'Asia/Riyadh'}).format(new Date(date));}
function getError(e:unknown){return e instanceof Error?e.message:'صار شيء غير متوقع، جرّب مرة ثانية.';}
function speak(text:string){if(!('speechSynthesis'in window))return;window.speechSynthesis.cancel();const voice=new SpeechSynthesisUtterance(text);voice.lang='en-US';voice.rate=.87;window.speechSynthesis.speak(voice);}
function Logo(){return <div className="brand" dir="ltr" aria-label="WordLoop"><span className="brand-symbol" aria-hidden="true"><span/></span><span>WordLoop</span></div>;}
function Gradient({className=''}:{className?:string}){return <span aria-hidden="true" className={'colour-wash '+className}/>;}
function Sidebar({page,onNavigate,count}:{page:Page;onNavigate:(p:Page)=>void;count:number}){
  return <aside className="sidebar"><div className="sidebar-inner"><div className="side-head"><Logo/><p>كلمة اليوم، تبقى معك.</p></div>
    <nav className="side-links" aria-label="التنقل">{pages.map(item=><button type="button" key={item.id} onClick={()=>onNavigate(item.id)} className={'side-link '+(page===item.id?'selected':'')} aria-current={page===item.id?'page':undefined}><item.icon size={21} strokeWidth={1.9}/><span>{item.label}</span>{item.id==='review'&&count>0&&<b className="nav-count">{count}</b>}</button>)}</nav>
    <div className="side-end"><Gradient/><span className="decorative-sun">✳</span><p>Learn it.<br/><em>Keep it.</em></p></div>
    <div className="private-notice"><HardDrive size={16}/><span>كلماتك تبقى على جهازك</span></div>
  </div></aside>;
}
function HomePage({words,reviews,onNavigate}:{words:Word[];reviews:Review[];onNavigate:(p:Page)=>void}){
  const stats=summary(words,reviews),hasDue=stats.due>0;
  return <>
    <section className="home-heading"><div><p className="overline">أهلًا بك في WordLoop</p><h1>{hasDue?copy.welcome:copy.noReview}<span className="heading-star">✳</span></h1><p className="lead">{hasDue?copy.subtitle:copy.emptySubtitle}</p></div><span className="today-pill"><CalendarCheck size={17}/> خطوة صغيرة، كل يوم</span></section>
    <section className="dashboard-feature">
      <Gradient/><div className="feature-intro"><span className="feature-tag"><span className="tiny-dot"/> مراجعتك اليوم</span><div className="feature-number">{stats.due}<span>كلمة تنتظرك</span></div><h2>كل كلمة تستاهل فرصة ثانية.</h2><p>تذكّر الكلمات اللي تعلمتها، في الوقت اللي تحتاجها فيه.</p><button type="button" className="main-cta" onClick={()=>onNavigate(hasDue?'review':'add')}>{hasDue?'ابدأ مراجعة اليوم':'أضف كلمة جديدة'}<ArrowLeft size={20}/></button></div>
      <div className="feature-art" aria-hidden="true"><div className="art-paper paper-one"><span>Remember</span><b>Grow</b></div><div className="art-paper paper-two"><div className="art-circles">✽ ✳ ✽</div><strong>One word<br/>at a time.</strong><span>WORDLOOP · 2026</span></div></div>
    </section>
    <section className="numbers" aria-label="ملخص التعلم">
      <div className="number-card green"><div className="number-head"><span>كلماتك</span><BookOpen size={20}/></div><strong>{stats.total}</strong><p>كلمة في مكتبتك</p></div>
      <div className="number-card peach"><div className="number-head"><span>بانتظار المراجعة</span><CalendarCheck size={20}/></div><strong>{stats.due}</strong><p>{stats.due?'جاهزة ترجع لذاكرتك':'أنت مخلّص مراجعاتك'}</p></div>
      <div className="number-card cream"><div className="number-head"><span>مراجعات اليوم</span><CheckCheck size={20}/></div><strong>{stats.reviewedToday}</strong><p>محاولة تقوّي ذاكرتك</p></div>
    </section>
    <section className="home-bottom"><div className="tip-strip"><span className="tip-icon"><Feather size={22}/></span><div><h3>تلميحة اليوم</h3><p>اربط الكلمة بجملة من حياتك. بتصير أسهل في التذكّر.</p></div></div>
      <button className="quick-add" type="button" onClick={()=>onNavigate('add')}><Plus size={27}/><span><strong>تعلمت كلمة جديدة؟</strong><small>أضفها الحين وخليها معك.</small></span><ChevronLeft size={20}/></button></section>
  </>;
}
function AddPage({onSaved}:{onSaved:()=>Promise<void>}){
  const [term,setTerm]=useState(''),[meaning,setMeaning]=useState(''),[example,setExample]=useState(''),[translation,setTranslation]=useState(''),[tag,setTag]=useState('عام');
  const [loading,setLoading]=useState(false),[msg,setMsg]=useState('');
  async function submit(e:FormEvent){e.preventDefault();setLoading(true);setMsg('');try{await addWord({term,meaning,example,translation,tag});setTerm('');setMeaning('');setExample('');setTranslation('');setTag('عام');setMsg('حفظنا الكلمة! بتظهر لك وقت المراجعة.');await onSaved();}catch(error){setMsg(getError(error));}finally{setLoading(false);}}
  return <section className="inner-page"><div className="section-intro"><p className="overline">كلمة جديدة، خطوة جديدة</p><h1>وش الكلمة الجديدة؟</h1><p>اكتب معناها كما فهمته من الجملة، والباقي علينا.</p></div><div className="form-layout"><form className="word-form" onSubmit={submit}>
    <div className="field"><label htmlFor="term">الكلمة بالإنجليزية <span>*</span></label><div className="input-action"><input required id="term" placeholder="Overlook" dir="ltr" maxLength={100} value={term} onChange={e=>setTerm(e.target.value)}/><button type="button" title="استمع إلى النطق" aria-label="اسمع نطق الكلمة" onClick={()=>speak(term)} disabled={!term.trim()}><Volume2 size={21}/></button></div></div>
    <div className="field"><label htmlFor="meaning">وش معناها؟ <span>*</span></label><input id="meaning" required maxLength={240} placeholder="يغفل عن / لا ينتبه إلى" value={meaning} onChange={e=>setMeaning(e.target.value)}/></div>
    <div className="field"><label htmlFor="example">جملة تذكّرك فيها <small>اختياري</small></label><textarea id="example" dir="ltr" rows={3} maxLength={500} placeholder="I overlooked an important email." value={example} onChange={e=>setExample(e.target.value)}/></div>
    <div className="field"><label htmlFor="translation">معنى الجملة <small>اختياري</small></label><input id="translation" maxLength={400} placeholder="فاتتني رسالة مهمة" value={translation} onChange={e=>setTranslation(e.target.value)}/></div>
    <div className="field"><label htmlFor="tag">تصنيف الكلمة</label><input id="tag" value={tag} maxLength={40} onChange={e=>setTag(e.target.value)} placeholder="عمل، قراءة، محادثة..."/></div>
    <button disabled={loading} type="submit" className="main-cta form-submit">{loading?'نحفظ الكلمة...':'احفظ الكلمة'}<ArrowLeft size={20}/></button>
    {msg&&<p className="status-message" role="status">{msg}</p>}
  </form><aside className="form-aside"><Gradient/><span className="aside-sun">✳</span><h2>مو لازم تحفظها من أول مرة.</h2><p>كل كلمة ترجع لها في وقتها، تترسخ أكثر.</p><div className="aside-stamp" dir="ltr">SAY IT · USE IT · KEEP IT</div></aside></div></section>;
}
const grades:{id:Grade;label:string;note:string}[]=[{id:'again',label:copy.again,note:'نرجع لها قريب'},{id:'hard',label:copy.hard,note:'تحتاج تدريب'},{id:'good',label:copy.good,note:'ممتاز، كمل'},{id:'easy',label:copy.easy,note:'ثابتة معك'}];
function ReviewPage({words,onReviewed,onNavigate}:{words:Word[];onReviewed:()=>Promise<void>;onNavigate:(p:Page)=>void}){
  const [queue,setQueue]=useState<string[]>([]),[revealed,setRevealed]=useState(false),[busy,setBusy]=useState(false),[done,setDone]=useState(0),[msg,setMsg]=useState('');
  useEffect(()=>{setQueue(words.filter(w=>!w.archived&&new Date(w.dueAt).getTime()<=Date.now()).map(w=>w.id));setDone(0);setRevealed(false);},[]); // Snapshot this review session on mount.
  const active=queue.length?words.find(w=>w.id===queue[0]):undefined;
  const review=async(g:Grade)=>{if(!active||busy)return;setBusy(true);setMsg('');try{await reviewWord(active.id,g);setQueue(v=>v.slice(1));setDone(n=>n+1);setRevealed(false);await onReviewed();}catch(e){setMsg(getError(e));}finally{setBusy(false);}};
  if(!active)return <section className="finish"><div className="finish-art"><Gradient/><Sparkles size={40}/></div><p className="overline">مراجعتك اليوم</p><h1>{done?copy.done:copy.noReview}</h1><p>{done?`راجعت ${done} ${done===1?'كلمة':'كلمات'}. كذا تكون خطوة اليوم خلصت.`:'كلماتك مرتاحة اليوم. تقدر تضيف كلمة جديدة.'}</p><button className="main-cta" onClick={()=>onNavigate(done?'home':'add')}>{done?'العودة للرئيسية':'أضف كلمة'}<ArrowLeft size={20}/></button></section>;
  return <section className="review-page"><div className="section-intro review-intro"><p className="overline">وقت تسترجع كلماتك</p><h1>تتذكر معناها؟</h1><p>فكر فيها شوي، بعدين اكشف المعنى.</p></div><div className="review-progress"><span>{done+1} من {done+queue.length}</span><span>{queue.length} باقي لك</span></div><div className="progress-track"><span style={{width:`${100*done/(done+queue.length)}%`}}/></div>
    <div className="study-card"><span className="card-category">{active.tag}</span><button className="audio-button" aria-label="اسمع النطق" title="نطق الكلمة" onClick={()=>speak(active.term)}><Volume2 size={21}/></button><span className="study-micro">YOUR WORD</span><h2 dir="ltr">{active.term}</h2><p className="example" dir="ltr">{active.example||'Read it. Recall it. Keep it.'}</p>
      {revealed?<div className="answer"><span>المعنى</span><strong>{active.meaning}</strong>{active.translation&&<p>{active.translation}</p>}</div>:<button type="button" className="reveal-cta" onClick={()=>setRevealed(true)}>شوف الإجابة<ArrowLeft size={19}/></button>}
    </div>
    {revealed&&<div className="rating-wrap"><h3>كيف كان تذكرك لها؟</h3><div className="rating-buttons">{grades.map(g=><button type="button" key={g.id} className={'rating '+g.id} disabled={busy} onClick={()=>void review(g.id)}><strong>{g.label}</strong><span>{g.note}</span></button>)}</div></div>}
    {msg&&<p className="status-message" role="alert">{msg}</p>}
  </section>;
}
function WordsPage({words,onArchived,onNavigate}:{words:Word[];onArchived:()=>Promise<void>;onNavigate:(p:Page)=>void}){
  const [q,setQ]=useState('');const list=useMemo(()=>words.filter(w=>!w.archived&&(w.term.toLowerCase().includes(q.toLowerCase())||w.meaning.includes(q)||w.tag.includes(q))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),[words,q]);
  const remove=async(word:Word)=>{if(!window.confirm(`تبي تأرشف كلمة «${word.term}»؟`))return;try{await archiveWord(word.id);await onArchived();}catch(e){window.alert(getError(e));}};
  return <section className="inner-page"><div className="section-intro row-intro"><div><p className="overline">الكلمات اللي جمعتها</p><h1>هذي كلماتك.</h1><p>كل كلمة أضفتها خطوة جديدة في تعلمك.</p></div><button className="main-cta compact" onClick={()=>onNavigate('add')}>أضف كلمة <Plus size={18}/></button></div>
    <div className="search-box"><Search size={20}/><input aria-label="ابحث في كلماتك" value={q} onChange={e=>setQ(e.target.value)} placeholder="تدور على كلمة؟ اكتبها هنا..."/></div>
    {!list.length?<div className="empty-list"><BookOpen size={34}/><h2>{words.length?'ما لقينا كلمة بهذا الاسم':'مكتبتك تنتظر أول كلمة'}</h2><p>كل يوم تتعلم كلمة جديدة، راح تشوفها هنا.</p><button className="ghost-cta" onClick={()=>onNavigate('add')}>أضف كلمة <ArrowLeft size={17}/></button></div>:<div className="word-list">{list.map(word=><article className="word-row" key={word.id}><div className="word-identity"><span className="word-first" aria-hidden="true">{word.term[0].toUpperCase()}</span><div><h2 dir="ltr">{word.term}</h2><p>{word.meaning}</p><span className="word-tag">{word.tag}</span></div></div><div className="word-actions"><span className={'word-due '+(new Date(word.dueAt)<=new Date()?'is-due':'')}>{new Date(word.dueAt)<=new Date()?'وقت مراجعتها':`المراجعة: ${localDate(word.dueAt)}`}</span><button type="button" title="اسمع الكلمة" aria-label={`اسمع ${word.term}`} onClick={()=>speak(word.term)}><Volume2 size={19}/></button><button type="button" title="أرشف الكلمة" aria-label={`أرشف ${word.term}`} onClick={()=>void remove(word)}><Trash2 size={19}/></button></div></article>)}</div>}
  </section>;
}
function SettingsPage({words,onRestored}:{words:Word[];onRestored:()=>Promise<void>}){
  const input=useRef<HTMLInputElement>(null);const [lastBackup,setLastBackup]=useState<string|null>(null);const [push,setPush]=useState('checking');const [status,setStatus]=useState('');const [busy,setBusy]=useState(false);
  useEffect(()=>{void lastBackupDate().then(setLastBackup).catch(()=>null);void pushState().then(setPush).catch(()=>setPush('disabled'));},[]);
  async function exportWords(){setStatus('');try{const backup=await buildBackup();const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`wordloop-backup-${new Date().toISOString().slice(0,10)}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);await rememberBackup();setLastBackup(new Date().toISOString());setStatus('جهزنا نسختك. احتفظ بها في مكان آمن.');}catch(e){setStatus(getError(e));}}
  async function importWords(file?:File){if(!file)return;if(file.size>20*1024*1024){setStatus('الملف كبير جدًا. الحد 20 ميجابايت.');return;}setStatus('');try{const data=validateBackup(JSON.parse(await file.text()));if(!window.confirm(`الملف فيه ${data.words.length} كلمة. استعادته راح تستبدل كلمات هذا الجهاز بالكامل. تكمل؟`))return;await restoreBackup(data);await onRestored();setStatus('رجّعنا كلماتك ومراجعاتك. نورت مكتبتك!');}catch(e){setStatus(getError(e));}finally{if(input.current)input.current.value='';}}
  async function notifications(action:'enable'|'disable'|'test'){setBusy(true);setStatus('');try{if(action==='enable'){await enablePush(words);setPush('enabled');setStatus('تمام! راح نذكّرك إذا حان وقت المراجعة.');}else if(action==='disable'){await disablePush();setPush('disabled');setStatus('أوقفنا التذكيرات على هذا الجهاز.');}else{await testPush();setStatus('أرسلنا إشعارًا تجريبيًا إلى جهازك.');}}catch(e){setStatus(getError(e));}finally{setBusy(false);}}
  async function protectStorage(){try{const supported=!!navigator.storage?.persist;if(!supported){setStatus('ميزة حماية التخزين غير متاحة في هذا المتصفح. لا تنس تحتفظ بنسخة احتياطية.');return;}const granted=await navigator.storage.persist();setStatus(granted?'المتصفح وافق على حماية بياناتك من الحذف التلقائي.':'المتصفح ما وافق على الحماية الدائمة. احفظ نسخة احتياطية باستمرار.');}catch(e){setStatus(getError(e));}}
  return <section className="inner-page"><div className="section-intro"><p className="overline">مساحتك الخاصة</p><h1>كلماتك، على جهازك.</h1><p>ما تحتاج حساب. أنت المتحكم في كلماتك ونسخها.</p></div>
    <div className="storage-banner"><Gradient/><div className="storage-icon"><HardDrive size={29}/></div><div><span className="privacy-kicker">محفوظ محليًا</span><h2>ملف التعلّم الخاص بك</h2><p>الكلمات محفوظة على هذا المتصفح. إذا غيرت جهازك، تقدر ترجعها من نسخة احتياطية.</p></div><ShieldCheck className="storage-check" size={34}/></div>
    <div className="settings-columns"><div className="settings-section"><h2>نسخة من كلماتك</h2><p>خل كلماتك معك حتى لو غيرت الجهاز أو حذفت بيانات المتصفح.</p><div className="setting-actions"><button className="action-tile" onClick={()=>void exportWords()}><span className="action-icon warm"><ArrowDownToLine size={22}/></span><span><strong>حمّل نسخة من كلماتك</strong><small>{lastBackup?`آخر نسخة: ${localDate(lastBackup)}`:'ما حفظت نسخة من قبل'}</small></span><ChevronLeft size={19}/></button><button className="action-tile" onClick={()=>input.current?.click()}><span className="action-icon mint"><ArrowUpFromLine size={22}/></span><span><strong>رجّع كلماتك من ملف</strong><small>ملف WordLoop بصيغة JSON</small></span><ChevronLeft size={19}/></button><input className="hidden" type="file" accept=".json,application/json" ref={input} onChange={e=>void importWords(e.target.files?.[0])}/></div><p className="small-warning"><Lightbulb size={16}/> مهم: النسخة اليدوية تحميك من فقدان كلماتك إذا مُسحت بيانات المتصفح.</p></div>
    <div className="settings-section"><h2>تذكير المراجعة</h2><p>خلك قريب من كلماتك. التذكير يوصل إلى جهازك بعد تفعيله.</p><div className="notification-tile"><span className="action-icon mint">{push==='enabled'?<Bell size={23}/>:<BellOff size={23}/>}</span><div><strong>{push==='enabled'?'التذكير شغّال':'فعّل تذكير الكلمات'}</strong><small>الساعة 8 مساءً بتوقيت الرياض، إذا فيه كلمات مستحقة.</small></div></div><div className="notification-actions">{push==='enabled'?<><button className="ghost-cta" disabled={busy} onClick={()=>void notifications('test')}><Send size={17}/> {copy.test}</button><button className="text-cta" disabled={busy} onClick={()=>void notifications('disable')}>إيقاف التذكير</button></>:<button className="ghost-cta" disabled={busy||!pushSupported()} onClick={()=>void notifications('enable')}><Bell size={18}/>{copy.permission}</button>}</div><p className="notification-note">الإشعارات تحتاج إنترنت والسماح من الجهاز. على الآيفون، ثبّت الموقع على الشاشة الرئيسية أولًا. الخادم يعرف موعد التذكير فقط، وليس كلماتك.</p></div></div>
    <div className="settings-section extra"><div><h2>حماية التخزين</h2><p>نطلب من المتصفح الحفاظ على كلماتك بقدر ما تسمح به إمكانياته.</p></div><button className="text-cta" onClick={()=>void protectStorage()}>اطلب حماية البيانات <ArrowLeft size={17}/></button></div>
    {status&&<p className="status-message large" role="status">{status}</p>}
    <div className="privacy-footer"><CloudOff size={19}/><span>المفردات والمراجعات لا تُرفع إلى Cloudflare أو أي قاعدة بيانات سحابية.</span></div>
  </section>;
}
export default function App(){
  const [page,setPage]=useState<Page>('home'),[words,setWords]=useState<Word[]>([]),[reviews,setReviews]=useState<Review[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[mobileNav,setMobileNav]=useState(false);
  const fetchLocal=useCallback(async()=>{try{const [w,r]=await Promise.all([listWords(),listReviews()]);setWords(w);setReviews(r);setError('');void syncPush(w).catch(console.warn);}catch(e){setError(getError(e));}finally{setLoading(false);}},[]);
  useEffect(()=>{void fetchLocal();const handle=()=>{void fetchLocal();};window.addEventListener('focus',handle);return()=>window.removeEventListener('focus',handle);},[fetchLocal]);
  const navigate=(to:Page)=>{setPage(to);setMobileNav(false);window.scrollTo({top:0,behavior:'smooth'});};
  const count=summary(words,reviews).due;
  return <div className="app-shell" dir="rtl"><Sidebar page={page} onNavigate={navigate} count={count}/><main className="main-area"><header className="topbar"><div className="mobile-brand"><Logo/></div><div className="crumb">WORDLOOP <span>/</span> {page==='home'?'الرئيسية':page==='review'?'المراجعة':page==='words'?'كلماتي':page==='add'?'إضافة كلمة':'الإعدادات'}</div><div className="top-actions"><span className="offline-mark"><Database size={15}/> على جهازك</span><button aria-label="القائمة" className="mobile-menu" onClick={()=>setMobileNav(n=>!n)}>{mobileNav?<X size={25}/>:<Menu size={25}/>}</button></div></header>
    {mobileNav&&<nav className="mobile-menu-panel" aria-label="القائمة">{pages.map(p=><button key={p.id} onClick={()=>navigate(p.id)}><p.icon size={19}/>{p.label}</button>)}</nav>}
    <div className="content-wrap">{error&&<div className="error-banner" role="alert">{error}<button onClick={()=>setError('')} aria-label="إغلاق"><X size={16}/></button></div>}
      {loading?<div className="loading"><RotateCcw size={25} className="spinner"/> نجهز كلماتك...</div>:page==='home'?<HomePage words={words} reviews={reviews} onNavigate={navigate}/>:page==='add'?<AddPage onSaved={fetchLocal}/>:page==='review'?<ReviewPage words={words} onReviewed={fetchLocal} onNavigate={navigate}/>:page==='words'?<WordsPage words={words} onArchived={fetchLocal} onNavigate={navigate}/>:<SettingsPage words={words} onRestored={fetchLocal}/>}
    </div></main><nav className="bottom-nav" aria-label="التنقل عبر الجوال">{pages.map(p=><button key={p.id} className={page===p.id?'selected':''} onClick={()=>navigate(p.id)}><p.icon size={22}/><span>{p.label}</span></button>)}<button className="mobile-add" onClick={()=>navigate('add')} aria-label="أضف كلمة"><Plus size={25}/><span>أضف</span></button></nav></div>;
}

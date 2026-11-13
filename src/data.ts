import {DefaultScheduler, Rating, type Grade as FsrsGrade} from 'ts-fsrs';

export type Grade='again'|'hard'|'good'|'easy';
/** #5: the four card kinds. Stored lowercase; UI labels live in the UI layer. */
export type ContentType='vocabulary'|'phrase'|'sentence'|'idiom';
export const CONTENT_TYPES:readonly ContentType[]=['vocabulary','phrase','sentence','idiom'];
/** Maximum length of the English text per kind. Sentences need room; everything else stays short. */
export const TERM_LIMIT:Record<ContentType,number>={vocabulary:100,phrase:160,sentence:300,idiom:160};
export const NOTE_LIMIT=500;
/** A card as the app uses it. Cards saved before #5 have no `contentType`/`note`; they are read as vocabulary with an empty note. */
export type Word={id:string;contentType:ContentType;term:string;meaning:string;example:string;translation:string;note:string;tag:string;createdAt:string;updatedAt:string;dueAt:string;fsrsState:Record<string,unknown>;archived:boolean;revision:number};
type StoredWord=Omit<Word,'contentType'|'note'>&{contentType?:ContentType;note?:string};
export type Review={id:string;wordId:string;grade:Grade;reviewedAt:string;nextDueAt:string};
export type Backup={app:'wordloop';version:2;exportedAt:string;words:Word[];reviews:Review[]};
export const isContentType=(v:unknown):v is ContentType=>CONTENT_TYPES.includes(v as ContentType);
/** Legacy-safe view of a stored card: id, dates, FSRS state and revision are passed through untouched. */
export function normalizeWord(w:StoredWord):Word{return {...w,contentType:isContentType(w.contentType)?w.contentType:'vocabulary',note:typeof w.note==='string'?w.note:''};}
const DB='wordloop-local-v1', VERSION=1;
const ratings:Record<Grade,FsrsGrade>={again:Rating.Again,hard:Rating.Hard,good:Rating.Good,easy:Rating.Easy};
let dbPromise:Promise<IDBDatabase>|null=null;
const request=<T>(r:IDBRequest<T>):Promise<T>=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||new Error('تعذّر قراءة البيانات المحلية'));});
function open():Promise<IDBDatabase>{
  if(!dbPromise){
    const pending:Promise<IDBDatabase>=new Promise((resolve,reject)=>{
      const r=indexedDB.open(DB,VERSION);
      r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains('words'))db.createObjectStore('words',{keyPath:'id'});if(!db.objectStoreNames.contains('reviews'))db.createObjectStore('reviews',{keyPath:'id'});if(!db.objectStoreNames.contains('meta'))db.createObjectStore('meta',{keyPath:'key'});};
      r.onsuccess=()=>{
        const db=r.result;
        // #4: a closed connection must not stay cached, or every later read/write fails until a reload.
        // `close` fires when the browser drops the connection (e.g. WebKit after the app was backgrounded).
        const forget=()=>{if(dbPromise===pending)dbPromise=null;};
        db.onversionchange=()=>{db.close();forget();};
        db.onclose=forget;
        resolve(db);
      };
      r.onerror=()=>{if(dbPromise===pending)dbPromise=null;reject(r.error||new Error('تعذّر فتح مساحة الكلمات'));};
    });
    dbPromise=pending;
  }
  return dbPromise;
}
/** Starts a transaction, reopening once if the cached connection was already closed. Nothing has been read or written when it retries. */
async function transaction(stores:string|string[],mode:IDBTransactionMode):Promise<IDBTransaction>{
  const db=await open();
  try{return db.transaction(stores,mode);}
  catch(e){
    if(!(e instanceof DOMException&&e.name==='InvalidStateError'))throw e;
    dbPromise=null;return (await open()).transaction(stores,mode);
  }
}
/** Test-only: drop the cached connection so a fresh fake IndexedDB can be used. */
export function resetConnectionForTests(){dbPromise=null;}
async function getAll<T>(store:'words'|'reviews'):Promise<T[]>{return request((await transaction(store,'readonly')).objectStore(store).getAll()) as Promise<T[]>;}
function settled(tx:IDBTransaction):Promise<void>{return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||new Error('تعذّر حفظ التغيير'));tx.onabort=()=>reject(tx.error||new Error('لم يكتمل الحفظ'));});}

/* #4: other tabs/windows of the app refresh after any committed local write. Only a ping is sent, never word data. */
const CHANNEL='wordloop-local-changes';
const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel(CHANNEL):null;
(channel as unknown as {unref?:()=>void}|null)?.unref?.(); // Node test runner only: don't keep the process alive
function announceChange(){try{channel?.postMessage({type:'changed'});}catch{/* best effort */}}
export function onOtherTabChange(listener:()=>void):()=>void{
  if(typeof BroadcastChannel==='undefined')return ()=>{};
  const ch=new BroadcastChannel(CHANNEL);ch.onmessage=()=>listener();
  return ()=>ch.close();
}
/** Duplicate key: case-insensitive, surrounding and repeated inner whitespace ignored. */
export function normalizeTerm(term:string){return term.trim().replace(/\s+/g,' ').toLocaleLowerCase();}
export async function listWords():Promise<Word[]>{return (await getAll<StoredWord>('words')).map(normalizeWord).sort((a,b)=>a.dueAt.localeCompare(b.dueAt));}
export async function listReviews(){return getAll<Review>('reviews');}
export async function getWord(id:string):Promise<Word|undefined>{const w=await request<StoredWord|undefined>((await transaction('words','readonly')).objectStore('words').get(id));return w&&normalizeWord(w);}
export type NewCard={contentType?:ContentType;term:string;meaning:string;example:string;translation:string;note?:string;tag:string};
export async function addWord(data:NewCard):Promise<Word>{
  const contentType=data.contentType??'vocabulary';
  if(!isContentType(contentType))throw Error('نوع البطاقة غير معروف');
  const term=data.term.trim().replace(/\s+/g,' '),meaning=data.meaning.trim(),note=(data.note??'').trim();
  if(!term||!meaning)throw Error('أضف الكلمة ومعناها أولًا');
  if(term.length>TERM_LIMIT[contentType]||meaning.length>240||data.example.length>500||data.translation.length>400||note.length>NOTE_LIMIT||data.tag.length>40)throw Error('أحد النصوص أطول من اللازم');
  // Duplicates are checked within the same kind only: "break the ice" may be both a phrase and an idiom.
  const words=await listWords();const key=normalizeTerm(term);if(words.some(w=>!w.archived&&w.contentType===contentType&&normalizeTerm(w.term)===key))throw Error('هذه الكلمة موجودة عندك بالفعل');
  const now=new Date(),id=crypto.randomUUID();
  const scheduler=await DefaultScheduler({version:'FSRS-7',desiredRetention:0.9,enableShortTerm:true,learningSteps:['1m','10m'],relearningSteps:['10m']});
  const fsrs=scheduler.newCard({cardId:id,now});
  const word:Word={id,contentType,term,meaning,example:data.example.trim(),translation:data.translation.trim(),note,tag:data.tag.trim()||'عام',createdAt:now.toISOString(),updatedAt:now.toISOString(),dueAt:fsrs.dueAt.toISOString(),fsrsState:JSON.parse(JSON.stringify(fsrs)),archived:false,revision:0};
  const tx=await transaction('words','readwrite'),end=settled(tx);tx.objectStore('words').add(word);await end;
  announceChange();return word;
}
export async function archiveWord(id:string):Promise<void>{const tx=await transaction('words','readwrite'),end=settled(tx),store=tx.objectStore('words');const w=await request<StoredWord|undefined>(store.get(id));if(!w){tx.abort();throw Error('لم نجد الكلمة');}store.put({...normalizeWord(w),archived:true,updatedAt:new Date().toISOString()});await end;announceChange();}
export async function reviewWord(id:string,grade:Grade):Promise<string>{
  const readTx=await transaction('words','readonly');const stored=await request<StoredWord|undefined>(readTx.objectStore('words').get(id));const old=stored&&normalizeWord(stored);
  if(!old||old.archived)throw Error('لم نجد الكلمة');
  if(new Date(old.dueAt).getTime()>Date.now()+1000)throw Error('لم يحن وقت مراجعة هذه الكلمة');
  const now=new Date(),scheduler=await DefaultScheduler({version:'FSRS-7',desiredRetention:0.9,enableShortTerm:true,learningSteps:['1m','10m'],relearningSteps:['10m']});
  const raw=old.fsrsState;
  const card={...raw,dueAt:new Date(String(raw.dueAt)),lastReviewAt:raw.lastReviewAt?new Date(String(raw.lastReviewAt)):null};
  const result=scheduler.review({card:card as Parameters<typeof scheduler.review>[0]['card'],grade:ratings[grade],now});
  const nextAt=result.card.dueAt.toISOString();
  // Two stores committed in one atomic local transaction.
  const tx=await transaction(['words','reviews'],'readwrite'),end=settled(tx),store=tx.objectStore('words');
  const existing=await request<StoredWord|undefined>(store.get(id));
  if(!existing||existing.revision!==old.revision){tx.abort();throw Error('تغيرت هذه الكلمة في تبويب آخر، حدّث الصفحة');}
  store.put({...old,fsrsState:JSON.parse(JSON.stringify(result.card)),dueAt:nextAt,updatedAt:now.toISOString(),revision:old.revision+1});
  tx.objectStore('reviews').put({id:crypto.randomUUID(),wordId:id,grade,reviewedAt:now.toISOString(),nextDueAt:nextAt} satisfies Review);
  await end;announceChange();return nextAt;
}
function text(v:unknown,max:number):v is string{return typeof v==='string'&&v.length<=max;}
/** v1 cards have no kind (read as vocabulary); v2 cards must carry a known kind. */
function validWord(w:unknown,version:1|2):w is StoredWord{
  if(!w||typeof w!=='object')return false;
  const x=w as Partial<StoredWord>;
  if(version===2?!isContentType(x.contentType):x.contentType!==undefined&&!isContentType(x.contentType))return false;
  if(x.note!==undefined&&!text(x.note,NOTE_LIMIT))return false;
  const kind=isContentType(x.contentType)?x.contentType:'vocabulary';
  return text(x.id,80)&&text(x.term,TERM_LIMIT[kind])&&x.term.length>0&&text(x.meaning,240)&&x.meaning.length>0&&text(x.example,500)&&text(x.translation,400)&&text(x.tag,40)&&text(x.createdAt,64)&&text(x.updatedAt,64)&&text(x.dueAt,64)&&Number.isFinite(Date.parse(x.dueAt))&&typeof x.revision==='number'&&Number.isInteger(x.revision)&&x.revision>=0&&typeof x.archived==='boolean'&&typeof x.fsrsState==='object'&&!!x.fsrsState&&!Array.isArray(x.fsrsState)&&text((x.fsrsState as Record<string,unknown>).dueAt,64)&&Number.isFinite(Date.parse(String((x.fsrsState as Record<string,unknown>).dueAt)))&&x.dueAt===(x.fsrsState as Record<string,unknown>).dueAt;
}
function validReview(r:unknown):r is Review{
  if(!r||typeof r!=='object')return false;
  const x=r as Partial<Review>;
  return text(x.id,80)&&text(x.wordId,80)&&['again','hard','good','easy'].includes(String(x.grade))&&text(x.reviewedAt,64)&&text(x.nextDueAt,64)&&Number.isFinite(Date.parse(x.reviewedAt))&&Number.isFinite(Date.parse(x.nextDueAt));
}
export function validateBackup(data:unknown):Backup{
  if(!data||typeof data!=='object')throw Error('هذا الملف ليس نسخة WordLoop');
  const v=data as {app?:unknown;version?:unknown;exportedAt?:unknown;words?:unknown;reviews?:unknown};
  if(v.app!=='wordloop'||(v.version!==1&&v.version!==2)||!Array.isArray(v.words)||!Array.isArray(v.reviews))throw Error('صيغة الملف غير مدعومة');
  if(v.words.length>50000||v.reviews.length>500000)throw Error('هذا الملف أكبر من الحد المسموح');
  const version=v.version;
  if(!v.words.every(w=>validWord(w,version))||!v.reviews.every(validReview))throw Error('بعض البيانات في الملف غير صحيحة');
  const words=(v.words as StoredWord[]).map(normalizeWord),reviews=v.reviews as Review[];
  const wordIds=new Set(words.map(w=>w.id)),reviewIds=new Set(reviews.map(r=>r.id));
  if(wordIds.size!==words.length||reviewIds.size!==reviews.length||reviews.some(r=>!wordIds.has(r.wordId)))throw Error('توجد بيانات مكررة أو مراجعات بلا كلمات');
  // Always returned as v2: v1 cards gain contentType 'vocabulary' and an empty note; nothing else changes.
  return {app:'wordloop',version:2,exportedAt:typeof v.exportedAt==='string'?v.exportedAt:new Date().toISOString(),words,reviews};
}
export async function buildBackup():Promise<Backup>{return {app:'wordloop',version:2,exportedAt:new Date().toISOString(),words:await listWords(),reviews:await listReviews()};}
export async function restoreBackup(backup:unknown):Promise<void>{
  const safe=validateBackup(backup),tx=await transaction(['words','reviews'],'readwrite'),end=settled(tx);
  const words=tx.objectStore('words'),reviews=tx.objectStore('reviews');
  // Any synchronous failure must abort, or the browser would commit the clear() on its own.
  try{words.clear();reviews.clear();for(const w of safe.words)words.put(w);for(const r of safe.reviews)reviews.put(r);}
  catch(e){try{tx.abort();}catch{/* already finished */}await end.catch(()=>undefined);throw e;}
  await end;announceChange();
}
export async function rememberBackup(){const tx=await transaction('meta','readwrite'),end=settled(tx);tx.objectStore('meta').put({key:'lastBackup',value:new Date().toISOString()});await end;}
export async function lastBackupDate():Promise<string|null>{const v=await request<{key:string;value:string}|undefined>((await transaction('meta','readonly')).objectStore('meta').get('lastBackup'));return v?.value||null;}
export function summary(words:Word[],reviews:Review[],now=new Date()){
  const active=words.filter(w=>!w.archived),day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const dayOf=(iso:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));
  return {total:active.length,due:active.filter(w=>new Date(w.dueAt).getTime()<=now.getTime()).length,reviewedToday:reviews.filter(r=>dayOf(r.reviewedAt)===day).length};
}

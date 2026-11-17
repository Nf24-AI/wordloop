import type {Word} from './data';
import {storedLocale} from './i18n';
import {accessFetch} from './net';
const PRACTICE_PREF='wordloop-practice-reminders',PRACTICE_DAY='wordloop-last-practice-day';
let practiceAvailable=false,lastWords:Word[]|null=null;
/** #30: practice nudges are on by default; the learner can turn just them off in Settings. */
export function practiceReminders(){try{return localStorage.getItem(PRACTICE_PREF)!=='off';}catch{return true;}}
export async function setPracticeReminders(on:boolean){try{if(on)localStorage.removeItem(PRACTICE_PREF);else localStorage.setItem(PRACTICE_PREF,'off');}catch{/* private mode */}if(lastWords)await syncPush(lastWords);}
/** Whether there is anything to practise (at least one Learning Passage). Without it a nudge would lead nowhere. */
export function setPracticeAvailable(v:boolean){practiceAvailable=v;}
function deviceZone(){try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Riyadh';}catch{return 'Asia/Riyadh';}}
/** Today on the device clock, YYYY-MM-DD. */
export function localDay(at=new Date()){try{return new Intl.DateTimeFormat('en-CA',{timeZone:deviceZone(),year:'numeric',month:'2-digit',day:'2-digit'}).format(at);}catch{return at.toISOString().slice(0,10);}}
/** Called when a Reading/Listening practice session finishes: no practice nudge today. Only the DAY is stored/synced — no scores or content. */
export function markPracticed(){try{localStorage.setItem(PRACTICE_DAY,localDay());}catch{/* private mode */}if(lastWords)void syncPush(lastWords).catch(()=>undefined);}
function lastPracticeDay(){try{return localStorage.getItem(PRACTICE_DAY);}catch{return null;}}
/** #30: the only extra metadata synced with the subscription — time zone (quiet hours, daily limit), notification language,
 *  whether practice nudges are wanted and possible, and the last local day of practice. Never words, scores or reviews. */
function deviceMeta(){return {timeZone:deviceZone(),locale:storedLocale(),practice:practiceAvailable&&practiceReminders(),lastPracticeDay:lastPracticeDay()};}
const TOKEN_KEY='wordloop-notification-device-token';
const api=(path:string,init?:RequestInit)=>accessFetch(path,init,storedLocale());
function getToken(){let token=localStorage.getItem(TOKEN_KEY);if(!token){token=crypto.randomUUID()+crypto.randomUUID();localStorage.setItem(TOKEN_KEY,token);}return token;}
function keyBytes(base64:string){const data=atob(base64.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-base64.length%4)%4));return Uint8Array.from(data,c=>c.charCodeAt(0));}
export function pushSupported(){return typeof window!=='undefined'&&'Notification'in window&&'serviceWorker'in navigator&&'PushManager'in window;}
export async function pushState(){if(!pushSupported())return 'unsupported';const reg=await navigator.serviceWorker.ready;return (await reg.pushManager.getSubscription())?'enabled':'disabled';}
export async function enablePush(words:Word[]){
  lastWords=words;
  if(!pushSupported())throw Error('هذا المتصفح لا يدعم الإشعارات. إذا كنت على آيفون، أضف الموقع إلى الشاشة الرئيسية أولًا.');
  const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('لم يتم السماح بالإشعارات من إعدادات الجهاز');
  const response=await api('/api/push/key');if(!response.ok)throw Error('الإشعارات غير مهيأة على الخادم بعد');
  const {publicKey}=await response.json() as {publicKey:string};
  const registration=await navigator.serviceWorker.ready;
  const subscription=(await registration.pushManager.getSubscription())||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(publicKey) as BufferSource});
  const nextDueAt=words.filter(w=>!w.archived).sort((a,b)=>a.dueAt.localeCompare(b.dueAt))[0]?.dueAt||null;
  const res=await api('/api/push/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:getToken(),subscription:subscription.toJSON(),nextDueAt,...deviceMeta()})});
  if(!res.ok)throw Error('تعذر ربط إشعارات هذا الجهاز. أعد المحاولة');
}
export async function syncPush(words:Word[]){
  lastWords=words;
  if(!pushSupported()||Notification.permission!=='granted')return;
  const token=localStorage.getItem(TOKEN_KEY);if(!token)return;
  const reg=await navigator.serviceWorker.ready,sub=await reg.pushManager.getSubscription();if(!sub)return;
  const nextDueAt=words.filter(w=>!w.archived).sort((a,b)=>a.dueAt.localeCompare(b.dueAt))[0]?.dueAt||null;
  await api('/api/push/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,subscription:sub.toJSON(),nextDueAt,...deviceMeta()})});
}
export async function disablePush(){
  if(!pushSupported())return;
  const token=localStorage.getItem(TOKEN_KEY),reg=await navigator.serviceWorker.ready,sub=await reg.pushManager.getSubscription();
  if(token){await api('/api/push/disable',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})}).catch(()=>undefined);}
  if(sub)await sub.unsubscribe();
}
export async function testPush(){const token=localStorage.getItem(TOKEN_KEY);if(!token)throw Error('فعّل الإشعارات أولًا');const r=await api('/api/push/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});if(!r.ok){const data=await r.json().catch(()=>({error:'تعذر إرسال الإشعار'}));throw Error(data.error||'تعذر إرسال الإشعار');}}

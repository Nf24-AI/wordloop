import type {Word} from './data';
const TOKEN_KEY='wordloop-notification-device-token';
function getToken(){let token=localStorage.getItem(TOKEN_KEY);if(!token){token=crypto.randomUUID()+crypto.randomUUID();localStorage.setItem(TOKEN_KEY,token);}return token;}
function keyBytes(base64:string){const data=atob(base64.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-base64.length%4)%4));return Uint8Array.from(data,c=>c.charCodeAt(0));}
export function pushSupported(){return typeof window!=='undefined'&&'Notification'in window&&'serviceWorker'in navigator&&'PushManager'in window;}
export async function pushState(){if(!pushSupported())return 'unsupported';const reg=await navigator.serviceWorker.ready;return (await reg.pushManager.getSubscription())?'enabled':'disabled';}
export async function enablePush(words:Word[]){
  if(!pushSupported())throw Error('هذا المتصفح لا يدعم الإشعارات. إذا كنت على آيفون، أضف الموقع إلى الشاشة الرئيسية أولًا.');
  const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('لم يتم السماح بالإشعارات من إعدادات الجهاز');
  const response=await fetch('/api/push/key');if(!response.ok)throw Error('الإشعارات غير مهيأة على الخادم بعد');
  const {publicKey}=await response.json() as {publicKey:string};
  const registration=await navigator.serviceWorker.ready;
  const subscription=(await registration.pushManager.getSubscription())||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(publicKey) as BufferSource});
  const nextDueAt=words.filter(w=>!w.archived).sort((a,b)=>a.dueAt.localeCompare(b.dueAt))[0]?.dueAt||null;
  const res=await fetch('/api/push/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:getToken(),subscription:subscription.toJSON(),nextDueAt})});
  if(!res.ok)throw Error('تعذر ربط إشعارات هذا الجهاز. أعد المحاولة');
}
export async function syncPush(words:Word[]){
  if(!pushSupported()||Notification.permission!=='granted')return;
  const token=localStorage.getItem(TOKEN_KEY);if(!token)return;
  const reg=await navigator.serviceWorker.ready,sub=await reg.pushManager.getSubscription();if(!sub)return;
  const nextDueAt=words.filter(w=>!w.archived).sort((a,b)=>a.dueAt.localeCompare(b.dueAt))[0]?.dueAt||null;
  await fetch('/api/push/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,subscription:sub.toJSON(),nextDueAt})});
}
export async function disablePush(){
  if(!pushSupported())return;
  const token=localStorage.getItem(TOKEN_KEY),reg=await navigator.serviceWorker.ready,sub=await reg.pushManager.getSubscription();
  if(token){await fetch('/api/push/disable',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})}).catch(()=>undefined);}
  if(sub)await sub.unsubscribe();
}
export async function testPush(){const token=localStorage.getItem(TOKEN_KEY);if(!token)throw Error('فعّل الإشعارات أولًا');const r=await fetch('/api/push/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});if(!r.ok){const data=await r.json().catch(()=>({error:'تعذر إرسال الإشعار'}));throw Error(data.error||'تعذر إرسال الإشعار');}}

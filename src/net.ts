/** #60: Staging sits behind Cloudflare Access. When its session has expired, Access answers /api/* with a redirect to
 *  its login page; followed by fetch that is a cross-origin hop that fails as an opaque «Load failed». We stop at the
 *  redirect instead and say what to do. Offline is reported as offline. Nothing else about the request changes. */
export class PushNetworkError extends Error{reason:'signin'|'offline';constructor(reason:'signin'|'offline',message:string){super(message);this.reason=reason;this.name='PushNetworkError';}}
const NET_TEXT={ar:{signin:'انتهت جلسة الدخول. حدّث الصفحة وسجّل الدخول من جديد، بعدين جرّب مرة ثانية.',offline:'أنت غير متصل. اتصل بالإنترنت وجرّب مرة ثانية.'},
  en:{signin:'Your sign-in has expired. Reload the page, sign in again, then try once more.',offline:'You’re offline. Connect to the internet and try again.'}} as const;
export async function accessFetch(path:string,init:RequestInit|undefined,locale:'ar'|'en'):Promise<Response>{
  const t=NET_TEXT[locale==='en'?'en':'ar'];
  let res:Response;
  try{res=await fetch(path,{...init,redirect:'manual',credentials:'same-origin'});}
  catch(e){if(typeof navigator!=='undefined'&&navigator.onLine===false)throw new PushNetworkError('offline',t.offline);throw e;}
  if(res.type==='opaqueredirect'||(res.status>=300&&res.status<400))throw new PushNetworkError('signin',t.signin);
  return res;
}

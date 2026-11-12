import {loadVapidKey,parseSubscription,sendPush} from '@codefusion-cc/web-push';

type Statement={bind:(...values:unknown[])=>Statement;run:()=>Promise<{meta:{changes:number}}> ;first:<T>()=>Promise<T|null>;all:<T>()=>Promise<{results:T[]}>};
type D1Database={prepare:(sql:string)=>Statement};
type Env={PUSH_DB?:D1Database;VAPID_PRIVATE_KEY?:string;VAPID_SUBJECT?:string};
type ScheduledController=unknown;
type ExecutionContext={waitUntil:(promise:Promise<unknown>)=>void};
type Subscription={endpoint:string;keys:{p256dh:string;auth:string}};
type PushRow={token_hash:string;endpoint:string;p256dh:string;auth_key:string;next_due_at:string|null;last_sent_day:string|null;last_test_at:number|null};
const reply=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const fail=(message:string,status=400)=>reply({error:message},status);
const isObj=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
// Stream incoming JSON with a hard 10 KB limit, including chunked requests.
async function body(request:Request){
  if(Number(request.headers.get('content-length')||0)>10000||!request.body)return null;
  const reader=request.body.getReader(),decoder=new TextDecoder();
  let size=0,json='';
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>10000){await reader.cancel();return null;}
      json+=decoder.decode(value,{stream:true});
    }
    json+=decoder.decode();
    const parsed:unknown=JSON.parse(json);
    return isObj(parsed)?parsed:null;
  }catch{return null;}finally{reader.releaseLock();}
}
async function hash(token:string){const bytes=new TextEncoder().encode(token);const digest=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}
async function send(env:Env,row:PushRow,title:string,bodyText:string){
  const vapid=env.VAPID_PRIVATE_KEY?await loadVapidKey(env.VAPID_PRIVATE_KEY):null;
  if(!vapid||!env.VAPID_SUBJECT)throw Error('الإشعارات غير مجهزة');
  const sub=parseSubscription({endpoint:row.endpoint,keys:{p256dh:row.p256dh,auth:row.auth_key}});
  if(!sub)throw Error('اشتراك جهاز غير صالح');
  return sendPush({vapid,subject:env.VAPID_SUBJECT,subscription:sub,payload:{title,body:bodyText,url:'/'},urgency:'normal'});
}
function originOK(request:Request){const h=request.headers.get('origin');return !h||h===new URL(request.url).origin;}
function dayRiyadh(now:Date){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
async function endpoint(request:Request,env:Env){
  const path=new URL(request.url).pathname,method=request.method;
  if(path==='/api/health')return reply({service:'wordloop',storage:'device-only',push:'optional'});
  if(path==='/api/push/key'&&method==='GET'){
    const key=env.VAPID_PRIVATE_KEY?await loadVapidKey(env.VAPID_PRIVATE_KEY):null;
    return key?reply({publicKey:key.publicKey}):fail('لم تُفعّل الإشعارات بعد',503);
  }
  if(!originOK(request))return fail('طلب غير مسموح',403);
  if(!env.PUSH_DB)return fail('خدمة الإشعارات غير جاهزة بعد',503);
  if(path==='/api/push/sync'&&method==='POST'){
    const data=await body(request);if(!data)return fail('طلب غير صالح');
    const token=data.token;
    const sub=data.subscription as Subscription|undefined;
    const next=data.nextDueAt;
    if(typeof token!=='string'||token.length<60||token.length>120||!sub||typeof sub.endpoint!=='string'||sub.endpoint.length>2500||!sub.endpoint.startsWith('https://')||!isObj(sub.keys)||typeof sub.keys.p256dh!=='string'||typeof sub.keys.auth!=='string'||sub.keys.p256dh.length>250||sub.keys.auth.length>250||!parseSubscription(sub)||(next!==null&&(typeof next!=='string'||next.length>40||!Number.isFinite(Date.parse(next)))))return fail('بيانات الجهاز غير صحيحة');
    const hashValue=await hash(token);
    await env.PUSH_DB.prepare(`INSERT INTO push_devices (token_hash,endpoint,p256dh,auth_key,next_due_at,updated_at)
      VALUES (?1,?2,?3,?4,?5,?6)
      ON CONFLICT(token_hash) DO UPDATE SET endpoint=excluded.endpoint,p256dh=excluded.p256dh,auth_key=excluded.auth_key,next_due_at=excluded.next_due_at,updated_at=excluded.updated_at`).bind(hashValue,sub.endpoint,sub.keys.p256dh,sub.keys.auth,next,new Date().toISOString()).run();
    return reply({ok:true});
  }
  if((path==='/api/push/disable'||path==='/api/push/test')&&method==='POST'){
    const data=await body(request);if(!data||typeof data.token!=='string'||data.token.length<60)return fail('طلب غير صالح');
    const key=await hash(data.token);
    if(path.endsWith('disable')){await env.PUSH_DB.prepare('DELETE FROM push_devices WHERE token_hash=?').bind(key).run();return reply({ok:true});}
    const row=await env.PUSH_DB.prepare('SELECT * FROM push_devices WHERE token_hash=?').bind(key).first<PushRow>();
    if(!row)return fail('فعّل الإشعارات أولًا',404);
    if(row.last_test_at&&Date.now()-row.last_test_at<60000)return fail('جرب مرة أخرى بعد دقيقة',429);
    await env.PUSH_DB.prepare('UPDATE push_devices SET last_test_at=? WHERE token_hash=?').bind(Date.now(),key).run();
    const outcome=await send(env,row,'WordLoop جاهز ✨','وصلنا! بنذكّرك لما يحين وقت مراجعة كلماتك.');
    if(outcome.outcome==='gone')await env.PUSH_DB.prepare('DELETE FROM push_devices WHERE token_hash=?').bind(key).run();
    return outcome.outcome==='sent'?reply({ok:true}):fail('تعذر إرسال الإشعار لهذا الجهاز',502);
  }
  return fail('هذا المسار غير متاح',404);
}
async function daily(env:Env){
  if(!env.PUSH_DB||!env.VAPID_PRIVATE_KEY)return;
  const now=new Date(),today=dayRiyadh(now);
  // Cloud stores ONLY subscription, anonymous token hash, and the earliest due timestamp.
  const {results}=await env.PUSH_DB.prepare(`SELECT * FROM push_devices WHERE next_due_at IS NOT NULL AND next_due_at<=? AND (last_sent_day IS NULL OR last_sent_day<>?) LIMIT 500`).bind(now.toISOString(),today).all<PushRow>();
  for(const row of results){
    try {
      // Claim before sending to prevent duplicate daily sends across retries.
      const claim=await env.PUSH_DB.prepare(`UPDATE push_devices SET last_sent_day=? WHERE token_hash=? AND (last_sent_day IS NULL OR last_sent_day<>?)`).bind(today,row.token_hash,today).run();
      if(!claim.meta.changes)continue;
      const result=await send(env,row,'كلماتك تنتظرك ✨','عندك كلمات تستاهل مراجعة سريعة. خمس دقائق تكفي للبداية.');
      if(result.outcome==='gone')await env.PUSH_DB.prepare('DELETE FROM push_devices WHERE token_hash=?').bind(row.token_hash).run();
      if(result.outcome==='failed')console.warn('Notification failed',result.status);
    } catch(e){console.warn('Push error',e);}
  }
}
export default {
  async fetch(request:Request,env:Env){try{return await endpoint(request,env);}catch(e){console.error('WordLoop Worker',e);return fail('حصل خطأ في الإشعارات',500);}},
  async scheduled(_event:ScheduledController,env:Env,ctx:ExecutionContext){ctx.waitUntil(daily(env));}
};

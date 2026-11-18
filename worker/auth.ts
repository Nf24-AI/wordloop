/**
 * #70 Staging tester access with a personal 8-digit PIN (replaces Cloudflare Access for invited testers).
 * STAGING ONLY and OFF unless `AUTH_MODE` is exactly "pin". When it is on, EVERY request — pages, static assets, /api/*
 * — passes this gate, except the sign-in page itself, its fonts/icon and /api/health.
 *
 * Secrets and storage (nothing secret is ever in GitHub, logs or the browser):
 *  - A PIN is stored only as HMAC-SHA256(PIN_PEPPER, PIN) — PIN_PEPPER is a Worker secret, separate from the database,
 *    so a D1 dump alone cannot be brute-forced offline. The PIN itself is shown once to the owner by the CLI and never stored.
 *  - A session is a random 256-bit token in an HttpOnly + Secure + SameSite=Lax `__Host-` cookie; D1 keeps only its
 *    SHA-256. Revoking a tester (or just its sessions) takes effect on the very next request.
 *  - Failed attempts are counted per (hashed, windowed) IP and globally; IPs are never stored in clear.
 * Fails CLOSED: if the switch is on but the secret or the tables are missing, nothing is served.
 */
import type {D1Database} from './reminders.ts';

type RateLimiter={limit:(args:{key:string;delta?:number})=>Promise<{success:boolean}>};
type Assets={fetch:(request:Request)=>Promise<Response>};
export type AuthEnv={AUTH_MODE?:string;PIN_PEPPER?:string;PUSH_DB?:D1Database;PUSH_LIMIT?:RateLimiter;ASSETS?:Assets};
export type Tester={id:string;profile:string;expires_at:number};

export const PIN_LENGTH=8;
export const SESSION_MS=7*24*3600e3;
export const IP_WINDOW_MS=15*60e3,IP_FAIL_LIMIT=10;           // 10 wrong PINs per 15 min per address
export const GLOBAL_WINDOW_MS=3600e3,GLOBAL_FAIL_LIMIT=200;   // 200 wrong PINs per hour for everyone together
const PIN_CONTEXT='wordloop-pin-v1|';

/* ───────── crypto helpers ───────── */
const hex=(buf:ArrayBuffer)=>Array.from(new Uint8Array(buf),b=>b.toString(16).padStart(2,'0')).join('');
export async function sha256(s:string){return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));}
/** The stored fingerprint of a PIN. The CLI (scripts/tester-pin.mjs) computes exactly the same value. */
export async function pinHash(pepper:string,pin:string){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pepper),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(PIN_CONTEXT+pin)));
}
function newToken(){const b=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...b)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
/** Arabic-Indic / Persian digits → ASCII; spaces and dashes removed. Anything else stays and fails the format check. */
export function normalizePin(raw:string){
  return raw.replace(/[٠-٩]/g,d=>String(d.charCodeAt(0)-0x0660)).replace(/[۰-۹]/g,d=>String(d.charCodeAt(0)-0x06F0)).replace(/[\s-]/g,'');
}

/* ───────── cookies ───────── */
/** `__Host-` (Secure, Path=/, no Domain) on https. Plain http exists only in local development. */
export const cookieName=(url:URL)=>url.protocol==='https:'?'__Host-wl_session':'wl_session';
function readCookie(request:Request,name:string){
  for(const part of (request.headers.get('cookie')||'').split(';')){const i=part.indexOf('=');if(i>0&&part.slice(0,i).trim()===name)return part.slice(i+1).trim();}
  return null;
}
function sessionCookie(url:URL,value:string,maxAgeSec:number){
  return `${cookieName(url)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0,Math.floor(maxAgeSec))}${url.protocol==='https:'?'; Secure':''}`;
}

/* ───────── responses ───────── */
const NO_STORE={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const json=(v:unknown,status=200,extra:Record<string,string>={})=>Response.json(v,{status,headers:{...NO_STORE,...extra}});
const redirect=(to:string,extra:Record<string,string>={})=>new Response(null,{status:303,headers:{Location:to,...NO_STORE,...extra}});
const wantsHtml=(r:Request)=>r.method==='GET'&&(r.headers.get('sec-fetch-mode')==='navigate'||(r.headers.get('accept')||'').includes('text/html'));
/** Only a same-site path may be a post-login target (no //host, no scheme, not the login/API itself). */
export function safeNext(raw:string|null){
  if(!raw||!raw.startsWith('/')||raw.startsWith('//')||raw.startsWith('/\\')||/[\u0000-\u001F]/.test(raw)||raw.length>300)return '/';
  if(raw.startsWith('/login')||raw.startsWith('/api/'))return '/';
  return raw;
}
/** Same-origin only. With «Referrer-Policy: no-referrer» browsers send «Origin: null» on a same-origin form POST, so a
 *  null/absent Origin is accepted only when Sec-Fetch-Site does not say the request came from another site. */
export function originOK(request:Request){
  const o=request.headers.get('origin'),own=new URL(request.url).origin;
  if(o===own)return true;
  if(o&&o!=='null')return false;
  const site=request.headers.get('sec-fetch-site');
  return !site||site==='same-origin'||site==='none';
}
/** Static files that are public without a session: the sign-in page's fonts, the app icons and the web manifest.
 *  None holds user data. The manifest must be public: browsers fetch it WITHOUT cookies, so a gated manifest would
 *  break «Add to Home Screen» on iPhone. Everything else — the app shell, its scripts, /sw.js, every /api/* — is gated. */
export function isPublicAsset(path:string,method:string){
  return (method==='GET'||method==='HEAD')&&(path.startsWith('/auth/')||/^\/icons\/[\w.-]+\.png$/.test(path)||path==='/manifest.webmanifest');
}

/* ───────── sessions ───────── */
export async function currentTester(request:Request,db:D1Database,now=Date.now()):Promise<(Tester&{session:string})|null>{
  const token=readCookie(request,cookieName(new URL(request.url)));
  if(!token||!/^[A-Za-z0-9_-]{40,60}$/.test(token))return null;
  const h=await sha256(token);
  const row=await db.prepare(`SELECT t.id,t.profile,t.expires_at FROM tester_sessions s JOIN testers t ON t.id=s.tester_id
    WHERE s.token_hash=?1 AND s.expires_at>?2 AND t.revoked_at IS NULL AND t.expires_at>?2`).bind(h,now).first<Tester>();
  return row?{...row,session:h}:null;
}

/* ───────── failed-attempt limits (hashed, windowed; fail closed) ───────── */
async function buckets(request:Request,now:number){
  const ip=request.headers.get('CF-Connecting-IP')||'unknown',w=Math.floor(now/IP_WINDOW_MS),g=Math.floor(now/GLOBAL_WINDOW_MS);
  return {ip:{key:'ip:'+(await sha256(`wl-auth|${w}|${ip}`)),end:(w+1)*IP_WINDOW_MS,limit:IP_FAIL_LIMIT},all:{key:`all:${g}`,end:(g+1)*GLOBAL_WINDOW_MS,limit:GLOBAL_FAIL_LIMIT}};
}
async function locked(db:D1Database,b:Awaited<ReturnType<typeof buckets>>){
  const rows=await db.prepare('SELECT bucket,n FROM auth_failures WHERE bucket IN (?1,?2)').bind(b.ip.key,b.all.key).all<{bucket:string;n:number}>();
  return rows.results.some(r=>r.n>=(r.bucket===b.ip.key?b.ip.limit:b.all.limit));
}
async function countFailure(db:D1Database,b:Awaited<ReturnType<typeof buckets>>,now:number){
  for(const x of [b.ip,b.all])await db.prepare('INSERT INTO auth_failures (bucket,n,window_end) VALUES (?1,1,?2) ON CONFLICT(bucket) DO UPDATE SET n=n+1').bind(x.key,x.end).run();
  await db.prepare('DELETE FROM auth_failures WHERE window_end<?1').bind(now).run();
}

/* ───────── sign-in / sign-out ───────── */
async function readForm(request:Request){
  if(Number(request.headers.get('content-length')||0)>2000)return null;
  const text=await request.text();if(text.length>2000)return null;
  return new URLSearchParams(text);
}
async function login(request:Request,env:Required<Pick<AuthEnv,'PIN_PEPPER'|'PUSH_DB'>>&AuthEnv,now:number){
  const url=new URL(request.url),db=env.PUSH_DB;
  if(!originOK(request))return json({error:'origin'},403);
  const form=await readForm(request),lang=form?.get('lang')==='en'?'en':'ar',next=safeNext(form?.get('next')??null);
  const back=(e:string)=>redirect(`/login?e=${e}&lang=${lang}${next!=='/'?'&next='+encodeURIComponent(next):''}`);
  if(env.PUSH_LIMIT&&!(await env.PUSH_LIMIT.limit({key:'auth:'+(request.headers.get('CF-Connecting-IP')||'unknown'),delta:6})).success)return back('rate');
  const b=await buckets(request,now);
  if(await locked(db,b))return back('locked');
  const pin=normalizePin(form?.get('pin')??'');
  if(!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)){await countFailure(db,b,now);return back('wrong');}
  const t=await db.prepare('SELECT id,expires_at,revoked_at FROM testers WHERE pin_hash=?1').bind(await pinHash(env.PIN_PEPPER,pin)).first<{id:string;expires_at:number;revoked_at:number|null}>();
  if(!t||t.revoked_at!==null){await countFailure(db,b,now);return back('wrong');}
  if(t.expires_at<=now)return back('expired');
  const token=newToken(),expires=Math.min(now+SESSION_MS,t.expires_at);
  await db.prepare('INSERT INTO tester_sessions (token_hash,tester_id,created_at,expires_at) VALUES (?1,?2,?3,?4)').bind(await sha256(token),t.id,now,expires).run();
  await db.prepare('DELETE FROM tester_sessions WHERE expires_at<?1').bind(now).run();
  return redirect(next,{'Set-Cookie':sessionCookie(url,token,(expires-now)/1000)});
}
async function logout(request:Request,db:D1Database,session:string|null){
  if(!originOK(request))return json({error:'origin'},403);
  if(session)await db.prepare('DELETE FROM tester_sessions WHERE token_hash=?1').bind(session).run();
  const url=new URL(request.url);
  // Clears the HTTP cache only — never "storage": the learner's words (IndexedDB) stay on the device.
  const headers={'Set-Cookie':sessionCookie(url,'',0),'Clear-Site-Data':'"cache"'};
  return (request.headers.get('accept')||'').includes('application/json')?json({ok:true},200,headers):redirect('/login?bye=1',headers);
}

/* ───────── the gate ───────── */
/** Wraps the app: `next` is the normal router (API endpoints + static assets). */
export async function pinGate(request:Request,env:AuthEnv,next:(r:Request)=>Promise<Response>,now=Date.now()):Promise<Response>{
  const url=new URL(request.url),path=url.pathname,method=request.method;
  if(path==='/api/health')return next(request);
  if(!env.PIN_PEPPER||env.PIN_PEPPER.length<32||!env.PUSH_DB)return notConfigured(request); // fail CLOSED
  const ready={...env,PIN_PEPPER:env.PIN_PEPPER,PUSH_DB:env.PUSH_DB};
  try{
    if(path==='/login'&&method==='GET')return loginPage(url);
    if(path==='/api/auth/login'&&method==='POST')return await login(request,ready,now);
    if(isPublicAsset(path,method))return env.ASSETS?env.ASSETS.fetch(request):new Response('Not found',{status:404});
    const who=await currentTester(request,env.PUSH_DB,now);
    if(path==='/api/auth/logout'&&method==='POST')return await logout(request,env.PUSH_DB,who?.session??null);
    if(!who){
      if(path.startsWith('/api/'))return json({error:'auth',code:'auth'},401);
      if(wantsHtml(request))return redirect('/login'+(path!=='/'?'?next='+encodeURIComponent(path+url.search):''));
      return new Response('Sign-in required',{status:401,headers:NO_STORE});
    }
    if(path==='/api/auth/me'&&method==='GET')
      // `ref` names whose words live in this browser (a renewed PIN keeps the profile). No name, no label, no PIN data.
      return json({mode:'pin',tester:{ref:(await sha256('wl-profile|'+who.profile)).slice(0,24),expiresAt:new Date(who.expires_at).toISOString()}});
    return privateCopy(await next(request));
  }catch(e){
    console.error('auth gate error',e instanceof Error?e.name:'unknown'); // never the PIN, cookie or SQL values
    return path.startsWith('/api/')?json({error:'auth-unavailable',code:'auth'},503):new Response('Access check unavailable',{status:503,headers:NO_STORE});
  }
}
/** Behind the gate nothing may land in a shared cache: «public» becomes «private», pages are revalidated, keyed on the cookie. */
function privateCopy(r:Response){
  const h=new Headers(r.headers),cc=h.get('cache-control')||'',html=(h.get('content-type')||'').includes('text/html');
  h.set('Cache-Control',html||!cc?'private, no-cache':cc.replace(/\bpublic\b/gi,'private').includes('private')?cc.replace(/\bpublic\b/gi,'private'):'private, '+cc);
  h.append('Vary','Cookie');
  return new Response(r.body,{status:r.status,statusText:r.statusText,headers:h});
}
function notConfigured(request:Request){
  return new URL(request.url).pathname.startsWith('/api/')?json({error:'auth-not-configured',code:'auth'},503)
    :new Response('Staging access is not configured.',{status:503,headers:{...NO_STORE,'Content-Type':'text/plain; charset=utf-8'}});
}

/* ───────── the sign-in page (no JavaScript; a plain form; strict CSP with a per-response style nonce) ───────── */
const TEXT={
  ar:{title:'دخول نسخة الاختبار',lead:'اكتب رمز الدخول الخاص فيك. الرمز ٨ أرقام ويوصلك من صاحب التطبيق.',label:'رمز الدخول',submit:'دخول',
    note:'لا تشارك رمزك مع أحد. كلماتك تبقى على جهازك، وإذا أكثر من شخص يستخدم نفس المتصفح فاستخدموا ملفات تعريف منفصلة عشان ما تختلط البيانات.',
    other:'English',e:{wrong:'الرمز غير صحيح. تأكد من الأرقام وجرّب مرة ثانية.',expired:'انتهت صلاحية هذا الرمز. اطلب رمزًا جديدًا من صاحب التطبيق.',
      locked:'محاولات خاطئة كثيرة. انتظر ١٥ دقيقة وجرّب مرة ثانية.',rate:'طلبات كثيرة. انتظر دقيقة وجرّب.'},bye:'سجّلت خروجك. كلماتك باقية على هذا الجهاز.'},
  en:{title:'Sign in to the test version',lead:'Enter your personal access PIN. It has 8 digits and comes from the app owner.',label:'Access PIN',submit:'Sign in',
    note:'Don’t share your PIN. Your words stay on your device; if several people use the same browser, use separate browser profiles so data never mixes.',
    other:'العربية',e:{wrong:'That PIN isn’t right. Check the digits and try again.',expired:'This PIN has expired. Ask the app owner for a new one.',
      locked:'Too many wrong attempts. Wait 15 minutes and try again.',rate:'Too many requests. Wait a minute and try again.'},bye:'You’re signed out. Your words are still on this device.'},
} as const;
const escHtml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function loginPage(url:URL){
  const lang=url.searchParams.get('lang')==='en'?'en':'ar',t=TEXT[lang],e=url.searchParams.get('e') as keyof typeof t.e|null;
  const msg=e&&e in t.e?t.e[e]:null,bye=url.searchParams.get('bye')==='1',next=safeNext(url.searchParams.get('next'));
  const nonce=newToken().slice(0,22),other=new URLSearchParams({lang:lang==='en'?'ar':'en',...(next!=='/'?{next}:{})});
  const html=`<!doctype html><html lang="${lang}" dir="${lang==='ar'?'rtl':'ltr'}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex">
<meta name="theme-color" content="#faf8f4"><title>WordLoop · ${escHtml(t.title)}</title><style nonce="${nonce}">
@font-face{font-family:Plex;font-weight:400;font-display:swap;src:url(/auth/plex-ar-400.woff2) format('woff2');unicode-range:U+0600-06FF,U+0750-077F,U+FB50-FDFF,U+FE70-FEFF,U+200C-200F}
@font-face{font-family:Plex;font-weight:400;font-display:swap;src:url(/auth/plex-la-400.woff2) format('woff2');unicode-range:U+0000-00FF,U+2000-206F}
@font-face{font-family:Plex;font-weight:600;font-display:swap;src:url(/auth/plex-ar-600.woff2) format('woff2');unicode-range:U+0600-06FF,U+0750-077F,U+FB50-FDFF,U+FE70-FEFF,U+200C-200F}
@font-face{font-family:Plex;font-weight:600;font-display:swap;src:url(/auth/plex-la-600.woff2) format('woff2');unicode-range:U+0000-00FF,U+2000-206F}
:root{--paper:#faf8f4;--surface:#fffdf9;--ink:#181b18;--ink-2:#40463f;--muted:#646a63;--line:#e9e5dc;--line-2:#dcd7cc;--mint:#e7f1ec;--peach:#fae9e1;--ok:#2f6b4f;--bad:#9b3b2a}
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--paper);color:var(--ink);font-family:Plex,"IBM Plex Sans Arabic",system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif}
body{display:grid;place-items:center;min-height:100dvh;padding:24px 16px calc(24px + env(safe-area-inset-bottom))}
main{inline-size:min(420px,100%);background:var(--surface);border:1px solid var(--line);border-radius:28px;padding:28px 22px 22px;box-shadow:0 24px 60px -36px rgba(24,27,24,.35)}
.brand{display:flex;align-items:center;gap:10px;font-weight:600;font-size:20px;margin-block-end:22px}.brand img{inline-size:34px;block-size:34px;border-radius:50%}
.tag{margin-inline-start:auto;font-size:13px;font-weight:600;background:#fbf0d2;border:1px solid #f0dfae;color:#5a4712;border-radius:999px;padding:4px 10px}
h1{font-size:26px;line-height:1.3;margin:0 0 8px}p{margin:0;color:var(--ink-2);line-height:1.75;font-size:15px}
form{display:grid;gap:10px;margin-block-start:22px}label{font-weight:600;font-size:15px}
input{font:600 28px/1.2 ui-monospace,"SF Mono",Menlo,Consolas,monospace;letter-spacing:.35em;text-align:center;direction:ltr;inline-size:100%;padding:14px 10px;border:1.5px solid var(--line-2);border-radius:16px;background:#fff;color:var(--ink)}
input:focus{outline:3px solid #b9dccb;outline-offset:2px;border-color:var(--ok)}
button{font:600 17px/1 inherit;font-family:inherit;min-block-size:52px;border:0;border-radius:999px;background:#111412;color:#fff;cursor:pointer}button:focus-visible{outline:3px solid #b9dccb;outline-offset:3px}
.msg{margin-block-start:16px;border-radius:14px;padding:10px 12px;font-size:14px;line-height:1.7}.err{background:var(--peach);color:var(--bad)}.ok{background:var(--mint);color:var(--ok)}
.note{font-size:13px;color:var(--muted);margin-block-start:16px}.switch{display:inline-block;margin-block-start:14px;color:var(--ok);font-weight:600;font-size:14px;text-decoration:none}
</style></head><body><main>
<div class="brand"><img src="/icons/icon-192.png" alt="" width="34" height="34"><span dir="ltr">WordLoop</span><span class="tag">${lang==='ar'?'نسخة اختبار':'Test version'}</span></div>
<h1>${escHtml(t.title)}</h1><p>${escHtml(t.lead)}</p>
${msg?`<p class="msg err" role="alert" id="pin-error">${escHtml(msg)}</p>`:bye?`<p class="msg ok" role="status">${escHtml(t.bye)}</p>`:''}
<form method="post" action="/api/auth/login" autocomplete="off">
<label for="pin">${escHtml(t.label)}</label>
<input id="pin" name="pin" inputmode="numeric" pattern="[0-9٠-٩۰-۹ -]*" maxlength="12" autocomplete="off" autocapitalize="off" spellcheck="false" required autofocus${msg?' aria-invalid="true" aria-describedby="pin-error"':''}>
<input type="hidden" name="lang" value="${lang}"><input type="hidden" name="next" value="${escHtml(next)}">
<button type="submit">${escHtml(t.submit)}</button></form>
<p class="note">${escHtml(t.note)}</p><a class="switch" href="/login?${escHtml(other.toString())}" lang="${lang==='ar'?'en':'ar'}">${escHtml(t.other)}</a>
</main></body></html>`;
  return new Response(html,{headers:{...NO_STORE,'Content-Type':'text/html; charset=utf-8','X-Frame-Options':'DENY',
    'Content-Security-Policy':`default-src 'none'; style-src 'nonce-${nonce}'; font-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`}});
}

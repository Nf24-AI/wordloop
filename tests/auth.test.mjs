// #70 Staging PIN gate — security and functional tests against a real SQLite database (node:sqlite) with the
// exact migration 0005. No network; the PEPPER and PINs below are test values only.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.ts';
import {pinGate,pinHash,normalizePin,safeNext,IP_FAIL_LIMIT,GLOBAL_FAIL_LIMIT,SESSION_MS} from '../worker/auth.ts';
import {pinHashNode,newPin,weakPin,createSql,safeLabel} from '../scripts/tester-pin.mjs';
import {checkAccess} from '../src/access.ts';

const BASE='https://wordloop-staging.nf24-wordloop.workers.dev';
const PEPPER='test-pepper-'+'0123456789abcdef'.repeat(3);
const PIN_A='40817263',PIN_B='93051746',PIN_OLD='55120934';
const DAY=864e5;

/** A D1-shaped wrapper over node:sqlite (?1-style parameters work the same). */
function d1(){
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../worker/migrations/0005_tester_access.sql',import.meta.url),'utf8'));
  const stmt=(sql,args=[])=>({
    bind:(...a)=>stmt(sql,a),
    first:async()=>db.prepare(sql).get(...args)??null,
    all:async()=>({results:db.prepare(sql).all(...args)}),
    run:async()=>{db.prepare(sql).run(...args);return {success:true};},
  });
  return {raw:db,prepare:sql=>stmt(sql)};
}
async function setup(now=Date.now()){
  const db=d1();
  db.raw.exec(createSql({pepper:PEPPER,pin:PIN_A,label:'tester-a',days:7,profile:'p-a',testerId:'aaaaaaaaaaaaaaaa',now}));
  db.raw.exec(createSql({pepper:PEPPER,pin:PIN_B,label:'tester-b',days:7,profile:'p-b',testerId:'bbbbbbbbbbbbbbbb',now}));
  db.raw.exec(createSql({pepper:PEPPER,pin:PIN_OLD,label:'old',days:1,profile:'p-o',testerId:'cccccccccccccccc',now:now-3*DAY}));
  const assets={fetch:async r=>new Response('<!doctype html><title>WordLoop</title>',{headers:{'Content-Type':'text/html','Cache-Control':'public, max-age=60'}})};
  const env={AUTH_MODE:'pin',PIN_PEPPER:PEPPER,PUSH_DB:db,ASSETS:assets};
  return {db,env};
}
const html={Accept:'text/html','Sec-Fetch-Mode':'navigate'};
const call=(env,path,init={},now)=>pinGate(new Request(BASE+path,init),env,async r=>env.ASSETS.fetch(r),now);
const viaWorker=(env,path,init={})=>worker.fetch(new Request(BASE+path,init),env);
function loginReq(pin,{ip='198.51.100.7',origin=BASE,next=''}={}){
  return {method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Origin:origin,'CF-Connecting-IP':ip},
    body:new URLSearchParams({pin,lang:'ar',...(next?{next}:{})}).toString()};
}
const cookieOf=res=>(res.headers.get('set-cookie')||'').split(';')[0];
async function signIn(env,pin=PIN_A,opts){const r=await call(env,'/api/auth/login',loginReq(pin,opts));return {res:r,cookie:cookieOf(r)};}

// Every log line written during these tests is checked at the end: no PIN, cookie value or pepper may appear.
const logged=[];for(const k of ['log','warn','error','info']){const o=console[k];console[k]=(...a)=>{logged.push(a.map(String).join(' '));o.apply(console,a);};}

test('AUTH-01 off by default: without AUTH_MODE=pin nothing is gated and the API behaves as before',async()=>{
  const assets={fetch:async()=>new Response('app',{headers:{'Content-Type':'text/html'}})};
  assert.equal(await (await viaWorker({ASSETS:assets},'/',{headers:html})).text(),'app');
  assert.equal((await viaWorker({ASSETS:assets,PUSH_DB:{prepare(){throw Error('untouched');}}},'/api/auth/me')).status,404,'no auth routes when the gate is off');
  assert.equal((await viaWorker({AUTH_MODE:'PIN',ASSETS:assets},'/')).status,200,'only the exact value "pin" turns it on');
});

test('AUTH-02 fails CLOSED when switched on without the pepper secret or the database',async()=>{
  for(const env of [{AUTH_MODE:'pin'},{AUTH_MODE:'pin',PIN_PEPPER:'short',PUSH_DB:d1()},{AUTH_MODE:'pin',PIN_PEPPER:PEPPER}]){
    assert.equal((await viaWorker(env,'/',{headers:html})).status,503);
    assert.equal((await viaWorker(env,'/api/push/key')).status,503);
    assert.equal((await viaWorker(env,'/assets/index.js')).status,503);
  }
  assert.equal((await viaWorker({AUTH_MODE:'pin'},'/api/health')).status,200,'health stays public (no data)');
});

test('AUTH-03 a visitor without a session gets nothing: pages → sign-in, assets and every API → 401',async()=>{
  const {env}=await setup();
  const page=await viaWorker(env,'/',{headers:html});
  assert.equal(page.status,303);assert.equal(page.headers.get('location'),'/login');
  const deep=await viaWorker(env,'/words?x=1',{headers:html});
  assert.equal(deep.headers.get('location'),'/login?next='+encodeURIComponent('/words?x=1'));
  for(const p of ['/assets/index-abc.js','/sw.js','/index.html','/src/main.tsx'])assert.equal((await viaWorker(env,p)).status,401,p);
  for(const [p,m] of [['/api/push/key','GET'],['/api/practice/story/status','GET'],['/api/practice/story','POST'],['/api/push/sync','POST'],['/api/push/test','POST'],['/api/auth/me','GET']]){
    const r=await viaWorker(env,p,{method:m,headers:{Origin:BASE}});
    assert.equal(r.status,401,p);assert.deepEqual(await r.json(),{error:'auth',code:'auth'});
    assert.equal(r.headers.get('cache-control'),'no-store');
  }
});

test('AUTH-04 the sign-in page: Arabic RTL by default, English on request, no-store, strict CSP with a nonce, no script',async()=>{
  const {env}=await setup();
  const ar=await call(env,'/login');const t=await ar.text();
  assert.equal(ar.status,200);assert.match(t,/<html lang="ar" dir="rtl">/);assert.match(t,/رمز الدخول/);
  assert.equal(ar.headers.get('cache-control'),'no-store');assert.equal(ar.headers.get('x-frame-options'),'DENY');
  const csp=ar.headers.get('content-security-policy');
  assert.match(csp,/default-src 'none'/);assert.match(csp,/frame-ancestors 'none'/);assert.match(csp,/form-action 'self'/);
  const nonce=/style-src 'nonce-([\w-]+)'/.exec(csp)[1];assert.ok(t.includes(`<style nonce="${nonce}">`));
  assert.doesNotMatch(t,/<script/i);
  assert.match(t,/inputmode="numeric"/);assert.match(t,/autocomplete="off"/);
  const en=await (await call(env,'/login?lang=en')).text();
  assert.match(en,/<html lang="en" dir="ltr">/);assert.match(en,/Access PIN/);
  const other=await call(env,'/login');assert.notEqual(/nonce-([\w-]+)/.exec(other.headers.get('content-security-policy'))[1],nonce,'a fresh nonce per response');
});

test('AUTH-05 a correct PIN starts a session: HttpOnly, Secure, SameSite=Lax, __Host- cookie; only its hash is stored',async()=>{
  const {db,env}=await setup();
  const {res,cookie}=await signIn(env);
  assert.equal(res.status,303);assert.equal(res.headers.get('location'),'/');
  const sc=res.headers.get('set-cookie');
  assert.match(sc,/^__Host-wl_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=\d+; Secure$/);
  assert.ok(!/Domain=/i.test(sc));
  const maxAge=Number(/Max-Age=(\d+)/.exec(sc)[1]);assert.ok(maxAge<=SESSION_MS/1000&&maxAge>SESSION_MS/1000-5,'7 days at most');
  const token=cookie.split('=')[1];
  const rows=db.raw.prepare('SELECT * FROM tester_sessions').all();
  assert.equal(rows.length,1);assert.notEqual(rows[0].token_hash,token);assert.match(rows[0].token_hash,/^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(db.raw.prepare('SELECT * FROM testers').all()).includes(PIN_A),'no PIN in clear in D1');
  // the session opens pages, assets and the API; nothing protected may be cached publicly
  const page=await call(env,'/',{headers:{...html,Cookie:cookie}});
  assert.equal(page.status,200);assert.equal(page.headers.get('cache-control'),'private, no-cache');assert.match(page.headers.get('vary'),/Cookie/);
  const me=await call(env,'/api/auth/me',{headers:{Cookie:cookie}});
  const body=await me.json();assert.equal(body.mode,'pin');assert.match(body.tester.ref,/^[0-9a-f]{24}$/);
  assert.ok(!JSON.stringify(body).includes('tester-a'),'no label/name in the API');
});

test('AUTH-06 PIN input: Arabic-Indic digits, spaces and dashes are accepted; anything else is a wrong PIN',async()=>{
  assert.equal(normalizePin('٤٠٨١ ٧٢٦٣'),'40817263');assert.equal(normalizePin('۴۰۸۱-۷۲۶۳'),'40817263');
  const {env}=await setup();
  assert.equal((await signIn(env,'٤٠٨١ ٧٢٦٣')).res.headers.get('location'),'/');
  for(const bad of ['4081726','408172633','4081726a',"40817263' OR 1=1--",'','<script>'])
    assert.match((await signIn(env,bad,{ip:'203.0.113.'+bad.length})).res.headers.get('location'),/e=wrong/,bad);
});

test('AUTH-07 wrong, revoked and expired PINs never open a session',async()=>{
  const {db,env}=await setup();
  const wrong=await signIn(env,'11223344');
  assert.match(wrong.res.headers.get('location'),/^\/login\?e=wrong&lang=ar/);assert.equal(wrong.res.headers.get('set-cookie'),null);
  const expired=await signIn(env,PIN_OLD);
  assert.match(expired.res.headers.get('location'),/e=expired/);assert.equal(expired.res.headers.get('set-cookie'),null);
  db.raw.exec("UPDATE testers SET revoked_at=1 WHERE id='bbbbbbbbbbbbbbbb'");
  const revoked=await signIn(env,PIN_B);
  assert.match(revoked.res.headers.get('location'),/e=wrong/,'a revoked PIN looks exactly like a wrong one');
  assert.equal(db.raw.prepare('SELECT count(*) n FROM tester_sessions').get().n,0);
  // a different pepper (e.g. a leaked D1 copy without the secret) matches nothing
  assert.match((await signIn({...env,PIN_PEPPER:'x'.repeat(64)},PIN_A,{ip:'192.0.2.99'})).res.headers.get('location'),/e=wrong/);
  assert.notEqual(await pinHash(PEPPER,PIN_A),await pinHash('x'.repeat(64),PIN_A));
});

test('AUTH-08 rate limit: 10 wrong PINs lock that address for the window — even the right PIN — others are unaffected',async()=>{
  const {env}=await setup(),now=Date.UTC(2026,10,18,10,1);
  const at=(pin,ip)=>call(env,'/api/auth/login',loginReq(pin,{ip}),now);
  for(let i=0;i<IP_FAIL_LIMIT;i++)assert.match((await at('0000000'+i,'198.51.100.1')).headers.get('location'),/e=wrong/);
  assert.match((await at(PIN_A,'198.51.100.1')).headers.get('location'),/e=locked/);
  assert.equal((await at(PIN_A,'198.51.100.2')).headers.get('location'),'/','another address still signs in');
  const later=await call(env,'/api/auth/login',loginReq(PIN_A,{ip:'198.51.100.1'}),now+16*60e3);
  assert.equal(later.headers.get('location'),'/','the lock ends with the 15-minute window');
  assert.ok(!JSON.stringify(env.PUSH_DB.raw.prepare('SELECT * FROM auth_failures').all()).includes('198.51.100'),'IPs are stored hashed only');
});

test('AUTH-09 global brake: after 200 wrong PINs in an hour from many addresses, sign-in pauses for everyone',async()=>{
  const {env}=await setup(),now=Date.UTC(2026,10,18,11,5);
  for(let i=0;i<GLOBAL_FAIL_LIMIT;i++)await call(env,'/api/auth/login',loginReq('1357913'+(i%10),{ip:`10.0.${i>>8}.${i&255}`}),now);
  assert.match((await call(env,'/api/auth/login',loginReq(PIN_A,{ip:'192.0.2.1'}),now)).headers.get('location'),/e=locked/);
  assert.equal((await call(env,'/api/auth/login',loginReq(PIN_A,{ip:'192.0.2.1'}),now+3600e3)).headers.get('location'),'/');
});

test('AUTH-10 also uses the Cloudflare rate-limit binding when present',async()=>{
  const {env}=await setup();
  const res=await call({...env,PUSH_LIMIT:{limit:async()=>({success:false})}},'/api/auth/login',loginReq(PIN_A));
  assert.match(res.headers.get('location'),/e=rate/);
});

test('AUTH-11 sign-out ends the session server-side, clears the cookie and the HTTP cache — never the stored words',async()=>{
  const {db,env}=await setup();
  const {cookie}=await signIn(env);
  const out=await call(env,'/api/auth/logout',{method:'POST',headers:{Cookie:cookie,Origin:BASE,Accept:'application/json'}});
  assert.equal(out.status,200);
  assert.match(out.headers.get('set-cookie'),/^__Host-wl_session=; Path=\/; HttpOnly; SameSite=Lax; Max-Age=0; Secure$/);
  assert.equal(out.headers.get('clear-site-data'),'"cache"','not "storage": IndexedDB stays');
  assert.equal(db.raw.prepare('SELECT count(*) n FROM tester_sessions').get().n,0);
  assert.equal((await call(env,'/api/auth/me',{headers:{Cookie:cookie}})).status,401,'a copied old cookie is useless');
  const form=await call(env,'/api/auth/logout',{method:'POST',headers:{Origin:BASE}});
  assert.equal(form.headers.get('location'),'/login?bye=1');
  assert.match(await (await call(env,'/login?bye=1')).text(),/كلماتك باقية/);
});

test('AUTH-12 revoking a tester ends all their sessions on the very next request; «signout» keeps the PIN',async()=>{
  const {db,env}=await setup();
  const a1=(await signIn(env)).cookie,a2=(await signIn(env,PIN_A,{ip:'192.0.2.5'})).cookie,b=(await signIn(env,PIN_B)).cookie;
  db.raw.exec("DELETE FROM tester_sessions WHERE tester_id='bbbbbbbbbbbbbbbb'"); // = scripts/tester-pin.mjs signout
  assert.equal((await call(env,'/api/auth/me',{headers:{Cookie:b}})).status,401);
  assert.equal((await signIn(env,PIN_B)).res.headers.get('location'),'/','the PIN still works after «signout»');
  db.raw.exec(`UPDATE testers SET revoked_at=${Date.now()} WHERE id='aaaaaaaaaaaaaaaa'`); // = revoke (sessions checked via the tester too)
  for(const c of [a1,a2])assert.equal((await call(env,'/',{headers:{...html,Cookie:c}})).status,303);
});

test('AUTH-13 sessions end at 7 days and never outlive the PIN',async()=>{
  const now=Date.now(),{env}=await setup(now);
  const {cookie}=await signIn(env);
  assert.equal((await call(env,'/api/auth/me',{headers:{Cookie:cookie}},now+SESSION_MS-1000)).status,200);
  assert.equal((await call(env,'/api/auth/me',{headers:{Cookie:cookie}},now+SESSION_MS+1000)).status,401);
  const db=d1();db.raw.exec(createSql({pepper:PEPPER,pin:PIN_A,label:'short',days:1,profile:'p',testerId:'dddddddddddddddd',now}));
  const env2={...env,PUSH_DB:db},s=await signIn(env2);
  assert.ok(Number(/Max-Age=(\d+)/.exec(s.res.headers.get('set-cookie'))[1])<=DAY/1000);
  assert.equal((await call(env2,'/api/auth/me',{headers:{Cookie:s.cookie}},now+DAY+1000)).status,401);
});

test('AUTH-14 cross-site requests and forged cookies are refused',async()=>{
  const {env}=await setup();
  assert.equal((await call(env,'/api/auth/login',loginReq(PIN_A,{origin:'https://attacker.example'}))).status,403);
  const nul=h=>({...loginReq(PIN_A),headers:{...loginReq(PIN_A).headers,Origin:'null',...h}});
  assert.equal((await call(env,'/api/auth/login',nul({'Sec-Fetch-Site':'cross-site'}))).status,403,'sandboxed/cross-site null origin');
  assert.equal((await call(env,'/api/auth/login',nul({'Sec-Fetch-Site':'same-site'}))).status,403);
  assert.equal((await call(env,'/api/auth/login',nul({'Sec-Fetch-Site':'same-origin'}))).headers.get('location'),'/','no-referrer form post');
  const {cookie}=await signIn(env);
  assert.equal((await call(env,'/api/auth/logout',{method:'POST',headers:{Cookie:cookie,Origin:'https://attacker.example'}})).status,403);
  for(const c of ['__Host-wl_session=abc','__Host-wl_session='+'A'.repeat(43),'wl_session='+cookie.split('=')[1],'__Host-wl_session=../../x; a=b'])
    assert.equal((await call(env,'/api/auth/me',{headers:{Cookie:c}})).status,401,c);
});

test('AUTH-15 no open redirect after sign-in; hostile text is escaped on the page',async()=>{
  for(const bad of ['//evil.example','https://evil.example','/\\evil.example','/login','/api/push/key','javascript:alert(1)','/\nx'])assert.equal(safeNext(bad),'/',bad);
  assert.equal(safeNext('/#/words'),'/#/words');
  const {env}=await setup();
  assert.equal((await signIn(env,PIN_A,{next:'//evil.example'})).res.headers.get('location'),'/');
  const page=await (await call(env,'/login?next=/%22%3E%3Cscript%3Ex%3C/script%3E&e=%3Cb%3E')).text();
  assert.doesNotMatch(page,/<script>x/);assert.doesNotMatch(page,/<b>/);
});

test('AUTH-16 only data-free static files are public (sign-in fonts, icons, manifest for iPhone «Add to Home Screen»)',async()=>{
  const {env}=await setup();
  for(const p of ['/auth/plex-ar-400.woff2','/icons/icon-192.png','/icons/icon-512.png','/manifest.webmanifest'])assert.equal((await call(env,p)).status,200,p);
  for(const p of ['/index.html','/assets/x.js','/sw.js','/icons/../index.html','/icons/x.png/../../sw.js','/auth'])assert.notEqual((await call(env,p)).status,200,p);
  assert.equal((await call(env,'/manifest.webmanifest',{method:'POST'})).status,401);
});

test('AUTH-17 PIN tool: 8 random digits, never trivial; the CLI hash equals the Worker hash; labels are validated',async()=>{
  const seen=new Set();for(let i=0;i<2000;i++){const p=newPin();assert.match(p,/^\d{8}$/);assert.ok(!weakPin(p));seen.add(p);}
  assert.ok(seen.size>1990,'random, not a sequence');
  for(const w of ['00000000','12345678','87654321','12341234','12121212'])assert.ok(weakPin(w),w);
  assert.equal(pinHashNode(PEPPER,PIN_A),await pinHash(PEPPER,PIN_A));
  assert.throws(()=>safeLabel("x'); DROP TABLE testers;--"));assert.equal(safeLabel('tester-1'),'tester-1');
  const sql=createSql({pepper:PEPPER,pin:PIN_A,label:'t',days:7});assert.ok(!sql.includes(PIN_A),'the SQL never carries the PIN');
});

test('AUTH-18 local data is bound to one tester: first sign-in claims it, another tester is blocked, no request outside Staging',async()=>{
  let owner=null;const store={get:async()=>owner,claim:async r=>{owner=r;}};
  const me=ref=>async()=>Response.json({mode:'pin',tester:{ref,expiresAt:'2026-11-25T00:00:00Z'}});
  const A='a'.repeat(24),B='b'.repeat(24);
  assert.equal(await checkAccess(me(A),store,true),'ok');assert.equal(owner,A,'first tester claims the existing words');
  assert.equal(await checkAccess(me(A),store,true),'ok');
  assert.equal(await checkAccess(me(B),store,true),'mismatch','another tester never sees or merges them');
  assert.equal(owner,A,'nothing is rebound');
  assert.equal(await checkAccess(async()=>new Response('{"error":"auth","code":"auth"}',{status:401}),store,true),'signin');
  assert.equal(await checkAccess(async()=>new Response('',{status:404}),store,true),'ok','gate off');
  assert.equal(await checkAccess(async()=>{throw new TypeError('offline');},store,true),'ok','offline: local words still open');
  let called=false;assert.equal(await checkAccess(async()=>{called=true;return new Response('');},store,false),'ok');assert.equal(called,false,'production builds make no request');
});

test('AUTH-19 secrets never reach logs, the repository or the client bundle sources',()=>{
  const joined=logged.join('\n');
  for(const s of [PIN_A,PIN_B,PEPPER])assert.ok(!joined.includes(s),'log leak');
  const ignore=readFileSync(new URL('../.gitignore',import.meta.url),'utf8');
  assert.match(ignore,/pin-pepper/);
  for(const f of ['../src/access.ts','../src/AccessBlocked.tsx','../src/main.tsx'])assert.doesNotMatch(readFileSync(new URL(f,import.meta.url),'utf8'),/PIN_PEPPER|pin_hash/);
  const wr=readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8').replace(/\/\/.*$/gm,'');
  assert.doesNotMatch(wr,/PIN_PEPPER|AUTH_MODE/,'the switch and the secret are set by the owner, not committed');
});

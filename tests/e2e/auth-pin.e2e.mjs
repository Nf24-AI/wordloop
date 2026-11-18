// #70 Staging PIN gate, end to end in Chromium and WebKit (390×844). The real gate (worker/auth.ts) runs in a small
// local proxy in front of the normal Vite/Worker dev server, with an in-memory SQLite database and test PINs only.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {ENGINES,IPHONE,startServer,addCard,libraryTerms} from './harness.mjs';
import {pinGate} from '../../worker/auth.ts';
import {createSql} from '../../scripts/tester-pin.mjs';

const PEPPER='e2e-pepper-'+'fedcba9876543210'.repeat(3),PIN_A='40817263',PIN_B='93051746';
let app,proxy,base,db;

function d1(){
  const raw=new DatabaseSync(':memory:');
  raw.exec(readFileSync(new URL('../../worker/migrations/0005_tester_access.sql',import.meta.url),'utf8'));
  const stmt=(sql,args=[])=>({bind:(...a)=>stmt(sql,a),first:async()=>raw.prepare(sql).get(...args)??null,
    all:async()=>({results:raw.prepare(sql).all(...args)}),run:async()=>{raw.prepare(sql).run(...args);return {success:true};}});
  return {raw,prepare:sql=>stmt(sql)};
}
before(async()=>{
  app=await startServer();db=d1();
  db.raw.exec(createSql({pepper:PEPPER,pin:PIN_A,label:'a',days:7,profile:'pa',testerId:'aaaaaaaaaaaaaaaa'}));
  db.raw.exec(createSql({pepper:PEPPER,pin:PIN_B,label:'b',days:7,profile:'pb',testerId:'bbbbbbbbbbbbbbbb'}));
  const upstream=async r=>{const u=new URL(r.url);const h=new Headers(r.headers);for(const k of ['host','connection','keep-alive','transfer-encoding','upgrade','expect','content-length'])h.delete(k);
    const res=await fetch(app.base+u.pathname+u.search,{method:r.method,headers:h,body:['GET','HEAD'].includes(r.method)?undefined:await r.arrayBuffer(),redirect:'manual'});
    const out=new Headers(res.headers);out.delete('content-encoding');out.delete('content-length');
    return new Response(res.body,{status:res.status,headers:out});};
  proxy=http.createServer(async(req,res)=>{
    const chunks=[];for await(const c of req)chunks.push(c);
    const url=`http://127.0.0.1:${proxy.address().port}${req.url}`;
    const headers=new Headers();for(const [k,v] of Object.entries(req.headers))if(typeof v==='string')headers.set(k,v);
    const request=new Request(url,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});
    let r;try{r=await pinGate(request,{AUTH_MODE:'pin',PIN_PEPPER:PEPPER,PUSH_DB:db,ASSETS:{fetch:upstream}},upstream);}catch(e){res.writeHead(502);res.end(String(e));return;}
    const hs={};r.headers.forEach((v,k)=>{hs[k]=k in hs?hs[k]+', '+v:v;});
    const cookie=r.headers.getSetCookie?.();if(cookie?.length)hs['set-cookie']=cookie;
    res.writeHead(r.status,hs);res.end(Buffer.from(await r.arrayBuffer()));
  });
  await new Promise(ok=>proxy.listen(0,'127.0.0.1',ok));
  base=`http://127.0.0.1:${proxy.address().port}`;
});
after(async()=>{proxy?.close();await app?.stop();});

async function signIn(page,pin){
  await page.waitForSelector('#pin');await page.fill('#pin',pin);
  await Promise.all([page.waitForNavigation(),page.click('button[type=submit]')]);
}
for(const [name,engine] of Object.entries(ENGINES)){
  test(`AUTH-E2E-01 ${name}: visitor → sign-in; wrong PIN; right PIN opens the app; sign-out keeps the words`,async()=>{
    const browser=await engine.launch();
    try{
      const context=await browser.newContext({...IPHONE,serviceWorkers:'block',locale:'ar-SA'});
      const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
      await page.goto(base+'/');
      assert.match(page.url(),/\/login$/);
      assert.equal(await page.getAttribute('html','dir'),'rtl');
      assert.equal(await page.textContent('h1'),'دخول نسخة الاختبار');
      const fits=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);assert.ok(fits,'no horizontal scroll at 390px');
      await signIn(page,'11112222');
      assert.match(await page.textContent('[role=alert]'),/الرمز غير صحيح/);
      assert.equal(await page.getAttribute('#pin','aria-invalid'),'true');
      await signIn(page,'٤٠٨١٧٢٦٣');
      await page.waitForSelector('main h1');
      const cookies=await context.cookies();const c=cookies.find(x=>x.name==='wl_session');
      assert.ok(c?.httpOnly,'HttpOnly');
      assert.equal(await page.evaluate(()=>document.cookie.includes('wl_session')),false,'scripts cannot read the session');
      await addCard(page,base,'serendipity','صدفة سعيدة');await page.getByRole('status').filter({hasText:'«serendipity»'}).waitFor();
      assert.deepEqual(await libraryTerms(page,base),['serendipity']);
      await page.goto(base+'/#/settings');await page.waitForSelector('#access-title');
      await Promise.all([page.waitForURL(/\/login\?bye=1/),page.click('section[aria-labelledby=access-title] button')]);
      assert.match(await page.textContent('[role=status]'),/كلماتك باقية/);
      assert.equal((await context.request.get(base+'/api/push/key')).status(),401,'API closed after sign-out');
      await page.goto(base+'/#/words/all');assert.match(page.url(),/\/login/);
      await signIn(page,PIN_A);await page.waitForSelector('main h1');
      assert.deepEqual(await libraryTerms(page,base),['serendipity'],'IndexedDB untouched by sign-out');
      // tester B in the SAME browser profile: blocked, sees none of A's words, nothing deleted
      await page.goto(base+'/#/settings');await page.waitForSelector('#access-title');
      await Promise.all([page.waitForURL(/\/login/),page.click('section[aria-labelledby=access-title] button')]);
      await signIn(page,PIN_B);
      await page.waitForSelector('.access-blocked h1');
      assert.equal(await page.locator('text=serendipity').count(),0);
      await Promise.all([page.waitForURL(/\/login/),page.click('.access-blocked button')]);
      await signIn(page,PIN_A);await page.waitForSelector('main h1');
      assert.deepEqual(await libraryTerms(page,base),['serendipity']);
      // revoked on the server → the next API call is refused and the app sends the tester to sign-in on reload
      db.raw.exec(`UPDATE testers SET revoked_at=${Date.now()} WHERE id='aaaaaaaaaaaaaaaa'`);
      assert.equal((await context.request.get(base+'/api/push/key')).status(),401);
      await page.reload();assert.match(page.url(),/\/login/);
      db.raw.exec(`UPDATE testers SET revoked_at=NULL WHERE id='aaaaaaaaaaaaaaaa'`);
      assert.deepEqual(errors,[]);
      await context.close();
    }finally{await browser.close();}
  });
}

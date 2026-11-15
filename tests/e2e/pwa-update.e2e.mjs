// Issue #41 — «تحديث الآن» for the installed PWA, with a real service worker over a production build.
// A tiny local server serves dist/client and can switch the deployed version (A → B), or behave like an expired
// Cloudflare Access session (redirect to a sign-in page). Real iPhone PWA behaviour still needs the owner's UAT.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {join,extname} from 'node:path';
import {ENGINES,IPHONE} from './harness.mjs';

const ROOT=new URL('../../dist/client/',import.meta.url);
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.json':'application/json'};
let server,base,state={version:'A',accessExpired:false,loads:0};
let swSource,built;
const idOf=v=>v==='A'?built:built.slice(0,10)+v.toLowerCase().padStart(2,'0');

before(async()=>{
  const r=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--mode','staging'],{stdio:'ignore'});
  assert.equal(r.status,0,'production build');
  swSource=readFileSync(new URL('sw.js',ROOT),'utf8');
  built=/const VERSION = '([0-9a-f]{12})'/.exec(swSource)?.[1];
  assert.ok(built,'the build stamped sw.js with a 12-hex version id');
  server=createServer((req,res)=>{
    const url=new URL(req.url,'http://x');let path=decodeURIComponent(url.pathname);
    if(state.accessExpired&&!path.startsWith('/cdn-cgi/')){res.writeHead(302,{location:'/cdn-cgi/access/login?redirect_url='+encodeURIComponent(path)});return res.end();}
    if(path.startsWith('/cdn-cgi/access/login')){res.writeHead(200,{'content-type':'text/html'});return res.end('<!doctype html><title>Sign in</title><h1>ACCESS-LOGIN-PAGE</h1>');}
    if(path.startsWith('/api/')){res.writeHead(404,{'content-type':'application/json'});return res.end('{}');}
    if(path==='/sw.js'){res.writeHead(200,{'content-type':'text/javascript','cache-control':'no-cache'});return res.end(swSource.replace(built,idOf(state.version)));}
    let file=join(ROOT.pathname.replace(/^\/(\w:)/,'$1'),path);
    if(path==='/'||!existsSync(file)||statSync(file).isDirectory()){file=join(ROOT.pathname.replace(/^\/(\w:)/,'$1'),'index.html');}
    res.writeHead(200,{'content-type':TYPES[extname(file)]||'application/octet-stream'});res.end(readFileSync(file));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  base=`http://127.0.0.1:${server.address().port}`;
});
after(()=>server?.close());

const swVersion=page=>page.evaluate(()=>new Promise(res=>{const c=new MessageChannel();c.port1.onmessage=e=>res(e.data);navigator.serviceWorker.controller?navigator.serviceWorker.controller.postMessage({type:'GET_VERSION'},[c.port2]):res(null);}));
/** What iOS does when the PWA comes back to the foreground. */
const resume=page=>page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
const raw=page=>page.evaluate(()=>new Promise(res=>{const r=indexedDB.open('wordloop-local-v1');r.onsuccess=()=>{const db=r.result,tx=db.transaction(['words','reviews','meta']),out={};let n=0;for(const s of ['words','reviews','meta']){const q=tx.objectStore(s).getAll();q.onsuccess=()=>{out[s]=q.result;if(++n===3){db.close();res(JSON.stringify(out));}};}};}));
const prompt=page=>page.locator('.update-card');

for(const [name,engine] of Object.entries(ENGINES)){
  test(`[${name}] issue #41 PWA update`,async t=>{
    const browser=await engine.launch();
    t.after(()=>browser.close());
    const context=await browser.newContext({...IPHONE,locale:'ar-SA',timezoneId:'Asia/Riyadh',serviceWorkers:'allow'});
    const page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(String(e)));
    page.on('load',()=>{state.loads++;});
    state={version:'A',accessExpired:false,loads:0};
    await page.goto(base+'/');await page.waitForSelector('main h1');
    if(!await page.evaluate(()=>'serviceWorker' in navigator)){t.skip(`${name}: no service worker support in this build`);return;}
    await page.waitForFunction(()=>!!navigator.serviceWorker.controller,null,{timeout:20000});

    await t.test('UPD-01: version A installed; no prompt on launch, on resume or after a reload when nothing new was deployed',async()=>{
      assert.equal(await swVersion(page),built);
      await page.goto(base+'/#/add');await page.waitForSelector('#term');
      await page.fill('#term','itinerary');await page.fill('#meaning','خط سير الرحلة');await page.click('form button[type=submit]');
      await page.getByRole('status').filter({hasText:'«itinerary»'}).waitFor();
      await resume(page);await page.reload();await page.waitForSelector('main h1');await resume(page);await page.waitForTimeout(1500);
      assert.equal(await prompt(page).count(),0,'no false prompt');
    });

    let before;
    await t.test('UPD-02: version B deployed → resume shows «تحديث جديد لـ WordLoop» without reloading; «لاحقًا» hides it',async()=>{
      before=await raw(page);
      state.version='B';const loads=state.loads;
      await resume(page);await prompt(page).waitFor({timeout:20000});
      assert.match(await prompt(page).innerText(),/تحديث جديد لـ WordLoop[\s\S]*تحديثات وتحسينات جاهزة\.[\s\S]*تحديث الآن[\s\S]*لاحقًا/);
      assert.equal(state.loads,loads,'nothing reloaded by itself');
      assert.equal(await swVersion(page),built,'still on A until the learner chooses');
      await prompt(page).getByRole('button',{name:'لاحقًا'}).click();
      assert.equal(await prompt(page).count(),0);
    });

    await t.test('UPD-03: a newer deploy offers it again; with unsaved text «تحديث الآن» asks first and «إكمال التعديل» keeps everything',async()=>{
      await page.goto(base+'/#/add');await page.waitForSelector('#term');
      state.version='B2';await resume(page);
      await prompt(page).waitFor({timeout:20000});
      await page.fill('#term','boarding');const loads=state.loads;
      await prompt(page).getByRole('button',{name:'تحديث الآن'}).click();
      await page.locator('dialog[open]',{hasText:'عندك تغييرات غير محفوظة'}).waitFor();
      await page.getByRole('button',{name:'إكمال التعديل'}).click();
      await page.waitForTimeout(800);
      assert.equal(state.loads,loads,'no reload while typing');assert.equal(await page.inputValue('#term'),'boarding');
      assert.equal(await swVersion(page),built);
      await page.fill('#term','');
    });

    await t.test('UPD-04: «تحديث الآن» activates B and reloads exactly once; the prompt is gone; cards, FSRS and settings are untouched',async()=>{
      const loads=state.loads;
      await Promise.all([page.waitForEvent('load'),prompt(page).getByRole('button',{name:'تحديث الآن'}).click()]);
      await page.waitForSelector('main h1');await page.waitForTimeout(2500);
      assert.equal(state.loads-loads,1,'one reload, no loop');
      assert.equal(await swVersion(page),idOf('B2'));
      await resume(page);await page.waitForTimeout(1200);
      assert.equal(await prompt(page).count(),0,'no repeated prompt after updating');
      assert.equal(await raw(page),before,'IndexedDB words, reviews and meta identical');
      assert.equal(await page.evaluate(async()=>(await caches.keys()).filter(k=>k.startsWith('wordloop-shell-')).length),1,'old shell cache removed');
    });

    await t.test('UPD-05: offline after the update, the new version still opens with the same cards',async()=>{
      await context.setOffline(true);
      await page.goto(base+'/#/words/all');await page.reload();await page.locator('.word-list .word-text b',{hasText:'itinerary'}).waitFor();
      await resume(page);await page.waitForTimeout(800);assert.equal(await prompt(page).count(),0,'no check and no prompt while offline');
      await context.setOffline(false);
    });

    await t.test('UPD-06: expired Cloudflare Access session — no false prompt, and the sign-in page never becomes the offline app',async()=>{
      state.accessExpired=true;state.version='C';
      await resume(page);await page.waitForTimeout(2000);
      assert.equal(await prompt(page).count(),0,'update check failed quietly');
      await page.goto(base+'/');await page.waitForSelector('text=ACCESS-LOGIN-PAGE');
      const shell=await page.evaluate(async()=>{const r=await caches.match('/');return r?await r.text():'';});
      assert.doesNotMatch(shell,/ACCESS-LOGIN-PAGE/);assert.match(shell,/id="root"/);
      state.accessExpired=false;
      await context.setOffline(true);await page.goto(base+'/#/words/all').catch(()=>{});
      await page.locator('.word-list .word-text b',{hasText:'itinerary'}).waitFor();
      await context.setOffline(false);
    });

    // WebKit reports the refused sw.js fetch of UPD-06 (redirected to the Access sign-in) as a page error; that is the expected, handled failure.
    assert.deepEqual(errors.filter(e=>!/sw\.js due to access control checks/.test(e)),[]);
    await context.close();
  });
}

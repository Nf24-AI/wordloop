// Issue #3 — the production build runs under its Content-Security-Policy and security headers (Chromium + WebKit).
// A local server applies public/_headers to dist/client the way Cloudflare static assets do, then the main flows run
// while every CSP violation is recorded. Zero violations is required; the headers themselves are asserted too.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {join,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ENGINES,IPHONE} from './harness.mjs';

const ROOT=fileURLToPath(new URL('../../dist/client/',import.meta.url));
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.webmanifest':'application/manifest+json','.json':'application/json'};
let server,base,rules=[];

/** Minimal _headers parser: "path pattern" lines followed by indented "Name: value" lines (Cloudflare format). */
function parseHeaders(text){
  const out=[];let cur=null;
  for(const line of text.split(/\r?\n/)){
    if(!line.trim()||line.trim().startsWith('#'))continue;
    if(!/^\s/.test(line)){cur={pattern:line.trim(),headers:{}};out.push(cur);continue;}
    const i=line.indexOf(':');cur.headers[line.slice(0,i).trim()]=line.slice(i+1).trim();
  }
  return out;
}
const matches=(pattern,path)=>pattern.endsWith('*')?path.startsWith(pattern.slice(0,-1)):path===pattern;

before(async()=>{
  const r=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--mode','staging'],{stdio:'ignore'});
  assert.equal(r.status,0,'production build');
  assert.ok(existsSync(join(ROOT,'_headers')),'_headers is shipped with the static assets');
  rules=parseHeaders(readFileSync(join(ROOT,'_headers'),'utf8'));
  server=createServer((req,res)=>{
    const path=decodeURIComponent(new URL(req.url,'http://x').pathname);
    if(path.startsWith('/api/')){res.writeHead(404,{'content-type':'application/json'});return res.end('{}');}
    let file=join(ROOT,path);
    if(path==='/'||!existsSync(file)||statSync(file).isDirectory()||path==='/_headers')file=join(ROOT,'index.html');
    const headers={'content-type':TYPES[extname(file)]||'application/octet-stream'};
    for(const rule of rules)if(matches(rule.pattern,path))Object.assign(headers,rule.headers);
    res.writeHead(200,headers);res.end(readFileSync(file));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  base=`http://127.0.0.1:${server.address().port}`;
});
after(()=>server?.close());

for(const [name,engine] of Object.entries(ENGINES)){
  test(`[${name}] issue #3 security headers`,{timeout:120_000},async t=>{
    const browser=await engine.launch();
    t.after(()=>browser.close());
    const context=await browser.newContext({...IPHONE,locale:'ar-SA',timezoneId:'Asia/Riyadh',serviceWorkers:'allow'});
    t.after(()=>context.close().catch(()=>{}));
    await context.addInitScript(()=>{window.__csp=[];document.addEventListener('securitypolicyviolation',e=>{window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`);});});
    const page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(String(e)));
    page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|Refused to/i.test(m.text()))errors.push(m.text());});

    await t.test('SEC-H1: the app page carries CSP, nosniff, no-referrer, frame denial and a restrictive Permissions-Policy',async()=>{
      const res=await page.goto(base+'/');const h=res.headers();
      const csp=h['content-security-policy']||'';
      for(const d of ["default-src 'self'","script-src 'self'","object-src 'none'","base-uri 'none'","frame-ancestors 'none'","connect-src 'self'"])assert.ok(csp.includes(d),`CSP has ${d}`);
      assert.doesNotMatch(csp.replace("style-src-attr 'unsafe-inline'",''),/unsafe-inline|unsafe-eval|\*/,'no unsafe-inline (except style attributes), unsafe-eval or wildcards');
      assert.equal(h['x-content-type-options'],'nosniff');assert.equal(h['referrer-policy'],'no-referrer');assert.equal(h['x-frame-options'],'DENY');
      assert.match(h['permissions-policy'],/camera=\(\)/);assert.match(h['permissions-policy'],/microphone=\(\)/);
      const sw=await page.request.get(base+'/sw.js');assert.equal(sw.headers()['cache-control'],'no-cache');
    });

    await t.test('SEC-H2: add, library, sheets, card details, review, stats, settings, language switch, backup export and the service worker run with zero CSP violations',async()=>{
      await page.goto(base+'/');await page.waitForSelector('main h1');
      await page.waitForFunction(()=>!!navigator.serviceWorker?.controller,null,{timeout:8000}).catch(()=>{}); // WebKit may never report a controller here; the worker still runs
      await page.goto(base+'/#/add');await page.waitForSelector('#term');
      await page.fill('#term','resilient');await page.fill('#meaning','مرن');await page.click('form button[type=submit]');
      await page.getByRole('status').filter({hasText:'«resilient»'}).waitFor();
      await page.goto(base+'/#/words');await page.locator('.folder-card.new').click();await page.locator('dialog[open] input').first().fill('CSP');
      await page.locator('dialog[open] button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('main h1')?.textContent==='CSP');
      await page.goto(base+'/#/words/all');await page.locator('.word-main',{hasText:'resilient'}).click();await page.locator('.word-detail').waitFor();
      await page.goto(base+'/#/review');await page.locator('.reveal').click();await page.locator('.grades button').nth(2).click();
      // Each screen as a full load (a fresh document under the CSP); hash-only jumps were unreliable in Linux WebKit.
      let n=0;const open=async(route,selector)=>{await page.goto(`${base}/?s=${++n}#/${route}`);
        await page.waitForSelector(selector,{timeout:15000}).catch(async e=>{throw new Error(`${route}: ${e.message} — at ${await page.evaluate(()=>location.hash+' | '+(document.querySelector('main h1')?.textContent??'no h1'))}`);});};
      await open('stats','main h1');
      await open('settings','.lang-switch');
      // Backup export (blob URL + <a download>) under the CSP. Headless WebKit on Linux may not surface a download event,
      // so the app's own success message is the signal; any CSP violation would still be recorded below.
      await page.locator('main button.tile:has(.lucide-arrow-down-to-line)').click();
      await page.getByRole('status').filter({hasText:'جهّزنا نسختك'}).waitFor({timeout:10000});
      await page.click('.lang-switch [data-locale=en]');await page.waitForFunction(()=>document.documentElement.lang==='en');
      await page.goto(base+'/#/');await page.waitForSelector('main h1');await page.waitForTimeout(500);
      assert.deepEqual(await page.evaluate(()=>window.__csp),[],'no CSP violations');
      assert.deepEqual(errors,[]);
    });

    await t.test('SEC-H3: injected inline script and a third-party request are blocked by the policy',async()=>{
      const r=await page.evaluate(async()=>{
        window.__ran=false;const s=document.createElement('script');s.textContent='window.__ran=true';document.body.append(s);
        let fetched=true;try{await fetch('https://example.com/',{mode:'no-cors',signal:AbortSignal.timeout(3000)});}catch{fetched=false;}
        await new Promise(r=>setTimeout(r,300));
        return {ran:window.__ran,fetched,violations:window.__csp.length};
      });
      assert.equal(r.ran,false,'inline script refused');assert.equal(r.fetched,false,'cross-origin connect refused');assert.ok(r.violations>=2);
    });
  });
}

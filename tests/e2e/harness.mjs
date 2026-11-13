// Shared browser-test harness. Uses E2E_BASE_URL if set, otherwise starts a local Vite (staging mode) server.
// Everything runs on 127.0.0.1; no data leaves the machine.
import {spawn} from 'node:child_process';
import {chromium,webkit} from 'playwright';

export const ENGINES={chromium,webkit};
export const IPHONE={viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:false};

export async function startServer(){
  if(process.env.E2E_BASE_URL)return {base:process.env.E2E_BASE_URL.replace(/\/$/,''),stop:async()=>{}};
  const port=4300+Math.floor(Math.random()*500);
  const child=spawn(process.execPath,['node_modules/vite/bin/vite.js','dev','--mode','staging','--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:'ignore'});
  const base=`http://127.0.0.1:${port}`;
  for(let i=0;i<90;i++){
    try{const r=await fetch(base+'/api/health');if(r.ok)return {base,stop:async()=>{child.kill();}};}catch{/* not up yet */}
    await new Promise(r=>setTimeout(r,500));
  }
  child.kill();throw new Error('Local server did not start');
}

/** Fresh, isolated browser context per test: empty IndexedDB, no service worker. */
export async function freshPage(browser,base,options={}){
  const context=await browser.newContext({...IPHONE,serviceWorkers:'block',locale:'ar-SA',timezoneId:'Asia/Riyadh',...options});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(base+'/');await page.waitForSelector('main h1');
  return {context,page,errors};
}

export async function addCard(page,base,term,meaning,{navigate=true}={}){
  if(navigate){await page.goto(base+'/#/add');}
  await page.waitForSelector('#term');
  await page.fill('#term',term);await page.fill('#meaning',meaning);
  await page.click('form button[type=submit]');
}

export async function libraryTerms(page,base,{navigate=true}={}){
  if(navigate){await page.goto(base+'/#/words');await page.waitForSelector('main h1');}
  await page.waitForTimeout(150);
  return page.locator('.word-list .word-text b').allTextContents();
}

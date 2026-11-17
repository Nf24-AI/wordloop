// Issue #30 — the device side of Smart Reminders in real engines (Chromium + WebKit, iPhone 390px).
// The push service itself is stubbed (no real subscription in a headless browser); we check exactly what the app would
// send to /api/push/sync: only the subscription, earliest due time, time zone, language, practice opt-in and the last
// practice DAY — never card text — and that the Settings switch and a finished practice session update it.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {ENGINES,startServer,freshPage} from './harness.mjs';

let server;
before(async()=>{server=await startServer();});
after(async()=>{await server?.stop();});

const data=(page,fn,arg)=>page.evaluate(async([src,arg])=>{const m=await import('/src/data.ts');return new Function('m','arg',`return (${src})(m,arg)`)(m,arg);},[fn.toString(),arg]);
/** A browser that "supports" push: permission granted and a fake subscription. Runs before any app code. */
const PUSH_STUB=()=>{
  const sub={endpoint:'https://fcm.googleapis.com/fcm/send/e2e-device',toJSON(){return {endpoint:this.endpoint,keys:{p256dh:'BGr7zSMFM06vKGfJ9GIH5AWCqkYGS5U_Iqktr2gaZLRPhxxhiMAQJrc2I6Rn1K5FDTd9YCzhMv-1BpMVtsfdNbk',auth:'OkRTNFqpn2fL3SCfwZ1pFg'}};},unsubscribe:async()=>true};
  let on=localStorage.getItem('e2e-subscribed')==='1';
  const reg={pushManager:{getSubscription:async()=>on?sub:null,subscribe:async()=>{on=true;localStorage.setItem('e2e-subscribed','1');return sub;}},addEventListener(){},update:async()=>undefined};
  if(!('PushManager' in window))window.PushManager=function(){};
  const N=window.Notification||function(){};
  Object.defineProperty(N,'permission',{get:()=>'granted',configurable:true});N.requestPermission=async()=>'granted';window.Notification=N;
  if(window.ServiceWorkerContainer)Object.defineProperty(ServiceWorkerContainer.prototype,'ready',{get:()=>Promise.resolve(reg),configurable:true});
};

async function setup(browser,base,{passage=true}={}){
  const {context,page,errors}=await freshPage(browser,base);
  const syncs=[];
  await context.route('**/api/push/key',r=>r.fulfill({json:{publicKey:'BGr7zSMFM06vKGfJ9GIH5AWCqkYGS5U_Iqktr2gaZLRPhxxhiMAQJrc2I6Rn1K5FDTd9YCzhMv-1BpMVtsfdNbk'}}));
  await context.route('**/api/push/sync',r=>{syncs.push(r.request().postData());return r.fulfill({json:{ok:true}});});
  await context.addInitScript(PUSH_STUB);
  const ids=await data(page,async(m,{passage})=>{
    const f=await m.createFolder('Idiomas'),d=await m.createDeck({folderId:f.id,name:'Español',contentLanguage:'es-ES',meaningLanguage:'ar-SA'});
    await m.addWord({term:'secretword',meanings:['كلمة سرية'],example:'',translation:'',tag:'',contentType:'vocabulary',deckId:d.id});
    const p=passage?await m.createPassage({deckId:d.id,title:'Lucía',body:'Lucía vive en Madrid.',questions:[{question:'Where does Lucía live?',answer:'Madrid',quote:'Lucía vive en Madrid.'}]}):null;
    return {deck:d.id,passage:p?.id};
  },{passage});
  await page.goto(base+'/#/settings');await page.reload();await page.waitForSelector('#push-title');
  return {context,page,errors,syncs,...ids};
}
const parsed=syncs=>syncs.map(s=>JSON.parse(s));
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

for(const [name,engine] of Object.entries(ENGINES)){
  test(`[${name}] issue #30 smart reminders (device side)`,async t=>{
    const browser=await engine.launch();
    t.after(()=>browser.close());
    const base=()=>server.base;

    await t.test('REM-01: turning reminders on sends only metadata — no card text — with practice on when there is a text',async()=>{
      const {context,page,errors,syncs}=await setup(browser,base());
      await page.getByRole('button',{name:'فعّل التذكير'}).click();
      await page.waitForFunction(()=>document.querySelector('.check-row input'));
      const s=parsed(syncs).at(-1);
      assert.deepEqual(Object.keys(s).sort(),['lastPracticeDay','locale','nextDueAt','practice','subscription','timeZone','token']);
      assert.equal(s.timeZone,'Asia/Riyadh');assert.equal(s.locale,'ar');assert.equal(s.practice,true);assert.equal(s.lastPracticeDay,null);
      for(const raw of syncs)assert.ok(!/secretword|كلمة سرية|Lucía|Madrid/.test(raw),'no learning content leaves the device');
      assert.ok(await page.locator('.check-row input').isChecked());
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('REM-02: the practice switch syncs off, survives a reload, and syncs on again',async()=>{
      const {context,page,errors,syncs}=await setup(browser,base());
      await page.getByRole('button',{name:'فعّل التذكير'}).click();
      const box=page.locator('.check-row input');await box.waitFor();
      const n=syncs.length;await box.uncheck();
      for(let i=0;i<40&&syncs.length===n;i++)await page.waitForTimeout(100);
      assert.equal(parsed(syncs).at(-1).practice,false);
      await page.reload();await page.locator('.check-row input').waitFor();
      assert.equal(await page.locator('.check-row input').isChecked(),false,'remembered on this device');
      await page.locator('.check-row input').check();
      for(let i=0;i<40&&parsed(syncs).at(-1).practice!==true;i++)await page.waitForTimeout(100);
      assert.equal(parsed(syncs).at(-1).practice,true);
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('REM-03: finishing a practice session syncs today as the last practice day (date only)',async()=>{
      const {context,page,errors,syncs,deck,passage}=await setup(browser,base());
      await page.getByRole('button',{name:'فعّل التذكير'}).click();await page.locator('.check-row input').waitFor();
      await page.goto(base()+`/#/words/d/${encodeURIComponent(deck)}/texts/${encodeURIComponent(passage)}`);await page.locator('.passage-body').waitFor();
      await page.getByRole('button',{name:'تمرين قراءة'}).click();await page.locator('.practice-start').click();
      while(await page.locator('.practice-q').count()){
        if(await page.locator('#practice-input').count()){await page.locator('#practice-input').fill('madrid');await page.getByRole('button',{name:'تحقق'}).click();}
        else if(await page.locator('.practice-option').count())await page.locator('.practice-option').first().click();
        else{await page.locator('.practice-q .reveal').click();await page.locator('.practice-q .btn-save').click();}
        await page.locator('.practice-next').click();
      }
      await page.locator('.finish').waitFor();
      for(let i=0;i<40&&parsed(syncs).at(-1).lastPracticeDay!==today();i++)await page.waitForTimeout(100);
      const s=parsed(syncs).at(-1);
      assert.equal(s.lastPracticeDay,today());
      assert.ok(!/score|answers|Madrid/i.test(syncs.at(-1)),'no results or content synced');
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('REM-04: no texts in any deck → practice suggestions are not requested',async()=>{
      const {context,page,errors,syncs}=await setup(browser,base(),{passage:false});
      await page.getByRole('button',{name:'فعّل التذكير'}).click();await page.locator('.check-row input').waitFor();
      assert.equal(parsed(syncs).at(-1).practice,false);
      assert.deepEqual(errors,[]);await context.close();
    });
  });
}

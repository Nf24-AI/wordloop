// Issue #21 — Learning Passages in real engines (Chromium + WebKit, iPhone 390px): one compact «النصوص» row in a deck,
// create a Spanish passage with a sourced question, read it in its language, listen to it in Spanish, edit, delete.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {ENGINES,startServer,freshPage} from './harness.mjs';

let server;
before(async()=>{server=await startServer();});
after(async()=>{await server?.stop();});

const data=(page,fn,arg)=>page.evaluate(async([src,arg])=>{const m=await import('/src/data.ts');return new Function('m','arg',`return (${src})(m,arg)`)(m,arg);},[fn.toString(),arg]);
const hashOf=page=>page.evaluate(()=>location.hash);
const LUCIA='Lucía vive en Madrid. Estudia español todos los días.';
function fakeSpeech(){
  const voices=[{name:'Samantha',lang:'en-US',localService:true,default:true,voiceURI:'s'},{name:'Mónica',lang:'es-ES',localService:true,default:false,voiceURI:'m'}];
  const log=[];let cur=null;
  const synth={paused:false,getVoices:()=>voices,addEventListener(){},removeEventListener(){},
    speak(u){cur=u;log.push({text:u.text,lang:u.lang,voice:u.voice?.name??null});},cancel(){const u=cur;cur=null;u?.onerror?.({error:'interrupted'});},resume(){},pause(){}};
  Object.defineProperty(window,'speechSynthesis',{value:synth,configurable:true});window.SpeechSynthesisUtterance=class{constructor(t){this.text=t;}};window.__spoken=log;
}
async function setup(browser,base){
  const {context,page,errors}=await freshPage(browser,base);
  await context.addInitScript(fakeSpeech);
  const deck=await data(page,async m=>{const f=await m.createFolder('Idiomas');return (await m.createDeck({folderId:f.id,name:'Español',contentLanguage:'es-ES',meaningLanguage:'ar-SA'})).id;});
  await page.goto(base+'/#/words/d/'+encodeURIComponent(deck));await page.reload();await page.locator('.texts-row').waitFor();
  return {context,page,errors,deck};
}

for(const [name,engine] of Object.entries(ENGINES)){
  test(`[${name}] issue #21 passages`,async t=>{
    const browser=await engine.launch();
    t.after(()=>browser.close());
    const base=()=>server.base;

    await t.test('TEXT-01: create a Spanish passage with a sourced question; it reads in Spanish, listens in Spanish and survives a reload',async()=>{
      const {context,page,errors,deck}=await setup(browser,base());
      assert.match(await page.locator('.texts-row').innerText(),/النصوص[\s\S]*ولا نص للحين/);
      await page.locator('.texts-row').click();
      assert.equal(await hashOf(page),'#/words/d/'+encodeURIComponent(deck)+'/texts');
      await page.locator('.empty').getByRole('button',{name:'نص جديد'}).click();
      assert.equal(await page.inputValue('#passage-lang'),'es-ES','the deck language by default');
      assert.equal(await page.locator('#passage-body').getAttribute('lang'),'es-ES');
      await page.fill('#passage-title','Lucía');await page.fill('#passage-body',LUCIA);
      await page.getByRole('button',{name:'إضافة سؤال'}).click();
      await page.fill('#fq-0','Where does Lucía live?');await page.fill('#fa-0','Madrid');await page.fill('#fl-0','en Madrid');await page.fill('#fs-0','vive en Madrid');
      await page.getByRole('button',{name:'حفظ'}).click();
      await page.locator('.passage-body').waitFor();
      assert.equal(await page.locator('main h1').innerText(),'Lucía');
      assert.equal(await page.locator('.passage-body').getAttribute('lang'),'es-ES');
      assert.equal(await page.locator('.passage-body').getAttribute('dir'),'ltr');
      await page.locator('.passage-listen').click();
      assert.deepEqual(await page.evaluate(()=>window.__spoken),[{text:LUCIA,lang:'es-ES',voice:'Mónica'}]);
      assert.equal(await page.getByRole('button',{name:/أبطأ/}).count(),1,'slower replay available');
      await page.reload();await page.locator('.passage-body').waitFor();
      await page.locator('.passage-facts summary').click();
      assert.match(await page.locator('.fact-list').innerText(),/Where does Lucía live\?[\s\S]*Madrid · en Madrid[\s\S]*vive en Madrid/);
      await page.goto(base()+'/#/words/d/'+encodeURIComponent(deck));
      assert.match(await page.locator('.texts-row').innerText(),/نص واحد/);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('TEXT-02: an unsourced quote is refused in place; edit keeps the passage; a deck with texts cannot be deleted; delete asks first',async()=>{
      const {context,page,errors,deck}=await setup(browser,base());
      await page.goto(base()+'/#/words/d/'+encodeURIComponent(deck)+'/texts/new');await page.locator('#passage-title').waitFor();
      await page.fill('#passage-title','Lucía');await page.fill('#passage-body',LUCIA);
      await page.getByRole('button',{name:'إضافة سؤال'}).click();await page.fill('#fq-0','Where?');await page.fill('#fa-0','Madrid');await page.fill('#fs-0','vive en Sevilla');
      await page.getByRole('button',{name:'حفظ'}).click();
      await page.locator('.inline-error[role=alert]',{hasText:'المقتطف لازم يكون من النص'}).waitFor();
      assert.equal((await data(page,m=>m.listPassages())).length,0,'nothing saved');
      await page.fill('#fs-0','vive en Madrid');await page.getByRole('button',{name:'حفظ'}).click();
      await page.locator('.passage-body').waitFor();
      await page.getByRole('button',{name:'عدّله'}).click();
      await page.fill('#passage-title','Lucía en Madrid');await page.getByRole('button',{name:'حفظ'}).click();
      await page.locator('main h1',{hasText:'Lucía en Madrid'}).waitFor();
      const [p]=await data(page,m=>m.listPassages());assert.equal(p.questions.length,1);assert.equal(p.title,'Lucía en Madrid');
      await page.goto(base()+'/#/words/d/'+encodeURIComponent(deck));await page.getByRole('button',{name:'إعدادات الحزمة'}).click();
      assert.match(await page.locator('dialog[open]').innerText(),/الحزمة فيها نصوص/);
      await page.keyboard.press('Escape');
      await page.goto(base()+'/#/words/d/'+encodeURIComponent(deck)+'/texts/'+encodeURIComponent(p.id));
      await page.getByRole('button',{name:'احذفه'}).click();
      await page.getByRole('button',{name:'إيه، احذفه'}).click();
      await page.getByRole('status').filter({hasText:'حذفنا «Lucía en Madrid»'}).waitFor();
      assert.equal(await hashOf(page),'#/words/d/'+encodeURIComponent(deck)+'/texts');
      assert.equal((await data(page,m=>m.listPassages())).length,0);
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('TEXT-03: English interface, 320px: labels in English, the text stays Spanish, nothing overflows',async()=>{
      const {context,page,errors,deck}=await setup(browser,base());
      await page.setViewportSize({width:320,height:700});
      await page.goto(base()+'/#/settings');await page.click('.lang-switch [data-locale=en]');await page.waitForFunction(()=>document.documentElement.lang==='en');
      const id=await data(page,(m,deck)=>m.createPassage({deckId:deck,title:'Lucía',body:'Lucía vive en Madrid.\nEstudia español todos los días.',translation:'لوسيا تعيش في مدريد.'}).then(p=>p.id),deck);
      await page.goto(base()+'/#/words/d/'+encodeURIComponent(deck)+'/texts/'+encodeURIComponent(id));await page.reload();await page.locator('.passage-body').waitFor();
      assert.equal(await page.locator('.passage-listen').innerText(),'Listen to the text');
      assert.equal(await page.locator('.passage-body p').count(),2,'paragraphs kept');
      await page.getByRole('button',{name:'Show translation'}).click();
      assert.match(await page.locator('.passage-translation').innerText(),/لوسيا/);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal scroll at 320px');
      await page.goto(base()+'/#/words/d/'+encodeURIComponent(deck)+'/texts/'+encodeURIComponent(id)+'/edit');await page.locator('#passage-title').waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'editor fits at 320px');
      assert.deepEqual(errors,[]);await context.close();
    });
  });
}

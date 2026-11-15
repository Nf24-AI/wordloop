// Issues #19/#20 — speech follows the card/deck language (not the interface), the best local voice is chosen for the learner,
// one tap listens / tap again stops, «أبطأ» replays slower, and a missing voice is said plainly instead of using another language.
// Real engines (Chromium + WebKit, iPhone 390px) with a recording speechSynthesis: CI machines have no reliable voices,
// and what matters here is which text/language/voice/rate WordLoop asks for. Real listening stays an iPhone UAT item.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {ENGINES,startServer,freshPage} from './harness.mjs';

let server;
before(async()=>{server=await startServer();});
after(async()=>{await server?.stop();});

const data=(page,fn,arg)=>page.evaluate(async([src,arg])=>{const m=await import('/src/data.ts');return new Function('m','arg',`return (${src})(m,arg)`)(m,arg);},[fn.toString(),arg]);
const spoken=page=>page.evaluate(()=>window.__spoken);
const clearSpoken=page=>page.evaluate(()=>{window.__spoken.length=0;});

/** Replaces the browser's speech with a recorder exposing an iPhone-like voice list (incl. a network and a novelty voice). */
function fakeSpeech(){
  const V=(name,lang,extra={})=>({name,lang,localService:true,default:false,voiceURI:'v:'+name,...extra});
  const voices=[V('Samantha','en-US',{default:true}),V('Daniel','en-GB'),V('Zarvox','en-US'),V('Mónica','es-ES'),V('Paulina','es-MX'),
    V('Ximena','es-ES'),V('Google Deutsch','de-DE',{localService:false}),V('Maged','ar-SA')];
  const spokenLog=[];let current=null;const listeners={};
  class Utterance{constructor(text){this.text=text;this.lang='';this.voice=null;this.rate=1;this.onend=null;this.onerror=null;}}
  const synth={paused:false,speaking:false,
    getVoices:()=>voices,
    addEventListener:(t,f)=>{(listeners[t]??=[]).push(f);},removeEventListener(){},
    speak(u){current=u;synth.speaking=true;spokenLog.push({text:u.text,lang:u.lang,voice:u.voice?.name??null,rate:u.rate});
      u.__t=setTimeout(()=>{if(current===u){current=null;synth.speaking=false;u.onend?.({});}},1500);},
    cancel(){const u=current;current=null;synth.speaking=false;if(u){clearTimeout(u.__t);u.onerror?.({error:'interrupted'});}},
    resume(){},pause(){}};
  Object.defineProperty(window,'speechSynthesis',{value:synth,configurable:true});
  window.SpeechSynthesisUtterance=Utterance;window.__spoken=spokenLog;
}
/** Español (es-ES), English (en-US) and Deutsch (de-DE) decks, one due card each. */
async function setup(browser,base){
  const {context,page,errors}=await freshPage(browser,base);
  await context.addInitScript(fakeSpeech);
  const ids=await data(page,async m=>{
    const f=await m.createFolder('Idiomas');
    const es=await m.createDeck({folderId:f.id,name:'Español',contentLanguage:'es-ES',meaningLanguage:'ar-SA'});
    const en=await m.createDeck({folderId:f.id,name:'English',contentLanguage:'en-US',meaningLanguage:'ar-SA'});
    const de=await m.createDeck({folderId:f.id,name:'Deutsch',contentLanguage:'de-DE',meaningLanguage:'ar-SA'});
    const card=(term,deckId,extra={})=>({term,meanings:['معنى'],example:'',translation:'',tag:'',contentType:'vocabulary',deckId,...extra});
    await m.addWord(card('hola',es.id,{example:'Hola, ¿qué tal?'}));await m.addWord(card('hello',en.id));await m.addWord(card('hallo',de.id));
    return {es:es.id,en:en.id,de:de.id};
  });
  await page.reload();await page.waitForSelector('main h1');
  return {context,page,errors,ids};
}
const openReview=async(page,base,deck)=>{await page.goto(base+'/#/review/d/'+encodeURIComponent(deck));await page.locator('.review .term').waitFor();};
const listen=page=>page.locator('.review .card-top .speak-group > button').first();

for(const [name,engine] of Object.entries(ENGINES)){
  test(`[${name}] issues #19/#20 voice`,async t=>{
    const browser=await engine.launch();
    t.after(()=>browser.close());
    const base=()=>server.base;

    await t.test('VOICE-01: «hola» in a Spanish deck is read in Spanish (Spain voice), «hello» in English, whatever the interface language',async()=>{
      const {context,page,errors,ids}=await setup(browser,base());
      await openReview(page,base(),ids.es);
      assert.equal(await page.locator('.review .term').getAttribute('lang'),'es-ES');
      await listen(page).click();
      assert.deepEqual(await spoken(page),[{text:'hola',lang:'es-ES',voice:'Mónica',rate:.9}],'exact-region local voice, never the rejected Ximena');
      await openReview(page,base(),ids.en);await clearSpoken(page);
      await listen(page).click();
      assert.deepEqual(await spoken(page),[{text:'hello',lang:'en-US',voice:'Samantha',rate:.9}],'no novelty voice');
      await page.goto(base()+'/#/settings');await page.click('.lang-switch [data-locale=en]');await page.waitForFunction(()=>document.documentElement.lang==='en');
      await openReview(page,base(),ids.es);await clearSpoken(page);
      await listen(page).click();
      assert.equal((await spoken(page))[0].lang,'es-ES','interface language does not change the speech language');
      assert.equal(await page.locator('select, [role=listbox]').count(),0,'no voice or accent picker in the study flow');
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('VOICE-02: tap again stops; after the first listen «أبطأ» replays slower; the example has its own listen button',async()=>{
      const {context,page,errors,ids}=await setup(browser,base());
      await openReview(page,base(),ids.es);
      assert.equal(await page.getByRole('button',{name:/أبطأ/}).count(),0,'no slower button before listening');
      await listen(page).click();
      await page.getByRole('button',{name:'أوقف النطق'}).click();
      assert.equal(await page.evaluate(()=>speechSynthesis.speaking),false,'stopped');
      assert.equal((await spoken(page)).length,1,'stop does not start another reading');
      await page.getByRole('button',{name:'اسمع «hola» أبطأ'}).click();
      assert.deepEqual((await spoken(page)).at(-1),{text:'hola',lang:'es-ES',voice:'Mónica',rate:.62});
      await page.locator('.review .reveal').click();
      await page.locator('.review .example-line').getByRole('button',{name:'اسمع الجملة'}).click();
      assert.deepEqual((await spoken(page)).at(-1),{text:'Hola, ¿qué tal?',lang:'es-ES',voice:'Mónica',rate:.9});
      assert.equal(await page.locator('.review .example-line span[lang]').getAttribute('lang'),'es-ES');
      const fits=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);assert.ok(fits,'no horizontal scroll');
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('VOICE-03: no local German voice → nothing is read in another language and the learner is told once, plainly',async()=>{
      const {context,page,errors,ids}=await setup(browser,base());
      await openReview(page,base(),ids.de);
      await listen(page).click();
      assert.deepEqual(await spoken(page),[],'silent: the only German voice is a network voice (local-first) — never English instead');
      const toast=page.locator('.toast[role=alert]').filter({hasText:'ما فيه صوت'});await toast.waitFor();
      assert.match(await toast.innerText(),/الألمانية/);
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('VOICE-04: library card, edit form and Add form all use the card/deck language',async()=>{
      const {context,page,errors,ids}=await setup(browser,base());
      await page.goto(base()+'/#/words/d/'+encodeURIComponent(ids.es));
      await page.locator('.word-main',{hasText:'hola'}).click();
      assert.equal(await page.locator('.word-main b[lang]').getAttribute('lang'),'es-ES');
      await page.locator('.word-actions').getByRole('button',{name:/اسمع نطق hola/}).click();
      assert.deepEqual((await spoken(page)).at(-1),{text:'hola',lang:'es-ES',voice:'Mónica',rate:.9});
      await page.locator('.word-detail .example-line').getByRole('button',{name:'اسمع الجملة'}).click();
      assert.equal((await spoken(page)).at(-1).text,'Hola, ¿qué tal?');
      await page.locator('.word-actions').getByRole('button',{name:/عدّل/}).click();
      assert.equal(await page.locator('#edit-term').getAttribute('lang'),'es-ES');
      await page.keyboard.press('Escape');
      await page.goto(base()+'/#/add/'+encodeURIComponent(ids.es));await page.fill('#term','gracias');
      await page.locator('.lang-box',{has:page.locator('#term')}).getByRole('button',{name:/اسمع/}).click();
      assert.deepEqual((await spoken(page)).at(-1),{text:'gracias',lang:'es-ES',voice:'Mónica',rate:.9});
      assert.equal(await page.locator('.lang-box .slow-btn').count(),0,'no slower pill inside the compact Add boxes');
      assert.deepEqual(errors,[]);await context.close();
    });
  });
}

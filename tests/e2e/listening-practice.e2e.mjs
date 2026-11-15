// Issue #23 — Listening Practice in real engines (Chromium + WebKit, iPhone 390px) with a recorded fake speech engine:
// Spanish voice for a Spanish text whatever the interface language; play/pause/resume/replay/slower; show/hide text;
// dictation with word marks; listening comprehension from saved questions only; an honest no-voice path; FSRS untouched.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {ENGINES,startServer,freshPage} from './harness.mjs';

let server;
before(async()=>{server=await startServer();});
after(async()=>{await server?.stop();});

const data=(page,fn,arg)=>page.evaluate(async([src,arg])=>{const m=await import('/src/data.ts');return new Function('m','arg',`return (${src})(m,arg)`)(m,arg);},[fn.toString(),arg]);
const LUCIA='Lucía vive en Madrid. Estudia español todos los días.';
const fsrsSnapshot=page=>data(page,async m=>JSON.stringify([(await m.listWords()).map(w=>[w.id,w.dueAt,w.fsrsState,w.revision]),await m.listReviews()]));
function fakeSpeech(withSpanish){
  const voices=[{name:'Samantha',lang:'en-US',localService:true,default:true,voiceURI:'s'}];
  if(withSpanish)voices.push({name:'Mónica',lang:'es-ES',localService:true,default:false,voiceURI:'m'});
  const log=[];let cur=null;
  const synth={paused:false,getVoices:()=>voices,addEventListener(){},removeEventListener(){},
    speak(u){cur=u;log.push({text:u.text,lang:u.lang,voice:u.voice?.name??null,rate:u.rate});},
    cancel(){const u=cur;cur=null;u?.onerror?.({error:'interrupted'});log.push('cancel');},
    pause(){this.paused=true;log.push('pause');},resume(){this.paused=false;log.push('resume');}};
  Object.defineProperty(window,'speechSynthesis',{value:synth,configurable:true});window.SpeechSynthesisUtterance=class{constructor(t){this.text=t;}};window.__spoken=log;
}
const spoken=page=>page.evaluate(()=>window.__spoken.filter(x=>typeof x==='object'));
const events=page=>page.evaluate(()=>window.__spoken.filter(x=>typeof x==='string'));

async function setup(browser,base,{spanish=true,questions=true}={}){
  const {context,page,errors}=await freshPage(browser,base);
  await context.addInitScript(fakeSpeech,spanish);
  const ids=await data(page,async(m,questions)=>{
    const f=await m.createFolder('Idiomas'),d=await m.createDeck({folderId:f.id,name:'Español',contentLanguage:'es-ES',meaningLanguage:'ar-SA'});
    await m.addWord({term:'Madrid',meanings:['مدريد'],example:'',translation:'',tag:'',contentType:'vocabulary',deckId:d.id});
    const p=await m.createPassage({deckId:d.id,title:'Lucía',body:'Lucía vive en Madrid. Estudia español todos los días.',
      questions:questions?[{question:'Where does Lucía live?',answer:'Madrid',quote:'Lucía vive en Madrid.'}]:[]});
    return {deck:d.id,passage:p.id};
  },questions);
  const path=`/#/words/d/${encodeURIComponent(ids.deck)}/texts/${encodeURIComponent(ids.passage)}`;
  await page.goto(base+path);await page.reload();await page.locator('.passage-body').waitFor();
  await page.getByRole('button',{name:'تمرين استماع'}).click();await page.locator('.listen-player').first().waitFor();
  return {context,page,errors,...ids,path};
}

for(const [name,engine] of Object.entries(ENGINES)){
  test(`[${name}] issue #23 listening practice`,async t=>{
    const browser=await engine.launch();
    t.after(()=>browser.close());
    const base=()=>server.base;

    await t.test('LISTEN-01: the text plays in Spanish (Mónica) — play, pause, resume, from the start, slower; text hidden until asked',async()=>{
      const {context,page,errors,path}=await setup(browser,base());
      assert.equal(await page.evaluate(()=>location.hash),path.slice(1)+'/listen');
      assert.equal(await page.locator('.listen-text').count(),0,'text hidden by default');
      await page.locator('.listen-play').click();
      assert.deepEqual((await spoken(page)).at(-1),{text:LUCIA,lang:'es-ES',voice:'Mónica',rate:.9});
      await page.getByRole('button',{name:'إيقاف مؤقت'}).click();assert.equal((await events(page)).at(-1),'pause');
      await page.getByRole('button',{name:'كمّل'}).click();assert.equal((await events(page)).at(-1),'resume');
      await page.getByRole('button',{name:'أبطأ'}).click();
      await page.getByRole('button',{name:'من البداية'}).click();
      assert.deepEqual((await spoken(page)).at(-1),{text:LUCIA,lang:'es-ES',voice:'Mónica',rate:.62});
      await page.getByRole('button',{name:'اعرض النص'}).click();
      assert.equal(await page.locator('.listen-text').getAttribute('lang'),'es-ES');
      assert.match(await page.locator('.listen-text').innerText(),/Lucía vive en Madrid/);
      // Leaving the screen stops the voice.
      await page.locator('.listen-play').click(); // speaking again
      const before=(await events(page)).filter(e=>e==='cancel').length;
      await page.evaluate(()=>{window.__sameDoc=true;});
      await page.locator('.back-btn').click();await page.locator('.passage-body').waitFor();
      // Same document: the screen must have cancelled the voice. (WebKit may restore the page as a new document,
      // which ends speech by itself — then there is nothing left to cancel.)
      if(await page.evaluate(()=>window.__sameDoc===true))assert.ok((await events(page)).filter(e=>e==='cancel').length>before,'speech cancelled on leave');
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('LISTEN-02: dictation — each sentence spoken alone; marks for accent / wrong / missing; comprehension from the saved fact; FSRS untouched',async()=>{
      const {context,page,errors}=await setup(browser,base());
      const before=await fsrsSnapshot(page);
      assert.match(await page.locator('.practice-setup').innerText(),/إملاء\s*2[\s\S]*فهم المسموع\s*1/);
      await page.locator('.practice-field').nth(1).getByRole('button',{name:'الكل'}).click();
      await page.locator('.practice-start').click();
      // 1: first sentence, with a missing accent and a missing word.
      await page.getByRole('button',{name:'اسمع الجملة'}).click();
      assert.deepEqual((await spoken(page)).at(-1),{text:'Lucía vive en Madrid.',lang:'es-ES',voice:'Mónica',rate:.9});
      await page.locator('.practice-q').getByRole('button',{name:'أبطأ'}).click();
      assert.equal((await spoken(page)).at(-1).rate,.62);
      await page.fill('#practice-input','Lucia vive Madrid');await page.getByRole('button',{name:'تحقق'}).click();
      assert.deepEqual(await page.locator('.dictation-marks .dw').evaluateAll(els=>els.map(e=>[e.className.replace('dw ',''),e.lastChild.textContent])),
        [['accent','Lucía'],['ok','vive'],['missing','en'],['ok','Madrid.']]);
      assert.equal(await page.locator('.dictation-marks').getAttribute('lang'),'es-ES');
      await page.locator('.practice-next').click();
      // 2: second sentence, exact.
      await page.fill('#practice-input','estudia español todos los días');await page.getByRole('button',{name:'تحقق'}).click();
      assert.match(await page.locator('.practice-feedback').innerText(),/صح/);
      await page.locator('.practice-next').click();
      // 3: listening comprehension — the saved question only; text hidden; source after answering.
      assert.equal(await page.locator('.practice-prompt').innerText(),'Where does Lucía live?');
      assert.equal(await page.locator('.listen-text').count(),0);
      await page.locator('.listen-play').click();
      assert.deepEqual((await spoken(page)).at(-1).text,LUCIA);
      await page.fill('#practice-input','Madrid');await page.getByRole('button',{name:'تحقق'}).click();
      assert.match(await page.locator('.practice-source').innerText(),/Lucía vive en Madrid\./);
      await page.locator('.practice-next').click();
      assert.match(await page.locator('.finish h1').innerText(),/2 من 3 صح/);
      assert.equal(await fsrsSnapshot(page),before);
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('LISTEN-03: English interface — labels in English, the voice stays Spanish',async()=>{
      const {context,page,errors}=await setup(browser,base());
      await page.evaluate(()=>localStorage.setItem('wordloop-locale','en'));await page.reload();await page.locator('.listen-player').first().waitFor();
      assert.match(await page.locator('main h1').innerText(),/Listening practice/);
      await page.getByRole('button',{name:'Play',exact:true}).click();
      assert.deepEqual((await spoken(page)).at(-1),{text:LUCIA,lang:'es-ES',voice:'Mónica',rate:.9});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('LISTEN-04: no Spanish voice → an honest message, nothing is read in English, the text can still be shown',async()=>{
      const {context,page,errors}=await setup(browser,base(),{spanish:false});
      assert.match(await page.locator('.listen-novoice').innerText(),/ما فيه صوت الإسبانية[^\n]*على جهازك[\s\S]*ما نقرأ النص بصوت لغة ثانية/);
      assert.equal(await page.locator('.listen-play').isDisabled(),true);
      assert.equal(await page.locator('.practice-start').count(),0,'no listening exercise without a voice');
      assert.deepEqual(await spoken(page),[],'never spoken in another language');
      await page.getByRole('button',{name:'اعرض النص'}).click();
      assert.match(await page.locator('.listen-text').innerText(),/Lucía/);
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('LISTEN-05: without saved questions, only dictation is offered',async()=>{
      const {context,page,errors}=await setup(browser,base(),{questions:false});
      assert.equal(await page.locator('.practice-field').first().getByRole('button',{name:/فهم المسموع/}).isDisabled(),true);
      assert.match(await page.locator('.practice-why').innerText(),/يسأل بس الأسئلة اللي أضفتها/);
      assert.deepEqual(errors,[]);await context.close();
    });
  });
}

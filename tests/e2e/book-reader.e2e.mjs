// Issue #77 — Reading 2.0 book reader, end to end. Chromium + WebKit; phone (390, 320) and desktop; AR + EN interface;
// English and Spanish stories. Everything is local: no story endpoint is called, and FSRS state is compared before/after.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {ENGINES,startServer,freshPage} from './harness.mjs';

let server;
before(async()=>{server=await startServer();});
after(async()=>{await server?.stop();});
const base=()=>server.base;

const data=(page,fn,arg)=>page.evaluate(async([src,arg])=>{const m=await import('/src/data.ts');return new Function('m','arg',`return (${src})(m,arg)`)(m,arg);},[fn.toString(),arg]);
const fsrsSnapshot=page=>data(page,async m=>JSON.stringify([(await m.listWords()).map(w=>[w.id,w.dueAt,w.fsrsState,w.revision,w.updatedAt]),await m.listReviews()]));
const noOverflow=page=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
const marks=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('wordloop-reading-done')||'{}'));

const EN_BODY=`On my way home late at night, I notice the lit windows of strangers. Each window holds a little story.

Although I don't know them, I feel connected to their quiet moments.

A person on the bus might be celebrating, worrying, or dreaming. Consequently, I try to be a little gentler with strangers. They wake up early, too.

Somewhere, someone is looking out, wondering about you too.`;
const EN_CARDS=[['although',['مع أنّ','رغم أنّ']],['stranger',['غريب']],['wake up',['يستيقظ']],['up',['فوق']]];
const ES_BODY=`Cada sábado, Lucía va al mercado con su abuela. Sin embargo, hoy las fresas no son baratas.

Entonces compran naranjas. ¡Qué día tan tranquilo!`;
const ES_CARDS=[['barato',['رخيص']],['abuela',['جدة']]];

/** A deck, its cards and one saved text, then the reader. Seeded through the app's own data layer. */
async function setup(browser,{lang='en-US',body=EN_BODY,cards=EN_CARDS,title='The Lit Windows of Strangers',locale='ar',questions=true,options={}}={}){
  const s=await freshPage(browser,base(),options);
  if(locale!=='ar'){await s.page.evaluate(l=>localStorage.setItem('wordloop-locale',l),locale);await s.page.reload();await s.page.waitForSelector('main h1');}
  s.ids=await data(s.page,async(m,{lang,body,cards,title,questions})=>{
    const f=await m.createFolder('Languages'),d=await m.createDeck({folderId:f.id,name:'Reading deck',contentLanguage:lang,meaningLanguage:'ar-SA'});
    for(const [term,meanings] of cards)await m.addWord({term,meanings,example:'',translation:'',tag:'',contentType:term.includes(' ')?'phrase':'vocabulary',deckId:d.id});
    const p=await m.createPassage({deckId:d.id,title,body,translation:'ترجمة قصيرة.',
      questions:questions?[{question:'What does the writer notice?',answer:'the lit windows of strangers',quote:'On my way home late at night, I notice the lit windows of strangers.'}]:[]});
    return {deck:d.id,passage:p.id};
  },{lang,body,cards,title,questions});
  s.story='#/words/practice/'+encodeURIComponent(s.ids.deck)+'/s/'+encodeURIComponent(s.ids.passage);
  await s.page.goto(base()+'/'+s.story);await s.page.locator('.reader-body').waitFor();
  // Measurements below depend on the final layout: wait for the web fonts (the title face swaps in late on a cold server).
  await s.page.evaluate(async()=>{await document.fonts.load('1em "DM Serif Display"','A');await document.fonts.ready;});
  return s;
}
const word=(page,text)=>page.locator('.story-word',{hasText:text}).first();

for(const [name,engine] of Object.entries(ENGINES)){
  test(`#77 book reader [${name}]`,async t=>{
    const browser=await engine.launch();
    t.after(()=>browser.close());

    await t.test('RD-01: a book page — serif column, warm paper, the app bars step aside; no overflow at 390, 320 and desktop',async()=>{
      for(const [label,viewport] of [['390',{width:390,height:844}],['320',{width:320,height:640}],['desktop',{width:1280,height:800}]]){
        const {context,page,errors}=await setup(browser,{options:{viewport,hasTouch:viewport.width<700}});
        assert.equal(await noOverflow(page),true,label+': no horizontal overflow');
        for(const sel of ['.topbar','.tabbar','.backbar'])assert.equal(await page.locator(sel).isVisible(),false,`${label}: ${sel} is hidden`);
        const look=await page.evaluate(()=>{
          const b=document.querySelector('.reader-body'),cs=getComputedStyle(b),r=b.getBoundingClientRect(),p=[...b.querySelectorAll('p')];
          return {family:cs.fontFamily,size:parseFloat(cs.fontSize),line:parseFloat(cs.lineHeight)/parseFloat(cs.fontSize),left:r.left,right:innerWidth-r.right,width:r.width,
            gap:p[1].getBoundingClientRect().top-p[0].getBoundingClientRect().bottom,bg:getComputedStyle(document.body).backgroundColor,border:cs.borderTopWidth,
            clipped:[...b.querySelectorAll('p,.story-word')].some(e=>{const x=e.getBoundingClientRect();return x.left<-0.5||x.right>innerWidth+0.5;})};
        });
        assert.match(look.family,/Georgia/,label+': serif body');
        assert.ok(look.size>=20&&look.size<=25.5,`${label}: body ${look.size}px`);
        assert.ok(look.line>=1.5&&look.line<=1.65,`${label}: line height ${look.line}`);
        assert.ok(look.gap>=look.size,`${label}: generous paragraph spacing`);
        assert.equal(look.bg,'rgb(247, 246, 243)',label+': warm off-white page');
        assert.equal(look.border,'0px',label+': no card around the story');
        assert.equal(look.clipped,false,label+': nothing is clipped');
        if(label==='desktop'){assert.ok(Math.abs(look.left-look.right)<2,'centred column');assert.ok(look.width<=830,'readable measure');assert.equal(await page.locator('.rail').isVisible(),false);}
        else assert.ok(look.left>=20&&look.left<=26,`${label}: gutter ${look.left}`);
        // Minimal chrome: Back + three tools, and the explicit finish button at the end.
        assert.equal(await page.locator('.reader-bar button').count(),4);
        assert.equal(await page.locator('main h1').innerText(),'The Lit Windows of Strangers');
        assert.equal(await page.getByRole('button',{name:'أنهيت القراءة'}).count(),1);
        assert.deepEqual(errors,[]);await context.close();
      }
    });

    await t.test('RD-02: yellow = saved cards really in the text, green = bundled expressions; phrases, inflections, overlaps; toggle',async()=>{
      const {context,page,errors}=await setup(browser);
      const got=await page.locator('.story-word').evaluateAll(els=>els.map(e=>(e.classList.contains('saved')?'saved:':'suggested:')+e.textContent));
      assert.deepEqual(got,['suggested:at night','saved:strangers','saved:Although','suggested:Consequently','saved:strangers','saved:wake up'],
        'whole phrase «wake up» (not «up»), inflected «strangers», first occurrence of each suggestion');
      assert.equal(await page.locator('.reader-body').innerText().then(t=>t.replace(/\s+/g,' ')),EN_BODY.replace(/\s+/g,' '),'the text itself is untouched');
      const colours=await page.evaluate(()=>[...new Set([...document.querySelectorAll('.story-word')].map(e=>getComputedStyle(e).backgroundColor))]);
      assert.deepEqual(colours.sort(),['rgb(184, 222, 196)','rgb(249, 227, 155)'],'exactly two subtle colours');
      assert.deepEqual(await page.locator('.reader-legend li').allInnerTexts(),['من كلماتك المحفوظة','تعابير مقترحة']);
      assert.equal(await page.locator('.reader').innerText().then(t=>/\b[ABC][12]\b/.test(t)),false,'no level is claimed for any word');
      // Hide → plain text, nothing interactive, legend gone; the choice survives a reload; nothing in the library changed.
      const before=await fsrsSnapshot(page);
      const toggle=page.getByRole('button',{name:'تلوين الكلمات'});
      assert.equal(await toggle.getAttribute('aria-pressed'),'true');
      await toggle.click();
      assert.equal(await page.locator('.story-word').count(),0);assert.equal(await page.locator('.reader-legend').count(),0);
      assert.equal(await toggle.getAttribute('aria-pressed'),'false');
      await page.reload();await page.locator('.reader-body').waitFor();
      assert.equal(await page.locator('.story-word').count(),0,'still hidden after a reload');
      await page.getByRole('button',{name:'تلوين الكلمات'}).click();
      assert.equal(await page.locator('.story-word').count(),6);
      assert.equal(await fsrsSnapshot(page),before);
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('RD-03: a saved word opens an accessible sheet: meanings, languages, listen; Escape, close, outside tap and Back dismiss; focus returns',async()=>{
      const {context,page,errors,story}=await setup(browser);
      const w=word(page,'Although');
      await w.click();
      const pop=page.getByRole('dialog');await pop.waitFor();
      assert.equal(await pop.getAttribute('aria-modal'),'true');
      assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('role')),'dialog','focus moves into the sheet');
      assert.equal(await pop.locator('.pop-head b').innerText(),'although');
      assert.equal(await pop.locator('.pop-head b').getAttribute('lang'),'en-US');
      assert.deepEqual(await pop.locator('ol.pop-meaning li').allInnerTexts(),['مع أنّ','رغم أنّ'],'every saved meaning, in order');
      assert.match(await pop.locator('.pop-kind').innerText(),/من مكتبتك/);
      assert.match(await pop.locator('.pop-langs').innerText(),/الإنجليزية · المعنى بـالعربية/);
      assert.equal(await pop.getByRole('button',{name:'أضفها لمكتبتي'}).count(),0,'already saved → no Add');
      await page.waitForFunction(()=>document.querySelector('.word-pop').getAnimations().every(a=>a.playState==='finished'));
      const box=await pop.boundingBox(),vp=page.viewportSize();
      assert.ok(Math.abs(box.y+box.height-vp.height)<2&&Math.abs(box.width-vp.width)<2,'a bottom sheet on a phone');
      // Tab stays inside the sheet.
      for(let i=0;i<4;i++)await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(()=>!!document.activeElement?.closest('[role=dialog]')),true);
      await page.keyboard.press('Escape');await pop.waitFor({state:'detached'});
      assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'Although','focus returns to the word');
      // Keyboard: Enter and Space open it.
      await page.keyboard.press('Enter');await pop.waitFor();
      await pop.getByRole('button',{name:'إغلاق'}).click();await pop.waitFor({state:'detached'});
      await page.keyboard.press(' ');await pop.waitFor();
      // Outside tap.
      await page.mouse.click(vp.width/2,40);await pop.waitFor({state:'detached'});
      // Back closes the sheet and stays on the story.
      await w.click();await pop.waitFor();
      await page.goBack();await pop.waitFor({state:'detached'});
      assert.equal(await page.evaluate(()=>location.hash),story);
      assert.equal(await page.locator('.reader-body').isVisible(),true);
      // The single-meaning card: one line, not a list.
      await word(page,'wake up').click();await pop.waitFor();
      assert.equal(await pop.locator('p.pop-meaning').innerText(),'يستيقظ');
      await page.keyboard.press('Escape');await pop.waitFor({state:'detached'});
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('RD-04: a suggested expression: grounded meaning, honest source, Add once, never a duplicate; a card with no meaning says so',async()=>{
      const {context,page,errors,ids}=await setup(browser);
      const before=await fsrsSnapshot(page);
      const pop=page.getByRole('dialog');
      await word(page,'Consequently').click();await pop.waitFor();
      assert.match(await pop.locator('.pop-kind').innerText(),/تعبير مقترح/);
      assert.equal(await pop.locator('p.pop-meaning').innerText(),'نتيجةً لذلك');
      assert.match(await pop.locator('.pop-source').innerText(),/مو من الذكاء الاصطناعي/);
      await pop.getByRole('button',{name:'أضفها لمكتبتي'}).click();
      await page.waitForFunction(()=>/انضافت لمكتبتك/.test(document.querySelector('.pop-kind')?.textContent??''));
      assert.equal(await pop.getByRole('button',{name:'أضفها لمكتبتي'}).count(),0,'no second Add');
      await page.keyboard.press('Escape');await pop.waitFor({state:'detached'});
      const cards=await data(page,async m=>(await m.listWords()).filter(w=>w.term==='consequently').map(w=>[w.deckId,w.meanings,w.archived]));
      assert.deepEqual(cards,[[ids.deck,['نتيجةً لذلك'],false]],'exactly one new card, in this deck');
      assert.equal(await word(page,'Consequently').evaluate(e=>e.classList.contains('saved')),true,'now one of the learner\'s words');
      await word(page,'Consequently').click();await pop.waitFor();
      assert.match(await pop.locator('.pop-kind').innerText(),/من مكتبتك/);
      assert.equal(await pop.getByRole('button',{name:'أضفها لمكتبتي'}).count(),0);
      await page.keyboard.press('Escape');await pop.waitFor({state:'detached'});
      // The cards that were already there are exactly as they were.
      const afterOld=await data(page,async m=>JSON.stringify([(await m.listWords()).filter(w=>w.term!=='consequently').map(w=>[w.id,w.dueAt,w.fsrsState,w.revision,w.updatedAt]),await m.listReviews()]));
      assert.equal(afterOld,before);
      // A legacy card without a meaning: the sheet says so and offers nothing invented.
      await page.evaluate(()=>new Promise((res,rej)=>{const r=indexedDB.open('wordloop-local-v1');r.onerror=()=>rej(r.error);r.onsuccess=()=>{
        const db=r.result,tx=db.transaction('words','readwrite'),st=tx.objectStore('words'),all=st.getAll();
        all.onsuccess=()=>{const w=all.result.find(x=>x.term==='stranger');w.meaning='';w.meanings=[];st.put(w);};tx.oncomplete=()=>{db.close();res();};tx.onerror=()=>rej(tx.error);};}));
      await page.reload();await page.locator('.reader-body').waitFor();
      await word(page,'strangers').click();await pop.waitFor();
      assert.match(await pop.locator('.pop-missing').innerText(),/ما لها معنى محفوظ/);
      assert.equal(await pop.locator('.pop-meaning').count(),0);
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('RD-05: reader settings: text size, typeface, appearance; persisted; the reading position is kept; focused reading',async()=>{
      const long=Array.from({length:40},(_,i)=>`Paragraph ${i+1}. Although the road was long, the strangers kept walking together until the evening came.`).join('\n\n');
      const {context,page,errors}=await setup(browser,{body:long,questions:false});
      const size=()=>page.evaluate(()=>parseFloat(getComputedStyle(document.querySelector('.reader-body')).fontSize));
      const aa=page.getByRole('button',{name:'الخط والمظهر'});
      assert.equal(await aa.getAttribute('aria-expanded'),'false');
      // Scroll into the text, then change the size: the paragraph at the top of the screen stays put.
      await page.evaluate(()=>document.querySelectorAll('.reader-body p')[14].scrollIntoView({block:'start'}));
      await page.evaluate(()=>window.scrollBy(0,-90));
      const topPara=()=>page.evaluate(()=>{const p=[...document.querySelectorAll('.reader-body p')].find(e=>e.getBoundingClientRect().bottom>0);return {text:p.textContent.slice(0,14),top:Math.round(p.getBoundingClientRect().top)};});
      // Focus + click inside the page, as a tap does. (Playwright's own click first scrolls the target «into view», which
      // moves the page by itself before the reader is even involved and would hide what is measured here.)
      const press=name=>page.getByRole('button',{name}).evaluate(b=>{b.focus();b.click();});
      const y0=await page.evaluate(()=>scrollY);
      await press('الخط والمظهر');await page.locator('#reader-panel').waitFor();
      assert.equal(await page.evaluate(()=>scrollY),y0,'focusing the sticky bar and opening the settings does not scroll the page');
      const s0=await size(),at0=await topPara();
      await press('كبّر الخط');await press('كبّر الخط');
      const s2=await size(),at2=await topPara();
      assert.ok(s2>s0*1.25,`text grew: ${s0} → ${s2}`);
      assert.equal(at2.text,at0.text,'same paragraph at the top');assert.ok(Math.abs(at2.top-at0.top)<=4,`same place (within a few px of sub-pixel rounding; a line is 30px+): ${at0.top} → ${at2.top}`);
      assert.equal(await noOverflow(page),true);
      await page.getByRole('button',{name:'كبّر الخط'}).click();
      assert.equal(await page.getByRole('button',{name:'كبّر الخط'}).isDisabled(),true,'five steps, then it stops');
      assert.equal(await noOverflow(page),true,'largest size still fits');
      for(let i=0;i<4;i++)await page.getByRole('button',{name:'صغّر الخط'}).click();
      assert.equal(await page.getByRole('button',{name:'صغّر الخط'}).isDisabled(),true);
      assert.ok(await size()<s0);
      // Typeface and appearance.
      await page.getByRole('button',{name:'بسيط'}).click();
      assert.doesNotMatch(await page.evaluate(()=>getComputedStyle(document.querySelector('.reader-body')).fontFamily),/Georgia/);
      await page.getByRole('button',{name:'داكن'}).click();
      const dark=await page.evaluate(()=>({bg:getComputedStyle(document.body).backgroundColor,ink:getComputedStyle(document.querySelector('.reader-body')).color,hl:getComputedStyle(document.querySelector('.story-word')).backgroundColor}));
      assert.deepEqual(dark,{bg:'rgb(25, 24, 22)',ink:'rgb(232, 228, 220)',hl:'rgb(92, 75, 22)'},'dark page, light ink, subdued highlight');
      // Escape closes the panel and focus returns to its button.
      await page.keyboard.press('Escape');await page.locator('#reader-panel').waitFor({state:'detached'});
      assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-controls')),'reader-panel');
      // Persisted across a reload; leaving the reader restores the app's own look.
      await page.reload();await page.locator('.reader-body').waitFor();
      assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('wordloop-reader-prefs'))),{size:0,font:'sans',theme:'dark',highlights:true,focus:false});
      assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(25, 24, 22)');
      // Focused reading: the bar leaves while reading down, returns on the way up, and keyboard focus always brings it back.
      await page.getByRole('button',{name:'قراءة مركّزة'}).click();
      assert.equal(await page.locator('.reader-aids').isVisible(),false);
      const barTop=()=>page.evaluate(()=>Math.round(document.querySelector('.reader-bar').getBoundingClientRect().bottom));
      await page.evaluate(()=>window.scrollTo(0,900));
      await page.waitForFunction(()=>document.querySelector('.reader-bar').classList.contains('away'));
      await page.waitForFunction(()=>document.querySelector('.reader-bar').getBoundingClientRect().bottom<=0);
      await page.evaluate(()=>window.scrollTo(0,700));
      await page.waitForFunction(()=>!document.querySelector('.reader-bar').classList.contains('away'));
      await page.evaluate(()=>window.scrollTo(0,1500));
      await page.waitForFunction(()=>document.querySelector('.reader-bar').classList.contains('away'));
      await page.evaluate(()=>document.querySelector('.reader-back').focus({preventScroll:true}));
      await page.keyboard.press('Tab'); // keyboard focus inside the hidden bar
      await page.waitForFunction(()=>document.querySelector('.reader-bar').getBoundingClientRect().bottom>0);
      assert.ok(await barTop()>0,'Back is reachable from the keyboard in focused reading');
      // The finish button is always at the end of a long story, unobstructed.
      const finish=page.getByRole('button',{name:'أنهيت القراءة'});
      await finish.scrollIntoViewIfNeeded();
      const hit=await finish.evaluate(b=>{const r=b.getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===b;});
      assert.equal(hit,true,'nothing covers Finish');
      await page.goto(base()+'/#/words');await page.waitForSelector('.tabbar');
      assert.equal(await page.evaluate(()=>[document.documentElement.dataset.reader,getComputedStyle(document.body).backgroundColor].join()),',rgb(250, 248, 244)','the rest of the app is unchanged');
      assert.equal(await page.locator('.tabbar').isVisible(),true);
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('RD-06: finish is explicit and recorded once; the quiz is optional; skipping is not a failure; FSRS is untouched',async()=>{
      const {context,page,errors,ids,story}=await setup(browser);
      const sent=[];page.on('request',r=>{if(/\/api\/practice\/story(?!\/status)/.test(r.url()))sent.push(r.url());});
      const before=await fsrsSnapshot(page);
      assert.deepEqual(await marks(page),{},'opening and reading records nothing');
      assert.equal(await page.locator('.reader-done').count(),0,'no quiz is offered before finishing');
      await page.getByRole('button',{name:'أنهيت القراءة'}).click();
      const done=page.locator('.reader-done');await done.waitFor();
      assert.equal(await page.evaluate(()=>document.activeElement?.id),'reader-done-h','focus moves to the result for screen readers');
      assert.match(await done.innerText(),/خلّصت القراءة[\s\S]*اختياري، وتخطّيه ما ينحسب عليك/);
      assert.equal(await done.innerText().then(t=>/%|\d+\s*من\s*\d+/.test(t)),false,'no score or percentage');
      const m1=await marks(page);
      assert.deepEqual(Object.keys(m1),[ids.passage]);assert.deepEqual(Object.keys(m1[ids.passage]).sort(),['first','last']);
      // Skip the quiz: «اكتفيت» simply leaves. The mark stays; nothing else is recorded.
      await done.getByRole('button',{name:'اكتفيت'}).click();
      await page.waitForFunction(s=>location.hash!==s,story);await page.locator('.reader').waitFor({state:'detached'});
      assert.deepEqual(Object.keys(await marks(page)),[ids.passage]);
      // Back on the story: already finished (no second completion), and the optional quiz opens the existing practice.
      await page.goto(base()+'/'+story);await page.locator('.reader-done').waitFor();
      assert.match(await page.locator('.reader-done h2').innerText(),/قرأت هالنص من قبل/);
      assert.equal(await page.getByRole('button',{name:'أنهيت القراءة'}).count(),0);
      assert.deepEqual(await marks(page),m1,'re-reading does not add or change a completion');
      await page.locator('.reader-done').getByRole('button',{name:'تمرين قراءة'}).click();
      await page.locator('.practice-setup').waitFor();
      assert.equal(await page.locator('.tabbar').isVisible(),true,'the app bars are back outside the reader');
      await page.locator('.practice-start').click();await page.locator('.practice-q').waitFor();
      assert.equal(await fsrsSnapshot(page),before,'cards, due dates, FSRS state, revisions and reviews unchanged');
      assert.deepEqual(sent,[],'the reader never calls the story endpoint');
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('RD-07: a text without questions offers no invented quiz; Spanish story in an English interface keeps its own direction',async()=>{
      const {context,page,errors}=await setup(browser,{lang:'es-ES',body:ES_BODY,cards:[],title:'El sábado en el mercado',locale:'en',questions:false});
      assert.deepEqual(await page.evaluate(()=>[document.documentElement.dir,document.documentElement.lang]),['ltr','en']);
      const art=page.locator('.reader-body');
      assert.deepEqual([await art.getAttribute('dir'),await art.getAttribute('lang')],['ltr','es-ES']);
      assert.deepEqual(await page.locator('.story-word').evaluateAll(e=>e.map(x=>x.className.replace('story-word ','')+':'+x.textContent)),['suggested:Sin embargo'],'no cards → no yellow; Spanish phrase list → green');
      await word(page,'Sin embargo').click();
      assert.equal(await page.getByRole('dialog').locator('p.pop-meaning').innerText(),'ومع ذلك');
      assert.match(await page.getByRole('dialog').locator('.pop-langs').innerText(),/Spanish · Meaning in Arabic/);
      await page.keyboard.press('Escape');
      await page.getByRole('button',{name:'Finish reading'}).click();
      assert.match(await page.locator('.reader-done').innerText(),/You finished reading[\s\S]*no questions, and we do not make any up/);
      assert.equal(await page.locator('.reader-done').getByRole('button',{name:'Reading practice'}).count(),0);
      assert.equal(await noOverflow(page),true);
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('RD-08: Arabic interface (RTL) around an LTR story; inflected Spanish card; reduced motion; offline; 200% zoom width',async()=>{
      // 640px wide = a 1280px desktop window at 200% zoom.
      const {context,page,errors,story}=await setup(browser,{lang:'es-ES',body:ES_BODY,cards:ES_CARDS,title:'El sábado en el mercado',questions:false,options:{viewport:{width:640,height:400},reducedMotion:'reduce'}});
      assert.equal(await page.evaluate(()=>document.documentElement.dir),'rtl');
      const geo=await page.evaluate(()=>{const back=document.querySelector('.reader-back').getBoundingClientRect(),tools=document.querySelector('.reader-tools').getBoundingClientRect(),p=document.querySelector('.reader-body p');
        return {backRight:back.left>tools.right,align:getComputedStyle(p).textAlign,dir:getComputedStyle(p).direction};});
      assert.deepEqual(geo,{backRight:true,align:'start',dir:'ltr'},'Back sits at the start of the RTL bar; the story reads left to right');
      assert.deepEqual(await page.locator('.story-word.saved').allInnerTexts(),['abuela','baratas'],'«baratas» matches the card «barato»');
      assert.equal(await noOverflow(page),true,'no overflow at 200% zoom');
      assert.equal(await page.evaluate(()=>parseFloat(getComputedStyle(document.querySelector('.reader-bar')).transitionDuration)<0.01),true,'reduced motion is respected');
      // Offline: a saved text still opens, highlights and finishes (local-first).
      await context.setOffline(true);
      await page.goto(base()+'/#/words');await page.waitForFunction(()=>location.hash==='#/words');
      await page.evaluate(s=>{location.hash=s.slice(1);},story);await page.locator('.reader-body').waitFor();
      await word(page,'abuela').click();
      assert.equal(await page.getByRole('dialog').locator('p.pop-meaning').innerText(),'جدة');
      await page.keyboard.press('Escape');
      await page.getByRole('button',{name:'أنهيت القراءة'}).click();await page.locator('.reader-done').waitFor();
      // The reader's own Back leaves the story.
      await page.locator('.reader-back').click();
      await page.waitForFunction(s=>location.hash!==s,story);
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('RD-09: wide screen — the word card is anchored to the word, inside the window, and closes on scroll',async()=>{
      const {context,page,errors}=await setup(browser,{options:{viewport:{width:1280,height:800},hasTouch:false}});
      const w=word(page,'Consequently');await w.click();
      const pop=page.locator('.word-pop.anchored');await pop.waitFor();
      const [a,b]=[await w.boundingBox(),await pop.boundingBox()];
      assert.ok(b.x>=12&&b.x+b.width<=1280-12&&b.y>=0&&b.y+b.height<=800,'inside the window');
      assert.ok(Math.abs((b.x+b.width/2)-(a.x+a.width/2))<60&&(Math.abs(b.y-(a.y+a.height))<14||Math.abs(a.y-(b.y+b.height))<14),'next to its word');
      assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('role')),'dialog');
      // It belongs to the word: scrolling the page away closes it.
      await page.setViewportSize({width:1280,height:420});await pop.waitFor({state:'detached'}); // a resize closes it too
      await w.click();await pop.waitFor();
      await page.mouse.wheel(0,200);await pop.waitFor({state:'detached'});
      assert.deepEqual(errors,[]);await context.close();
    });
  });
}

// Issue #22 — Reading Practice in real engines (Chromium + WebKit, iPhone 390px). Questions only from saved data;
// FSRS (cards, dueAt, fsrsState, reviews) is byte-identical before and after a full session.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {ENGINES,startServer,freshPage} from './harness.mjs';

let server;
before(async()=>{server=await startServer();});
after(async()=>{await server?.stop();});

const data=(page,fn,arg)=>page.evaluate(async([src,arg])=>{const m=await import('/src/data.ts');return new Function('m','arg',`return (${src})(m,arg)`)(m,arg);},[fn.toString(),arg]);
const LUCIA='Lucía vive en Madrid. Estudia español todos los días.';
const fsrsSnapshot=page=>data(page,async m=>JSON.stringify([(await m.listWords()).map(w=>[w.id,w.dueAt,w.fsrsState,w.revision]),await m.listReviews()]));

async function setup(browser,base,{questions=true,cards=true,locale}={}){
  const {context,page,errors}=await freshPage(browser,base,locale?{locale}:undefined);
  const ids=await data(page,async(m,{questions,cards})=>{
    const f=await m.createFolder('Idiomas'),d=await m.createDeck({folderId:f.id,name:'Español',contentLanguage:'es-ES',meaningLanguage:'ar-SA'});
    if(cards)for(const [term,meaning] of [['Madrid','مدريد'],['español','الإسبانية'],['perro','كلب'],['gato','قطة'],['libro','كتاب']])
      await m.addWord({term,meanings:[meaning],example:'',translation:'',tag:'',contentType:'vocabulary',deckId:d.id});
    const p=await m.createPassage({deckId:d.id,title:'Lucía',body:'Lucía vive en Madrid. Estudia español todos los días.',
      questions:questions?[{question:'Where does Lucía live?',answer:'Madrid',quote:'Lucía vive en Madrid.'}]:[]});
    return {deck:d.id,passage:p.id};
  },{questions,cards});
  const path=`/#/words/d/${encodeURIComponent(ids.deck)}/texts/${encodeURIComponent(ids.passage)}`;
  await page.goto(base+path);await page.reload();await page.locator('.passage-body').waitFor();
  return {context,page,errors,...ids,path};
}
/** Answers whatever question is on screen: right, or on purpose wrong / with a missing accent. */
async function answer(page,how){
  const q=page.locator('.practice-q');
  const kind=await q.locator('.kind-badge').innerText();
  if(await q.locator('.practice-options').count()){
    const opts=q.locator('.practice-option');const term=await q.locator('.term-prompt').innerText();
    const right={Madrid:'مدريد','español':'الإسبانية',perro:'كلب',gato:'قطة',libro:'كتاب'}[term];
    const texts=await opts.allInnerTexts();const i=how==='wrong'?texts.findIndex(t=>t!==right):texts.indexOf(right);
    await opts.nth(i).click();return kind;
  }
  const prompt=await q.locator('.practice-prompt').innerText(),hint=await q.locator('.practice-hint').innerText().catch(()=>'');
  let value=/Where/.test(prompt)?'madrid':/مدريد/.test(hint)?'Madrid':/الإسبانية/.test(hint)?'español':'?';
  if(how==='wrong')value='Barcelona';if(how==='accent'&&value==='español')value='espanol';
  await q.locator('#practice-input').fill(value);await q.getByRole('button',{name:/تحقق|Check/}).click();
  return kind;
}

for(const [name,engine] of Object.entries(ENGINES)){
  test(`[${name}] issue #22 reading practice`,async t=>{
    const browser=await engine.launch();
    t.after(()=>browser.close());
    const base=()=>server.base;

    await t.test('READ-01: acceptance — «Where does Lucía live?» → Madrid with its source; a full session; FSRS untouched',async()=>{
      const {context,page,errors,path}=await setup(browser,base());
      const before=await fsrsSnapshot(page);
      await page.getByRole('button',{name:'تمرين قراءة'}).click();
      assert.equal(await page.evaluate(()=>location.hash),path.slice(1)+'/read');
      assert.match(await page.locator('.practice-setup').innerText(),/اكمل الفراغ\s*2[\s\S]*معنى الكلمة\s*5[\s\S]*فهم النص\s*1/);
      await page.locator('.practice-field').nth(1).getByRole('button',{name:'الكل'}).click();
      await page.locator('.practice-start').click();
      let seenComprehension=false,n=0;
      while(await page.locator('.practice-q').count()){
        const prompt=await page.locator('.practice-prompt').first().innerText();
        if(/Where does Lucía live\?/.test(prompt)){
          seenComprehension=true;
          await page.locator('#practice-input').fill('madrid');await page.getByRole('button',{name:'تحقق'}).click();
          assert.match(await page.locator('.practice-feedback').innerText(),/صح/);
          assert.match(await page.locator('.practice-source').innerText(),/من النص:\s*.?Lucía vive en Madrid\./);
        }else await answer(page,n===0?'wrong':'right');
        n++;await page.locator('.practice-next').click();
      }
      assert.ok(seenComprehension);assert.equal(n,8,'2 cloze + 5 meaning + 1 comprehension');
      assert.match(await page.locator('.finish h1').innerText(),/7 من 8 صح/);
      assert.equal(await page.locator('.practice-missed li').count(),1,'the missed one is listed with its answer');
      assert.match(await page.locator('.finish').innerText(),/التمرين ما يغيّر مواعيد مراجعة بطاقاتك/);
      assert.equal(await fsrsSnapshot(page),before,'cards, due dates, FSRS state and reviews unchanged');
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('READ-02: no saved questions → no comprehension questions; cloze is from card terms in the text, accents are «almost»',async()=>{
      const {context,page,errors}=await setup(browser,base(),{questions:false});
      await page.getByRole('button',{name:'تمرين قراءة'}).click();
      const comp=page.locator('.practice-field').first().getByRole('button',{name:/فهم النص/});
      assert.equal(await comp.isDisabled(),true);
      assert.match(await page.locator('.practice-why').innerText(),/يسأل بس الأسئلة اللي أضفتها/);
      await page.locator('.practice-field').first().getByRole('button',{name:/معنى الكلمة/}).click(); // only cloze
      await page.locator('.practice-start').click();
      const seen=[];
      while(await page.locator('.practice-q').count()){
        assert.equal(await page.locator('.kind-badge').innerText(),'اكمل الفراغ');
        assert.equal(await page.locator('.practice-prompt').getAttribute('lang'),'es-ES');
        assert.equal(await page.locator('.practice-prompt').getAttribute('dir'),'ltr');
        assert.equal(await page.locator('.practice-text').evaluate(d=>d.open),false,'the text is folded during a cloze');
        seen.push(await page.locator('.practice-prompt').innerText());
        await answer(page,'accent');
        await page.locator('.practice-next').click();
      }
      assert.equal(seen.length,2);
      assert.ok(seen.every(s=>!/Madrid|español/.test(s)),'the answer is never visible in the prompt');
      assert.match(await page.locator('.finish h1').innerText(),/1 من 2 صح/);
      assert.match(await page.locator('.finish .lead').innerText(),/إجابة وحدة قريبة/);
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('READ-03: nothing to practise → an honest empty state with the two ways forward; leaving mid-session asks first',async()=>{
      const {context,page,errors,path}=await setup(browser,base(),{questions:false,cards:false});
      await page.getByRole('button',{name:'تمرين قراءة'}).click();
      assert.match(await page.locator('.practice-empty').innerText(),/ما نخترع أسئلة من النص/);
      assert.equal(await page.locator('.practice-start').count(),0);
      await context.close();
      const s=await setup(browser,base());
      await s.page.getByRole('button',{name:'تمرين قراءة'}).click();await s.page.locator('.practice-start').click();
      await answer(s.page,'right');
      await s.page.locator('.back-btn').click();
      await s.page.getByRole('dialog').waitFor();
      await s.page.getByRole('dialog').getByRole('button').first().click(); // stay
      assert.equal(await s.page.locator('.practice-q').count(),1,'the session is still there');
      assert.deepEqual([...errors,...s.errors],[]);await s.context.close();
      void path;
    });

    await t.test('READ-04: English interface at 320px — English labels, the text and the cloze stay Spanish, nothing overflows',async()=>{
      const {context,page,errors}=await setup(browser,base());
      await page.evaluate(()=>localStorage.setItem('wordloop-locale','en'));await page.reload();await page.locator('.passage-body').waitFor();
      await page.setViewportSize({width:320,height:700});
      await page.getByRole('button',{name:'Reading practice'}).click();
      assert.match(await page.locator('.practice-setup').innerText(),/Fill the gap[\s\S]*Word meaning[\s\S]*Understanding/);
      await page.locator('.practice-field').first().getByRole('button',{name:/Word meaning/}).click();
      await page.locator('.practice-field').first().getByRole('button',{name:/Understanding/}).click();
      await page.locator('.practice-start').click();
      assert.equal(await page.locator('.practice-prompt').getAttribute('lang'),'es-ES');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await answer(page,'right');
      assert.match(await page.locator('.practice-feedback').innerText(),/Correct!/);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.deepEqual(errors,[]);await context.close();
    });
  });
}

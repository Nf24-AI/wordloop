// Issue #61 — the Practice flow end to end: Practice → deck → text → Reading / Listening → result → switch activity.
// Chromium + WebKit at iPhone width; empty states; AR + EN; FSRS untouched; passages survive backup → delete → restore.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {ENGINES,startServer,freshPage} from './harness.mjs';

let server;
before(async()=>{server=await startServer();});
after(async()=>{await server?.stop();});

const data=(page,fn,arg)=>page.evaluate(async([src,arg])=>{const m=await import('/src/data.ts');return new Function('m','arg',`return (${src})(m,arg)`)(m,arg);},[fn.toString(),arg]);
const fsrsSnapshot=page=>data(page,async m=>JSON.stringify([(await m.listWords()).map(w=>[w.id,w.dueAt,w.fsrsState,w.revision]),await m.listReviews()]));
const hashOf=page=>page.evaluate(()=>location.hash);

async function seed(page,{passage=true}={}){
  return data(page,async(m,{passage})=>{
    const f=await m.createFolder('Idiomas'),d=await m.createDeck({folderId:f.id,name:'Español',contentLanguage:'es-ES',meaningLanguage:'ar-SA'});
    for(const [term,meaning] of [['Madrid','مدريد'],['español','الإسبانية'],['perro','كلب'],['gato','قطة'],['libro','كتاب']])
      await m.addWord({term,meanings:[meaning],example:'',translation:'',tag:'',contentType:'vocabulary',deckId:d.id});
    let p=null;
    if(passage)p=await m.createPassage({deckId:d.id,title:'Lucía',body:'Lucía vive en Madrid. Estudia español todos los días.',
      questions:[{question:'Where does Lucía live?',answer:'Madrid',quote:'Lucía vive en Madrid.'}]});
    return {deck:d.id,passage:p?.id??null};
  },{passage});
}

for(const [name,engine] of Object.entries(ENGINES)){
  test(`[${name}] issue #61 practice hub`,async t=>{
    const browser=await engine.launch();
    t.after(()=>browser.close());
    const base=()=>server.base;

    await t.test('HUB-01: no texts anywhere → honest onboarding; a deck row leads to «new text» for that deck',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      const {deck}=await seed(page,{passage:false});
      await page.goto(base()+'/#/words/practice');await page.reload();await page.locator('.practice-hub').waitFor();
      assert.match(await page.locator('.practice-hub .empty').innerText(),/ما فيه نصوص للتمرين/);
      await page.locator('.deck-row',{hasText:'Español'}).click();
      assert.equal(await hashOf(page),`#/words/d/${encodeURIComponent(deck)}/texts/new`);
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('HUB-02: Practice → deck → text → Reading → result → switch to Listening; FSRS untouched',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      const {deck,passage}=await seed(page);
      await page.reload();await page.waitForSelector('main h1');
      const before=await fsrsSnapshot(page);
      await page.click('.tab-add');await page.locator('[data-action=practice]').click();
      await page.locator('.practice-hub').waitFor();
      await page.locator('.deck-row',{hasText:'Español'}).click();
      await page.locator('.hub-item').first().waitFor();
      assert.equal(await hashOf(page),`#/words/practice/${encodeURIComponent(deck)}`);
      assert.match(await page.locator('.back-btn').innerText(),/ممارسة/,'Back names the Practice hub');
      const item=page.locator('.hub-item',{hasText:'Lucía'});
      const read=item.getByRole('button',{name:/تمرين قراءة/});
      assert.ok((await read.boundingBox()).height>=44,'touch target ≥ 44px');
      await read.click();
      await page.locator('.practice-setup').waitFor();
      assert.equal(await hashOf(page),`#/words/d/${encodeURIComponent(deck)}/texts/${encodeURIComponent(passage)}/read`);
      await page.locator('.practice-field').nth(1).getByRole('button',{name:'الكل'}).click();
      await page.locator('.practice-start').click();
      let n=0;
      while(await page.locator('.practice-q').count()){
        const q=page.locator('.practice-q');
        if(await q.locator('.practice-options').count())await q.locator('.practice-option').first().click();
        else if(await q.locator('#practice-input').count())await q.getByRole('button',{name:'اعرض الإجابة'}).click();
        else{await q.getByRole('button',{name:'اعرض المعنى'}).click();await q.getByRole('button',{name:'عرفتها'}).click();}
        n++;await page.locator('.practice-next').click();
        assert.ok(n<20,'the session ends');
      }
      assert.equal(n,5,'2 cloze + 2 meaning (words of this text) + 1 comprehension');
      await page.locator('.finish').waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.locator('.finish').getByRole('button',{name:'تمرين استماع'}).click();
      await page.waitForFunction(h=>location.hash===h,`#/words/d/${encodeURIComponent(deck)}/texts/${encodeURIComponent(passage)}/listen`);
      assert.equal(await fsrsSnapshot(page),before,'cards, due dates, FSRS state and reviews unchanged');
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('HUB-03: a deck page has a direct Practice entry; English UI is LTR, the Spanish text keeps its language',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      const {deck}=await seed(page);
      await page.evaluate(()=>localStorage.setItem('wordloop-locale','en'));
      await page.goto(base()+`/#/words/d/${encodeURIComponent(deck)}`);await page.reload();
      await page.locator('.practice-row').click();
      await page.locator('.hub-item').first().waitFor();
      assert.equal(await hashOf(page),`#/words/practice/${encodeURIComponent(deck)}`);
      assert.match(await page.locator('.practice-hub').innerText(),/Choose a text[\s\S]*Reading practice[\s\S]*Listening practice/);
      assert.equal(await page.locator('.hub-text small').getAttribute('lang'),'es-ES');
      assert.equal(await page.evaluate(()=>document.documentElement.dir),'ltr');
      await page.setViewportSize({width:320,height:700});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('HUB-04: a passage and its questions survive backup → delete → restore',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      const {passage}=await seed(page);
      const out=await data(page,async(m,id)=>{
        const backup=JSON.parse(JSON.stringify(await m.buildBackup()));
        await m.deletePassage(id);
        const gone=(await m.listPassages()).length;
        await m.restoreBackup(backup);
        return {gone,passages:(await m.listPassages()).map(p=>[p.title,p.questions.length,p.contentLanguage])};
      },passage);
      assert.equal(out.gone,0);
      assert.deepEqual(out.passages,[['Lucía',1,'es-ES']]);
      assert.deepEqual(errors,[]);await context.close();
    });
  });
}

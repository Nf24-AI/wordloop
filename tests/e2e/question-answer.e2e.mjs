// Issue #18 — Question & Answer cards in real engines: add in a CS deck, review question-first, library badge + search, EN labels.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {ENGINES,startServer,freshPage} from './harness.mjs';

let server;
before(async()=>{server=await startServer();});
after(async()=>{await server?.stop();});

const stored=page=>page.evaluate(()=>new Promise(res=>{const r=indexedDB.open('wordloop-local-v1');r.onsuccess=()=>{const q=r.result.transaction('words').objectStore('words').getAll();q.onsuccess=()=>{r.result.close();res(q.result);};};}));
/** A «علوم الحاسب» folder with an Arabic «Networking» deck, created through the app's data module. */
async function csDeck(page){
  return page.evaluate(async()=>{const m=await import('/src/data.ts');const f=await m.createFolder('علوم الحاسب');const d=await m.createDeck({folderId:f.id,name:'Networking',contentLanguage:'ar-SA',meaningLanguage:'ar-SA'});return d.id;});
}

for(const [name,engine] of Object.entries(ENGINES)){
  test(`[${name}] issue #18 question & answer`,async t=>{
    const browser=await engine.launch();
    t.after(()=>browser.close());
    const base=()=>server.base;

    await t.test('QA-E1: add a question in a CS deck; the mode is remembered for that deck; review shows the question first',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      const deckId=await csDeck(page);
      await page.goto(base()+'/#/add/'+encodeURIComponent(deckId));await page.reload();await page.waitForSelector('#term');
      await page.getByRole('group',{name:'نوع البطاقة'}).getByRole('button',{name:'سؤال وجواب'}).click();
      await page.locator('main h1',{hasText:'وش السؤال؟'}).waitFor();
      await page.fill('#term','ما وظيفة DNS؟');await page.fill('#meaning','تحويل أسماء النطاقات إلى عناوين IP');
      await page.getByRole('button',{name:'إضافة شرح أو مثال'}).click();
      await page.fill('#example','لما تكتب example.com يرجع لك عنوانه');
      await page.click('form button[type=submit]');
      await page.locator('.toast',{hasText:'ما وظيفة DNS؟'}).waitFor();
      const [w]=await stored(page);
      assert.equal(w.contentType,'sentence');assert.equal(w.cardType,'question_answer');
      assert.equal(w.deckId,deckId);assert.equal(w.note,'لما تكتب example.com يرجع لك عنوانه');assert.equal(w.example,'');
      // The form stays in Q&A mode for the next card, and opens in it next time for this deck.
      assert.equal(await page.locator('[data-mode=qa]').getAttribute('aria-pressed'),'true');
      await page.goto(base()+'/#/');await page.goto(base()+'/#/add/'+encodeURIComponent(deckId));await page.reload();await page.waitForSelector('#term');
      assert.equal(await page.locator('[data-mode=qa]').getAttribute('aria-pressed'),'true');
      // Review: question first, nothing of the answer or explanation visible until «شوف الإجابة».
      await page.goto(base()+'/#/review');await page.reload();await page.locator('.reveal').waitFor();
      assert.equal(await page.locator('.card .kind-badge').textContent(),'سؤال وجواب');
      assert.equal(await page.locator('.card h2.term').textContent(),'ما وظيفة DNS؟');
      assert.equal(await page.locator('.card').getByText('تحويل أسماء النطاقات').count(),0);
      assert.equal(await page.locator('.card').getByText('example.com').count(),0);
      await page.click('.reveal');
      await page.locator('.answer strong',{hasText:'تحويل أسماء النطاقات إلى عناوين IP'}).waitFor();
      await page.locator('.answer .note',{hasText:'example.com'}).waitFor();
      await page.locator('.grade.g-good').click();
      await page.locator('.finish h1').waitFor();
      const [after]=await stored(page);
      assert.equal(after.revision,1);assert.equal(after.cardType,'question_answer');
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('QA-E2: the library shows the Q&A badge, its own kind filter, and search finds a question by its answer',async()=>{
      const {context,page}=await freshPage(browser,base());
      await page.evaluate(async()=>{const m=await import('/src/data.ts');
        await m.addWord({contentType:'question_answer',term:'What does DNS do?',meanings:['Turns domain names into IP addresses'],example:'',translation:'',note:'',tag:''});
        await m.addWord({contentType:'vocabulary',term:'overlook',meanings:['يغفل عن'],example:'',translation:'',note:'',tag:''});});
      await page.goto(base()+'/#/words/all');await page.reload();await page.waitForSelector('.word-list');
      await page.getByRole('group',{name:'نوع البطاقة'}).getByRole('button',{name:/سؤال وجواب/}).click();
      await page.locator('.word-list .word').nth(1).waitFor({state:'detached'});
      assert.deepEqual(await page.locator('.word-list .word-text b').allTextContents(),['What does DNS do?']);
      await page.getByRole('button',{name:'كل الأنواع'}).click();
      await page.fill('.search input','ip addresses');
      await page.locator('.word-list .word').nth(1).waitFor({state:'detached'});
      assert.deepEqual(await page.locator('.word-list .word-text b').allTextContents(),['What does DNS do?']);
      await context.close();
    });

    await t.test('QA-E3: English UI labels the mode and the review face',async()=>{
      const {context,page}=await freshPage(browser,base());
      await page.evaluate(()=>localStorage.setItem('wordloop-locale','en'));
      await page.goto(base()+'/#/add');await page.reload();await page.waitForSelector('#term');
      await page.getByRole('group',{name:'Card type'}).getByRole('button',{name:'Question & answer'}).click();
      await page.locator('main h1',{hasText:'What’s the question?'}).waitFor();
      await page.click('form button[type=submit]');
      await page.locator('#term-hint',{hasText:'Type the question first.'}).waitFor();
      await page.fill('#term','What is TCP?');await page.click('form button[type=submit]');
      await page.locator('#meaning-hint',{hasText:'Type the answer.'}).waitFor();
      assert.equal((await stored(page)).length,0,'nothing is saved without an answer');
      await context.close();
    });
  });
}

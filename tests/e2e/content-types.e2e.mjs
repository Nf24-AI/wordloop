// Issues #5 / #12 — four card kinds through the real UI (Chromium + WebKit, iPhone viewport).
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {ENGINES,startServer,freshPage,libraryTerms} from './harness.mjs';

let server;
before(async()=>{server=await startServer();});
after(async()=>{await server?.stop();});

async function addTyped(page,base,kind,fields,{navigate=true}={}){
  if(navigate)await page.goto(base+'/#/add');
  await page.waitForSelector('#term');
  await page.click(`[data-kind=${kind}]`);
  for(const [id,v] of Object.entries(fields))await page.fill('#'+id,v);
  await page.click('form button[type=submit]');
  await page.getByRole('status').filter({hasText:`«${fields.term}»`}).waitFor();
}
const stored=page=>page.evaluate(()=>new Promise(res=>{const r=indexedDB.open('wordloop-local-v1');r.onsuccess=()=>{const q=r.result.transaction('words').objectStore('words').getAll();q.onsuccess=()=>{r.result.close();res(q.result);};};}));

for(const [name,engine] of Object.entries(ENGINES)){
  test(`[${name}] issues #5/#12 card kinds`,async t=>{
    const browser=await engine.launch();
    t.after(()=>browser.close());
    const base=()=>server.base;

    await t.test('TYPE-01/03: add one of each kind; Library shows kind badges and an idiom keeps its explanation',async()=>{
      const {context,page,errors}=await freshPage(browser,base());
      await addTyped(page,base(),'vocabulary',{term:'overlook',meaning:'يغفل عن'});
      await addTyped(page,base(),'phrase',{term:'in charge of',meaning:'مسؤول عن',example:"I'm in charge of it."});
      await addTyped(page,base(),'sentence',{term:'I forgot my keys at home, so I had to go back.',meaning:'نسيت مفاتيحي في البيت فرجعت.',note:'لما تتأخر'});
      await addTyped(page,base(),'idiom',{term:'break the ice',meaning:'يكسر الحاجز ويبدأ الكلام',note:'ما له علاقة بالثلج',example:'He told a joke to break the ice.'});
      const rows=await stored(page);
      assert.deepEqual(Object.fromEntries(rows.map(w=>[w.term,w.contentType])),{'overlook':'vocabulary','in charge of':'phrase','I forgot my keys at home, so I had to go back.':'sentence','break the ice':'idiom'});
      assert.equal(rows.find(w=>w.contentType==='idiom').note,'ما له علاقة بالثلج');
      await page.goto(base()+'/#/words');await page.waitForSelector('.word-list');
      const badges=await page.locator('.word-list .kind-badge').allTextContents();
      assert.deepEqual(badges.sort(),['تعبير اصطلاحي','جملة','عبارة','مفردة'].sort());
      await page.locator('.word-main',{hasText:'break the ice'}).click();
      await page.locator('.word-detail .note',{hasText:'ما له علاقة بالثلج'}).waitFor();
      assert.deepEqual(errors,[]);await context.close();
    });

    await t.test('TYPE-02: same text as phrase and idiom coexist; same-kind duplicate refused with fields kept',async()=>{
      const {context,page}=await freshPage(browser,base());
      await addTyped(page,base(),'phrase',{term:'break the ice',meaning:'يكسر الثلج'});
      await addTyped(page,base(),'idiom',{term:'break the ice',meaning:'يكسر الحاجز'});
      await page.click('[data-kind=idiom]');await page.fill('#term','Break  The Ice');await page.fill('#meaning','ثاني');
      await page.click('form button[type=submit]');
      await page.locator('.inline-error[role=alert]').waitFor();
      assert.equal(await page.inputValue('#term'),'Break  The Ice');
      assert.equal((await stored(page)).length,2);
      await context.close();
    });

    await t.test('TYPE-04: switching kind changes labels/fields, keeps typed text, and saves only fields of the chosen kind',async()=>{
      const {context,page}=await freshPage(browser,base());
      await page.goto(base()+'/#/add');await page.waitForSelector('#term');
      await page.click('[data-kind=vocabulary]');
      await page.fill('#term','I forgot my keys.');await page.fill('#meaning','نسيت مفاتيحي.');await page.fill('#example','Example that should not be saved.');
      await page.click('[data-kind=sentence]');
      assert.equal(await page.locator('label[for=term]').textContent(),'الجملة بالإنجليزي');
      assert.equal(await page.locator('#term').evaluate(el=>el.tagName),'TEXTAREA');
      assert.equal(await page.locator('#example').count(),0,'sentence has no example field');
      assert.equal(await page.inputValue('#term'),'I forgot my keys.');assert.equal(await page.inputValue('#meaning'),'نسيت مفاتيحي.');
      await page.click('[data-kind=idiom]');
      assert.equal(await page.locator('label[for=meaning]').textContent(),'معناه الاصطلاحي');
      assert.equal(await page.inputValue('#example'),'Example that should not be saved.','text typed earlier is still there');
      await page.click('[data-kind=sentence]');
      await page.click('form button[type=submit]');
      await page.getByRole('status').filter({hasText:'حفظنا'}).waitFor();
      const [w]=await stored(page);
      assert.equal(w.contentType,'sentence');assert.equal(w.example,'');
      await context.close();
    });

    await t.test('kind picker is a keyboard-operable radio group and remembers the last kind',async()=>{
      const {context,page}=await freshPage(browser,base());
      await page.goto(base()+'/#/add');await page.waitForSelector('#term');
      const group=page.getByRole('radiogroup',{name:'نوع البطاقة'});
      assert.equal(await group.getByRole('radio').count(),4);
      await page.click('[data-kind=vocabulary]');
      await page.keyboard.press('ArrowLeft'); // RTL: left = next
      assert.equal(await page.getAttribute('[data-kind=phrase]','aria-checked'),'true');
      await page.keyboard.press('End');
      assert.equal(await page.getAttribute('[data-kind=idiom]','aria-checked'),'true');
      assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-kind')),'idiom');
      await page.reload();await page.waitForSelector('#term');
      assert.equal(await page.getAttribute('[data-kind=idiom]','aria-checked'),'true');
      await context.close();
    });

    await t.test('Library kind filter narrows and clears',async()=>{
      const {context,page}=await freshPage(browser,base());
      await addTyped(page,base(),'vocabulary',{term:'overlook',meaning:'يغفل عن'});
      await addTyped(page,base(),'idiom',{term:'break the ice',meaning:'يكسر الحاجز'});
      await page.goto(base()+'/#/words');await page.waitForSelector('.word-list');
      await page.getByRole('group',{name:'نوع البطاقة'}).getByRole('button',{name:/تعبير اصطلاحي/}).click();
      await page.locator('.word-list .word').nth(1).waitFor({state:'detached'});
      assert.deepEqual(await libraryTerms(page,base(),{navigate:false}),['break the ice']);
      await page.getByRole('button',{name:'كل الأنواع'}).click();
      await page.locator('.word-list .word').nth(1).waitFor();
      await context.close();
    });

    await t.test('TYPE-05 (UI): review shows the kind and idiomatic meaning; grading works for every kind',async()=>{
      const {context,page}=await freshPage(browser,base());
      await addTyped(page,base(),'vocabulary',{term:'overlook',meaning:'يغفل عن'});
      await addTyped(page,base(),'phrase',{term:'in charge of',meaning:'مسؤول عن'});
      await addTyped(page,base(),'sentence',{term:'I forgot my keys.',meaning:'نسيت مفاتيحي.'});
      await addTyped(page,base(),'idiom',{term:'break the ice',meaning:'يكسر الحاجز',note:'ما له علاقة بالثلج'});
      await page.goto(base()+'/#/review');
      const seen=new Set();
      for(let i=0;i<4;i++){
        await page.locator('.reveal').waitFor();
        const badge=await page.locator('.card .kind-badge').textContent();seen.add(badge);
        await page.click('.reveal');
        if(badge==='تعبير اصطلاحي'){await page.locator('.answer-label',{hasText:'المعنى الاصطلاحي'}).waitFor();await page.locator('.answer .note',{hasText:'ما له علاقة بالثلج'}).waitFor();}
        await page.locator('.grade.g-good').click();
        await page.waitForFunction(n=>document.querySelector('.review-count b')?.textContent!==String(n)||!document.querySelector('.reveal'),i+1);
      }
      assert.equal(seen.size,4);
      await page.locator('.finish').waitFor();
      const reviews=await page.evaluate(()=>new Promise(res=>{const r=indexedDB.open('wordloop-local-v1');r.onsuccess=()=>{const q=r.result.transaction('reviews').objectStore('reviews').getAll();q.onsuccess=()=>{r.result.close();res(q.result);};};}));
      assert.equal(reviews.length,4);
      await context.close();
    });

    await t.test('legacy card (no contentType) shows as vocabulary; a v1 backup file restores through Settings',async()=>{
      const {context,page}=await freshPage(browser,base());
      const now=new Date().toISOString();
      const legacy={id:'legacy-1',term:'legacy',meaning:'قديم',example:'',translation:'',tag:'عام',createdAt:now,updatedAt:now,dueAt:now,fsrsState:{cardId:'legacy-1',dueAt:now},archived:false,revision:0};
      await page.evaluate(w=>new Promise(res=>{const r=indexedDB.open('wordloop-local-v1');r.onsuccess=()=>{const tx=r.result.transaction('words','readwrite');tx.objectStore('words').put(w);tx.oncomplete=()=>{r.result.close();res();};};}),legacy);
      await page.goto(base()+'/#/words');await page.reload();
      await page.locator('.word-list .kind-badge',{hasText:'مفردة'}).waitFor();
      const v1={app:'wordloop',version:1,exportedAt:now,words:[{...legacy,id:'from-file',term:'restored',fsrsState:{cardId:'from-file',dueAt:now}}],reviews:[{id:'r1',wordId:'from-file',grade:'good',reviewedAt:now,nextDueAt:now}]};
      await page.goto(base()+'/#/settings');await page.waitForSelector('input[type=file]',{state:'attached'});
      page.once('dialog',d=>void d.accept());
      await page.setInputFiles('input[type=file]',{name:'wordloop-backup-v1.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(v1))});
      await page.getByRole('status').filter({hasText:'رجّعنا'}).waitFor();
      const rows=await stored(page);
      assert.equal(rows.length,1);assert.equal(rows[0].id,'from-file');assert.equal(rows[0].contentType,'vocabulary');assert.equal(rows[0].dueAt,now);
      await context.close();
    });
  });
}

// FSRS audit fixes (M1, M2, L1). Scheduling itself is unchanged: the last test checks it against ts-fsrs directly.
import 'fake-indexeddb/auto';
import {IDBFactory} from 'fake-indexeddb';
import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {DefaultScheduler,Rating} from 'ts-fsrs';
import {addWord,reviewWord,archiveWord,editWord,moveWord,createFolder,createDeck,getWord,listWords,listReviews,buildBackup,validateBackup,restoreBackup,resetConnectionForTests} from '../src/data.ts';

beforeEach(()=>{globalThis.indexedDB=new IDBFactory();resetConnectionForTests();});
const card=term=>({term,meanings:['معنى'],example:'',translation:'',tag:'',contentType:'vocabulary'});
const flush=()=>new Promise(r=>setTimeout(r,0));
const CONFIG={version:'FSRS-7',desiredRetention:0.9,enableShortTerm:true,learningSteps:['1m','10m'],relearningSteps:['10m']};

/* ── M1: a backup whose FSRS state cannot be graded is refused before anything is cleared ── */
test('M1: backups with an ungradable fsrsState are refused (validateBackup and restoreBackup); the current data stays',async()=>{
  const w=await addWord(card('keep'));const good=await buildBackup();
  const broken=[
    ['stability is text',s=>({...s,stability:'abc'})],
    ['unknown state',s=>({...s,state:7})],
    ['lastReviewAt is not a date',s=>({...s,lastReviewAt:'garbage'})],
    ['no FSRS-7 memory state',s=>({cardId:s.cardId,dueAt:s.dueAt})],
    ['negative reps',s=>({...s,reps:-1})],
    ['difficulty NaN (null in JSON)',s=>({...s,difficulty:null})],
  ];
  for(const [why,mutate] of broken){
    const b=JSON.parse(JSON.stringify(good));b.words[0].fsrsState=mutate(b.words[0].fsrsState);
    assert.throws(()=>validateBackup(b),/غير صحيحة/,why);
    await assert.rejects(restoreBackup(b),/غير صحيحة/,why);
  }
  const after=await listWords();assert.equal(after.length,1);assert.deepEqual(after[0].fsrsState,w.fsrsState,'existing data untouched');
});

test('M1: real backups — new, reviewed, relearning cards and v1 files — still restore, and every card can be graded',async()=>{
  const a=await addWord(card('new one')),b=await addWord(card('reviewed')),c=await addWord(card('lapsed'));
  await reviewWord(b.id,'good');await reviewWord(c.id,'again');
  const backup=JSON.parse(JSON.stringify(await buildBackup()));
  globalThis.indexedDB=new IDBFactory();resetConnectionForTests();
  await restoreBackup(backup);
  assert.equal((await listWords()).length,3);
  await reviewWord(a.id,'good');
  // v1 file (no kinds, decks or folders) keeps working.
  const v1={app:'wordloop',version:1,exportedAt:backup.exportedAt,words:backup.words.map(({contentType,deckId,note,meanings,...w})=>w),reviews:backup.reviews};
  globalThis.indexedDB=new IDBFactory();resetConnectionForTests();
  await restoreBackup(v1);assert.equal((await listWords()).length,3);
});

/* ── M2: read → schedule → write in one transaction ── */
test('M2: a restore landing during a review never leaves a schedule computed from the pre-restore card',async()=>{
  for(const delay of [0,1,2,3,4,6,10]){
    globalThis.indexedDB=new IDBFactory();resetConnectionForTests();
    const x=await addWord(card('gamma'));
    const other=JSON.parse(JSON.stringify(await buildBackup())),ow=other.words[0];
    // The backup holds the same card (same revision) with another schedule, e.g. from another device.
    const s=await DefaultScheduler(CONFIG);
    const c=s.review({card:{...ow.fsrsState,dueAt:new Date(ow.fsrsState.dueAt),lastReviewAt:null},grade:Rating.Easy,now:new Date('2026-01-31T09:00:00Z')}).card;
    ow.fsrsState=JSON.parse(JSON.stringify(c));ow.dueAt=ow.fsrsState.dueAt;ow.meanings=['FROM BACKUP'];ow.meaning='FROM BACKUP';
    const p=reviewWord(x.id,'again');for(let i=0;i<delay;i++)await flush();
    const q=restoreBackup(other);await Promise.allSettled([p,q]);
    const fin=await getWord(x.id);
    assert.deepEqual(fin.meanings,['FROM BACKUP'],`delay ${delay}: restore applied`);
    const restoredUntouched=fin.dueAt===ow.dueAt&&fin.fsrsState.reps===c.reps;
    const reviewedAfterRestore=fin.fsrsState.reps===c.reps+1&&fin.fsrsState.lapses===c.lapses+1; // Again on the restored (review-state) card
    assert.ok(restoredUntouched||reviewedAfterRestore,`delay ${delay}: reps=${fin.fsrsState.reps} stability=${fin.fsrsState.stability} (backup reps ${c.reps}, stability ${c.stability})`);
  }
});

test('M2: grading while the card is edited, moved or archived keeps every change; two grades of one card apply once',async()=>{
  const f=await createFolder('F'),d=await createDeck({folderId:f.id,name:'D'});
  for(const other of [id=>editWord(id,{meanings:['edited']}),id=>moveWord(id,d.id),id=>archiveWord(id)]){
    for(const delay of [0,1,3]){
      const w=await addWord(card('w'+Math.random()));const p=reviewWord(w.id,'good');for(let i=0;i<delay;i++)await flush();
      const o=other(w.id);const [rv]=await Promise.allSettled([p,o]);const fin=await getWord(w.id);
      if(rv.status==='fulfilled')assert.equal(fin.fsrsState.reps,1);
      assert.ok(fin.meanings[0]==='edited'||fin.deckId===d.id||fin.archived,'the other change survived');
    }
  }
  const w=await addWord(card('double'));
  const r=await Promise.allSettled([reviewWord(w.id,'good'),reviewWord(w.id,'again')]);
  const fin=await getWord(w.id),revs=(await listReviews()).filter(x=>x.wordId===w.id);
  assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(revs.length,1);assert.equal(fin.fsrsState.reps,1);assert.equal(fin.revision,1);
});

/* ── L1: refused writes never leave an unhandled rejection ── */
test('L1: missing card, archived card, not-yet-due card and archiving a missing card reject cleanly (no unhandled rejection)',async()=>{
  const seen=[];const on=e=>seen.push(String(e?.message??e));process.on('unhandledRejection',on);
  try{
    await assert.rejects(reviewWord('nope','good'),/لم نجد الكلمة/);
    await assert.rejects(archiveWord('nope'),/لم نجد الكلمة/);
    const w=await addWord(card('soon'));await reviewWord(w.id,'easy');
    await assert.rejects(reviewWord(w.id,'good'),/لم يحن وقت/);
    await archiveWord(w.id);await assert.rejects(reviewWord(w.id,'good'),/لم نجد الكلمة/);
    for(let i=0;i<5;i++)await flush();
  }finally{process.off('unhandledRejection',on);}
  assert.deepEqual(seen,[]);
});

/* ── Unchanged algorithm ── */
test('scheduling is bit-identical to ts-fsrs with the same configuration (new card, all four grades)',async()=>{
  const s=await DefaultScheduler(CONFIG);
  for(const [grade,rating] of [['again',Rating.Again],['hard',Rating.Hard],['good',Rating.Good],['easy',Rating.Easy]]){
    globalThis.indexedDB=new IDBFactory();resetConnectionForTests();
    const w=await addWord(card('x'+grade));const before=w.fsrsState;
    const next=await reviewWord(w.id,grade);const after=await getWord(w.id);
    const ref=s.review({card:{...before,dueAt:new Date(before.dueAt),lastReviewAt:null},grade:rating,now:new Date(after.fsrsState.lastReviewAt)}).card;
    assert.deepEqual(after.fsrsState,JSON.parse(JSON.stringify(ref)),grade);assert.equal(next,ref.dueAt.toISOString());
  }
});

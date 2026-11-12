import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summary,validateBackup} from '../src/data.ts';

const now='2026-11-12T17:00:00.000Z';
function word(id='w-1',overrides={}){
  return {
    id,term:'overlook',meaning:'يغفل عن',example:'I overlooked a detail.',
    translation:'فاتتني تفصيلة.',tag:'عام',
    createdAt:now,updatedAt:now,dueAt:now,
    fsrsState:{cardId:id,dueAt:now},
    archived:false,revision:0,...overrides,
  };
}
function backup(words=[word()],reviews=[]){
  return {app:'wordloop',version:1,exportedAt:now,words,reviews};
}

test('accepts a well-formed local backup',()=>{
  const payload=backup();
  assert.deepEqual(validateBackup(payload),payload);
});

test('rejects corrupted FSRS scheduling dates before replacing stored data',()=>{
  assert.throws(()=>validateBackup(backup([word('w-1',{fsrsState:{dueAt:'broken'}})])),/غير صحيحة/);
  assert.throws(()=>validateBackup(backup([word('w-1',{fsrsState:{dueAt:'2026-11-13T17:00:00.000Z'}})])),/غير صحيحة/);
  assert.throws(()=>validateBackup(backup([word('w-1',{dueAt:'not-a-date'})])),/غير صحيحة/);
});

test('rejects orphan reviews and duplicate word IDs',()=>{
  const review={id:'r-1',wordId:'missing',grade:'good',reviewedAt:now,nextDueAt:now};
  assert.throws(()=>validateBackup(backup([word()], [review])),/مراجعات بلا كلمات/);
  assert.throws(()=>validateBackup(backup([word(),word()])),/مكررة/);
});

test('daily summary counts only active words, due cards, and Riyadh-local reviews',()=>{
  const earlier='2026-11-11T22:00:00.000Z'; // Nov 12, 01:00 in Riyadh
  const later='2026-11-13T17:00:00.000Z';
  const words=[
    word('w-1'),
    word('w-2',{dueAt:later,fsrsState:{cardId:'w-2',dueAt:later}}),
    word('w-3',{archived:true}),
  ];
  const reviews=[{id:'r-1',wordId:'w-1',grade:'good',reviewedAt:earlier,nextDueAt:later}];
  assert.deepEqual(summary(words,reviews,new Date(now)),{total:2,due:1,reviewedToday:1});
});

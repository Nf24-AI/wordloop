// Issue #10 — honest home/progress counters (pure functions, fixed clock).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summary,riyadhDayOf} from '../src/data.ts';

const now=new Date('2026-11-12T17:00:00.000Z'); // 20:00 in Riyadh
const DAY=86_400_000;
const iso=ms=>new Date(ms).toISOString();
function card(id,{dueIn=0,archived=false}={}){const dueAt=iso(now.getTime()+dueIn);return {id,contentType:'vocabulary',term:id,meaning:'م',example:'',translation:'',note:'',tag:'عام',createdAt:iso(0),updatedAt:iso(0),dueAt,fsrsState:{dueAt},archived,revision:0};}
const review=(id,wordId,at,grade='good')=>({id,wordId,grade,reviewedAt:iso(at),nextDueAt:iso(at)});

test('MET-01: one card reviewed four times today = 1 distinct card, 4 attempts',()=>{
  const t=now.getTime();
  const reviews=['again','again','hard','good'].map((g,i)=>review('r'+i,'w1',t-(4-i)*60_000,g));
  const s=summary([card('w1',{dueIn:DAY})],reviews,now);
  assert.equal(s.cardsReviewedToday,1);assert.equal(s.reviewAttemptsToday,4);
});

test('MET-02: active/due/scheduled counts exclude archived cards and never double count',()=>{
  const words=[card('due'),card('future',{dueIn:3*DAY}),card('archived-due',{archived:true}),card('later',{dueIn:8*DAY}),card('edge',{dueIn:7*DAY})];
  const s=summary(words,[],now);
  assert.equal(s.inLibrary,4);
  assert.equal(s.dueNow,1,'only the active due card');
  assert.equal(s.scheduledNext7Days,2,'future (3 days) + edge (exactly 7 days); not due-now, not 8 days');
  assert.ok(s.dueNow+s.scheduledNext7Days<=s.inLibrary);
});

test('MET-03: reviews at 23:59 and 00:01 Riyadh time fall on separate days',()=>{
  const before=Date.parse('2026-11-12T20:59:00.000Z'); // 23:59 Riyadh, Nov 12
  const after=Date.parse('2026-11-12T21:01:00.000Z');  // 00:01 Riyadh, Nov 13
  assert.equal(riyadhDayOf(iso(before)),'2026-11-12');assert.equal(riyadhDayOf(iso(after)),'2026-11-13');
  const reviews=[review('a','w1',before),review('b','w2',after)];
  const words=[card('w1',{dueIn:DAY}),card('w2',{dueIn:DAY})];
  const on12=summary(words,reviews,new Date('2026-11-12T20:59:30.000Z'));
  const on13=summary(words,reviews,new Date('2026-11-12T21:02:00.000Z'));
  assert.deepEqual([on12.cardsReviewedToday,on12.reviewAttemptsToday],[1,1]);
  assert.deepEqual([on13.cardsReviewedToday,on13.reviewAttemptsToday],[1,1]);
});

test('reviews of a card that was archived later still count as reviewed today; archive does not count as a review',()=>{
  const t=now.getTime();
  const s=summary([card('w1',{archived:true})],[review('r','w1',t-1000)],now);
  assert.equal(s.inLibrary,0);assert.equal(s.cardsReviewedToday,1);assert.equal(s.reviewAttemptsToday,1);
});

test('MET-04: new user and one-card user get zeros, not invented numbers',()=>{
  assert.deepEqual(summary([],[],now),{inLibrary:0,dueNow:0,scheduledNext7Days:0,cardsReviewedToday:0,reviewAttemptsToday:0});
  assert.deepEqual(summary([card('only')],[],now),{inLibrary:1,dueNow:1,scheduledNext7Days:0,cardsReviewedToday:0,reviewAttemptsToday:0});
});

test('yesterday\'s reviews do not count today',()=>{
  const s=summary([card('w1')],[review('r','w1',now.getTime()-DAY)],now);
  assert.equal(s.cardsReviewedToday,0);assert.equal(s.reviewAttemptsToday,0);
});

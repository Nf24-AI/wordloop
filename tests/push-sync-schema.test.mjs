// #30 rollout safety: /api/push/sync must keep working whatever migrations the D1 has (none, 0002, 0002+0003),
// so merging/deploying before the owner applies a migration never breaks enabling notifications on Staging.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.ts';
import {testBrowser} from '@codefusion-cc/web-push/testing';

const base='https://wordloop-staging.nf24-wordloop.workers.dev';
const token='test-token-'.repeat(7);
function d1(db){
  const stmt=(sql,args=[])=>({bind:(...v)=>stmt(sql,v),
    run:async()=>{const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};},
    first:async()=>db.prepare(sql).get(...args)??null,
    all:async()=>({results:db.prepare(sql).all(...args).map(r=>({...r}))})});
  return {prepare:sql=>stmt(sql)};
}
const original=()=>readFileSync('worker/schema.sql','utf8').replace(/,\s*-- #30[\s\S]*?(?=\n\);)/,'');
const mig=n=>readFileSync(`worker/migrations/${n}`,'utf8');
const setups={
  'original schema (no migration yet)':db=>db.exec(original()),
  '0002 only':db=>{db.exec(original());db.exec(mig('0002_smart_reminders.sql'));},
  '0002 + 0003':db=>{db.exec(original());db.exec(mig('0002_smart_reminders.sql'));db.exec(mig('0003_practice_reminders.sql'));},
  'fresh schema.sql':db=>db.exec(readFileSync('worker/schema.sql','utf8')),
};
for(const [name,setup] of Object.entries(setups)){
  test(`push sync stores the device on: ${name}`,async()=>{
    const raw=new DatabaseSync(':memory:');setup(raw);
    const env={PUSH_DB:d1(raw),PUSH_LIMIT:{limit:async()=>({success:true})}};
    const {subscription:sim}=await testBrowser();
    const subscription={endpoint:sim.endpoint,keys:{p256dh:sim.p256dh,auth:sim.auth}};
    const body={token,subscription,nextDueAt:'2026-11-15T08:10:00.000Z',timeZone:'Europe/London',locale:'en',practice:true,lastPracticeDay:'2026-11-14'};
    const res=await worker.fetch(new Request(base+'/api/push/sync',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(body)}),env);
    assert.equal(res.status,200);
    const row=raw.prepare('SELECT * FROM push_devices').get();
    assert.equal(row.next_due_at,'2026-11-15T08:10:00.000Z');
    if('time_zone' in row){assert.equal(row.time_zone,'Europe/London');assert.equal(row.locale,'en');}
    if('practice_ok' in row){assert.equal(row.practice_ok,1);assert.equal(row.last_practice_day,'2026-11-14');}
    // a second sync (e.g. practice turned off, bad day) updates in place
    const res2=await worker.fetch(new Request(base+'/api/push/sync',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({...body,practice:false,lastPracticeDay:'yesterday'})}),env);
    assert.equal(res2.status,200);
    const rows=raw.prepare('SELECT * FROM push_devices').all();assert.equal(rows.length,1);
    if('practice_ok' in rows[0]){assert.equal(rows[0].practice_ok,0);assert.equal(rows[0].last_practice_day,null);}
  });
}

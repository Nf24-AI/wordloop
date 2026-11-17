// Issue #30 — Smart Reminders, tested against real SQLite (node:sqlite) with the ORIGINAL schema + the additive migration,
// through a D1-shaped adapter. Covers: near-due delivery, grouping, idempotency across repeated/concurrent runs, stale dues,
// quiet hours, daily cap + cooldown, retry after transient failure, gone subscriptions, time zones, copy, privacy of the schema.
import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {runReminders,decide,localParts,safeZone,safeDay,MESSAGES,REMINDER,URLS} from '../worker/reminders.ts';

/** Minimal Cloudflare D1 API over node:sqlite (positional ?1..?n). */
function d1(db){
  const stmt=(sql,args=[])=>({bind:(...v)=>stmt(sql,v),
    run:async()=>{const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};},
    first:async()=>db.prepare(sql).get(...args)??null,
    all:async()=>({results:db.prepare(sql).all(...args).map(r=>({...r}))})});
  return {prepare:sql=>stmt(sql)};
}
let raw,db,sent;
const at=iso=>new Date(iso);
/** Riyadh is UTC+3 all year. */
const riyadh=(hhmm,day='2026-11-15')=>new Date(`${day}T${hhmm}:00+03:00`);
const sender=(outcome='sent')=>async(row,msg)=>{sent.push({token:row.token_hash,...msg});return typeof outcome==='function'?outcome(row):outcome;};
const run=(now,outcome)=>runReminders(db,now,sender(outcome));
const row=token=>raw.prepare('SELECT * FROM push_devices WHERE token_hash=?').get(token);
function device(token,next,{zone='Asia/Riyadh',locale='ar'}={}){
  raw.prepare(`INSERT INTO push_devices (token_hash,endpoint,p256dh,auth_key,next_due_at,updated_at,time_zone,locale) VALUES (?,?,?,?,?,?,?,?)`)
    .run(token,'https://push.example/'+token,'p','a',next&&new Date(next).toISOString(),new Date().toISOString(),zone,locale);
}
const sync=(token,next)=>raw.prepare('UPDATE push_devices SET next_due_at=? WHERE token_hash=?').run(next&&new Date(next).toISOString(),token);

beforeEach(()=>{
  raw=new DatabaseSync(':memory:');
  raw.exec(readFileSync('worker/schema.sql','utf8').replace(/,\s*-- #30[\s\S]*?(?=\n\);)/,'')); // the ORIGINAL table (pre-#30 columns only)
  raw.exec(readFileSync('worker/migrations/0002_smart_reminders.sql','utf8'));
  raw.exec(readFileSync('worker/migrations/0003_practice_reminders.sql','utf8'));
  db=d1(raw);sent=[];
});

test('the migration is additive over the original schema; legacy rows keep working; no vocabulary columns exist',async()=>{
  const fresh=new DatabaseSync(':memory:');fresh.exec(readFileSync('worker/schema.sql','utf8'));
  const cols=t=>t.prepare('PRAGMA table_info(push_devices)').all().map(c=>c.name).sort();
  assert.deepEqual(cols(raw),cols(fresh),'migrated table = fresh schema');
  for(const c of cols(raw))assert.ok(!/term|meaning|word|example|review|fsrs|note/i.test(c),'no learning data in the cloud: '+c);
  raw.prepare(`INSERT INTO push_devices (token_hash,endpoint,p256dh,auth_key,next_due_at,updated_at,last_sent_day) VALUES ('legacy','https://x','p','a',?,?,'2026-11-14')`)
    .run(riyadh('10:00').toISOString(),new Date().toISOString());
  await run(riyadh('10:15'));
  assert.equal(sent.length,1,'a pre-#30 subscription (no zone/locale) gets the reminder');
  assert.equal(sent[0].title,MESSAGES.ar.due.title,'defaults: Arabic, Riyadh');
});

test('a card due at 11:10 Riyadh is reminded at the next 15-min run, not at 20:00',async()=>{
  device('a',riyadh('11:10'));
  await run(riyadh('11:00'));assert.equal(sent.length,0,'not due yet');
  await run(riyadh('11:15'));
  assert.deepEqual(sent.map(s=>s.title),['حان وقت المراجعة']);
  assert.equal(row('a').notified_due_at,riyadh('11:10').toISOString());
});

test('ten cards due close together → one notification; repeated and overlapping runs never resend the same due event',async()=>{
  device('a',riyadh('11:10')); // the device syncs only its earliest due: the other nine are covered by it
  await Promise.all([run(riyadh('11:15')),run(riyadh('11:15')),run(riyadh('11:15'))]);
  for(const t of ['11:30','11:45','12:00','16:00'])await run(riyadh(t));
  assert.equal(sent.length,1);
});

test('after a review the device syncs a later due: the old event is not sent; the new one is, respecting the cooldown',async()=>{
  device('a',riyadh('11:10'));
  sync('a',riyadh('15:00'));               // reviewed offline-then-online before the run
  await run(riyadh('11:15'));assert.equal(sent.length,0,'stale due never sent');
  await run(riyadh('15:00'));assert.equal(sent.length,1);
  sync('a',riyadh('15:20'));               // reviewed some, more came due soon after
  await run(riyadh('15:30'));assert.equal(sent.length,1,'3-hour cooldown');
  await run(riyadh('18:00'));assert.equal(sent.length,2);
  assert.equal(sent[1].title,'مراجعتك جاهزة','a due that had to wait uses the calm «later» copy');
  sync('a',null);await run(riyadh('22:00'));assert.equal(sent.length,2,'nothing due → nothing sent');
});

test('quiet hours 00:00–09:00 local: a night-time due waits until 09:00 and is sent once',async()=>{
  device('a',riyadh('02:00'));
  for(const t of ['02:00','05:30','08:45'])await run(riyadh(t));
  assert.equal(sent.length,0);
  await run(riyadh('09:00'));await run(riyadh('09:15'));
  assert.deepEqual(sent.map(s=>s.title),['مراجعتك جاهزة']);
});

test('at most 3 notifications per local day, at least 3 hours apart; the rest waits for tomorrow without losing it',async()=>{
  device('a',riyadh('09:00'));
  const times=['09:00','10:00','12:00','12:15','15:00','18:00','21:00','23:45'];
  for(const t of times){await run(riyadh(t));const s=row('a');if(s.notified_due_at===s.next_due_at)sync('a',riyadh(t));} // new due right after each send
  assert.equal(sent.length,3);
  const sends=raw.prepare('SELECT sent_count,sent_day FROM push_devices').get();assert.deepEqual({...sends},{sent_count:3,sent_day:'2026-11-15'});
  await run(riyadh('09:00','2026-11-16'));
  assert.equal(sent.length,4,'the waiting due is sent the next morning');
  assert.equal(row('a').sent_count,1,'counter resets per local day');
});

test('transient failure releases the claim (retried next run); a gone subscription is deleted',async()=>{
  device('a',riyadh('11:10'));device('b',riyadh('11:10'));
  await run(riyadh('11:15'),r=>r.token_hash==='a'?'failed':'gone');
  assert.equal(row('b'),undefined,'gone → deleted');
  assert.equal(row('a').notified_due_at,null,'claim released');assert.equal(row('a').sent_count,0);
  await run(riyadh('11:30'));
  assert.equal(sent.filter(s=>s.token==='a').length,2,'retried once more and delivered');
  await run(riyadh('11:45'));assert.equal(sent.filter(s=>s.token==='a').length,2);
});

test('time zones: quiet hours and the daily counter follow the device, not Riyadh; bad zones fall back safely',async()=>{
  device('ny',at('2026-11-15T12:00:00Z'),{zone:'America/New_York',locale:'en'}); // 07:00 in New York
  await run(at('2026-11-15T12:30:00Z'));assert.equal(sent.length,0,'07:30 New York = quiet');
  await run(at('2026-11-15T14:00:00Z'));
  assert.deepEqual(sent.map(s=>s.title),['Your review is ready']);
  assert.equal(row('ny').sent_day,'2026-11-15');
  assert.equal(safeZone('Mars/Olympus'),'Asia/Riyadh');assert.equal(safeZone(42),'Asia/Riyadh');
  assert.deepEqual(localParts(at('2026-11-15T21:30:00Z'),'Asia/Riyadh'),{day:'2026-11-16',hour:0});
});

test('decide() is pure and conservative',()=>{
  const now=riyadh('12:00'),base={time_zone:'Asia/Riyadh',last_sent_at:null,sent_day:null,sent_count:0,notified_due_at:null};
  assert.equal(decide({...base,next_due_at:null},now),null);
  assert.equal(decide({...base,next_due_at:'not a date'},now),null);
  assert.equal(decide({...base,next_due_at:riyadh('12:05').toISOString()},now),null);
  assert.equal(decide({...base,next_due_at:riyadh('11:50').toISOString()},now).kind,'due');
  assert.equal(decide({...base,next_due_at:riyadh('10:00').toISOString()},now).kind,'later');
  assert.equal(decide({...base,next_due_at:riyadh('11:50').toISOString(),sent_day:'2026-11-15',sent_count:REMINDER.dailyCap},now),null);
});

test('notification copy: Arabic + English for each reason, short for a lock screen, no counts, no words, no emoji',()=>{
  for(const l of ['ar','en'])for(const k of ['due','later','practice']){
    const {title,body}=MESSAGES[l][k];
    assert.ok(title.length<=30&&body.length<=60,`${l}.${k} fits the iPhone lock screen`);
    assert.ok(!/\p{Extended_Pictographic}/u.test(title+body),'no emoji');
    assert.ok(!/\d/.test(title+body),'no counts or times the server can’t vouch for');
  }
  assert.deepEqual(MESSAGES.ar.due,{title:'حان وقت المراجعة',body:'كلماتك جاهزة للمراجعة. كم دقيقة وتكمل!'});
});

const practice=(token,{day=null,ok=1}={})=>raw.prepare('UPDATE push_devices SET practice_ok=?,last_practice_day=? WHERE token_hash=?').run(ok,day,token);

test('practice nudge: one per local day, only in a practice window, links to the library',async()=>{
  device('p',null);practice('p');
  for(const t of ['02:00','08:45','09:30','14:00','15:30'])await run(riyadh(t));
  assert.equal(sent.length,0,'quiet hours and 14–17 are not practice windows');
  await run(riyadh('10:15'));
  assert.deepEqual(sent.map(s=>[s.title,s.url]),[[MESSAGES.ar.practice.title,URLS.practice]]);
  for(const t of ['13:30','18:30','21:30','22:45'])await run(riyadh(t));
  assert.equal(sent.length,1,'max one practice nudge per day');
  await run(riyadh('10:00','2026-11-16'));assert.equal(sent.length,2,'next day again');
});

test('practice nudge: never without opt-in, never on a day already practised, never while a review is due',async()=>{
  device('off',null);practice('off',{ok:0});
  device('done',null);practice('done',{day:'2026-11-15'});
  device('due',riyadh('09:00'));practice('due');
  await run(riyadh('10:15'));
  assert.deepEqual(sent.map(s=>[s.token,s.title]),[['due',MESSAGES.ar.later.title]],'due review wins; no practice for off/done');
  for(const t of ['18:30','21:30'])await run(riyadh(t));
  assert.equal(sent.filter(s=>s.token==='due').length,1,'a notified-but-unreviewed due still blocks practice');
  assert.equal(sent.length,1);
});

test('practice and due share the daily cap and cooldown; a practice failure is retried',async()=>{
  device('p',riyadh('09:00'));practice('p');
  await run(riyadh('09:00'));assert.equal(sent.length,1);
  sync('p',riyadh('23:59','2026-11-20'));            // reviewed: nothing due for days
  await run(riyadh('10:15'));assert.equal(sent.length,1,'3-hour cooldown applies to practice too');
  await run(riyadh('18:00'),'failed');assert.equal(row('p').practice_sent_day,null,'released after failure');
  await run(riyadh('18:15'));assert.equal(sent.length,3);assert.equal(sent[2].title,MESSAGES.ar.practice.title);
  assert.equal(row('p').sent_count,2);
});

test('a database with 0002 only (0003 not applied yet) still sends due reminders',async()=>{
  raw=new DatabaseSync(':memory:');
  raw.exec(readFileSync('worker/schema.sql','utf8').replace(/,\s*-- #30[\s\S]*?(?=\n\);)/,''));
  raw.exec(readFileSync('worker/migrations/0002_smart_reminders.sql','utf8'));
  db=d1(raw);device('a',riyadh('11:10'));
  await run(riyadh('11:15'));assert.equal(sent.length,1);
});

test('devices in their cooldown are filtered in SQL, so they cannot starve the batch',async()=>{
  const t=riyadh('12:00').getTime();
  for(let i=0;i<REMINDER.batch+20;i++){device('busy'+i,riyadh('11:00'));raw.prepare('UPDATE push_devices SET last_sent_at=? WHERE token_hash=?').run(t-60_000,'busy'+i);}
  device('fresh',riyadh('11:55'));
  await run(riyadh('12:00'));
  assert.deepEqual(sent.map(s=>s.token),['fresh']);
});

test('safeDay accepts only YYYY-MM-DD',()=>{
  assert.equal(safeDay('2026-11-15'),'2026-11-15');
  for(const v of ['2026-11-15T00:00','x',null,20261115])assert.equal(safeDay(v),null);
});

/**
 * #30 Smart Reminders — «نذكّرك عندما يفيدك التذكير، لا لمجرد مرور الوقت».
 * Runs every 15 minutes (Cron). For each device the cloud knows ONLY: the earliest due time (as synced by the device),
 * its time zone, the notification language and — for practice nudges — a yes/no opt-in and the last local DAY it practised.
 * No words, meanings, reviews, scores or FSRS data.
 *
 * Rules (initial hypotheses from #30, tuned after UAT):
 * - one notification per due event: the earliest due time the device synced. Cards due together are one notification;
 *   repeated/overlapping cron runs or retries never resend the same event (atomic claim before sending);
 * - quiet hours 00:00–09:00 device-local time: nothing is sent; a due that happened then is sent after 09:00 as «later»;
 * - at most 3 notifications per local day, at least 3 hours apart; anything beyond waits (FSRS dates never change);
 * - a stale due is never sent: after a review the device syncs a later due time and the old event no longer matches;
 * - a transient push failure releases the claim so the next run retries; a gone subscription is deleted;
 * - practice nudge (migration 0003): at most ONE per local day, only inside the practice windows 10–12, 18–20, 21–23 local,
 *   only if the device opted in and has something to practise, never on a day it already practised, and never while a
 *   review is due (due reviews always win). It counts toward the same daily cap and cooldown.
 */
export type Statement={bind:(...values:unknown[])=>Statement;run:()=>Promise<{meta:{changes:number}}>;first:<T>()=>Promise<T|null>;all:<T>()=>Promise<{results:T[]}>};
export type D1Database={prepare:(sql:string)=>Statement};
export type ReminderRow={token_hash:string;endpoint:string;p256dh:string;auth_key:string;next_due_at:string|null;time_zone:string|null;locale:string|null;
  last_sent_at:number|null;sent_day:string|null;sent_count:number|null;notified_due_at:string|null;
  practice_ok?:number|null;last_practice_day?:string|null;practice_sent_day?:string|null};
export type Kind='due'|'later'|'practice';
export type Outcome='sent'|'gone'|'failed';
export type Message={title:string;body:string;url:string};

export const REMINDER={everyMinutes:15,quietEndHour:9,dailyCap:3,cooldownMs:3*3_600_000,lateMs:45*60_000,batch:500} as const;
/** Local hours [from, to) in which a practice nudge may be sent (#30 §3 — initial hypotheses, not measured alertness). */
export const PRACTICE_WINDOWS:readonly (readonly [number,number])[]=[[10,12],[18,20],[21,23]];
export const DEFAULT_ZONE='Asia/Riyadh';

/** A valid IANA time zone or the default. Never throws. */
export function safeZone(tz:unknown):string{
  if(typeof tz!=='string'||!tz||tz.length>64)return DEFAULT_ZONE;
  try{new Intl.DateTimeFormat('en-US',{timeZone:tz});return tz;}catch{return DEFAULT_ZONE;}
}
export const safeLocale=(l:unknown):'ar'|'en'=>l==='en'?'en':'ar';
/** A local calendar day YYYY-MM-DD, or null. */
export const safeDay=(d:unknown):string|null=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)?d:null;
/** Local calendar day (YYYY-MM-DD) and hour (0–23) at `at` in `tz`. */
export function localParts(at:Date,tz:string):{day:string;hour:number}{
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(at).map(x=>[x.type,x.value]));
  return {day:`${p.year}-${p.month}-${p.day}`,hour:Number(p.hour)%24};
}

type DecideRow=Pick<ReminderRow,'next_due_at'|'time_zone'|'last_sent_at'|'sent_day'|'sent_count'|'notified_due_at'|'practice_ok'|'last_practice_day'|'practice_sent_day'>;
/** Pure decision for one device at `now`: what to send, or nothing. The claim re-checks it atomically in SQL. */
export function decide(row:DecideRow,now:Date):{kind:Kind;due:string;day:string}|null{
  const due=row.next_due_at,t=now.getTime();
  const dueMs=due?Date.parse(due):NaN,isDue=due!=null&&Number.isFinite(dueMs)&&dueMs<=t;
  if(isDue&&row.notified_due_at===due)return null;             // this due event was already notified (and still blocks practice)
  if(!isDue&&row.practice_ok!==1)return null;                  // nothing due, no practice opt-in
  const {day,hour}=localParts(now,safeZone(row.time_zone));
  if(hour<REMINDER.quietEndHour)return null;                   // quiet hours: wait until 09:00 local
  if(row.last_sent_at!=null&&t-row.last_sent_at<REMINDER.cooldownMs)return null;
  if(row.sent_day===day&&(row.sent_count??0)>=REMINDER.dailyCap)return null;
  if(isDue)return {kind:t-dueMs>REMINDER.lateMs?'later':'due',due:due!,day};
  // Practice nudge — lower priority, only when nothing is due.
  if(row.practice_sent_day===day||row.last_practice_day===day)return null;
  if(!PRACTICE_WINDOWS.some(([a,b])=>hour>=a&&hour<b))return null;
  return {kind:'practice',due:due??'',day};
}

/** Verbal identity (#30): short, calm, Saudi-light Arabic / plain English, one call to action, no counts, no words, no emoji. */
export const MESSAGES:Record<'ar'|'en',Record<Kind,{title:string;body:string}>>={
  ar:{due:{title:'حان وقت المراجعة',body:'كلماتك جاهزة للمراجعة. كم دقيقة وتكمل!'},later:{title:'مراجعتك جاهزة',body:'عندك كلمات للمراجعة. نبدأ؟'},
    practice:{title:'تمرين خفيف؟',body:'ثلاث دقائق قراءة أو استماع تكفي اليوم.'}},
  en:{due:{title:'Time to review',body:'Your words are ready. A few minutes and you’re done!'},later:{title:'Your review is ready',body:'You have words to review. Shall we start?'},
    practice:{title:'Quick practice?',body:'Three minutes of reading or listening is enough today.'}},
};
/** Where a tap lands: reviews open Home (Review is one tap away); practice opens the library to pick a text. */
export const URLS:Record<Kind,string>={due:'/',later:'/',practice:'/#/library'};
export const messageFor=(locale:unknown,kind:Kind):Message=>({...MESSAGES[safeLocale(locale)][kind],url:URLS[kind]});

/** Devices that may get something now. Devices still in their cooldown are filtered in SQL so a large waiting set can't
 *  starve the batch; least-recently-notified first. ?1 = now (ISO), ?2 = cooldown cut-off (ms). */
export const CANDIDATES_SQL=`SELECT token_hash,endpoint,p256dh,auth_key,next_due_at,time_zone,locale,last_sent_at,sent_day,sent_count,notified_due_at,
    practice_ok,last_practice_day,practice_sent_day
  FROM push_devices WHERE (last_sent_at IS NULL OR last_sent_at<=?2) AND (
    (next_due_at IS NOT NULL AND next_due_at<=?1 AND (notified_due_at IS NULL OR notified_due_at<>next_due_at))
    OR (practice_ok=1 AND (next_due_at IS NULL OR next_due_at>?1)))
  ORDER BY COALESCE(last_sent_at,0),next_due_at LIMIT ${REMINDER.batch}`;
/** For a database with 0002 but not yet 0003 (no practice columns): due reminders only. */
export const CANDIDATES_SQL_0002=`SELECT token_hash,endpoint,p256dh,auth_key,next_due_at,time_zone,locale,last_sent_at,sent_day,sent_count,notified_due_at
  FROM push_devices WHERE (last_sent_at IS NULL OR last_sent_at<=?2) AND next_due_at IS NOT NULL AND next_due_at<=?1
    AND (notified_due_at IS NULL OR notified_due_at<>next_due_at)
  ORDER BY COALESCE(last_sent_at,0),next_due_at LIMIT ${REMINDER.batch}`;
/** D1/SQLite error for a column a not-yet-applied migration would add. */
export const missingColumn=(e:unknown)=>/no such column|has no column/i.test(String((e as Error)?.message??e));

/** Atomic claim: succeeds for exactly one run, and only if the due event, cooldown and daily cap still allow it. */
const CLAIM_SQL=`UPDATE push_devices SET notified_due_at=?1,last_sent_at=?2,
    sent_count=CASE WHEN sent_day=?3 THEN COALESCE(sent_count,0)+1 ELSE 1 END,sent_day=?3
  WHERE token_hash=?4 AND next_due_at=?1 AND (notified_due_at IS NULL OR notified_due_at<>?1)
    AND (last_sent_at IS NULL OR last_sent_at<=?5) AND (sent_day IS NULL OR sent_day<>?3 OR COALESCE(sent_count,0)<?6)`;
/** Undo our own claim after a transient failure, so the next run retries (only if nothing else changed it since). */
const RELEASE_SQL=`UPDATE push_devices SET notified_due_at=?1,last_sent_at=?2,sent_count=?3,sent_day=?4
  WHERE token_hash=?5 AND notified_due_at=?6 AND last_sent_at=?7`;
/** Practice claim: once per local day, only while nothing is due; same cooldown and cap.
 *  ?1 day ?2 now(ms) ?3 token ?4 cooldown cut-off ?5 cap ?6 now(ISO) */
const CLAIM_PRACTICE_SQL=`UPDATE push_devices SET practice_sent_day=?1,last_sent_at=?2,
    sent_count=CASE WHEN sent_day=?1 THEN COALESCE(sent_count,0)+1 ELSE 1 END,sent_day=?1
  WHERE token_hash=?3 AND practice_ok=1 AND (practice_sent_day IS NULL OR practice_sent_day<>?1)
    AND (last_practice_day IS NULL OR last_practice_day<>?1) AND (next_due_at IS NULL OR next_due_at>?6)
    AND (last_sent_at IS NULL OR last_sent_at<=?4) AND (sent_day IS NULL OR sent_day<>?1 OR COALESCE(sent_count,0)<?5)`;
const RELEASE_PRACTICE_SQL=`UPDATE push_devices SET practice_sent_day=?1,last_sent_at=?2,sent_count=?3,sent_day=?4
  WHERE token_hash=?5 AND practice_sent_day=?6 AND last_sent_at=?7`;

export async function runReminders(db:D1Database,now:Date,send:(row:ReminderRow,msg:Message)=>Promise<Outcome>):Promise<{sent:number;skipped:number;failed:number;gone:number}>{
  const stats={sent:0,skipped:0,failed:0,gone:0},t=now.getTime(),cut=t-REMINDER.cooldownMs,iso=now.toISOString();
  let results:ReminderRow[];
  try{({results}=await db.prepare(CANDIDATES_SQL).bind(iso,cut).all<ReminderRow>());}
  catch(e){if(!missingColumn(e))throw e;console.warn('Reminders: migration 0003 not applied, due reminders only');({results}=await db.prepare(CANDIDATES_SQL_0002).bind(iso,cut).all<ReminderRow>());}
  for(const row of results){
    const d=decide(row,now);if(!d){stats.skipped++;continue;}
    try{
      const claim=d.kind==='practice'
        ?await db.prepare(CLAIM_PRACTICE_SQL).bind(d.day,t,row.token_hash,cut,REMINDER.dailyCap,iso).run()
        :await db.prepare(CLAIM_SQL).bind(d.due,t,d.day,row.token_hash,cut,REMINDER.dailyCap).run();
      if(!claim.meta.changes){stats.skipped++;continue;}
      let outcome:Outcome;
      try{outcome=await send(row,messageFor(row.locale,d.kind));}catch{outcome='failed';}
      if(outcome==='sent')stats.sent++;
      else if(outcome==='gone'){stats.gone++;await db.prepare('DELETE FROM push_devices WHERE token_hash=?1').bind(row.token_hash).run();}
      else if(d.kind==='practice'){stats.failed++;await db.prepare(RELEASE_PRACTICE_SQL).bind(row.practice_sent_day??null,row.last_sent_at,row.sent_count??0,row.sent_day,row.token_hash,d.day,t).run();}
      else{stats.failed++;await db.prepare(RELEASE_SQL).bind(row.notified_due_at,row.last_sent_at,row.sent_count??0,row.sent_day,row.token_hash,d.due,t).run();}
    }catch(e){stats.failed++;console.warn('Reminder error',e);}
  }
  return stats;
}

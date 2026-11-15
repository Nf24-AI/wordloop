/**
 * #30 Smart Reminders — «نذكّرك عندما يفيدك التذكير، لا لمجرد مرور الوقت».
 * Runs every 15 minutes (Cron). For each device the cloud knows ONLY: the earliest due time (as synced by the device),
 * its time zone and the notification language. No words, meanings, reviews or FSRS data.
 *
 * Rules (initial hypotheses from #30, tuned after UAT):
 * - one notification per due event: the earliest due time the device synced. Cards due together are one notification;
 *   repeated/overlapping cron runs or retries never resend the same event (atomic claim before sending);
 * - quiet hours 00:00–09:00 device-local time: nothing is sent; a due that happened then is sent after 09:00 as «later»;
 * - at most 3 notifications per local day, at least 3 hours apart; anything beyond waits (FSRS dates never change);
 * - a stale due is never sent: after a review the device syncs a later due time and the old event no longer matches;
 * - a transient push failure releases the claim so the next run retries; a gone subscription is deleted.
 * Practice nudges are NOT sent yet: Practice (#21–#23) doesn't exist, so a nudge would lead nowhere.
 */
export type Statement={bind:(...values:unknown[])=>Statement;run:()=>Promise<{meta:{changes:number}}>;first:<T>()=>Promise<T|null>;all:<T>()=>Promise<{results:T[]}>};
export type D1Database={prepare:(sql:string)=>Statement};
export type ReminderRow={token_hash:string;endpoint:string;p256dh:string;auth_key:string;next_due_at:string|null;time_zone:string|null;locale:string|null;
  last_sent_at:number|null;sent_day:string|null;sent_count:number|null;notified_due_at:string|null};
export type Kind='due'|'later';
export type Outcome='sent'|'gone'|'failed';

export const REMINDER={everyMinutes:15,quietEndHour:9,dailyCap:3,cooldownMs:3*3_600_000,lateMs:45*60_000,batch:500} as const;
export const DEFAULT_ZONE='Asia/Riyadh';

/** A valid IANA time zone or the default. Never throws. */
export function safeZone(tz:unknown):string{
  if(typeof tz!=='string'||!tz||tz.length>64)return DEFAULT_ZONE;
  try{new Intl.DateTimeFormat('en-US',{timeZone:tz});return tz;}catch{return DEFAULT_ZONE;}
}
export const safeLocale=(l:unknown):'ar'|'en'=>l==='en'?'en':'ar';
/** Local calendar day (YYYY-MM-DD) and hour (0–23) at `at` in `tz`. */
export function localParts(at:Date,tz:string):{day:string;hour:number}{
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(at).map(x=>[x.type,x.value]));
  return {day:`${p.year}-${p.month}-${p.day}`,hour:Number(p.hour)%24};
}

/** Pure decision for one device at `now`: what to send, or nothing. The claim re-checks it atomically in SQL. */
export function decide(row:Pick<ReminderRow,'next_due_at'|'time_zone'|'last_sent_at'|'sent_day'|'sent_count'|'notified_due_at'>,now:Date):{kind:Kind;due:string;day:string}|null{
  const due=row.next_due_at;if(!due)return null;
  const dueMs=Date.parse(due),t=now.getTime();
  if(!Number.isFinite(dueMs)||dueMs>t)return null;            // not due yet
  if(row.notified_due_at===due)return null;                    // this due event was already notified
  const {day,hour}=localParts(now,safeZone(row.time_zone));
  if(hour<REMINDER.quietEndHour)return null;                   // quiet hours: wait until 09:00 local
  if(row.last_sent_at!=null&&t-row.last_sent_at<REMINDER.cooldownMs)return null;
  if(row.sent_day===day&&(row.sent_count??0)>=REMINDER.dailyCap)return null;
  return {kind:t-dueMs>REMINDER.lateMs?'later':'due',due,day};
}

/** Verbal identity (#30): short, calm, Saudi-light Arabic / plain English, one call to action, no counts, no words, no emoji. */
export const MESSAGES:Record<'ar'|'en',Record<Kind,{title:string;body:string}>>={
  ar:{due:{title:'حان وقت المراجعة',body:'كلماتك جاهزة للمراجعة. كم دقيقة وتكمل!'},later:{title:'مراجعتك جاهزة',body:'عندك كلمات للمراجعة. نبدأ؟'}},
  en:{due:{title:'Time to review',body:'Your words are ready. A few minutes and you’re done!'},later:{title:'Your review is ready',body:'You have words to review. Shall we start?'}},
};
export const messageFor=(locale:unknown,kind:Kind)=>MESSAGES[safeLocale(locale)][kind];

export const CANDIDATES_SQL=`SELECT token_hash,endpoint,p256dh,auth_key,next_due_at,time_zone,locale,last_sent_at,sent_day,sent_count,notified_due_at
  FROM push_devices WHERE next_due_at IS NOT NULL AND next_due_at<=?1 AND (notified_due_at IS NULL OR notified_due_at<>next_due_at)
  ORDER BY next_due_at LIMIT ${REMINDER.batch}`;
/** Atomic claim: succeeds for exactly one run, and only if the due event, cooldown and daily cap still allow it. */
const CLAIM_SQL=`UPDATE push_devices SET notified_due_at=?1,last_sent_at=?2,
    sent_count=CASE WHEN sent_day=?3 THEN COALESCE(sent_count,0)+1 ELSE 1 END,sent_day=?3
  WHERE token_hash=?4 AND next_due_at=?1 AND (notified_due_at IS NULL OR notified_due_at<>?1)
    AND (last_sent_at IS NULL OR last_sent_at<=?5) AND (sent_day IS NULL OR sent_day<>?3 OR COALESCE(sent_count,0)<?6)`;
/** Undo our own claim after a transient failure, so the next run retries (only if nothing else changed it since). */
const RELEASE_SQL=`UPDATE push_devices SET notified_due_at=?1,last_sent_at=?2,sent_count=?3,sent_day=?4
  WHERE token_hash=?5 AND notified_due_at=?6 AND last_sent_at=?7`;

export async function runReminders(db:D1Database,now:Date,send:(row:ReminderRow,msg:{title:string;body:string})=>Promise<Outcome>):Promise<{sent:number;skipped:number;failed:number;gone:number}>{
  const stats={sent:0,skipped:0,failed:0,gone:0},t=now.getTime();
  const {results}=await db.prepare(CANDIDATES_SQL).bind(now.toISOString()).all<ReminderRow>();
  for(const row of results){
    const d=decide(row,now);if(!d){stats.skipped++;continue;}
    try{
      const claim=await db.prepare(CLAIM_SQL).bind(d.due,t,d.day,row.token_hash,t-REMINDER.cooldownMs,REMINDER.dailyCap).run();
      if(!claim.meta.changes){stats.skipped++;continue;}
      let outcome:Outcome;
      try{outcome=await send(row,messageFor(row.locale,d.kind));}catch{outcome='failed';}
      if(outcome==='sent')stats.sent++;
      else if(outcome==='gone'){stats.gone++;await db.prepare('DELETE FROM push_devices WHERE token_hash=?1').bind(row.token_hash).run();}
      else{stats.failed++;await db.prepare(RELEASE_SQL).bind(row.notified_due_at,row.last_sent_at,row.sent_count??0,row.sent_day,row.token_hash,d.due,t).run();}
    }catch(e){stats.failed++;console.warn('Reminder error',e);}
  }
  return stats;
}

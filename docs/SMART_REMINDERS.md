# Smart Reminders (#30): design and staging rollout

The idea is «نذكّرك عندما يفيدك التذكير، لا لمجرد مرور الوقت». This replaces the old single 20:00 Riyadh reminder, which used `last_sent_day`.

## Behaviour (first hypotheses from #30, to be tuned after UAT)

| Rule | Value |
|---|---|
| Check frequency | Cron `*/15 * * * *` (96 runs/day); delivery is near the due time, not to the second |
| Grouping | The device syncs only its **earliest** due time. Everything due together → **one** notification |
| Idempotency | Key = the due event (`notified_due_at`). It is checked in the query, in `decide()`, and in the atomic `UPDATE … WHERE` claim before sending |
| Stale dues | After a review, archive or add, the app re-syncs `nextDueAt`. A due the server knows is gone is never sent |
| Quiet hours | 00:00–09:00 **device-local**. A night-time due is sent after 09:00 with the calm «later» copy |
| Daily cap / cooldown | 3 per local day, ≥ 3 h apart. Extra dues wait; FSRS `dueAt` is never changed |
| Failures | Transient: the claim is released and the next run retries. `gone`: the subscription is deleted |
| Practice nudges | At most **1 a day**, only in the local windows 10–12, 18–20, 21–23, only when **nothing is due** (a due review — even one already notified — always wins), only if the device has at least one Learning Passage and the learner kept «اقتراح تمرين خفيف» on, and never on a day the learner already finished a practice session. Same cap and cooldown as reviews. Opens «مكتبتي». Needs migration 0003; without it the Worker sends due reminders only |
| Starvation | Devices still in their 3 h cooldown are filtered in SQL; candidates are ordered least-recently-notified first, so a large waiting set can't push new due events out of the 500-row batch |
| Schema safety | `/api/push/sync` tries the newest columns first and falls back (0003 → 0002 → original) on `no such column`, so deploying before a migration never breaks enabling notifications |

The copy follows the verbal identity in #30. It lives in `worker/reminders.ts` → `MESSAGES` and is tested.

| Reason | Arabic | English |
|---|---|---|
| Due | «حان وقت المراجعة» — «كلماتك جاهزة للمراجعة. كم دقيقة وتكمل!» | Time to review — Your words are ready. A few minutes and you’re done! |
| Later (waited for quiet hours, cooldown or cap) | «مراجعتك جاهزة» — «عندك كلمات للمراجعة. نبدأ؟» | Your review is ready — You have words to review. Shall we start? |
| Practice | «تمرين خفيف؟» — «ثلاث دقائق قراءة أو استماع تكفي اليوم.» | Quick practice? — Three minutes of reading or listening is enough today. |

The copy has no word text, no counts and no emoji. The notification language follows the app's interface language, which is synced with the subscription. It is not the learning language.

## Data in D1 (minimal, anonymous)

Existing columns: subscription endpoint and keys, the token hash, `next_due_at`, `updated_at`, `last_test_at`.

New columns:

| Column | Holds |
|---|---|
| `time_zone` | IANA zone |
| `locale` | `ar` or `en` |
| `notified_due_at` | Idempotency key |
| `last_sent_at` | Time of the last reminder |
| `sent_day` | Local day the counter refers to |
| `sent_count` | Reminders sent that day |
| `practice_ok` (0003) | 1 if practice suggestions are on **and** the device has a text to practise |
| `last_practice_day` (0003) | Device-local date (YYYY-MM-DD) of the last finished practice session — no scores, no content |
| `practice_sent_day` (0003) | Local day a practice nudge was sent (max 1/day) |

There are **no** terms, meanings, examples, reviews or FSRS state. A test asserts the schema has no such columns. Settings → Privacy explains these fields. Several devices each hold their own anonymous row, and each is reminded independently.

## Rollout on staging (owner action, explicit approval required by #30)

1. **Apply the additive migration first.** It is safe with the current Worker, which ignores the new columns:
   ```
   npx wrangler d1 execute wordloop-push-staging --remote --file=worker/migrations/0002_smart_reminders.sql
   ```
   ```
   npx wrangler d1 execute wordloop-push-staging --remote --file=worker/migrations/0003_practice_reminders.sql
   ```
   Check the result with `npx wrangler d1 execute wordloop-push-staging --remote --command "PRAGMA table_info(push_devices)"`. It should list `time_zone`, `locale`, `notified_due_at`, `last_sent_at`, `sent_day`, `sent_count`, `practice_ok`, `last_practice_day`, `practice_sent_day`. Never run these against `wordloop-push` (Production).
2. **Merge the PR into `staging`.** Workers Builds deploys `wordloop-staging` with the new Cron and code.
   - Deployed **before** step 1: `/api/push/sync` still works (it falls back to the older columns); the 15-minute job logs an error and sends nothing until 0002 is applied; without 0003 it sends due reminders only.
   - No data is lost either way.
3. **UAT on an iPhone PWA:**
   - Add a card and let it become due. A reminder should arrive within about 15 min.
   - Review it. No repeat should arrive.
   - Night-time due: the reminder should arrive after 09:00.
   - Cap: no more than 3 a day.
   - Copy in AR and EN.

**Rollback:** revert the PR, which restores `0 17 * * *` and the old `daily()`. The new columns (0002 and 0003) can stay, because the old code ignores them and `last_sent_day` was kept. No `DROP COLUMN` is needed.

**Known limits (documented, accepted for UAT):** a review done offline reaches the server only on the next online sync, so a reminder may arrive for cards already reviewed offline; each device of the same learner is reminded independently (devices don't know about each other); a learner who ignores a due reminder gets no repeat for the same due event until the app syncs a new one (owner decision pending in PR #40).

**Cost (estimate, verify in the dashboard):**
- **Cron:** 96 invocations/day.
- **Reads:** each run is 1 indexed `SELECT` (`next_due_at`), limited to 500 rows.
- **Writes:** 1 `UPDATE` per reminder actually sent.
- **Per device:** at most 3 sends a day, so writes stay tiny.

This fits well inside the Workers/D1 free-tier daily limits for a personal app.

**Production** (the `main` Worker and the production D1) is untouched and needs its own approval and migration.

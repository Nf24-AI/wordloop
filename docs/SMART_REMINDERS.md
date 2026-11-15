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
| Practice nudges | **Not sent yet.** Practice (#21–#23) doesn't exist, so a nudge would lead nowhere. They come with Practice: at most 1 a day, never instead of a due review |

The copy follows the verbal identity in #30. It lives in `worker/reminders.ts` → `MESSAGES` and is tested.

| Reason | Arabic | English |
|---|---|---|
| Due | «حان وقت المراجعة» — «كلماتك جاهزة للمراجعة. كم دقيقة وتكمل!» | Time to review — Your words are ready. A few minutes and you’re done! |
| Later (waited for quiet hours, cooldown or cap) | «مراجعتك جاهزة» — «عندك كلمات للمراجعة. نبدأ؟» | Your review is ready — You have words to review. Shall we start? |

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

There are **no** terms, meanings, examples, reviews or FSRS state. A test asserts the schema has no such columns. Settings → Privacy explains these fields. Several devices each hold their own anonymous row, and each is reminded independently.

## Rollout on staging (owner action, explicit approval required by #30)

1. **Apply the additive migration first.** It is safe with the current Worker, which ignores the new columns:
   ```
   npx wrangler d1 execute wordloop-push-staging --remote --file=worker/migrations/0002_smart_reminders.sql
   ```
   Check the result with `PRAGMA table_info(push_devices)`. It should list `time_zone`, `locale`, `notified_due_at`, `last_sent_at`, `sent_day` and `sent_count`.
2. **Merge the PR into `staging`.** Workers Builds deploys `wordloop-staging` with the new Cron and code.
   - If the code is deployed **before** step 1, the 15-minute job and `/api/push/sync` fail with "no such column".
   - No data is lost. Apply step 1 and they recover.
3. **UAT on an iPhone PWA:**
   - Add a card and let it become due. A reminder should arrive within about 15 min.
   - Review it. No repeat should arrive.
   - Night-time due: the reminder should arrive after 09:00.
   - Cap: no more than 3 a day.
   - Copy in AR and EN.

**Rollback:** revert the PR, which restores `0 17 * * *` and the old `daily()`. The new columns can stay, because the old code ignores them and `last_sent_day` was kept.

**Cost (estimate, verify in the dashboard):**
- **Cron:** 96 invocations/day.
- **Reads:** each run is 1 indexed `SELECT` (`next_due_at`), limited to 500 rows.
- **Writes:** 1 `UPDATE` per reminder actually sent.
- **Per device:** at most 3 sends a day, so writes stay tiny.

This fits well inside the Workers/D1 free-tier daily limits for a personal app.

**Production** (the `main` Worker and the production D1) is untouched and needs its own approval and migration.

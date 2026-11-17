# Staging push notifications: audit and operator runbook (#60 §B, #1/#2/#30)

The audit is read-only, done 2026-11-17 in the Cloudflare dashboard and the code. **No secret, Cron or D1 change was made.**

## 1. Current state of `wordloop-staging`
| Item | Found | Status |
|---|---|---|
| Active version | `2fef4b0d` = commit `94e0504` (#58). Workers Builds deploys every push to `staging` | OK |
| Cron | `*/15 * * * *` (from `wrangler.jsonc`) | OK |
| `VAPID_SUBJECT` | Present as an **encrypted secret**, so `wrangler deploy` keeps it | OK |
| `VAPID_PRIVATE_KEY` | **Missing** | **BLOCKER** |
| D1 `PUSH_DB` → `wordloop-push-staging` (`65707638-…`) | Bound. Query history shows the 0002 (`time_zone`, `locale`, `notified_due_at`, `last_sent_at`, `sent_day`, `sent_count`) and 0003 (`practice_ok`, `last_practice_day`, `practice_sent_day`) `ALTER`s and a later `pragma_table_info` check | Migrated. **Do not re-run** |
| Rate limiter `PUSH_LIMIT` | 60 / 60 s | OK |
| Production `wordloop-local-first` / D1 `wordloop-push` | Not touched | OK |

While `VAPID_PRIVATE_KEY` is missing:
- `GET /api/push/key` returns 503, so «فعّل التذكير» says notifications aren't set up yet.
- The Cron handler returns immediately (`reminders()` checks the key first).
- Nothing is sent, and nothing breaks.

## 2. How the key works (why one secret is enough)
`@codefusion-cc/web-push` keeps the VAPID key as **one private JWK**. The Worker derives the public key from it (`loadVapidKey(...).publicKey`) and serves it at `/api/push/key`, and the browser subscribes with that. So the public and private halves **cannot** get out of step, and no public key is stored anywhere. A `{publicKey,privateKey}` pair whose halves don't match is refused at load.

**A new key ends every existing subscription.** Staging has none that work yet, so nothing is lost. Production's key is separate and must not be reused.

## 3. Operator steps (owner only; needs the owner's explicit approval first)
The key goes from the generator straight into the secret. It is never shown, typed or saved to a file. Only the public half is printed, and it is not secret.
```powershell
# In a clone of Nf24-AI/wordloop on branch staging (wrangler.jsonc name = wordloop-staging)
npm ci
npx wrangler login                     # the owner's Cloudflare account, in the browser
npx wrangler whoami                    # check the account before going on
npx codefusion-vapid | npx wrangler secret put VAPID_PRIVATE_KEY --name wordloop-staging
npx wrangler secret list --name wordloop-staging   # expect VAPID_PRIVATE_KEY and VAPID_SUBJECT (names only)
```
- `--name wordloop-staging` targets the staging Worker. **Never** run this against `wordloop-local-first` (Production).
- `secret put` makes a new version with the same code, so no rebuild is needed.
- Don't paste the key into chat, issues, commits or logs. Don't use the dashboard's text box, which would put the key on screen.
- Rollback: `npx wrangler secret delete VAPID_PRIVATE_KEY --name wordloop-staging` goes back to «not set up». Nothing else changes.
- `VAPID_SUBJECT` must be a `mailto:` or `https:` contact. Apple refuses pushes without a valid one. If unsure, set it again with `npx wrangler secret put VAPID_SUBJECT --name wordloop-staging`.

## 4. Cloudflare Access (OTP) compatibility
- The page and `/api/*` are same-origin, so requests carry the Access cookie. The Cron handler and the push services don't pass through Access. Delivery doesn't depend on the learner's session.
- **Fixed in this PR:** when the Access session has expired, Access redirects `/api/*` to its login page. Before, `fetch` followed the redirect cross-origin and Safari showed an opaque «Load failed». Now `src/net.ts` stops at the redirect and says, in Arabic or English, to reload and sign in again (`tests/push-access.test.mjs`). Offline is reported as offline.
- A tapped notification opens `/` (due) or `/#/words/practice` (practice nudge). If Access has expired, the OTP page appears first, then the app.

## 5. iPhone UAT (all PENDING until the owner reports PASS/FAIL with the time and the staging SHA)
Before starting: section 3 is done, iOS 16.4 or later, and the app is **installed from Safari → Share → Add to Home Screen**. Push only exists in the installed app, not in a Safari tab.

| ID | Steps | Expected |
|---|---|---|
| N1 | Open the installed app → Settings → «فعّل التذكير» → Allow | Permission prompt shows, then «enabled». No error |
| N2 | «جرّب التذكير» | A notification arrives within ~10 s, titled «WordLoop جاهز ✨». A second try within 60 s says «جرب مرة أخرى بعد دقيقة» |
| N3 | Lock the phone and wait for a card's due time (outside 00:00–09:00 local) | Within 15 min: «حان وقت المراجعة». Tapping it opens Home |
| N4 | Review that card so the next due moves later | No second notification for the old due time |
| N5 | Have a due time fall between 00:00 and 09:00 | Nothing at night. After 09:00 you get «مراجعتك جاهزة» once |
| N6 | Several dues in one day | At most 3 per local day, at least 3 h apart |
| N7 | Have a text, nothing due, no practice today, in 10–12, 18–20 or 21–23 | At most one «تمرين خفيف؟» a day. Tapping opens the Practice hub. None on a day you finished a practice session |
| N8 | Settings → turn practice nudges off | No practice nudges. Due reminders continue |
| N9 | «أوقف التذكير» | No more notifications. The device row is removed |
| N10 | iOS Settings → WordLoop → Notifications off, then open the app | No crash, and the app says permission is off |
| N11 | Airplane mode → try enable/test | Clear offline message. After reconnecting, it works |
| N12 | Let the Access session expire (or sign out of Access), then «جرّب التذكير» | «انتهت جلسة الدخول…». After signing in again, it works |
| N13 | Two devices enabled | Each gets its own notifications, and disabling one leaves the other |
| N14 | Notification text | Never contains words, meanings, counts or scores |

Privacy: the D1 row holds only the hashed device token, the push endpoint/keys, the next due time, time zone, locale, the practice opt-in and the last practice day. No vocabulary.

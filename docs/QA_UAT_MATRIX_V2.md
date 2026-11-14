# WordLoop — QA/UAT Acceptance Matrix V2
**Date:** 2026-11-14 | **State:** TEST PLAN, not test execution or owner approval.
**Companion:** [Claude Implementation Brief V2](CLAUDE_IMPLEMENTATION_BRIEF_V2.md) and [Brand Guidelines](WORDLOOP_BRAND_GUIDELINES_V1.md).

This supersedes conflicting UI expectations in [QA_UAT_MATRIX.md](QA_UAT_MATRIX.md) where the old tests require a new-user card-type picker (#12). It does **not** delete the older test cases: compatible legacy content types still matter. **No test is marked PASS solely because an issue is written or code was merged on staging.**

## 0. Test prerequisites / release gate
- Target `staging`, never Production. Owner-only Cloudflare Access via Email OTP; separate D1/VAPID, not Production subscriptions.
- Test on **a clean Staging origin** and a **synthetic legacy fixture** with v1/v2 backups, multiple review events, mixed archival state, short-term FSRS schedules and old `contentType`.
- For device-dependent checks report device and browser actually used. Simulator/Playwright WebKit is **not** a real iPhone Push/voice test.
- Use controlled clock in tests. Evaluate `Asia/Riyadh` midnight plus user-local zone transitions for Push.
- Record status of each row as **PASS / FAIL / NOT TESTED / BLOCKED**, PR SHA, evidence and blocker. This file is a template, not a claim of tests passing.
- **P0 blockers:** any loss of words, orphan reviews, FSRS rescheduling without a real rating, broken old backup import, unauthorized exposure of word content, Staging auth bypass or unapproved Production promotion.

## 1. Baseline — existing staging features #2–#12
| ID | Pri | Case | Expected |
|---|---|---|---|
| BASE-01 | P0 | Audit staging SHA and #4–#12 implementation | Distinguish merged code from owner UAT; no duplicate rewrite of completed features |
| BASE-02 | P0 | Create cards, refresh, navigate hash routes, reopen PWA | Persisted cards display without false success; regression for previously reported missing card |
| BASE-03 | P0 | Save failure, full storage/quota, UI refresh failure | No false "saved", input retained for recovery |
| BASE-04 | P0 | Legacy v1/v2 backups: valid, malformed, oversize, orphan review | Valid imports preserve records; invalid files rejected before replacing any data |
| BASE-05 | P0 | Offline add/review, installed PWA update, data persistence | Content and histories survive; no network dependency for card data |
| BASE-06 | P0 | Unauthenticated Staging request to page/API/SW | Access denies as designed |
| BASE-07 | P0 | Rate limiting, invalid Push endpoints, cross-origin, oversized payloads | Secure rejection; no stored secrets or word content |
| BASE-08 | P1 | UI locale AR/EN, RTL/LTR, home metrics, + menu | Old changes behave correctly and report truthful counts |
| BASE-09 | P0 | Staging VAPID, OTP and iPhone PWA test | Explicit real device result; do not assume configured based on Worker deploy |
| BASE-10 | P1 | Existing #5 legacy type display and FSRS | Vocabulary/Phrase/Sentence/Idiom remain readable and scheduled; **do not require** selecting type in NEW Add UI |

## 2. Data model and migration — #15 and #26
| ID | Pri | Fixture / action | Expected |
|---|---|---|---|
| MIG-01 | P0 | Upgrade real old schema via synthetic IndexedDB fixture | All old cards mapped to safe default folder + deck, with original card IDs preserved |
| MIG-02 | P0 | Compare full review-event set before/after | Exact review links, grades, event times preserved, no duplicates/orphans |
| MIG-03 | P0 | Compare `dueAt`, `fsrsState`, `revision` before/after pure migration | No unexpected changes from schema migration, folder move or adding a meaning |
| MIG-04 | P0 | Import JSON backup v1 and v2 into fresh new app | Every old field retained: `meaning`, `translation`, `example`, `note`, `tag`, `contentType`, archive |
| MIG-05 | P0 | Export latest backup and re-import on clean origin | Folder/deck IDs, languages, meanings, reviews, FSRS and IDs round-trip |
| MIG-06 | P0 | Abort upgrade/restore midway, simulate quota failure | Atomic rollback or safe recoverability; no half-migrated state |
| MIG-07 | P1 | Create folders/decks, rename, move deck/card | Correct counts and references; moving a card never regrades FSRS |
| MIG-08 | P0 | Archive/delete non-empty deck/folder | Explicit safe behavior; never silent cascade of learning data |
| MIG-09 | P1 | Same-name folders/decks, missing/invalid association, cyclic/foreign IDs | Deterministic validation/recovery, no corrupted graph |
| MIG-10 | P1 | Deck has `contentLanguage=en-US`, `meaningLanguage=ar-SA`, then custom Spanish deck | Correct storage and optional per-card override; interface locale independent |
| MIG-11 | P0 | Convert single legacy `meaning` to `meanings[]` | First meaning retained exactly, >=1 nonempty meaning, no duplicate FSRS cards |
| MIG-12 | P1 | Edit card with two+ meanings; delete one; save/reopen/export | All remaining meanings maintained; no accidental card duplication |
| MIG-13 | P0 | Create 40 cards with mixed old types, due/archived and revision data; update app twice | Idempotent migration and stable schedules; no data loss offline |
| MIG-14 | P1 | Recompute earliest Push due after move/archive/review | New sync appropriate; no leaked user words |

## 3. Approved library/Add UX — #16/#25/#26/#9
| ID | Pri | Interaction | Expected |
|---|---|---|---|
| UX-01 | P1 | Open «مكتبتي» on iPhone-sized viewport | Title + description + search + 3 tabs + **two-column** folder cards + dashed add tile |
| UX-02 | P1 | Tap folder → deck → cards, back navigation | Scoped contents only; consistent breadcrumbs/navigation RTL/LTR |
| UX-03 | P1 | Query all cards and due filter | Search/filt count accurate, no made-up sample folders or statistics |
| UX-04 | P1 | From deck, tap Add | Correct deck selected once and both content/meaning languages inherited |
| UX-05 | P1 | Open new Add form | No mandatory picker for four content types; one content input + first meaning |
| UX-06 | P1 | Add meaning twice | Each meaning box matches content box shape, border, corners and language chip placement; same card |
| UX-07 | P1 | Example optional / save | Example absent until requested; exactly one clear Save action; actual DB commit before success |
| UX-08 | P1 | Add `show` / «يُظهر» / «عرض (فيلم، منتج)» and reopen | One card with two meanings, both visible during review and edit |
| UX-09 | P1 | View details for old word + old type | No repeated irrelevant internal stats/labels; edit and audio remain reachable |
| UX-10 | P1 | Delete via "more" | Requires confirmation, clear effect; no accidental hidden cascade |
| UX-11 | P1 | 320px/375px width, software keyboard, safe area, large text, screen reader | No clipping, reachable buttons, aria and focus coherent |
| UX-12 | P1 | Switch AR↔EN with English/Spanish content | UI direction changes, learner text and audio language do not invert/translate |

## 4. Scoped reviews, audio, Practice — #17/#19–#23
| ID | Pri | Case | Expected |
|---|---|---|---|
| REV-01 | P0 | 3 decks; review due cards of selected deck | No other-deck cards, no duplicate review event |
| REV-02 | P0 | Compare all/deck/folder counts before and after move/archive | Accurate active/due/upcoming counts; same FSRS schedule |
| REV-03 | P0 | Complete scheduled review, attempt free Study if offered | Only actual scored reviews affect FSRS; free study never implicitly grades |
| REV-04 | P1 | Due state empty vs nonempty | Honest user-facing text and actionable controls |
| AUD-01 | P1 | Spanish content `hola` in es-ES deck, English in en-US deck | Speech lang/voice selection follows content language, not UI locale |
| AUD-02 | P1 | Arabic meaning field and local voice absent | Arabic voice requested when available; if unavailable, no silent mispronunciation in English |
| AUD-03 | P1 | Rate/voice settings, installed iPhone PWA | Actual listening and usability QA on physical iPhone; report unsupported voices |
| PRAC-01 | P1 | Create/edit Learning Passage inside deck | Stored offline with proper language, backup round trip |
| PRAC-02 | P1 | Reading prompts from structured saved text/answers | No fabricated comprehension ground truth from arbitrary unstructured text |
| PRAC-03 | P1 | Listening/typing practice on real phone | Correct language voice/text comparison and clear feedback; no FSRS alteration |
| PRAC-04 | P1 | Play/use Practice offline where supported | Clear capability state; no surprise external network upload |

## 5. Smart Reminders — #30
| ID | Pri | Case | Expected |
|---|---|---|---|
| PUSH-01 | P1 | Next card due 11:10 user-local, cron check every 15m proposed | Eligible notification near due in next applicable processing window; not fixed 20:00 |
| PUSH-02 | P1 | 10 cards due in same short window | One grouped reminder without listing private terms |
| PUSH-03 | P0 | Repeated cron, concurrent workers, retries, partial failure | Idempotent claim; no duplicate same-due-event alerts |
| PUSH-04 | P1 | User reviews/archive card; sync succeeds before send | Stale reminder suppressed, counts/rescheduling unchanged |
| PUSH-05 | P1 | Study offline, sync delayed | Known stale-schedule limitations documented and minimized, no false exact-delivery claim |
| PUSH-06 | P1 | Quiet time 00:00–09:00 local, time-zone change and Riyadh midnight | Deferred nonurgent reminders; no missed/duplicated daily quota |
| PUSH-07 | P1 | At least four due/nudge triggers in a day | Proposed max 3 notifications/day; prioritizes due review over practice |
| PUSH-08 | P1 | Practice nudge after recent actual practice / in due window | No extra pointless practice nudge; max one/day |
| PUSH-09 | P0 | D1 schema and Worker payload/logs | Only minimal anonymous subscription/schedule/prefs; no term, meaning or full review history |
| PUSH-10 | P1 | Arabic and English push on iPhone lock screen | Short readable WordLoop verbal identity; no guilt, fake streak or fake data |
| PUSH-11 | P0 | Separate staging D1/VAPID and real PWA device permission | No Production device or account receives staging push; unsubscribing works |
| PUSH-12 | P1 | Cost/rate check across 96 cron ticks/day proposed | Limits, retry behavior and operational risks documented before change |

## 6. Deferred scope and brand quality
| ID | Pri | Verification | Expected |
|---|---|---|---|
| SCOPE-01 | P0 | Diff selected PR against listed in-scope issues | Future #18/#24/#27–#29 not implemented without separate owner authorization |
| SCOPE-02 | P0 | AI / OCR / file import / cloud TTS endpoints | No new service, upload or cost introduced by approved current phases |
| BRAND-01 | P1 | AR home/Add/Library/Push vs Brand Guidelines | Warm colors, correct fonts, multicolor loop, one CTA, quiet whitespace |
| BRAND-02 | P1 | Examples and error states | Saudi conversational language, action-oriented, truthful, no technical jargon |
| BRAND-03 | P1 | Vision/mission/marketing copy | No publication of *proposed* Brand Book strategy as if owner-approved |
| BRAND-04 | P1 | Accessibility | ≥4.5:1 body text contrast where applicable, touch sizes, reduce motion, screen-reader semantics |

## 7. Required test execution, evidence and reporting
Run (where supported by repo): `npm ci`, `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run build -- --mode staging`, `npm audit --omit=dev --audit-level=high`; run existing Cloudflare Worker/API and Access smoke tests as appropriate. Add automated regression cases before claiming features tested.

For each PR include the following fields:
- PR/commit SHA, linked issue number(s), exact scope and files.
- Migration fixtures and **before vs after checksums** for ID, dueAt, fsrsState and review history.
- Actual test commands with PASS/FAIL logs; failures and unresolved limitations.
- Screenshot/video evidence: 375×812 and 320px mobile, RTL/EN LTR, empty/populated.
- Real phone model/OS/browser for Push/voice; otherwise **NOT TESTED**.
- Staging Access and D1/Push isolation evidence.
- Owner UAT checklist with expected result, actual result and decision.
- Rollback limitations: releasing old code cannot necessarily undo a database schema upgrade; plan backward-compatible or reversible migration.

**The docs PR and this QA plan perform zero testing themselves. A green CI badge is not permission to deploy Production.**

# WordLoop — Claude Implementation Handoff
**Owner:** WordLoop Product Owner  
**Prepared by:** ChatGPT — product analysis, technical review, acceptance criteria  
**Status:** READY FOR IMPLEMENTATION (issues #4–#12); **#13 is Discovery only**  
**Base branch and PR target:** `staging`  
**Do NOT deploy to Production or merge `staging` wholesale into `main`.**

> This document is the implementation contract for the next development cycle. Source of truth: GitHub Issues #4–#13. Full verification plan: [QA_UAT_MATRIX.md](QA_UAT_MATRIX.md). Read both before editing code.

## 1. Goal and non-negotiables

Improve the Arabic-first, local-first vocabulary PWA while preserving *every existing user's words, reviews and FSRS scheduling*. Do not treat a visual improvement as permission to rebuild unrelated features.

**User-approved product requirements:**
- Four card kinds: **Vocabulary, Phrases, Sentences, Idioms**.
- Fix reported newly added card not appearing in Library (first establish reproducible cause).
- Clear settings cog and Arabic/English UI toggle.
- More meaningful, practical homepage information.
- Remove duplicate add CTAs; central bottom `+` opens actions: Add / Review / Practice (Practice is not implemented yet).
- Correct misleading review counters.
- Move homepage privacy note to Settings.
- Adapt Add UX to each type; Idioms need idiomatic meaning, context/example and plain-language explanation.
- Reading and listening Practice are **design discovery only** until approved.

**Must preserve:**
1. Local IndexedDB for all cards/reviews; no account, Supabase, cloud sync, analytics upload or AI-provider upload of vocabulary.
2. FSRS-7 behavior, scheduling/grade semantics, local time-safe review history. No Practice interactions may implicitly grade FSRS.
3. Compatible backup import from existing **version 1**; never silently clear/recreate IndexedDB.
4. Offline PWA, installability, accessibility, mobile Safari/iPhone as primary target; desktop responsive.
5. Existing Cloudflare push API and isolated Staging D1; never copy Production D1/VAPID resources.
6. Cloudflare Access email **OTP** for owner-only Staging; do not bypass/change it.
7. No feature launch to Production without staging UAT and explicit owner approval.

## 2. Current architecture, code audit and evidence

| File | Existing responsibility | Key finding / development guidance |
|---|---|---|
| `src/App.tsx` | ~545 lines, six hash-routed pages, home/add/review/library/stats/settings, bottom bar | Split into components/i18n cautiously; do not break hash navigation, focus, aria, keyboard |
| `src/data.ts` | IndexedDB `wordloop-local-v1`, stores `words`, `reviews`, `meta`; backups v1; FSRS-7 | Existing `Word` has no `contentType`; schema and backup migration needed |
| `src/push.ts` | Browser subscription and sync of earliest due time | Retain minimal push payload; keep API paths unchanged |
| `worker/index.ts` | Push endpoints, D1, cron, origin checks, rate-limit binding on Staging | Preserve protections; no new cloud storage for word text |
| `public/sw.js` | Offline shell, push handling | Do not wipe IndexedDB/local content; test upgrade and iPhone install |
| `public/manifest.webmanifest` | RTL, Arabic PWA metadata | UI language switch does not automatically localize a static manifest |
| `wrangler.jsonc` | **Staging-only** Worker, D1 binding, rate limiter | **Do not replace with Production settings or merge into `main`** |
| `.github/workflows/staging-quality.yml` | Typecheck, tests, audit, build, local smoke, Access denial | Must remain passing; add behavioral regression coverage |
| `docs/STAGING_UAT.md` | Access gate/release safety | Staging is online behind email OTP; VAPID private key and real-device push UAT pending |

**Concrete current behavior requiring care:**
- `AddPage.submit` in `src/App.tsx`: `await addWord(...)`, then immediately **clears fields and displays success**, then `await onSaved()`. If UI refresh subsequently fails, success is misleading; fix error/state semantics after investigation. The reported missing-item bug **is unverified**, do not assert a root cause until reproduced.
- `summary()` in `src/data.ts` returns `reviewedToday` as **number of review events**. That is valid for attempts, not unique cards.
- `HomePage` computes `weekAhead` from future `dueAt` values for next 7 days. Do not claim it currently counts repeated reviews; rename/clarify it.
- Current bottom middle `+` directly navigates to `add`, and homepage has another add nudge.
- Settings icon uses `Settings2`; `<div className="app" dir="rtl">` and UI strings are Arabic-only.
- Word duplicate check currently uses active `term` case-insensitive matching, with no distinction between content types.
- `reviewWord()` commits word and review transaction atomically; preserve revision checks and short-term FSRS learning.

## 3. Delivery batches and dependency graph

Make **one focused PR per batch** (or two small PRs for a large batch). Branch from latest `staging` for each; do not push straight to `main`. Every batch must have passing checks and a concise PR with screenshots and a test report.

| Order | Issues | Batch | Outcome |
|---|---|---|---|
| A — P0 | [#4](https://github.com/Nf24-AI/wordloop/issues/4) | Save / library consistency | Diagnosis, fix if reproduced, accurate save/error states, regression tests |
| B — P1 | [#5](https://github.com/Nf24-AI/wordloop/issues/5), [#12](https://github.com/Nf24-AI/wordloop/issues/12) | Four types + Add UX | Backward-compatible data model, type-specific form, Library/Review support |
| C — P1 | [#10](https://github.com/Nf24-AI/wordloop/issues/10) | Truthful metrics | Distinct reviewed cards vs attempt counts, clear due wording |
| D — P1 | [#8](https://github.com/Nf24-AI/wordloop/issues/8), [#9](https://github.com/Nf24-AI/wordloop/issues/9) | Home CTA / quick action menu | One primary CTA, accessible bottom `+` menu |
| E — P1 | [#6](https://github.com/Nf24-AI/wordloop/issues/6) | Localization + settings cog | AR/EN display and RTL/LTR switching without touching card text |
| F — P2 | [#11](https://github.com/Nf24-AI/wordloop/issues/11), [#7](https://github.com/Nf24-AI/wordloop/issues/7) | Privacy relocation + useful Home | Practical, data-grounded home content; privacy in Settings |
| Discovery | [#13](https://github.com/Nf24-AI/wordloop/issues/13) | Practice exploration | Wireflows, privacy/audio compatibility options, **no feature development yet** |

### Batch A — reported missing card (do not guess)
1. Reproduce on a fresh DB and an existing one: add first word, add second word, navigate to Library immediately, search/filter, refresh, background/foreground, offline.
2. Instrument local dev only (no user-data telemetry). Separate IndexedDB write failure, asynchronous refresh failure, stale React state, filter/sort confusion, duplicated term, archived state.
3. A successful save must be transactionally committed **and visibly reconciled** before declaring end-to-end success. Preserve drafts on true save failure; distinguish “saved but list could not refresh” from “not saved”.
4. Add deterministic tests covering new item persistence and refreshed list. If unreplicable, document evidence + add guard/test; don't fabricate a fix.

### Batch B — schema and add interface (explicit choices)
Canonical `contentType` values: `'vocabulary' | 'phrase' | 'sentence' | 'idiom'` (lowercase in storage; UI translations separate).
- Historical records without type **normalize as `vocabulary`** in memory and when re-saved; preserve review links `id`, due dates, FSRS state and revision.
- Use existing `term`, `meaning`, `example`, `translation`, `tag` fields where possible; an optional short `note` may capture Idiom explanation/context if needed. Avoid making existing optional fields mandatory for legacy words.
- Required fields for all: English expression/text (`term`), user-authored meaning in Arabic (`meaning`). Examples, sentence translation, notes and tags optional; for Idioms the UI should **explain idiomatic, nonliteral meaning** and invite a usage example.
- Term-length and other validations must support real sentences but have reasonable limits; if limits change, adjust UI `maxLength`, `addWord`, `validWord` and backup validation together.
- Duplicate policy: normalize case + extra whitespace **within the same type**; a phrase and idiom with identical text may coexist. Archived entries do not block reuse. No automatic destructive deduplication.
- New backups should be versioned (e.g. **v2**) and include type (and optional note). Both v1 and v2 import must be verified, with explicit safe normalization. Keep validation before destructive restore, including file-size bounds and no orphan reviews.
- IndexedDB version increment **only if needed by physical schema/index changes**; never rename/delete the local DB or clear stores merely to add a field.
- Library/search/type filters, review card display and backups must recognize all four kinds. FSRS algorithm and grade scheduling remain unchanged.

### Batch C — metrics definitions
- `cardsReviewedToday`: count distinct `wordId` among review events in current Asia/Riyadh calendar day.
- `reviewAttemptsToday`: count all review events that day (may repeat same card).
- `inLibrary`: active non-archived cards.
- `dueNow`: active cards with `dueAt <= now`.
- `scheduledNext7Days`: active cards with `now < dueAt <= now + 7 days`; call it upcoming/scheduled, not “reviewed” or “completed”.
- Display exactly labeled, understandable stats. **Test: one card repeated four times today → one distinct card, four attempts.** Archive and midnight timezone cases must be covered. Practice does not contribute to FSRS review counts.

### Batch D — navigation interaction
- Home: one emphasized CTA; if due cards exist → “ابدأ المراجعة”; otherwise → “أضف بطاقة” (including empty state).
- Keep useful navigation, eliminate redundant in-content add buttons, and retain access to Add via bottom `+`.
- `+` opens accessible quick action sheet/menu (Add, Review, Practice). Practice must be **disabled or clearly “قريبًا”** until approved/implemented, never navigate to an empty or broken page.
- Proper focus on open/close, Esc/back/outside dismiss, minimum 44 px touch targets, safe areas, Arabic/English labels and reasonable one-hand UX. No 3D or unrelated visual redesign.

### Batch E — localization
- Conventional cog `Settings` icon instead of `Settings2`.
- Locale setting `ar | en`, stored locally, default Arabic for existing users. Use a centralized typed translation dictionary (not hundreds of inline ternaries), including notifications, empty/error states, navigation, stats, settings and accessibility labels.
- The app shell updates `dir`/language. Respect RTL/LTR alignment of navigational UI, keep **English learning terms LTR** and do not translate the user's saved meaning/examples. Preserve Arabic product tone and accessible contrast.
- Date and plural formatting per selected locale; review scheduling remains anchored to absolute dates and Riyadh-local conventions already in code.
- PWA manifest is statically Arabic currently; document its limitation or implement safe manifest localization separately (avoid breaking install).

### Batch F — home/privacy
- Move “كلماتك تبقى على جهازك” explanation to **Settings → الخصوصية والبيانات**, but preserve an unobtrusive link to privacy in appropriate UI if needed.
- Truthful note: **vocabulary + review history are device-local**; optional Push sync shares subscription metadata and earliest due timestamp, never word texts.
- Home content should support decision/action: due-now, next scheduled review, last added card, one short curated language-learning tip (optional, no invented personal analytics). Avoid clutter. Check 0/1/many cards.

### Practice discovery — NOT build scope
Produce 2–3 comparison concepts for reading/listening with saved cards, assumptions about offline Speech Synthesis on iOS, audio quality and permissions, privacy tradeoffs, wireflows, examples, and UAT acceptance proposal. Await explicit owner decision; no third-party LLM or voice API by default.

## 4. Quality/release guardrails

Run:
```bash
npm ci
npm run typecheck
npm test
npm run build -- --mode staging
npm audit --omit=dev --audit-level=high
```
The existing GitHub staging workflow also tests local Worker HTTP endpoints and ensures anonymous users cannot access the Staging UI/API/SW.

**Do not** reset the IndexedDB database, modify Cloudflare Access policies, copy production push secrets/DB, turn off rate limiting or tests, or alter production deploy controls. Staging login uses authorized email + OTP. Production releases run via **`wrangler versions upload`**, not automatic deployment.

Review and satisfy each scenario in [QA_UAT_MATRIX.md](QA_UAT_MATRIX.md). For risks you cannot test locally (installed iPhone PWA, OTP/Push), provide a reproducible manual procedure rather than falsely marking PASS.

## 5. Required deliverables from Claude

For **each batch**:
1. A dedicated branch and PR **targeting `staging`** with issue links and why/how changes work.
2. Summary of changes, altered files, migrations and backward-compatibility impacts.
3. Automated regression tests (not just TypeScript/build) and pasted command results.
4. **Before/after screenshots** for relevant screens on iPhone-sized viewport; desktop screenshot as relevant. Include empty and populated states, AR/EN where applicable.
5. QA matrix with per-case PASS/FAIL/NOT TESTED, blockers and device/browser actually used. Never claim a real iPhone test unless performed on a real device.
6. Manual user acceptance steps that require no coding knowledge.
7. No secrets, credentials, OTPs, user word exports, analytics data or cloud uploads of vocabulary.
8. Stop and surface any data loss/security blocker immediately. No scope creep.
9. Do not mark GitHub issue Done until QA and owner acceptance; do not publish to production.

**Single most important product criterion:** an existing user's old words, review log and FSRS schedule must survive the upgrade **unchanged**, with a recoverable backup.

## 6. Work authorization

You may implement approved batches **A–F** in Staging, one PR at a time. You may prepare—but must not implement—Practice from #13 until product owner approves its UX scope. All production promotion requires owner approval after UAT.

**GitHub Issues index:** https://github.com/Nf24-AI/wordloop/issues  
**Staging (protected by OTP):** https://wordloop-staging.nf24-wordloop.workers.dev/  
**Production:** https://wordloop-local-first.nf24-wordloop.workers.dev/

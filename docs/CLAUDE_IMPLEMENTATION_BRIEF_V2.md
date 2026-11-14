# WordLoop — Claude Master Implementation Brief V2
**Prepared:** 2026-11-14 | **Status:** canonical planning handoff for approved backlog; implementation not started by this document.
**Implementation target:** feature branches → PRs into `staging` → test & owner UAT. **Never deploy Production without explicit product-owner consent.**
**Product principle:** **خطوات أقل، فعالية أكثر.** Reduce decisions without compromising trust, learning effectiveness, safety or clarity.

## 0. Read-first and order of authority
1. Explicit newer product-owner decisions in **current GitHub issue bodies**, including attached/approved image references, control over older UI requests.
2. This V2 contract and [QA matrix V2](QA_UAT_MATRIX_V2.md) reconcile the issue dependencies.
3. The [brand guidelines V1](WORDLOOP_BRAND_GUIDELINES_V1.md), the existing [voice system](VOICE_AND_DESIGN_SYSTEM.md), and current code are authoritative for the **implemented** brand system. Strategic prose marked "proposed" is not a brand decision.
4. Existing implementation documentation [V1 brief](CLAUDE_IMPLEMENTATION_BRIEF.md) and [V1 QA](QA_UAT_MATRIX.md) are useful **historical records** for #4–#12, **not instructions to undo newer designs**.
5. Live code + tests establish what is already delivered, not the "[To do]" string alone. Never report an issue implemented or QA-passed without evidence.

**Mandatory source files to review:** `src/data.ts`, `src/App.tsx`, `src/style.css`, `src/i18n.ts`, `src/push.ts`, `worker/index.ts`, `worker/schema.sql`, `public/sw.js`, `wrangler.jsonc`, `src/fonts/`, staging workflows, existing tests, backup fixtures, `docs/STAGING_UAT.md`.

**Current evidence at drafting time:** `staging` already contains batches of #4–#12 implementation merged on Nov 13, pending owner UAT. The code still renders type-based Add UX and holds a single `meaning` field, without Folder/Deck model. Current Worker cron `0 17 * * *` checks once at 20:00 Riyadh and `last_sent_day` limits alerts to one daily. These are old implementation details to evolve, not targets to freeze. Reaudit branch before writing code.

## 1. Hard constraints and product guarantees
- **Local-first:** learned terms, meanings, examples, archived state, full review history and FSRS scheduling stay in browser IndexedDB, not D1, logging, telemetry or a third-party LLM/voice API. No surprise Supabase/cloud accounts or word-sync feature.
- **Data integrity:** preserve existing card IDs, review links, timestamps, revisions, review history and FSRS-7 behavior; moving folders, adding meanings, changing interface language or viewing Practice must not regrade or reschedule a card.
- **Backups:** import v1 and v2 backup formats, export a documented new version including folder/deck assignments, meaning arrays and learning languages. Validate *before* destructive restore. Ensure transaction atomicity/rollback and no orphan reviews.
- **No hidden deletions:** deleting/archiving folders or decks containing cards requires an explicit, safe policy; offer move/archive rather than silent cascading delete.
- **Staging isolation:** Cloudflare Access owner email + OTP; distinct Staging Worker/D1/VAPID, no Production secrets/data. Existing Staging VAPID private key and real iPhone Push/OTP UAT remained unverified per #2 at latest review. Confirm actual state before push work.
- **Release:** no changes to Production Cloudflare environment, `main`, production D1, Access policies, or deployed Worker from a feature PR. Production requires security checks, owner iPhone UAT and **explicit approval**. Existing safe Production build uses `wrangler versions upload` (does not itself promote active version); do not alter this.
- **User experience:** AR-first/EN interface localization, RTL/LTR and text-direction correctness, keyboard+screen reader, touch targets ≥44 CSS px, safe-area and low visual noise. No brand redesign.
- **No unsupported claims:** numbers use real data; never call "Study all" a scheduled review or claim card mastery because content was viewed.

## 2. Execution sequence — one small tested PR at a time

| Phase | Priority | Issues | Scope and release checkpoint |
|---|---|---|---|
| **Gate 0: baseline & protection** | P0 | #2, #3, #4–#12 | Audit what is already in `staging`; verify CI, legacy save/restore, offline, login/Push staging setup and security. Existing #4–#12 are **Ready for UAT**, not newly unimplemented. Deliver gap report; no broad rewrites. |
| **1A: data model** | P1 | #15; interface with #19/#26 | Add Folder → Deck → Card associations, content/meaning languages, stable IDs, migration into default folder/deck, and versioned backups. Preserve v1/v2 restoration. Write migration tests **before UI**. |
| **1B: multi-meaning storage** | P1 | #26 data part + #15 | Add `meanings[]`, map legacy `meaning` losslessly, require ≥1 meaning, keep legacy contentType and other fields; **one FSRS card** for multiple meanings. Test save/edit/export/restore and legacy files. |
| **2A: library UX** | P1 | #16, #25, #9 contextual extension | Owner-approved "مكتبتي" layout: header, search, tabs (مجلدات/كل البطاقات/تنتظر مراجعة), **two-column mobile folder grid**, add-folder tile, folder→deck→cards, correct counts, simplified card details. Keep existing WordLoop identity. |
| **2B: one-step card add** | P1 | #26 UI; #12 superseded; #9 | One content box + identical-shape meaning boxes with short language chips inside, optional example on demand, clear primary save, inherited deck/language context. NO up-front Vocabulary/Phrase/Sentence/Idiom selection. Preserve the four legacy data types. |
| **3: review and speech** | P1 | #17, #19, #20 | Scoped **due** reviews for all/folder/deck using unchanged FSRS; real counts. Speech uses card/deck BCP-47 content language (not UI locale); quality/speed and actual iPhone voices tested. |
| **4: Smart Reminders** | P1 | #30; #1/#2 | Review reminders near due time, optional limited practice nudges, quiet hours, deduplication/idempotency, privacy and WordLoop tone. Do not change deployed Cron/production Push as part of docs or unapproved release. |
| **5: Practice** | P2 | #13, #21, #22, #23 | Learning Passage tied to deck, local/rule-based Reading and Listening, accuracy of questions, dependencies on voice, independent of FSRS. Deliver as separate product feature PRs with UAT. |
| **Deferred, NOT authorized now** | Future | #18, #24, #27–#29 | Q&A fifth card type, optional AI lesson, Continue Learning, bulk paste, and advanced sorting/selection. User approved the A/B **ideas for later**, not implementation in present cycle. Images/PDF/OCR C group is NOT approved. |

**Important nuance:** #16/#17's *core* folder/deck features are P1 and approved; **competitor-derived enhancements** to their issue bodies are later-scope. Start with the core, identify extras separately, obtain explicit priority authorization before including deferred extras.

### Phase 0 deliverable — do this BEFORE first code PR
Produce a table of status for each #4–#12: implemented on staging / untested / failing / conflicts with new decision. Record branch SHA and CI status. Check #2 owner-only OTP and isolated VAPID; #3 high/critical security blockers. Obtain test fixture backup (synthetic, not user's personal words). If real-device checks cannot be run, label **NOT TESTED** rather than PASS. Do not invent run results.

### Phase 1A and 1B — data migration contract
- Current `Word` in `src/data.ts` has `meaning: string`, `contentType`, `dueAt`, `fsrsState`, `revision`, and review history keyed by card ID. Expand carefully; normalization may support legacy display, but define **one canonical write schema**.
- Introduce local Folder and Deck entities with stable UUIDs, one folder per deck and one deck per card. Deck stores **content language + meaning language** independently from AR/EN interface language; optional per-card overrides. Default imported English language `en-US` where existing data warrants it; no word-level language inference from short text.
- The same card can have multiple meanings with one FSRS schedule, not duplicated cards. Legacy `meaning` becomes first `meanings[]` item without losing `translation`, `example`, `note`, `contentType`, `tag` or history.
- Upgrading from `wordloop-local-v1` IndexedDB and importing old JSON backups must not clear, silently rewrite reviews, reset the schedule or create duplicated IDs. Update validation, storage, export, backup version, offline, restore, concurrency and notification due sync coherently.
- Test old DB upgrade, v1/v2 imports and new-format round trip; failed upgrade/restore, quota exceeded, duplicate names, moving cards across decks, changing language, deletion safety. Keep a documented rollback/data recovery plan.

### Phase 2 — binding UX specification
**#16 library is a specific approved visual**, not a file explorer: title «مكتبتي», caption «نظّم ما تتعلمه في مكان واحد», search «ابحث عن مجلد أو حزمة أو بطاقة...», filters «المجلدات | كل البطاقات | تنتظر مراجعة», folder cards in **2 columns on standard iPhone width**, icon+name+true deck/card counts, a dashed «مجلد جديد» tile. Folder tap lists only its decks; deck tap shows its cards. Existing test examples such as «الإنجليزية» are illustrations only — never seed fake user folders/statistics.
**#26 Add UX:** inside deck, show inherited language badges (EN/ES for content, AR for meaning), audio action when available; each meaning box has **exactly the same shape, borders, corners and visual rhythm** as the content box. «+ إضافة معنى آخر» repeats the same meaning box; extra example remains hidden until chosen; one «حفظ» CTA. No four-card-type selection in the new Add UI. Context-aware Add retains deck destination automatically; external Add asks once if unavoidable.
**#25 Card details:** prioritize term/meaning/example/note, do not clutter with duplicate FSRS/technical metadata. Delete in "more" with confirmation. All fields and stored history remain accessible.

### Phase 3 — review and voice
- Reviews use due cards only, scoped all/folder/deck; only actual review ratings update FSRS. If no due cards, show truthful state.
- An eventual free study mode must **never** alter FSRS by default; this is not permission to build it now.
- `speechSynthesis` must pick the content or meaning language of the field; do not hardcode `en-US`. Voices/quality vary on iPhone; expose supported rate/voice options only when valuable. No paid/cloud TTS without separate consent. Don't claim voice testing from headless browser equals a real-device listening test.

### Phase 4 — notifications
- Current `wrangler.jsonc` has one 20:00 local reminder and server `last_sent_day`; fix the design only after reviewing Cloudflare costs, cron limits and reliability. Suggested check every **15 min**, not promised exact-second delivery.
- Due alerts near FSRS due time; coalesce multiple cards; no duplicate alert for same due event across retries; avoid stale alerts after synced review/archive.
- Practice nudges max one per day, with review priority; default quiet window **00:00–09:00 local**, proposed practice opportunities 10:00–12:00 / 18:00–20:00 / 21:00–23:00. Initial **overall cap 3 notifications/day**, adjustable later. Times are hypotheses, not scientifically proven population awake percentages.
- D1 only minimal anonymous subscription/due metadata and necessary user-opted prefs, **never terms or full review history**; check multi-device and offline stale-sync limitations. Migration of `last_sent_day` to idempotent due-key and last_sent_at needs transactional/error handling.
- All notifications follow Brand verbal identity: brief, reassuring Saudi Arabic or localized English; no pressure, shame, inflated stats or unexplained emojis. Example due: «حان وقت المراجعة» / «كلماتك جاهزة للمراجعة. كم دقيقة وتكمل!». Example practice: «ودّك تتمرّن شوي؟» / «ثلاث دقايق من يومك تصنع فرقًا. نبدأ؟». See #30.

### Phase 5 — Practice
- `Learning Passage` created/stored locally inside a Deck; correct content-language audio, reading/listening, simple local rule-based exercise generation.
- Do not invent "comprehension answers" from arbitrary prose; require structured/question-backed ground truth. Distinguish practice activity from scheduled review. AI lesson generation #24 is Future and requires independent privacy/cost authorization.

## 3. Brand & editorial acceptance
Read [WORDLOOP_BRAND_GUIDELINES_V1.md](WORDLOOP_BRAND_GUIDELINES_V1.md). Non-negotiable implemented references: warm Paper `#FAF8F4`, Surface `#FFFDF9`, Ink `#181B18`, near-black action `#111412`, Teal `#2F7D68`, `IBM Plex Sans Arabic`, `DM Serif Display`, restrained multi-colour loop mark and airy UI. Preserve existing CSS tokens first; no invented decor, unrelated logo, 3D, competitor clone or global brand facelift. Existing tagline **«كلمة اليوم، تبقى معك.»** stays. Brand Book v1 vision/mission/values/positioning are proposals, not settled company strategy.

## 4. Tests, evidence and owner approval
See [QA_UAT_MATRIX_V2.md](QA_UAT_MATRIX_V2.md). For each feature PR, provide:
1. PR → `staging`, explicit `Refs #N`, dependency and scope; no giant multi-feature release.
2. Before/after screenshots at realistic iPhone size, AR/EN, empty+populated, RTL/LTR; link to the exact image design reference from #16/#26 where available. If reference image cannot be accessed, **flag and do not invent it**.
3. Automated tests for DB migrations, backup compatibility, FSRS unchanged, push idempotency where relevant; real or mocked time-zone changes.
4. Commands actually run: `npm ci`, `npm run typecheck`, `npm test`, `npm run test:e2e` (when available), `npm run build -- --mode staging`, `npm audit --omit=dev --audit-level=high`. Report actual failures; no fictional PASS.
5. Manual real-device UAT steps, with results marked PASS / FAIL / NOT TESTED and evidence. Owner tests iPhone PWA/access/push.
6. Data migration/recovery/rollback notes and a clear "may not ship" list (loss of words, corrupted review records/FSRS, leaked user content, auth bypass, unauthorized Production promotion).
7. Final owner decision before merge into Production. A docs-only PR is NOT an implementation PR.

## 5. First instruction Claude should receive once this handoff is accepted
> Read root CLAUDE.md, the V2 implementation brief and V2 QA matrix, the brand guidelines, then current GitHub issues and staging code. First audit existing work (#4–#12, #2/#3), report conflicts and risks, and propose the **smallest safe first implementation PR for #15** (data migration and compatibility). Do not begin a large refactor, do not implement Future tasks, and do not deploy/modify Production. Protect existing cards, backups and FSRS; provide tests and reviewable PRs, one batch at a time.

## Source references
- [Backlog / issue index](https://github.com/Nf24-AI/wordloop/blob/main/PROJECT_BOARD.md)
- [#2 Staging](https://github.com/Nf24-AI/wordloop/issues/2), [#3 Security](https://github.com/Nf24-AI/wordloop/issues/3)
- [#15 Data model](https://github.com/Nf24-AI/wordloop/issues/15), [#16 Library](https://github.com/Nf24-AI/wordloop/issues/16), [#17 scoped review](https://github.com/Nf24-AI/wordloop/issues/17)
- [#26 Add](https://github.com/Nf24-AI/wordloop/issues/26), [#19 Language](https://github.com/Nf24-AI/wordloop/issues/19), [#20 Voice](https://github.com/Nf24-AI/wordloop/issues/20)
- [#21–#23 Practice](https://github.com/Nf24-AI/wordloop/issues/21), [#30 Smart Reminders](https://github.com/Nf24-AI/wordloop/issues/30)
- [#27 Future resume](https://github.com/Nf24-AI/wordloop/issues/27), [#28 Future bulk](https://github.com/Nf24-AI/wordloop/issues/28), [#29 Future organize](https://github.com/Nf24-AI/wordloop/issues/29)

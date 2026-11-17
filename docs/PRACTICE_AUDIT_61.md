# Practice v1.0 — engineering audit (#61 / #60 §A)

Audited on 2026-11-17 against `staging` @ `94e0504` (Worker version `2fef4b0d`). The status words mean:

- **IMPLEMENTED**: the code is on the branch.
- **TESTED**: an automated unit or browser test passes in Chromium and WebKit at iPhone width.
- **DEVICE**: verified on the owner's iPhone. **Nothing below is DEVICE yet.**
- **GAP → fixed**: missing or wrong at the audit, and fixed in this PR.

| # | Requirement (#61) | Where | Status | Evidence |
|---|---|---|---|---|
| A1 | Passage create/edit/delete; one passage for both modes; offline; backup/restore | #21 `src/data.ts` passages store, `PassageEditor`/`PassageView` | IMPLEMENTED · TESTED | `passages.test.mjs`, `passages.e2e.mjs`, **new** `practice-hub.e2e.mjs` HUB-04 (backup → delete → restore keeps the text and its questions) |
| — | **Global entry: Practice → deck → text → Reading/Listening** | — | **GAP → fixed** | The quick action was a disabled «قريبًا». Now `#/words/practice` (deck list) and `#/words/practice/<deck>` (texts with Read and Listen buttons). HUB-01/02, NAV-04 |
| — | Launch Practice from a deck | Deck page | **GAP → fixed** | New «تمرين قراءة واستماع» row on decks that have texts. HUB-03 |
| A2 | Empty decks/passages/cards/questions; zero activities | Engine + UI | IMPLEMENTED · TESTED, **engine hardened** | `interleave` now drops empty pools, and `buildListening([])` returns `[]`. Hub empty states. `practice.test.mjs` «#61: no activity…», HUB-01, READ-03 |
| A3 | Cloze: real source, usable context, variants, accents | `clozeItems` | **GAP → fixed** | Prefers a sentence where the term occurs once, so one blank and readable context. Blanks every occurrence only if all sentences repeat the term. Matching is NFC with `\p{M}` word edges, so decomposed accents match and «Luci» never matches inside «Lucía». Tests «#61: cloze…», «#61: Unicode…», «#61: regex…» |
| A3 | Accent-sensitive answers | `checkAnswer` / `fold` | IMPLEMENTED · TESTED | si/sí, ano/año and año→ano are «almost», never correct. Arabic tashkeel is ignored, and hamza variants are «almost» |
| A4 | MCQ only with safe distractors; else reveal | `distractorsFor` / `meaningItems` | IMPLEMENTED · TESTED | Needs ≥3 independent distractors. Synonyms, overlaps and duplicate terms are excluded; otherwise the question becomes «show the meaning» recall |
| — | Passage-only vs deck-wide vocabulary | `meaningItems` | **GAP → fixed** | Questions now cover only cards whose term occurs in the text. The rest of the deck only supplies wrong options. The UI hint text is updated |
| A5 | Comprehension only from saved questions; quote shown | `comprehensionItems` | IMPLEMENTED · TESTED | READ-01 |
| A6 | Spanish text + Arabic UI → Spanish voice; English → English | `src/voice.ts` `pickVoice` (language from passage, never UI) | IMPLEMENTED · TESTED (unit/ranking) | `voice.test.mjs`, `listening-practice.e2e.mjs`. **Real voices need DEVICE UAT** |
| A7 | Dictation correct/missing/extra/accent; no-voice fallback | `compareDictation`, `ListeningPractice` | IMPLEMENTED · TESTED | **New** «#61: dictation reports missing, extra…». No-voice/unsupported states keep «اعرض النص» |
| A8 | Progress, results, back, retry, **switch activity**, keyboard, AR/EN, RTL/LTR | Practice UI | IMPLEMENTED · TESTED, **switch → fixed** | Results now offer Reading ↔ Listening («تمرين استماع» / «تمرين قراءة») next to «تمرين ثاني» and «رجوع للنص». The unsaved-session guard is `data-unsaved` (#42). HUB-02/03 |
| A9 | FSRS dueAt/state/history identical before/after | Practice writes nothing | IMPLEMENTED · TESTED | Byte-identical snapshot in READ-01, the listening e2e and HUB-02 |
| A10 | No AI / no content transmission; #24 OFF | `src/lessons.ts` flag + no generator | IMPLEMENTED · TESTED | `lessons.test.mjs`, `ai-lessons.e2e.mjs`. Proposal: `docs/AI_LESSONS_PROPOSAL.md` |
| A11 | Green CI, staging SHA, iPhone evidence, owner approval | — | PENDING | CI `test-staging` is the real gate. `Workers Builds: wordloop-local-first` fails by configuration (see below). iPhone checklist: `docs/PUSH_STAGING_RUNBOOK.md` §5 and the PR body |

## Known limits (not changed on purpose)
- Sentence splitting treats «Sr.» or «etc.» as a sentence end. Cloze items whose term crosses that break are skipped, never guessed.
- Terms that are shorter than 2 letters once punctuation is ignored (e.g. «C++», «x») are not asked about.
- Practice results are not stored. Only the local *day* of practice is synced, for #30 nudges.

## Failing check «Workers Builds: wordloop-local-first»
The **Production** Worker `wordloop-local-first` has Workers Builds connected to this repo with *non-production branch builds* on. For every non-`main` branch it runs `npx wrangler preview`. The staging `wrangler.jsonc` binds D1 `PUSH_DB` and rate limiter `PUSH_LIMIT`. Wrangler refuses to make a Preview without preview-safe values, prints `<REPLACE_ME>` and exits 1 (build `b7fa0639`, 2026-11-17 14:24). The code is not at fault, and GitHub does not require this check (`staging` is unprotected). **Owner fix (Production setting, so not done here):** Cloudflare → Workers → `wordloop-local-first` → Settings → Builds → turn off *non-production branch builds*, or limit them to `main`. The real staging build is `wordloop-staging`.

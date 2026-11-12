# WordLoop — QA / UAT Acceptance Matrix

**Purpose:** objective test gate for Claude's implementation against Issues [#4–#13](https://github.com/Nf24-AI/wordloop/issues). Companion contract: [CLAUDE_IMPLEMENTATION_BRIEF.md](CLAUDE_IMPLEMENTATION_BRIEF.md).

**Status:** QA PLAN, **not** a statement that these tests have passed. Baseline on `staging` exists, but product UX changes are not yet implemented. Owner decides final acceptance after UAT.

## 0. Test environment and rules

- Test on Staging, **not** the Production URL: https://wordloop-staging.nf24-wordloop.workers.dev/.
- Access gate: authorized owner email + Email OTP. No “Everyone” or bypass.
- Local-first: this app stores cards/reviews in IndexedDB *per-origin*; Safari and an installed iPhone PWA may have different storage. Do **not** import a real user's production backup into a shared test device.
- Test both a **clean Staging origin** and a **legacy v1 fixture** that includes cards, review logs, due dates, archived cards and version numbers.
- Check at least iPhone Safari (browser tab and installed PWA if available), Android Chrome, and desktop Chrome/Firefox or Safari. Report the devices actually tested. Do not mark untested hardware PASS.
- Network conditions: normal, offline, slow/lost network. Staging Access login requires connectivity; offline PWA test occurs after successful installation and precache.
- Use fixed deterministic clock/test fixtures for review scheduling (e.g. Asia/Riyadh 23:59 → 00:01 boundary).
- Treat failures of data integrity/security/privacy as **release blockers** regardless of design polish.

## 1. Functional verification (QA IDs)

| ID | Priority | Feature / Issue | Steps / fixture | Expected result |
|---|---|---|---|---|
| SAVE-01 | P0 | Save / #4 | Fresh Staging DB; add `overlook` then `reliable`; open Library | Both unique cards visible, no fake success |
| SAVE-02 | P0 | Save / #4 | Save, navigate Home → Library → Add, reload | New card persists after reload and navigation |
| SAVE-03 | P0 | Save / #4 | Add duplicate same type with case/extra spaces | Clear duplicate error, existing card unchanged |
| SAVE-04 | P0 | Save / #4 | Simulate IndexedDB transaction failure/quota in automated test | Input remains recoverable, explicit failure, no success toast |
| SAVE-05 | P0 | Save / #4 | Save succeeded but UI refresh fails (mock) | No “unsaved” misdiagnosis; user can find/retry refresh without losing saved card |
| SAVE-06 | P0 | Save / #4 | Search, filter by due/type/tag; clear filters | Card exists, is discoverable; filter state is explicit |
| DATA-01 | P0 | Legacy / #5/#12 | Load v1 backup with one old word and reviews | Imported as vocabulary; original `id`, due time, FSRS and reviews preserved |
| DATA-02 | P0 | Legacy / #5/#12 | Export current v2 backup then import on fresh origin | All types, fields, history and schedules round-trip |
| DATA-03 | P0 | Backup / #5/#12 | Restore malformed JSON, orphan review, wrong dueAt, oversized file | Import rejected **before overwriting local data** |
| DATA-04 | P0 | Backup / #5/#12 | Existing 50-card fixture, upgrade app, return offline | Count/IDs/due dates/revision/history unchanged |
| DATA-05 | P0 | Backup / #5/#12 | Force exception during restore transaction | Existing database not partially replaced |
| TYPE-01 | P1 | Four types / #5 | Add word, phrase, sentence, idiom | All four saved with canonical `contentType`, displayed correctly |
| TYPE-02 | P1 | Four types / #5 | Add `break the ice` as phrase and idiom | Different types coexist; same-type duplicates refused |
| TYPE-03 | P1 | Idioms / #5/#12 | Add idiom with nonliteral Arabic meaning, example and note | Idiomatic explanation clear, no word-for-word requirement |
| TYPE-04 | P1 | Types UI / #12 | Switch selected type before save | Relevant placeholders/fields; other types not corrupted |
| TYPE-05 | P1 | Review / #5 | Review any of four types with each grade | Stable FSRS grade behavior; no due scheduling distortion |
| MET-01 | P1 | Stats / #10 | Same card reviewed 4 times today in Riyadh | Distinct reviewed=1; attempts=4 |
| MET-02 | P1 | Stats / #10 | 2 active, 1 archived card, 1 due, 1 future due | Correct active/due/future counts, no double count |
| MET-03 | P1 | Stats / #10 | Reviews at 23:59 and 00:01 Asia/Riyadh | Counted in correct separate days |
| MET-04 | P1 | Stats / #10 | New user and one-card user | Honest empty/low count labels, no “streak” fabrication |
| NAV-01 | P1 | Home / #8 | With due cards, view homepage CTA | Exactly one dominant CTA starts due reviews |
| NAV-02 | P1 | Home / #8 | No due cards / empty library | Main CTA adds a card; no unnecessary add duplicates |
| NAV-03 | P1 | Quick action / #9 | Tap central + and choose Add / Review | Sheet opens, actions route correctly, pressing Back/Esc closes |
| NAV-04 | P1 | Practice placeholder / #9/#13 | Open + before Practice is shipped | Clearly disabled “قريبًا” or hidden; no dead or misleading route |
| NAV-05 | P1 | A11y / #9 | Keyboard-only + menu, screen reader where available | Dialog/menu has labels, focus logic and dismiss, sufficient touch area |
| I18N-01 | P1 | Language / #6 | AR → English → AR, refresh/reopen | Language persists, full UI translated, correct `dir`/focus order |
| I18N-02 | P1 | Language / #6 | Compare vocabulary, examples, FSRS before/after language change | **No saved user text or schedules changed** |
| I18N-03 | P1 | Language / #6 | Buttons, errors, settings, plural/date, toasts | Translated consistently, no mixed-language bugs |
| HOME-01 | P2 | Homepage / #7 | Empty, 1 card, due cards, no due cards | Useful meaningful guidance without invented metrics |
| HOME-02 | P2 | Privacy / #11 | Home → Settings → Privacy | Privacy explanation removed from Home and discoverable in Settings |
| HOME-03 | P2 | Privacy accuracy / #11 | Read privacy copy and inspect push paths | Device-local words/reviews stated accurately; push metadata exception acknowledged |
| PWA-01 | P0 | Offline | Install PWA, pre-cache, disable Wi-Fi/mobile data, reopen | Existing cards and reviews accessible; no false cloud dependency |
| PWA-02 | P0 | Upgrade | Install old version, save cards, deploy new candidate to Staging, reopen | No loss of data, navigation/styles or broken offline shell |
| PUSH-01 | P1 | Push | Enable on real authorized PWA after separate staging VAPID configured | Notification subscription stored **only in staging D1** |
| PUSH-02 | P1 | Push | Test notification and disable | Staging notification received / disabled; no production device notified |
| SEC-01 | P0 | Staging Access | Anonymous GET `/`, `/api/health`, `/sw.js` | Redirect to Access/deny, no app content exposed |
| SEC-02 | P0 | Staging Access | Authorized email OTP sign in | OTP arrives only for approved identity, session usable; real owner must verify |
| SEC-03 | P0 | API abuse | External Origin, oversized JSON, private push endpoint | Rejected (403/400); no DB mutation or outbound push |
| SEC-04 | P0 | API rate | Burst of test sync/notify requests from isolated fixture | 429 or documented bounded behavior; never disable limit for convenience |
| SEC-05 | P0 | CI/dependencies | `npm audit --omit=dev --audit-level=high` and CI | No high/critical unresolved in deployed runtime |
| SEC-06 | P0 | Security/privacy | Check Worker D1 schema and browser network on ordinary study flows | No vocabulary, meanings or review history sent to Worker |
| SEC-07 | P1 | Injection | Term/meaning/backup with `<script>`, quotes, HTML, RTL control chars | No code execution or uncontrolled HTML injection |

## 2. Automated regression requirements

**Mandatory existing commands** (run locally and in Staging CI):
```bash
npm ci
npm run typecheck
npm test
npm run build -- --mode staging
npm audit --omit=dev --audit-level=high
```

Minimum new automated tests, preferably Node `node:test` + IndexedDB harness, or a justified browser runner for UI:
- Save then query after transaction commit; duplicate handling and stale refresh.
- New and legacy backup payload validity and v1→v2 normalization, IDs, dates, grades, archive state, atomic restore.
- Four `contentType` cases and same-type duplicate policy.
- Unique review counters vs attempts; midnight `Asia/Riyadh`; archive exclusion.
- Quick-action navigation and RTL/LTR semantic rendering. UI interaction tests required if adding dialog.
- Unknown/hostile HTML strings render as plain text.
- Keep all Staging existing API security tests and Access denial smoke tests.

**Hard caveat:** current `tests/data-contract.test.mjs` and `tests/structure.test.mjs` cover only a subset of local data and UI. Passing them is **not sufficient** to claim the above behavioral cases PASS. Improve rather than delete.

## 3. Visual UX acceptance standards

- No redesign of WordLoop's core aesthetic without owner approval. Keep meaningful whitespace, clear hierarchy, low visual noise, Arabic-first style.
- iPhone-size responsive (e.g., 375×812) and small 320 px viewport: no horizontal scrolling, clipped menus, or obscured content by bottom tab bar.
- Touch targets approximately 44×44 CSS pixels; visible focus indicators, labels, `aria-current`, dialog semantics, reduced motion.
- App respects iOS safe area and keyboard opening for Add form; back navigation predictable.
- English mode must flip layout direction without flipping the direction of English learning expressions or voice/language metadata.
- All four types: compact Library preview and readable Review cards; protect long sentences from overflow.
- Screenshots required: empty Home, populated Home with due, Add screen for each of 4 types, Library filters, stats, quick menu, Settings + privacy, English equivalents.

## 4. Owner UAT procedure (non-technical)

1. Open Staging URL and sign in by owner email OTP.
2. Add Vocabulary `overlook`, Phrase `in charge of`, Sentence `I forgot my keys`, Idiom `break the ice` with meanings.
3. Open Library; confirm all four types appear. Refresh and repeat.
4. Try adding duplicate; confirm helpful message and no missing/orphan card.
5. Review a due card, check that one card reviewed multiple times counts as one distinct card.
6. Tap central `+` and confirm actions; Practice must remain labeled as not yet available.
7. Switch Arabic/English twice; confirm saved content unchanged.
8. Export backup; restore it **only to a separate test origin/fixture after making a copy**. Confirm intact history.
9. Test offline and reopening PWA if possible.
10. Compare change screenshots and approve or request revision through the PR/issue.

Do not use a user's personal words in screenshots, demo data, or bug reports.

## 5. PR evidence template

Every batch PR must report:

| Field | Required submission |
|---|---|
| Issue(s) | `Closes #N` only after tested; otherwise `Refs #N` |
| Scope | In / out, feature flag or migration impact |
| Code changes | Specific files and rationale |
| Test results | Commands and summary + link to passing CI |
| QA cases | Table of IDs above: PASS / FAIL / NOT TESTED, device/browser |
| UX evidence | Before/after screenshot links on mobile + desktop where useful |
| Risks | Data migration, offline, auth/push, privacy concerns |
| Rollback | App-level rollback plan; backup/data migration reversal limitations |
| Status | **Ready for owner UAT** or blocked; never auto-promote Production |

## 6. Release decision

A PR can be merged into Staging only after automated tests and review. **Production promotion is blocked** if:
- Any P0 data-loss or security issue fails, or legacy backup import is broken.
- UI shows false save success, destroys review records or changes FSRS schedules unexpectedly.
- Staging Access no longer protects UI/API, or any connection to Production D1 is introduced.
- Required real-device UAT is unavailable or not approved by the owner.

**Practice (#13) has discovery-only scope.** No feature release, no unauthorized voice API, and no changes to FSRS on Practice actions without a separate explicit approval.

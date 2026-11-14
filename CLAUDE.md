# WordLoop — Claude Code entrypoint (handoff v2, 2026-11-14)

**Read this before changing anything.** This file is a navigation and safety contract, not authorization to deploy.

1. Read [docs/CLAUDE_IMPLEMENTATION_BRIEF_V2.md](docs/CLAUDE_IMPLEMENTATION_BRIEF_V2.md) in full.
2. Read [docs/QA_UAT_MATRIX_V2.md](docs/QA_UAT_MATRIX_V2.md) and [docs/WORDLOOP_BRAND_GUIDELINES_V1.md](docs/WORDLOOP_BRAND_GUIDELINES_V1.md).
3. Read [docs/VOICE_AND_DESIGN_SYSTEM.md](docs/VOICE_AND_DESIGN_SYSTEM.md), the current CSS/font/i18n files and [GitHub Product Backlog](https://github.com/Nf24-AI/wordloop/blob/main/PROJECT_BOARD.md).
4. Read the **exact, current** body of the issues in the selected batch. Issue bodies have more detailed accepted UX and data criteria than these summaries.
5. Before implementation, produce a short delta report: what is already implemented on staging, what still needs work, compatibility/migration risks, and test plan. **Do not redo already staged #4–#12 just because an old issue remains open.**
6. Work on one narrowly scoped feature branch and PR targeting `staging`. No direct merges to `main`, no Production release. Owner signs off UAT.

## Highest-priority decisions (newer decisions supersede older UI text)
- **#26 supersedes #12's card-add type-selection UI**: one content field + one or more identically styled meaning fields, language badges inside fields, optional example, one save. Preserve legacy contentType/storage/FSRS.
- **#15 + #16 + #17** establish Folder → Deck → Card, a two-column folder library, and scoped *due* review; preserve all old words, review history, backup compatibility and FSRS-7.
- **#19 + #20**: speech language is taken from the card/deck (not interface locale); test real voices on iPhone.
- **#30**: smart due-time reminders + bounded practice nudges; respect WordLoop verbal identity and local-first privacy. Current 20:00 daily Cron is the **old implementation**, not the desired product behavior.
- **#21–#23**: Reading/Listening Practice are approved, but depend on content/decks/voice and must not grade FSRS by default.
- **#27–#29 and #24**: Future; do **not** implement merely because they are open. #18 Future as well. Approved A/B product ideas marked Future are postponed.
- **Brand Book**: applicable implemented design/voice rules are captured in [Brand Guidelines V1](docs/WORDLOOP_BRAND_GUIDELINES_V1.md). Strategic vision/mission/positioning in Brand Book v1 are *proposals*, not owner-approved claims.

**Release gate:** Test → security → real-device UAT → explicit owner approval → Production. If a change may destroy IndexedDB, corrupt backups/FSRS, leak words to cloud, bypass Staging Access or auto-promote Production, STOP and flag it.

**This docs-only PR creates the handoff; it does not authorize implementing all issues simultaneously.**

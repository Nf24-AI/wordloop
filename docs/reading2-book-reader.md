# Reading 2.0 — Immersive Book Reader (owner visual direction)
Status: product/visual specification; **not implemented**. Target: staging only. Reference illustration: [reader-reference.svg](./reader-reference.svg). The original screenshot was supplied in ChatGPT; SVG is an original schematic approximation, not a copy of the uploaded screenshot.

## Product decision
The Reading 2.0 story screen should feel like a beautifully typeset book page, not a dashboard, quiz, or form. Keep the existing Reading setup, completion and optional comprehension flow. Do not change Listening/Writing screens, FSRS, auth, AI flags, or production.

## Visual language
- Warm off-white background (suggested light #F7F6F3), near-black text (#242424), very low chrome.
- Story title in bold elegant serif; body in readable serif (system Georgia fallback). UI controls retain WordLoop UI font.
- On phones: body clamp(20px, 4.7vw, 25px), line-height 1.5–1.65, paragraphs spaced ~1.2em, horizontal gutters 20–26px; on wide screens max readable width ~68ch with centered column. Test with real Arabic, English, Spanish, long words and 200% zoom.
- No card border or raised container around story. No unnecessary illustration or floating play icon in Reading.
- Focused reading: header controls fade/collapse when scrolling down, return on scroll up/tap, but back and completion must always remain discoverable and keyboard/screen-reader accessible.
- Compact header with Back, typography/settings, highlight toggle; title and optional CEFR / estimated reading time.
- Light and dark modes with equally readable subdued highlight palettes. Respect reduced motion.
- Avoid colored legends dominating the reader; optional accessible legend under content or in settings.

## Highlight semantics (do not fake classification)
- Yellow: words/phrases selected from user's saved vocabulary and *actually found in story*.
- Green: optional suggested expressions ONLY if there is a grounded source and meaning; do not label them B2/C1 without validated CEFR metadata.
- Never infer that yellow means B2 or green means C1. If no reliable suggestions exist, show yellow only.
- Highlight whole phrases before single words, resolve overlaps deterministically, use language-aware Unicode boundaries and existing matcher. Preserve punctuation, line breaks, accessibility and copy/select text.
- A setting toggles highlights without modifying saved data.

## Word interaction
- Tap/click/focus highlighted phrase to show a small anchored popover or mobile bottom sheet: original phrase, saved meaning(s), content language, meaning language, optional pronounce if supported, and Add to Library only if not already present.
- If meaning is missing, say so; do not invent translation or auto-call AI.
- Avoid duplicate cards; preserve existing add/edit and multi-meaning behavior. Popover dismissible via Escape, close, outside click, Back; focus returns to trigger.
- In Arabic UI with English/Spanish text, preserve story LTR and interface RTL independently.

## Reader settings
- Font size (3–5 accessible steps, persisted locally), optionally serif/sans font choice, light/dark/auto using existing theme, highlight on/off.
- Settings should be non-modal where possible; do not obstruct reading or mobile keyboard.
- Keep reading position when settings change; persist/resume safely if already supported.

## Completion and quiz
- Explicit «أنهيت القراءة» / Finish Reading control after story; accessible on phone.
- Completion logged once independently of quiz. Re-reading does not inflate unique completions.
- Optional comprehension questions only after explicit choice; grounded in story, no fabricated questions. Skipping quiz not a failure and shows no comprehension percentage.
- Reuse current Reading 2.0 architecture; do not change FSRS scheduling, dueAt, stability, difficulty, or review history.

## Implementation safety
- PR #76 (Practice 2.0 foundation) is open against staging at time of writing; coordinate integration to avoid conflicts. Do not merge #76 or this change without owner approval. Never deploy production.
- Audit current components, tests, routes and PWA before coding. Keep existing local-first/offline behavior.
- Do not activate AI or new network requests; use saved/demo story fallback with honest labels.

## Acceptance tests
1. Mobile 390px and 320px, desktop 1280px, 200% zoom: no clipping/horizontal overflow; readable paragraphs.
2. AR/EN UI and English/Spanish content: correct RTL/LTR, punctuation, screen readers.
3. Long story and short story: legible layout, scroll position, accessible back and Finish Reading.
4. Highlight correct terms, multiple-word phrases, inflections and overlaps; no false positives or fake CEFR claims.
5. Tap, keyboard Enter/Space, Escape, outside dismissal, focus return, mobile bottom sheet.
6. Known/missing/multiple meanings, no duplicate Add, no invented translation.
7. Font sizing, highlight toggle, themes, reduced motion and persistence.
8. Offline/saved story and demo states.
9. Completion without quiz; quiz optional; repeated completion idempotent.
10. FSRS before/after snapshots identical; existing reviews, backup, navigation, staging auth unaffected.
11. Typecheck, unit, build and full Chromium/WebKit browser suite; provide commands and results.
12. Screenshots for phone and desktop before asking for approval.

## Deliverables
Audit, small PR targeting staging, screenshots, tests, changed files, commit SHA, PASS/FAIL matrix, known limitations. No merge/deploy until owner approval.

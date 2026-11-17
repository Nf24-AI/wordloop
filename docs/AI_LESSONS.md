# WordLoop — AI «أنشئ درسًا» (Generate a Lesson), issue #24

**Status:** architecture + UI only. **No AI provider is connected, no API key exists, no Worker endpoint calls an AI API, and nothing is transmitted.** The feature is hidden in every build unless *both* switches below are on, and today the second one cannot be on in any shipped build.

## How it is switched on (and why it is off)
| Switch | Where | Default |
|---|---|---|
| Build flag `VITE_AI_LESSONS=on` | build-time env (Vite), read in `src/lessons.ts` | unset → **off** |
| A configured `LessonGenerator` | `registerLessonGenerator()` in `src/lessons.ts` | none registered → **off** |

The «أنشئ درسًا» entry in a deck appears only when both are true (`aiLessonsAvailable()`). Production and Staging builds set neither. The only generator that exists is a mock defined **inside the tests** (`tests/lessons.test.mjs`, `tests/e2e/ai-lessons.e2e.mjs`); it is not part of the app bundle.

## Architecture
- `src/lessons.ts` — separate from the rule-based Practice engine (`src/practice.ts`), which keeps working with or without AI.
  - `LessonGenerator` interface: `{id, label, costNote, generate(request, signal)}`. A provider is added by implementing it; Practice is not touched.
  - `buildLessonRequest(deck, cards, options)` builds the **only** payload that may leave the device: content/meaning language, level (A1/A2/B1), lesson type (reading/listening/both), question count (3/5/10) and the *selected* cards' term + meanings (max 30). No ids, no notes/examples, no FSRS state, no due dates, no review history, no other cards, no backups.
  - `validateLesson(raw, request)` checks the structured output before the learner even sees it: shape and field types, length limits (same as Learning Passages), the requested number of questions, no repeated question, no question that contains its own answer, **every answer backed by a quote that appears verbatim in the generated text and contains the answer**, and at least one selected word used in the text. Automated checks do **not** prove the content is correct — the UI says so.
  - `lessonToPassageInput(lesson, deck)` maps an accepted lesson to a normal Learning Passage (#21), so Reading (#22) and Listening (#23) practice work on it offline with on-device voices. Text generation and speech are separate: generating a lesson never implies a cloud voice.
- UI (`src/App.tsx`, route `#/words/d/<deck>/lesson`): **setup** (level, type, count, which cards) → **preview & consent** (shows exactly the payload, requires an explicit checkbox, shows the provider's cost/limit note) → **generating** (cancellable; a network/provider failure shows a clear message and saves nothing) → **review** (edit title, text, questions, answers and quotes; *Save as text* or *Reject*). Rejecting writes nothing. Saving creates one passage; it never creates cards and never touches FSRS, `dueAt` or the review log.

## Provider decision checklist (must be completed and approved by the owner before any provider is connected)
- [ ] **Cost per lesson:** expected tokens in/out per lesson for each question count; price per lesson at current list price; worst case.
- [ ] **Budget & usage limits:** per-device and global daily caps, monthly budget ceiling, behaviour when the cap is hit (clear message; local Practice keeps working).
- [ ] **Where the key lives:** never in the browser. A server-side proxy (Worker) holds the secret; Staging and Production use separate keys; rotation plan.
- [ ] **Abuse protection:** Cloudflare Access/auth requirement, rate limiting per device/IP, request size caps (≤30 cards, ≤5,000 characters of output), no free-form prompt from the client (the Worker builds the prompt from the structured request).
- [ ] **Privacy & retention:** the provider's data-retention period, whether inputs are used for training (must be **no**), region, sub-processors, deletion on request; Privacy section text in Settings updated *before* launch.
- [ ] **Logging:** the Worker logs no card text, no meanings, no generated lesson; only counts/status needed for limits.
- [ ] **Model/output contract:** JSON schema / structured output mode, refusal handling, timeout, max output tokens; `validateLesson` stays the gate.
- [ ] **Kill switch & opt-out:** a server-side switch to disable generation instantly; the learner can hide the entry; the app stays fully usable without AI.
- [ ] **Quality review:** sample lessons per language/level reviewed by a human; no claim that generated content is guaranteed correct.
- [ ] **Tests before launch:** Staging-only rollout, privacy/security review, real iPhone UAT, explicit owner approval. No Production promotion without it.

## What is tested now
Unit (`tests/lessons.test.mjs`): flag/generator gating, the exact payload (nothing beyond term+meanings of the selected cards), every validation rule, passage mapping, reject = no DB change, save = one passage and unchanged FSRS. E2E (`tests/e2e/ai-lessons.e2e.mjs`): entry hidden by default; with the flag on and a mock generator, the consent screen shows the payload, generation is blocked without consent, failures save nothing, invalid output is refused, edit + save creates a passage, reject writes nothing.

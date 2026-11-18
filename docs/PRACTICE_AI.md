# #64 Practice 2.0: AI stories from your words

**Status (2026-11-18):** the app flow, Worker endpoint, prompt, validators, quotas and tests are on `staging`. **AI generation is OFF.** No Workers AI binding exists, the `ai_usage` table isn't applied, and `AI_STORIES` isn't set. In this state the endpoint answers `503 off`. The app says so clearly and offers the learner's own texts instead. Nothing is sent anywhere and nothing costs money. Switching it on needs the owner steps in §7.

## 1. Flow
Practice → (deck: remembered, or the one with the most words) → **Start**. Choosing words, level and story/conversation is optional.
1. **Consent** (first time, and again after it is withdrawn): the exact words and meanings to be sent, the languages and level, the provider's name, and what is *never* sent.
2. **Generating**: progress and Cancel. One request, no automatic retries.
3. **Story**:
   - The target words are highlighted. Tapping one shows its saved meaning.
   - Listen (device TTS in the deck's language), with an optional translation.
   - «Your words in the story» shows which words were used and which were not.
4. Reading / Listening practice, using the existing #22/#23 engine on the saved story. Questions are generated cloze/meaning items from words *in the text*, plus the 3 grounded questions.
5. **Result**: right / wrong / almost, the number of words practised, Next story, Practise again, the other activity, Back to the story, Back to the deck.

**Large selections:** words go into batches by level (A1 5 · A2 6 · B1 8 · B2 10 · C1 12, max 12 per request).
- The whole queue is kept in `localStorage` (`wordloop-practice-plan`) and resumable («Story 2 of 5 · Continue»).
- Coverage is measured on the text, not taken from the model's claim.
- A word the story didn't use moves into the next batch once. If it's missed again it is listed as «couldn't fit into a story».
- No selected word is ever silently dropped (STORY-BATCH-02).

## 1b. When AI is off: notice + Demo Mode
- `GET /api/practice/story/status` returns only `{ai:"on"|"off"}`. Practice asks once per session, so «AI stories aren't switched on yet» is shown as a calm note **before** Start, not as a failure after it.
- With AI off, the main button is **«Start with a demo story»**. If an old Worker or an offline device made the status unknown, the generator explains «off» in the same calm way and offers the demo.
- **Demo Mode** (`src/demoStory.ts`):
  - A fixed EN/ES frame plus one sentence per selected word. The translation carries each saved meaning.
  - It passes the same `validateStory` gate.
  - It runs locally: no request, no consent screen, no quota.
  - Selection, select all, batches, Reading, Listening, questions, results and «Next story» all behave exactly as with AI.
- **Never presented as AI output:**
  - the saved title starts with «قصة تجريبية: » / «Demo story: »;
  - the story screen shows «A local demo story, not written by AI»;
  - the plan records `demo:true`.
  It is a plain practice text, not a language-quality sample.
- Demo texts are ordinary local passages. The learner can delete them from the deck's texts like any other.

## 2. Data and privacy
| | Where |
|---|---|
| Cards, FSRS, reviews | IndexedDB on the device. Practice never writes them (P2-02 compares an FSRS snapshot before and after) |
| Generated stories | An ordinary local Passage (#21). Included in backup/restore (P2-06) and works offline after generation |
| Selection, level, plan, consent | `localStorage`, this device only |
| Sent to the Worker | `{v, contentLanguage, meaningLanguage, level, genre, words:[{term, meaning}]}` only. The request is strictly validated and any extra key is refused (STORY-REQ-01) |
| D1 | `ai_usage(day, who, n)`. `who` = SHA-256("wordloop-ai\|day\|identity"), rotated daily. No words, stories, emails or IPs (STORY-API-03) |
| Logs | Error codes only, never prompts or outputs (STORY-API-04) |

## 3. Server guards (`worker/story.ts`)
Each check below happens in this order:
1. Same-origin.
2. Kill switch: binding + `AI_STORIES=on` + an allow-listed model + the quota table. Any one missing → 503 `off`.
3. Edge rate limit: about 6 requests a minute per IP.
4. 10 KB body limit.
5. Strict schema.
6. Concurrency cap: 4 in flight per isolate.
7. Daily quota per user (default 10, keyed by the Cloudflare Access identity, else the IP).
8. Global daily budget (default 200). Fails **closed**.
9. Daily neuron budget: each model call reserves its worst case first (default 8,000, ceiling 9,000 — below the 10,000/day free allocation).
10. 45-second timeout (measured max 30.1 s with a repair), plus client cancellation.
11. Output validation, with one bounded repair call (also metered), then a 422.

The API key never reaches the browser: Workers AI is a binding.

## 4. Prompt and validation
- The prompt is versioned (`story-v1`, `src/story.ts`).
- Output must be one JSON object: `{title, story, translation, usedWords[], questions[3]{question, answer, quote}}`.
- `validateStory` rejects any of the following:
  - the wrong shape;
  - an empty or over-long title;
  - length outside the level's band (±30%);
  - the wrong language (stop-word check for EN and ES);
  - links, markup or code;
  - not exactly 3 questions;
  - a quote not copied from the story, or an answer not inside its quote;
  - a question that contains its answer, or a duplicate question;
  - fewer than half of the batch's words actually present.
- The Worker validates once, and the app validates again before showing or saving anything.

## 5. Model choice (verified from Cloudflare docs, 2026-11-18)
Sources:
- https://developers.cloudflare.com/workers-ai/platform/pricing/
- https://developers.cloudflare.com/workers-ai/models/
- https://developers.cloudflare.com/workers-ai/features/json-mode/
- https://developers.cloudflare.com/workers-ai/platform/limits/

| Model | $/M in · out | JSON mode | Notes |
|---|---|---|---|
| `@cf/google/gemma-4-26b-a4b-it` | 0.100 · 0.300 (9,091 · 27,273 neurons/M) | Not on the JSON-mode list → prompt-only JSON + validator | 256k context; no beta/deprecation note (checked 2026-11-18). **Default: owner-approved for testing 2026-11-18** |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | 0.293 · 2.253 | **Yes** (json_schema) | 24k context. Fallback if Gemma fails the eval |
| `@cf/mistralai/mistral-small-3.1-24b-instruct` | 0.351 · 0.555 | Not listed (`guided_json` exists) | Allowed as a fallback |
| `@cf/qwen/qwen3-30b-a3b-fp8` | 0.051 · 0.335 | Not listed | **Excluded: planned deprecation 2026-11-20** |
| `@cf/google/gemma-3-12b-it` | n/a | n/a | **Excluded: model page returns 404 / not in the catalog** |

- **Free allocation:** 10,000 neurons/day. On Workers Free there is no overage (requests fail). Workers Paid charges $0.011 per 1,000 neurons.
- **Rate limit:** text generation is limited to 300 requests/minute.

**Not measured yet.** Quality, JSON reliability and latency need real calls, which need the owner's approval. `scripts/eval-stories.mjs` runs the **20 cases** in `scripts/story-cases.mjs`:
- English and Spanish;
- A1–C1;
- story and conversation;
- 1–12 words, including multi-word terms and accents.

It runs them through both candidates with the same validator and repair, and writes `docs/eval/STORY_EVAL_<date>.md`. That report has PASS/FAIL, coverage, latency and token usage, plus every story with a human-review checklist. **The final model is whichever passes most cases and human review, with gemma-4 preferred if it is within about 5 points, because of cost.** Change `AI_STORY_MODEL` to switch; no code change is needed.

## 5b. No charges: how it is guaranteed (checked 2026-11-18)
1. **Account plan: Workers Free** (dashboard → Workers plans shows «Current plan» on Free). Cloudflare's pricing page: on Free, usage above 10,000 neurons/day *fails with an error*; it is billed only on Workers Paid. Cloudflare offers **no** Workers AI spend cap, so this guarantee holds **only while the account stays on Free and no AI Gateway «Unified billing» / prepaid credits are set up**. Upgrading the plan must be a deliberate owner decision that revisits this section.
2. **App-side hard budget** (works on any plan): every model call first reserves its worst case (input estimate at 1 token / 2 chars + 1,600 output tokens) in D1 atomically, and is refused if today's total would pass `AI_NEURON_DAILY` (default **8,000**, ceiling **9,000** in code — a var cannot raise it). The reservation is then settled down to the usage the model reports. A repair that does not fit is not attempted. Gemma worst case ≈ 55–60 neurons per call, so 8,000 always covers ≥ 130 calls; typical ≈ 37 per story.
3. The 10,000/day allocation is **per account** (resets 00:00 UTC): the eval script shares it, so it has its own budget (`EVAL_NEURON_BUDGET`, default 3,000, max 4,000; worst case for 20 cases ≈ 1,059, ≈ 2,118 with a repair each). Run the eval on a day the story budget is not in heavy use.

## 5c. Eval result (2026-11-18, Gemma 4 26B, prompt story-v1): `docs/eval/STORY_EVAL_2026-11-18.md`
- **Finding:** with Gemma's default reasoning ON, the model spent all 1,600 output tokens on hidden reasoning and returned empty content (`finish_reason: length`), so 9/9 cases failed. Fix: `chat_template_kwargs.enable_thinking=false` in the shared `modelInput()`, used by both the Worker and the eval.
- **After the fix:** 20/20 pass the automatic gate (2 needed their one repair). 111/115 words were found by the exact matcher; the 4 «missing» words are present in inflected form (looks forward to, barata, prestarle, tenía ganas de). Median 14.5 s, max 30.1 s. ≈ 23.5 neurons per story, about $0.00026.
- **Neurons spent on the whole test:** ≈ 1,403 of the approved 3,000 (933 on the failed first run + 2 diagnostic calls, then 470 on the run itself).

## 6. Cost estimate (my arithmetic, using the prices above)
**Per story:**
- About 950 input tokens and 1,050 output tokens, including the translation (about 40% of output) and an assumed 15% repair rate.
- llama-3.3-70b: **≈ $0.0026** (≈ 240 neurons; the free allocation covers about 40 stories/day).
- gemma-4-26b: **≈ $0.0004** (≈ 37 neurons; about 270/day free).

Assuming 2 stories per active user per day (the cap is 10):

| DAU | Stories/day | llama-3.3-70b / month | gemma-4-26b / month | Notes |
|---|---|---|---|---|
| 100 | 200 | ≈ $12–16 | ≈ $0 (inside the free allocation) | Workers Paid ($5/mo) is needed for any overage |
| 1,000 | 2,000 | ≈ $150 | ≈ $22 | |
| 10,000 | 20,000 | ≈ $1,550 | ≈ $245 | Peaks approach 300 req/min: queue or Gateway needed |
| 100,000 | 200,000 | ≈ $15,600 | ≈ $2,450 | Exceeds the 300/min limit at peak; needs AI Gateway, batching, or a contracted provider |

**Levers:**
- Make the translation on-demand (about −40% output).
- Reuse the learner's saved stories; this is already the case, since a story is generated once and practised many times.
- Lower the daily caps.
- Use gemma-4.

**Explicitly shareable public story caching is NOT implemented.** Stories are built from personal vocabulary, so sharing needs a separate design and consent.

## 7. Owner actions to switch it on (staging only)
1. ✅ 2026-11-18 owner approved for testing: Gemma 4 26B, `AI_USER_DAILY` 10, `AI_GLOBAL_DAILY` 200, and the consent text **provided it matches what is sent**. The consent was then made exact (consent v2: adds the hashed daily counter; earlier consents are asked again).
2. Run the eval (needs owner approval to create the token):
   - `node scripts/eval-stories.mjs --dry-run` first (no network).
   - Least-privilege token: Dashboard → Manage account → **Account API tokens** → Create → Custom: permissions **Account · Workers AI · Read** and **Account · Workers AI · Edit** only (Cloudflare's REST docs require both to run a model); Account resources: **this account only**; TTL: **1 day**; optional client IP filter. No Workers Scripts, D1, Access, DNS or billing permissions.
   - `CF_ACCOUNT_ID=… CF_API_TOKEN=… node scripts/eval-stories.mjs` → `docs/eval/STORY_EVAL_<date>.md` (≤ 3,000 neurons, free). Revoke the token afterwards.
3. Apply the migration to **staging D1 only**: `npx wrangler d1 execute wordloop-push-staging --remote --file worker/migrations/0004_ai_usage.sql`.
4. Add to the staging `wrangler.jsonc` in a PR. CI's isolation check still guards the D1 id. Production is untouched.
   ```jsonc
   "ai": { "binding": "AI" },
   "vars": { "WORDLOOP_ENV": "staging", "AI_STORIES": "on", "AI_STORY_MODEL": "@cf/meta/llama-3.3-70b-instruct-fp8-fast" }
   ```
5. Run iPhone UAT (`docs/PRACTICE_AI.md` §8), then decide.

**Kill switch:** set `AI_STORIES` to anything but `on` (or remove the binding). The app immediately shows «not switched on» and the learner's own texts.

## 8. iPhone UAT (installed PWA): PENDING
| ID | Steps | Expected |
|---|---|---|
| S1 | + → Practice | The deck is preselected; «6 of N words selected»; one Start button |
| S2 | Choose words → Select all → Deselect all → pick 3 → Done | Counter matches; Back returns; the selection is kept after reopening |
| S3 | Practice with AI off | A calm note «AI stories aren't switched on yet» (not an error) and «Start with a demo story» |
| S3b | Select all → Start with a demo story → Reading → result → Listening → result → Next story | Demo banner on every story; «Story 1 of N»; counts add up; nothing sent; due dates unchanged |
| S4 | (after enabling) Start → Agree | Progress, then a story with highlighted words. Tap a word: its meaning. Listen speaks the deck's language |
| S5 | Reading → finish | Right / wrong / almost counts, Next story. Card due dates are unchanged |
| S6 | Listening on the same story | Dictation with word-level marks. Without a voice there's a clear message and «Show text» |
| S7 | Select 30+ words → Start | «Story 1 of N»; Continue works after closing the app |
| S8 | Airplane mode → Start | The offline message; saved stories still open and practise |
| S9 | English UI | LTR, English strings; story text in its own language |

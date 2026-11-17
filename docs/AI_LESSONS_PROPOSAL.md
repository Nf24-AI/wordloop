# #24 AI lesson generation: decision proposal (stays OFF)

**Status:** the architecture and UI exist behind the `VITE_AI_LESSONS` build flag *and* a registered generator. No shipped build has a generator, so no lesson is ever generated, nothing is sent and nothing costs money. This document is for the owner's decision. **Nothing here is enabled.** No provider is configured and no cost is incurred.

## 1. What one lesson needs
The payload is already fixed in `src/lessons.ts`: up to ~20 selected cards (term + meanings only), the two languages, level, mode and question count. No FSRS data, reviews or other cards.

| | Estimate per lesson |
|---|---|
| Input (instructions + 20 cards) | ~1,000–1,500 tokens |
| Output (title, ~150–250-word text, 5–10 questions with quotes, JSON) | ~800–1,500 tokens |

**Cost per lesson = input tokens × input price + output tokens × output price.** At small-model prices this is a fraction of a US cent. At frontier-model prices it is a few cents. **Prices change, so the owner should read them from the provider's own pricing page on the day of the decision. This document deliberately doesn't quote them.**

## 2. Provider options
| Option | Quality for ES/EN + Arabic meanings | Privacy posture to verify | Notes |
|---|---|---|---|
| A. Anthropic Claude API (a small, fast model) | Strong multilingual; good at structured JSON | API inputs not used for training by default; check the retention period and region | One vendor key in a Worker secret |
| B. OpenAI API (a small model) | Strong | Same checks: training opt-out, retention, region | Same proxy shape |
| C. Google Gemini API | Strong | Check the paid-tier terms, because free tiers may train on inputs | Same proxy shape |
| D. Cloudflare Workers AI (open models) | Weaker Arabic/Spanish generation; more validation failures | Runs inside the same Cloudflare account; no third party | Billed with Cloudflare; no extra vendor |
| E. On-device model | Not realistic on iPhone in a PWA today | Best privacy | Not recommended now |

Recommendation for a first pilot: **A or B with a small model**, behind the limits below. D can serve as a later no-third-party fallback if its quality passes the validator.

## 3. Limits (enforced on the server, not trusted from the client)
- Per device: **3 lessons/day**, **30/month**, keyed by the hashed device token (same as push). No account or IP is stored.
- Global: a daily and monthly **budget cap** in the Worker. Over the cap, the endpoint says «unavailable today». It never fails silently and never retries in a loop.
- Max ~20 cards and ~2 KB of input per request. Output is capped at ~2,000 tokens.

## 4. Security and the server proxy
- `POST /api/lessons/generate` on the **staging** Worker first. The browser never sees the provider key.
- The key is a Worker secret, set the same way as VAPID (piped into `wrangler secret put`, never shown). Staging and Production get separate keys.
- Same-origin check, existing `PUSH_LIMIT`-style rate limiter, 10 KB body limit, schema validation of the request.
- Behind Cloudflare Access on staging. Production stays OFF until the owner signs off a staging UAT.
- Nothing is logged: no request or response bodies in logs, only counts and error classes. No D1 storage of content.

## 5. Consent and preview (already built)
The setup screen is followed by a consent screen. It shows the exact payload, the provider name and the cost/limit note, and needs an explicit checkbox. Generation is cancellable. The result opens in an **editable review**: the learner can save it as a text or reject it (reject writes nothing). Saving creates one Learning Passage. It never creates cards and never touches FSRS.

## 6. Quality checks (already built, extend before launch)
`validateLesson` (in `src/lessons.ts`) refuses output that:
- is malformed or over the length limits;
- has the wrong number of questions;
- has a quote that isn't in the text, or an answer that isn't in its quote;
- gives the answer away in the question, or repeats a question;
- uses none of the selected terms.

Refused output is never saved. Before launch, add: a **language check** (the text must be in the deck's content language; there is none today) and a length band per level.

## 7. Failures and fallback
A provider error, timeout, budget cap or offline device each show one clear message and save nothing. The learner can write or paste a text by hand (#21), which stays the default path.

## 8. Owner decisions needed
1. Approve a provider and model (or none), after reading its current pricing and data terms.
2. Approve the budget caps (per device per day/month, global per month).
3. Approve the privacy text for Settings.
4. Approve creating a staging-only API key, set by the owner.

Until all four are approved, #24 stays OFF.

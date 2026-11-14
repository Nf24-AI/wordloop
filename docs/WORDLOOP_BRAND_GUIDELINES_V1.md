# WordLoop — Brand Guidelines for Designers, Claude and Developers (V1)
**Derived from WordLoop Brand Book v1.0, 27 pages, 2026-11-14**, reviewed against `src/style.css`, `src/i18n.ts` and `docs/VOICE_AND_DESIGN_SYSTEM.md`.
**Document type:** actionable text companion to the visual PDF authored for the owner. **Not a new identity or blanket approval for brand strategy.** The original PDF is available as a deliverable in the owner's ChatGPT conversation; this Markdown is the GitHub-readable implementation reference. **Do not invent a replacement master logo.**

## 1. Governance: distinguish what is real
- **Implemented:** WordLoop name, multicolour loop mark, «كلمة اليوم، تبقى معك.» brand line, warm paper/surface, established CSS colours, IBM Plex Sans Arabic/DM Serif Display, local-first privacy explanation and existing UI lexicon.
- **Approved direction, not necessarily shipped:** «خطوات أقل، فعالية أكثر» as **product principle** (not automatically the public slogan); simplified Add #26; Folder/Deck library #15–#17; scoped review; additional meanings; context languages and voice; Smart Reminders #30 with calm Saudi verbal identity.
- **Proposed only, requiring explicit owner sign-off before publishing as formal brand claims:** vision, mission, purpose, values, positioning, any new brand promise or secondary tagline, social campaigns and untested competitive superiority claims.
- **Future product work:** #18, #24, #27–#29. The user accepted some competitor-inspired ideas but explicitly deferred their implementation. Unapproved OCR/image/PDF workflow is outside scope.

### Product definition
WordLoop helps people capture encountered words/phrases, keep them with meanings, and recall them through spaced repetition when due. It is **not** a generic all-in-one productivity suite. Existing app is offline-first; do not promise seamless cross-device sync. Full review history remains on the user's browser/device unless they explicitly export and restore backups.

## 2. Applied visual system

| Token / purpose | Established guidance |
|---|---|
| Paper / page background | `#FAF8F4` |
| Surface / cards | `#FFFDF9` |
| Ink / main text | `#181B18` |
| Existing near-black primary button | `#111412` |
| Teal / focus, meaningful highlights | `#2F7D68` |
| Mint / light selected state | `#E7F1EC` |
| Cream / quiet background | `#F4F1E9` |
| Fine border | `#E9E5DC` |
| Peach / existing accent | `#FAE9E1` |
| Supporting wash | very soft green/sea, yellow, orange and pink in **limited accent areas** |

**Use current source CSS values and components as implementation truth.** Avoid recolouring the entire app or replacing current near-black button treatment globally. **Specific approved #26 Add mockup uses a green Save CTA**; implement that within its approved screen without silently redesigning other actions.

### Logo and symbols
- WordLoop's actual brand sign is a compact **multicolour circular loop**, implemented by CSS conic-gradient in the application. Keep original icon and spacing; code/approved app asset is master for implementation.
- Small header icon is approximately **26×26 CSS pixels in existing code**; treat this as observation, not a universal minimum. Brand Book suggested a breathing space about half the ring radius, pending design-system approval.
- Do not replace the loop with an alien mark, architecture ornament, 3D cartoon, competitor logo, or invented vector master. `docs/identity-reference.png` is **inspiration only**; not a licensed app background.
- Existing `public/icons` or other current app icon assets take precedence for the installed PWA.

### Fonts, rhythm and interface density
- **IBM Plex Sans Arabic**, self-hosted, is the main user-interface typeface (weights 400/500/600/700); do not use serif for Arabic body text.
- **DM Serif Display** is an editorial accent for selected English words/headings, not a mandatory global typeface. Respect system fallback if unavailable.
- Calm visual hierarchy: one heading, one-line supportive text, one primary action, secondary controls only where useful.
- Current CSS uses radii around 12/16/22/28px and pill 999px. Reuse existing tokens rather than inventing another radius scale.
- Multicolour blurred wash is a **subtle signature** for selected hero/illustrative areas, not for every card/input. Never reduce text contrast or readability.
- Support 4.5:1 text contrast where applicable, touch targets around 44px minimum, reduced motion and predictable focus, iPhone safe areas.
- Do not add false progress bars, generic KPI dashboard, tiled gradient overload, 3D/skeuomorphic visuals or unnecessary outlined-card repetition.

## 3. Verbal Identity — how WordLoop speaks
**Personality:** helpful, reassuring, clear, calm, slightly playful, confidently practical. Saudi conversational Arabic that is understandable broadly; **no heavy slang**, no coercion or shame.
- Typical heading: **2–7 words**, one idea.
- Body: one short plain-language sentence explaining purpose or next action.
- CTA: verb + plain object («ابدأ المراجعة», «أضف بطاقة», «شوف الإجابة», «حفظ»). No jargon in primary flow.
- Error: what happened + next step; keep user's typed content for retry.
- Success: only after actual DB transaction confirms data saved. Never celebrate a click that failed to persist.
- Report statistics only when sourced from real local data. Review quality is a personal estimate, not a test-score guarantee.
- Never push guilt ("تأخرت", "فاتتك المراجعة", streak shame), overpromises ("تذكر مضمون"), marketing hype, or invented "you studied 20 minutes" analytics.
- Avoid internal words in everyday UI: FSRS, IndexedDB, Cron, JSON validation, D1 and VAPID; put technical explanations in docs or an optional "How it works" area.

### Content patterns and examples
| Context | Short title or action | Supporting copy |
|---|---|---|
| Brand line | **كلمة اليوم، تبقى معك.** | The currently implemented brand expression |
| Review due | **حان وقت المراجعة** | بضع دقائق اليوم تخلي كلماتك أقرب لذاكرتك. |
| Review empty | **ما عليك مراجعة اليوم!** | تقدر تضيف بطاقة جديدة الحين. |
| Review end | **خلصت مراجعتك، يعطيك العافية!** | Short quiet positive feedback, not pressure |
| Add | **أضف بطاقة** | محتوى + معنى واحد على الأقل؛ المثال اختياري |
| Show answer | **شوف الإجابة** | Avoid «كشف جهة البطاقة الخلفية» |
| Save success | **تم حفظ البطاقة** | Only after confirmed persistence |
| Save failure | **ما قدرنا نحفظها. جرّب مرة ثانية.** | Keep entered fields |
| Offline | **أنت بدون إنترنت** | كلماتك ومراجعتك شغّالة عادي. |
| Backup | **حمّل نسخة من كلماتك** | Browser-local data can be lost if device data is cleared |
| Due Push | **حان وقت المراجعة** | كلماتك جاهزة للمراجعة. كم دقيقة وتكمل! |
| Practice Push | **ودّك تتمرّن شوي؟** | ثلاث دقايق من يومك تصنع فرقًا. نبدأ؟ |
| Grouped due Push | **مراجعتك جاهزة** | عندك كلمات للمراجعة. نبدأ؟ |

Some examples above are **sample brand-consistent copy**, not all live application strings; verify in `src/i18n.ts` before claiming a string is implemented. For notification templates, avoid personal wording that implies unseen user behavior. Group alerts without exposing term text or unverified card counts.

### Localization and languages
- App UI locale AR or EN is **independent** from learning content language and the translated meaning language of the deck/card.
- Translate intent and tone, **not word-by-word slang**: e.g., «شوف الإجابة» → “Show answer”; «حان وقت المراجعة» → “Time for a quick review”; «ودّك تتمرّن شوي؟» → “Up for a quick practice?”.
- Content boxes use proper `dir` for their specific language; short chips `EN`, `ES`, `AR` inside the fields. No redundant prose like “لغة المحتوى:” beside every box.
- Choose speech voice from content/meaning language, never assume English because the current PWA historically began as English-learning.

## 4. Product UX principles — absolute quality bar
1. **One primary action** per screen; due cards → start review, otherwise meaningful add/next action.
2. **Context inheritance:** remember selected Deck and content/meaning languages; don't request them every save.
3. **Progressive disclosure:** second meaning and examples appear when requested; no default settings maze.
4. **Truthful system:** accurate due counts, persistence confirmation, no fabricated mastery.
5. **Preserve data:** folder moves, display changes and meaning edits must not change FSRS records or review history.
6. **Fewer interruptions:** bounded notifications, clear dialog reasons and unobtrusive quiet states.

### Approved Add (#26)
- Input box for content + one or more meaning boxes of **identical visual geometry**, with embedded short language chips and audio icon when supported. Multiple meanings belong to the **same** reviewed card.
- Optional example hidden until requested; one Save CTA. No forced upfront selection Vocabulary/Phrase/Sentence/Idiom.
- Legacy type information remains stored/importable; only the new user-facing workflow is simplified. Keep original WordLoop styling.

### Approved Library (#16) and review (#17)
- Default «مكتبتي»: title and caption, visible search, **three compact tabs** (folders/all cards/due), **two-column folders** on typical iPhone width, dashed add-folder tile, real counts, folder→deck→cards navigation.
- Avoid a standard nested file tree, fake seeded demo folders, a dashboard of statistics in the library header or a clone of competitors.
- Scoped **due review** does not change FSRS; ordinary free study is a different concept and deferred unless separately approved.

### Smart Reminders (#30)
- Each notification needs a **true reason, useful time and concise action**.
- Due review prioritized over generic nudges; group due cards; avoid repeat due-event alerts; observe opt-out and quiet hours.
- Quiet Saudi tone, no guilt, clickbait or forced streak. English equivalent respects same spirit.
- Push cloud stores minimum anonymous subscription and due metadata; no user word texts or full review log.

## 5. Strategy from Brand Book v1 — NOT YET APPROVED
These are suggested draft formulations, **not claims authorized for publication**:
- **Purpose draft:** مساعدة المتعلم على ألا تضيع الكلمات التي يلتقطها في حياته اليومية.
- **Vision draft:** أن يصبح WordLoop الرفيق الأبسط والأكثر ثقة لتثبيت المفردات والعبارات عبر اللغات، بوقت أقل وممارسة أذكى.
- **Mission draft:** نحوّل ما يختاره المتعلم من كلمات وعبارات إلى بطاقات واضحة ومراجعات في وقتها، في تجربة سهلة تحترم وقته وخصوصيته.
- **Brand promise draft:** أضفها بسهولة. راجعها في وقتها. خلّها تبقى.
- **Positioning draft:** WordLoop رفيق شخصي للتعلّم: يحوّل الكلمات التي تلتقطها إلى مراجعات مناسبة، دون زحمة القوائم والإعدادات.
- **Value candidates:** الوضوح، احترام الوقت، الثقة والصدق، الاستمرار الهادئ، الخصوصية.
- Audience/use cases include language learners, professionals, self-directed learners, and multilingual learners, but these are **strategic target hypotheses**, not measured cohorts.

Do not replace the implemented tagline «كلمة اليوم، تبقى معك.» with a draft phrase without owner approval; don't claim “best/fastest” without real comparative research.

## 6. Scientific and privacy claims
- Accurate: WordLoop uses local FSRS-7 (via `ts-fsrs`) and principles of spaced practice/active recall; the app's schedule adapts from review grades.
- Inaccurate: WordLoop itself was independently clinically validated, guarantees 90% remembrance, or learns a personal AI model from user data. A `desiredRetention: 0.9` config is a scheduling target, not an individual memory guarantee.
- Accurate: cards and review history are device-local. Optional Push sends **minimum anonymous subscription and earliest due metadata** for reminders, not vocabulary. Offline changes can temporarily make push schedule stale; backup remains user's responsibility.

## 7. Implementation and approval checklist
- [ ] Compare UI with existing `src/style.css`, `src/fonts/`, `src/i18n.ts`, `docs/VOICE_AND_DESIGN_SYSTEM.md`, logo asset.
- [ ] Owner's approved visual mockups in issue context are followed; if inaccessible, call out ambiguity rather than recreating them from memory.
- [ ] Existing identity retained, new CTA appropriate and consistent, all Arabic/English samples tested in narrow viewport.
- [ ] Error/empty/offline/success and Push copy reviewed against these principles.
- [ ] No new brand strategy promoted from draft to official without separate approval.
- [ ] Product data/FSRS/security/production change receives engineering review and real UAT.

**Original source:** WordLoop Brand Book v1.0, PDF, 27 pages, created 2026-11-14. The PDF is visually authoritative for illustrative examples and layout, while `src/style.css` and current repository assets are authoritative for implemented tokens and logo. This Markdown provides a complete readable handoff for Claude without needing to extract text from the PDF.

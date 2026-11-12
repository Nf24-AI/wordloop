# Claude task — WordLoop UI polish (Arabic RTL)

## Responsibility boundary
You own **frontend UX and visual craft only**. ChatGPT owns learning algorithms, IndexedDB, backup validation, and Cloudflare Push. Do not rewrite or bypass those systems. Do not add Supabase/auth/cloud vocabulary storage.

## Reference
Use `docs/identity-reference.png` as visual inspiration, not a brand name or logo to copy. Cultt is not our brand. WordLoop is. Desired: refined warm editorial feel, cream paper, expressive soft colour washes (teal / orange / pink / yellow), crisp near-black type, confident large headings, generous white space, restrained iconography, subtle micro-interactions. Responsive and accessible. No giant gradients on every element.

## Approved verbal identity
Voice: friendly conversational Saudi Arabic, concise and easy to read, encouraging without childish cheerleading, never blame for forgetting. No developer terminology in normal copy. Use short actionable labels.
- Hero: "حان وقت المراجعة" / when zero due: "ما عليك مراجعة اليوم!"
- Supporting: "بضع دقائق اليوم تخلي كلماتك أقرب لذاكرتك."
- CTA: "ابدأ مراجعة اليوم" / "أضف كلمة جديدة"
- Word add: "وش الكلمة الجديدة؟" / "وش معناها؟" / "احفظ الكلمة"
- Reveal: "شوف الإجابة"
- Grades: "نسيتها" / "صعبة" / "تذكرتها" / "سهلة جدًا"
- Finish: "خلصت مراجعتك، يعطيك العافية!"
- Backup: "حمّل نسخة من كلماتك" / "رجّع كلماتك من ملف"
- Notification: "عندك كلمات تستاهل مراجعة سريعة."
- Privacy: "كلماتك تبقى على جهازك."

## Key screen QA
1. Home: clear next action (review when due / add otherwise), no misleading sample data.
2. Review: card shows term+example before reveal, answer then rating four options; accessible buttons; readable phone.
3. Add: fields term/meaning mandatory, example/translation/tag optional, microphone not included, speech synthesis optional.
4. Words: searchable library, archive confirmation, due status.
5. Settings: one-click manual backup JSON, guarded restore, requests persistent browser storage, optional Web Push toggle/test. Explain Web Push conditions (online, installed to home screen on iOS).
6. No login screen, no personal account, zero word data in cloud.
7. State/error/empty states in consistent friendly voice.

## Files Claude may modify
- `src/App.tsx` presentational JSX, layout, accessibility, and text. Keep imports/API calls to `src/data.ts` and `src/push.ts` intact.
- `src/style.css` polish and responsive refinements.
- `public/icons/*`, manifest display tweaks if necessary (do not copy Cultt trademark).

## Files Claude must NOT modify without explicit approval
- `src/data.ts`, `src/push.ts`, `worker/index.ts`, `worker/schema.sql`, `wrangler.jsonc`, `package.json` and any backup format/version.
- Do not change API endpoint names, backup schema or database schema.

## Definition of done
- Typecheck `npm run typecheck`; production build `npm run build`.
- Manually smoke-test all pages at 375px, 768px, 1440px, and in RTL. Keyboard navigation and visible focus states; prefers-reduced-motion.
- Test zero words, several words, due/not due, failed import, interrupted offline usage and PWA offline shell.
- Return list of files changed, QA results and any remaining issues. Do not claim notification delivery without testing on a real phone.

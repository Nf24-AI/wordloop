# WordLoop — verbal & visual identity (v1)

## Brand idea
**كلمة اليوم، تبقى معك.** Learn a word in context. Recall it on time. Bring it into real life.

## Personality
Helpful, reassuring, clear, calm, slightly playful. Saudi conversational Arabic with straightforward, broadly understood phrases. Never a dense admin dashboard. Write in second person only where natural. Celebrate effort, not streak pressure.

## Copy patterns
- Heading: 2–7 words, one idea. e.g. "هذي كلماتك.".
- Description: one sentence why/action. e.g. "كل كلمة أضفتها خطوة جديدة في تعلمك."
- Action: verb + object, no jargon. "احفظ الكلمة", "شوف الإجابة", "حمّل نسخة من كلماتك".
- Errors: what happened + next step; never "خطأ غير معروف" if recoverable.
- Never: "مواصفات النسخ", "FSRS", "IndexedDB", "Database Sync", "تصدير JSON" in the main user flow.
- Security copy must be accurate: "كلماتك محفوظة على هذا المتصفح"; never suggest local browser data survives clearing or is synced automatically.
- No invented stats or scripted fake success messages; use real data.
- Review labels deliberately reflect subjective confidence, not assessment of correctness.

## Design tokens
- Background `#faf8f4`, foreground `#181b18`, deep near-black buttons `#111412`.
- Muted mint `#e7f1ec`, peach `#fae9e1`, cream `#f4f1e9`.
- Colour wash: blurred soft green / orange / yellow / pink. Use sparingly as signature.
- Rounded 15–25px for cards, 999px CTAs. Avoid overusing outlined cards or flat repetition.
- Arabic type: IBM Plex Sans Arabic / system fallback. English editorial detail: Georgia / DM Serif Display.
- 4.5:1 contrast for body text, readable 12–14px minimum on mobile, 44px touch targets.
- User-supplied collage `docs/identity-reference.png` is inspiration only (not to be used as a background asset).

## Important UX rules
- Data is local-only; each browser/device has separate data.
- Backup is manual; show a gentle reminder to export.
- iOS notifications work for installed home screen web apps with permission; notification timings can become outdated if app was reviewed offline without sync.
- Disabled notification state clearly points to server setup on development deployments.

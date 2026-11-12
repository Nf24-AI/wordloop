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


## Scientific positioning — claim integrity (v2)

**وعد العلامة:** «كلمة اليوم، تبقى معك.»

**الرسالة الداعمة التي تظهر في الفيديو وصفحة "عن WordLoop":**
> «WordLoop مبني على مبادئ علمية في التعلّم والذاكرة: الاسترجاع النشط والتكرار المتباعد. ويستخدم خوارزمية FSRS-7 لتقدير موعد مراجعة كل كلمة بحسب تقييم المستخدم وتاريخ مراجعاته.»

**نسخة قصيرة مناسبة للواجهات:**
> «مراجعة ذكية، مستندة إلى أبحاث التعلّم والذاكرة.»

**نسخة فيديو:**
> «وراء الفكرة علم: الاسترجاع النشط والتكرار المتباعد. وFSRS-7 تساعد WordLoop على اختيار وقت المراجعة التالي بناءً على أدائك.»

**حدود الادعاء، واجبة في كل المحتوى:**
- **صحيح:** توجد أبحاث مستقلة منشورة تدعم الاسترجاع النشط والتكرار المتباعد في التعلم، بما في ذلك مفردات اللغة الثانية.
- **صحيح:** كود WordLoop يستخدم `ts-fsrs` مع `version:'FSRS-7'` و`desiredRetention:0.9`. التوقيت يتحدث مع تقييم المراجعة.
- **غير صحيح:** الادعاء بأن WordLoop نفسه خضع لتجربة علمية محكمة أو أن نتائجه قد جرى التحقق منها سريريًا أو على عينة مستخدمين؛ لا يوجد تحقق مستقل موثق من ذلك.
- **غير صحيح:** «تضمن تذكر 90%»؛ هذه قيمة **مستهدفة في خوارزمية الجدولة** وليست ضمانًا فرديًا.
- **غير صحيح:** «تدرّبنا خوارزمية AI على بياناتك»؛ النسخة الحالية تستخدم إعدادات FSRS الافتراضية وتحدّث حالة البطاقة ومواعيدها من التقييمات، دون تدريب نموذج جديد مخصص لكل مستخدم.
- أظهر اسم FSRS-7 في «كيف تعمل؟» أو محتوى تعليمي اختياري، لا داخل الأزرار والتدفق اليومي.
- يُفضّل تقديم المنهج والمصادر في صفحة «ليش نراجع بهذه الطريقة؟»، وليس تحويل كل شاشة لشرح علمي.

**مصادر المرجعية:**
1. Karpicke & Roediger (2008), *Science*, “The Critical Importance of Retrieval for Learning”: https://doi.org/10.1126/science.1152408
2. Meta-analysis (2022), *Language Learning*, “The Effects of Spaced Practice on Second Language Learning”: https://doi.org/10.1111/lang.12479
3. FSRS-7 algorithm and model documentation: https://open-spaced-repetition.github.io/ts-fsrs/guide/model/fsrs-7
4. ts-fsrs library: https://github.com/open-spaced-repetition/ts-fsrs


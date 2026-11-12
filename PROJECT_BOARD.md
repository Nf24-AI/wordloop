# WordLoop — Product Backlog

لوحة متابعة ملاحظات المنتج والتحسينات. **كل ملاحظة قابلة للتنفيذ تُسجل GitHub Issue مستقلًا**، وليست تعليقًا ضائعًا في محادثة.

## ملفات التسليم للمطوّر (Claude)

- **[مواصفات التنفيذ الكاملة — Claude Implementation Brief](https://github.com/Nf24-AI/wordloop/blob/staging/docs/CLAUDE_IMPLEMENTATION_BRIEF.md)**: تحليل الكود، قرارات UX/المحتوى، مراحل العمل، قيود البيانات والإنتاج، ومخرجات كل PR.
- **[مصفوفة اختبارات QA/UAT](https://github.com/Nf24-AI/wordloop/blob/staging/docs/QA_UAT_MATRIX.md)**: حالات اختبار واضحة بالمعرفات ومعايير PASS/FAIL وخطوات اعتماد صاحب المنتج.
- **[قالب Pull Request](https://github.com/Nf24-AI/wordloop/blob/staging/.github/pull_request_template.md)**: توثيق التغييرات والاختبارات واللقطات والمخاطر قبل الاعتماد.

**تنبيه:** هذه الملفات أُعدت ووُثقت؛ لا يعني ذلك أن Claude برمج التعديلات. يبدأ التنفيذ من فرع `staging` عبر Pull Requests، دون نشر للإنتاج.

## قرار معتمد — بيئة الاختبار قبل الإنتاج

**اعتماد Staging / UAT:** البيئة التجريبية **أُنشئت ونُشرت** وهي محمية بـ Cloudflare Access (بريد المالك + رمز OTP). بقي إكمال مفتاح VAPID واختبارات الجوال والموافقة النهائية قبل اعتبار #2 مكتملًا.

| المهمة الجديدة | الأولوية | الحالة |
|---|---|---|
| [#2 — إعداد Staging/UAT](https://github.com/Nf24-AI/wordloop/issues/2) | P0 | In progress — بيئة معزولة ومحمية عبر OTP؛ متبقي Push وUAT |
| [#3 — Security Hardening & Testing](https://github.com/Nf24-AI/wordloop/issues/3) | P0 | In progress — API tests and rate limiter on Staging |

**تسلسل الإطلاق المعتمد:** `Feature Branch → Pull Request → Automated Tests → Staging/UAT → Security Checks → Owner Approval → Production`.

**حماية الإنتاج (مفعّلة):** غُيّر أمر بناء Production في Cloudflare من `wrangler deploy` إلى `wrangler versions upload`، حتى لا تؤدي تحديثات `main` إلى نشر تلقائي. يتطلب الإطلاق تفعيلًا يدويًا صريحًا للنسخة المرشحة بعد الموافقة. يجب التأكد من سجل Build عند أول إصدار بعد هذا التعديل.

**قيود لا يمكن تجاوزها:** عزل D1 وVAPID لكل بيئة، وعدم استخدام بيانات مستخدمين حقيقيين في الاختبارات، وعدم تحويل كلمات المستخدم إلى تخزين سحابي، وعدم الإطلاق إذا فشلت اختبارات الأمان الحرجة أو التخزين/الاستعادة.

> التنفيذ متوقف على استكمال #2 و#3؛ لا تعتبر فحوص GitHub البرمجية وحدها بديلًا عن تجربة UAT على الهاتف.


## تغييرات المنتج والواجهة (لم تُنفّذ بعد)

**التوثيق لا يعني التنفيذ:** تم تسجيل الملاحظات العشر التالية كـGitHub Issues؛ لا تظهر كتغييرات في Staging أو Production بعد. يبدأ تطويرها على فرع منفصل وتمر عبر الاختبارات والاعتماد قبل الترقية.

| # | التعديل | الأولوية | الحالة |
|---|---|---|---|
| [#4](https://github.com/Nf24-AI/wordloop/issues/4) | التحقق من مشكلة عدم ظهور الإضافة الجديدة وإصلاحها | P0 | To do |
| [#5](https://github.com/Nf24-AI/wordloop/issues/5) | أربعة أنواع: Vocabulary / Phrase / Sentence / Idiom | P1 | To do |
| [#6](https://github.com/Nf24-AI/wordloop/issues/6) | أيقونة الإعدادات وتبديل العربية/الإنجليزية | P1 | To do |
| [#7](https://github.com/Nf24-AI/wordloop/issues/7) | معلومات تعليمية عملية في الرئيسية | P2 | To do |
| [#8](https://github.com/Nf24-AI/wordloop/issues/8) | إزالة أزرار الإضافة المكررة وCTA ذكي | P1 | To do |
| [#9](https://github.com/Nf24-AI/wordloop/issues/9) | قائمة الزر الأوسط: إضافة / مراجعة / ممارسة | P1 | To do |
| [#10](https://github.com/Nf24-AI/wordloop/issues/10) | إحصائيات بطاقات مميزة بدل خلطها بمحاولات المراجعة | P1 | To do |
| [#11](https://github.com/Nf24-AI/wordloop/issues/11) | نقل خصوصية البيانات إلى الإعدادات | P2 | To do |
| [#12](https://github.com/Nf24-AI/wordloop/issues/12) | تحسين نموذج إضافة البطاقات لكل نوع | P1 | To do |
| [#13](https://github.com/Nf24-AI/wordloop/issues/13) | **Discovery فقط:** تصميم Practice للقراءة والاستماع | P2 | بانتظار اعتماد التصميم |

**ترتيب مقترح:** #4 → #5 و#12 → #10 → #8 و#9 → #6 → #11 و#7؛ أما #13 فهو نقاش وتصميم قبل البرمجة. كل تطوير يمر عبر Staging المحمية، وتحتاج أي ترقية إلى Production إلى موافقة صاحب المنتج.


## افتح قوائم المهام

| الحالة | الرابط | المعنى |
|---|---|---|
| **To do** | [المهام المفتوحة](https://github.com/Nf24-AI/wordloop/issues?q=is%3Aissue+is%3Aopen) | ملاحظات تنتظر التنفيذ |
| **In progress** | [المهام المسندة](https://github.com/Nf24-AI/wordloop/issues?q=is%3Aissue+is%3Aopen+assignee%3A%2A) | مهمة عُهد بها لشخص؛ تأكد من الحالة في وصفها |
| **Done** | [المهام المغلقة](https://github.com/Nf24-AI/wordloop/issues?q=is%3Aissue+is%3Aclosed) | مهام انتهت بعد التحقق |
| **جميع الملاحظات** | [Issues](https://github.com/Nf24-AI/wordloop/issues) | كل المهام والمناقشات |

> تنبيه: هذه **صفحة متابعة باستخدام GitHub Issues** وليست لوحة GitHub Projects Kanban. ربط المستودع بمشروع GitHub Projects يتم بشكل منفصل، ويمكن نقل الـIssues الموجودة إليه دون فقدانها.

## قواعد إدارة العمل

1. الملاحظات التي يرسلها صاحب المنتج تُحوّل إلى Issues منفصلة، واحدة لكل مشكلة أو تحسين واضح.
2. العنوان: `[To do] [واجهة / UX / Bug / Feature / Content / Notifications] وصف مختصر`.
3. الوصف يحدد **المشكلة، السلوك المتوقع، خطوات إعادة الإنتاج إن وجدت، ومعايير القبول**.
4. أي ملاحظة غير محسومة تبقى في **To do**، ولا نغيّر الحالة إلى **Done** حتى يُطبَّق التعديل ويُختبر.
5. إذا بدأ تنفيذ مهمة: نسندها إلى المنفّذ ونعلّق بتاريخ البدء أو نغيّر العنوان إلى `[In progress]`. وبعد التحقق نغلقها.
6. قبل إنشاء مهمة جديدة، نبحث في Issues حتى لا نكرر المهمة نفسها.
7. الأعمال المتعلقة بإشعارات الجوال والنشر موجودة في [Issue #1](https://github.com/Nf24-AI/wordloop/issues/1)، ولا ننسخها هنا.

## التوزيع

- **صاحب المنتج:** يرسل الملاحظات ويعتمد النتيجة.
- **ChatGPT:** يحوّل الملاحظات إلى مهام دقيقة، ويحدد الأولوية والقبول، ويتابع الأعمال التقنية.
- **Claude:** ينفّذ تحسينات التصميم والواجهة وUX، ويضع رابط PR لكل تعديل.
- **GitHub:** المصدر المعتمد لتوثيق حالة كل مهمة.

## عند إنشاء GitHub Project (Board)

افتح [Projects في حساب GitHub](https://github.com/users/Nf24-AI/projects)، وأنشئ Board باسم **WordLoop — Product Roadmap**، واربط به المستودع `Nf24-AI/wordloop`، ثم اعتمد ثلاث حالات **To do / In progress / Done**. أضف الـIssues الموجودة إلى المشروع، بحيث لا تحتاج لنسخ نصوصها.

*آخر إعداد: 12 نوفمبر 2026.*

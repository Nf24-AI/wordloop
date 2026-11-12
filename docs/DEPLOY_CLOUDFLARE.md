# نشر WordLoop على Cloudflare Workers

الواجهة وملفاتها الثابتة والـ Worker (مسارات `/api/*` والتذكير اليومي) تنتشر كلها بأمر واحد. التذكيرات اختيارية، والتطبيق يشتغل كامل بدونها.

## المتطلبات
- Node.js 24 أو أحدث (`node -v`).
- حساب Cloudflare.
- من مجلد المشروع: `npm install`
  - إذا طلع تحذير `allow-scripts` عن `workerd` أو `esbuild`، شغّل `npm approve-scripts workerd esbuild` ثم `npm install` مرة ثانية. البناء والنشر اشتغلوا عندنا بدونها، لكن `wrangler dev` يحتاج `workerd`.

## 1) تحقق قبل النشر
```sh
npm run typecheck
npm run test
npm run build
```

## 2) سجّل الدخول لـ Cloudflare
```sh
npx wrangler login
npx wrangler whoami
```

## 3) انشر (بدون تذكيرات)
```sh
npm run deploy
```
الأمر يبني المشروع (`vite build`) ثم ينشره (`wrangler deploy`) باسم `wordloop-local-first` على:
`https://wordloop-local-first.<your-subdomain>.workers.dev`

تأكد من النشر:
```sh
curl https://wordloop-local-first.<your-subdomain>.workers.dev/api/health
# {"service":"wordloop","storage":"device-only","push":"optional"}
```
في هذه المرحلة يظهر زر «فعّل التذكير»، وإذا ضغطه المستخدم تطلع له رسالة إن التذكيرات مو جاهزة. هذا متوقع.

## 4) تفعيل التذكيرات (اختياري)
1. أنشئ قاعدة D1:
   ```sh
   npx wrangler d1 create wordloop-push
   ```
   انسخ `database_id` من النتيجة.
2. أضف الربط في `wrangler.jsonc` (داخل الكائن الرئيسي، وانتبه للفاصلة قبله):
   ```jsonc
   "d1_databases": [{ "binding": "PUSH_DB", "database_name": "wordloop-push", "database_id": "<database_id>" }]
   ```
3. أنشئ الجدول على القاعدة الحقيقية:
   ```sh
   npx wrangler d1 execute wordloop-push --remote --file=worker/schema.sql
   ```
4. أنشئ مفتاح VAPID وخزّنه مباشرة كـ secret، بدون ما يمر على أي ملف:
   ```sh
   npx codefusion-vapid | npx wrangler secret put VAPID_PRIVATE_KEY
   npx wrangler secret put VAPID_SUBJECT
   # اكتب: mailto:your-email@example.com
   ```
   لا تحفظ المفتاح الخاص في Git. إذا أنشأت مفتاح جديد لاحقًا، كل الاشتراكات القديمة تتوقف ويحتاج المستخدم يفعّل التذكير من جديد.
5. انشر مرة ثانية:
   ```sh
   npm run deploy
   ```
6. تحقق:
   ```sh
   curl https://<your-domain>/api/push/key
   # المفروض يرجّع {"publicKey":"..."}، مو 503
   ```
7. التذكير اليومي مضبوط في `wrangler.jsonc` على `0 17 * * *` (UTC)، يعني 8 مساءً بتوقيت الرياض. تقدر تشوف تشغيلاته من لوحة Cloudflare: Workers ← wordloop-local-first ← Logs.

## 5) اختبار على جوال حقيقي (لازم)
- **آيفون (iOS 16.4 أو أحدث):** افتح الرابط في Safari، ثم المشاركة ← «إضافة إلى الشاشة الرئيسية». افتح التطبيق من الأيقونة، وبعدها الإعدادات ← «فعّل التذكير» ← «جرّب التذكير». التذكيرات ما تشتغل من تبويب Safari العادي.
- **أندرويد (Chrome):** الإعدادات ← «ثبّت التطبيق» (أو من قائمة Chrome)، ثم فعّل التذكير وجرّبه.
- اختبر بدون إنترنت: افتح التطبيق مرة وأنت متصل، بعدها شغّل وضع الطيران وأعد فتحه. المفروض تقدر تضيف وتراجع.

## 6) دومين خاص (اختياري)
من لوحة Cloudflare: Workers ← wordloop-local-first ← Settings ← Domains & Routes ← Add ← Custom domain. التذكيرات تحتاج HTTPS، وCloudflare يوفّره تلقائيًا.

## ملاحظات
- كل جهاز ومتصفح له كلماته الخاصة. الخادم ما يخزن إلا اشتراك التذكير، وبصمة مجهولة للجهاز، وموعد المراجعة الجاية.
- بعد أي نشر جديد، الـ Service Worker (`wordloop-shell-v4`) يحدّث نسخة التطبيق المخزنة عند أول فتح وأنت متصل.

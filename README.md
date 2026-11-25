# أثير · Aether

عميل [ستريمو](https://www.stremio.com) بواجهة عربية: يكتشف الأعمال من إضافاتك، ويشغّل **MP4 وHLS وDASH وMKV** داخل المشغل نفسه، مع ترجمات من إضافات `subtitles` وإعدادات مشاهدة كاملة.

هذا المستودع يحوّل التطبيق المصغّر (نسخة الويب داخل Fish Pocket) إلى شيئين قابلين للتوزيع:

| المخرج | ما هو | كيف تحصل عليه |
| --- | --- | --- |
| **نسخة ويب / PWA** | صفحة واحدة تعمل في Safari وتُثبَّت على الشاشة الرئيسية | تُنشر تلقائيًا على GitHub Pages مع كل دفعة |
| **غلاف iOS + IPA** | تطبيق SwiftUI صغير يحتضن WKWebView ويحمّل نفس الصفحة من داخل الحزمة | يبنيه ورك `iOS IPA` ويُرفعه كـ Artifact |

> **ملاحظة مهمة:** التطبيق المصغّر نفسه مكتوب بـ JavaScript/React، ولا يمكن تحويله إلى IPA مباشرة: الآيفون لا يبني تطبيقات iOS، وApple تحتاج شهادة توقيع. لذلك الـ IPA هنا هو **غلاف أصلي رقيق** حول نفس واجهة الويب، ويُبنى غير موقّع ليوقّعه جهازك أو أدواتك.

---

## 1. النسخة الجاهزة (بدون بناء)

بعد أول تشغيل لورك `Web`:

- **الرابط:** https://hfip.github.io/aether/
- افتحه في Safari على الآيفون ← زر المشاركة ← **إضافة إلى الشاشة الرئيسية**.
- يعمل كتطبيق مستقل (بدون شريط Safari) ويحفظ إعداداتك وإضافاتك محليًا.

> **فعّل Pages مرة واحدة** قبل أول نشر: **Settings → Pages → Build and deployment → Source: GitHub Actions**. بعدها يعيد الورك النشر تلقائيًا مع كل دفعة (أو شغّله يدويًا من تبويب Actions).

---

## 2. بناء IPA وتثبيته

1. افتح تبويب **Actions** في المستودع.
2. اختر **iOS IPA** ← **Run workflow** (أو انتظر الدفعة على `main`).
3. بعد انتهاء البناء نزّل الـ Artifact باسم `Aether-unsigned-ipa` وفكّ ضغطه لتحصل على `Aether-unsigned.ipa`.

الـ IPA **غير موقّع**، وهذا مقصود لأن التوقيع يحتاج حسابك. اختر ما يناسبك:

- **SideStore / AltStore** — يوقّعان على الجهاز بحساب Apple ID المجاني (يعمل مع IPA غير موقّع).
- **Sideloadly** — على الكمبيوتر، توقيع بحسابك.
- **شهادة تطوير خاصة** — بعد تنزيل المشروع على Mac:

  ```sh
  cd ios
  xcodegen generate
  open Aether.xcodeproj
  # اختر Team وBundle Identifier ثم Run على جهازك
  ```

  أو عبر سطر الأوامر مع شهادتك (بدون `CODE_SIGNING_ALLOWED=NO`).

غيّر `PRODUCT_BUNDLE_IDENTIFIER` في [`ios/project.yml`](ios/project.yml) إلى معرّفك قبل التوقيع بحسابك، ثم أعد توليد المشروع.

### بناء نسخة موقّعة في GitHub Actions (اختياري)

أضف هذه الأسرار إلى المستودع ثم عدّل الورك لتوقيع الحزمة:

- `BUILD_CERTIFICATE_BASE64` — شهادة `.p12` بترميز base64
- `P12_PASSWORD`
- `PROVISIONING_PROFILE_BASE64` — ملف `.mobileprovision`
- `KEYCHAIN_PASSWORD`

هذا خارج نطاق الورك الحالي عمدًا: توقيع iOS يحتاج ملفاتك الخاصة، ولا يجوز حفظها في المستودع.

---

## 3. التطوير محليًا

```sh
npm ci
npm run build     # ينتج dist/index.html كملف واحد مستقل
npm run preview   # معاينة على http://localhost:4173
```

البناء يستخدم **Rollup بنسخة WebAssembly** و**Sucrase** لتحويل JSX، لذلك لا يحتاج أي أدوات أصلية (Native) — يعمل حتى على iPad. لا حاجة إلى `esbuild` أو `Xcode` لبناء الويب.

### لماذا ملف واحد؟

`npm run build` يدمج JavaScript وCSS والأيقونات في `dist/index.html` واحد. هذا يجعل:

- GitHub Pages يخدم صفحة واحدة بسرعة،
- وغلاف WKWebView يحمّلها من `file://` دون أي طلبات محلية (لا مشاكل CORS للملفات).

---

## 4. مزامنة التطبيق مع Fish Pocket

`src/app/` هو **نفس** مصدر التطبيق المصغّر، بلا تعديلات. لتحديث أحدهما من الآخر:

```sh
# من التطبيق المصغّر إلى المستودع
cp ~/apps/aether/{App.jsx,api.js,components.jsx,media.js,player.jsx,player-settings.jsx,prefs.js,remux.js,store.js,style.css,subtitles.js,views.jsx} src/app/

# من المستودع إلى التطبيق المصغّر
cp src/app/*.{js,jsx,css} ~/apps/aether/
```

ثم `npm run build` وشغّل الفحص إن كنت داخل Fish Pocket.

---

## 5. البنية

```
src/app/            مصدر التطبيق (نفس نسخة Fish Pocket)
src/main.jsx        نقطة تركيب React للويب
index.html          قالب الصفحة (يُدمج فيه كل شيء وقت البناء)
scripts/build.mjs   بناء ملف واحد + الأيقونات
scripts/icon.mjs    توليد أيقونات PNG برمجيًا (بدون ملفات ثنائية في git)
public/             manifest + أيقونة SVG
ios/project.yml     مشروع XcodeGen (iOS 17+، iPhone وiPad)
ios/Aether/         SwiftUI + WKWebView
.github/workflows/  نشر Pages وبناء IPA
```

---

## 6. ما يعمل وما لا يعمل

**يعمل:** تصفّح إضافات ستريمو، بحث، قائمة مشاهدة، متابعة من حيث توقفت، MP4 / HLS / DASH، إعادة تغليف MKV أثناء التشغيل، ترجمات SRT/VTT من الإضافات، سرعة التشغيل، ملء الشاشة، مؤقت نوم، إحصائيات، الحلقة التالية تلقائيًا، صورة داخل صورة.

**حدود معروفة:**

- **MKV يحتاج CORS:** إعادة التغليف تقرأ بايتات الملف عبر `fetch`، فإن رفض الخادم ذلك ظهرت رسالة مع خيار النسخ إلى AetherPlayer.
- **DRM وDolby Vision وTrueHD** لا تعمل داخل WebKit، وتحتاج مشغلًا أصليًا.
- **iOS 17.1 أو أحدث** لتشغيل DASH/MKV (ManagedMediaSource).
- أول تشغيل لـ DASH/MKV يحمّل مكتبتين من CDN (dash.js وmediabunny)، فاستعمالهما يحتاج اتصالًا.

---

## 7. الحقوق

كود هذا المستودع تحت [MIT](LICENSE).

يعتمد على: [React](https://react.dev) (MIT)، [dash.js](https://github.com/Dash-Industry-Forum/dash.js) (BSD-3)، [mediabunny](https://github.com/Vanilagy/mediabunny) (MPL-2.0)، [Rollup](https://rollupjs.org) (MIT)، [Sucrase](https://github.com/alangpierce/sucrase) (MIT).

أثر لا يستضيف أي وسائط؛ كل المحتوى يأتي من الإضافات التي يضيفها المستخدم.

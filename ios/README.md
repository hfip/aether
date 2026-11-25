# غلاف iOS

تطبيق SwiftUI صغير يحمّل `dist/index.html` من داخل الحزمة عبر WKWebView.
لا يوجد منطق خاص بالتطبيق هنا: كل شيء في `src/app/`.

## بناء محلي (على Mac)

```sh
brew install xcodegen
./scripts/build-ios.sh        # يبني الويب وينسخه ثم يولّد المشروع
open ios/Aether.xcodeproj
```

في Xcode:

1. اختر هدف **Aether** ← **Signing & Capabilities**.
2. اختر Team، وغيّر Bundle Identifier إن لزم (الافتراضي `site.abdulluh.aether`).
3. شغّل على جهازك.

## IPA غير موقّع

الورك `iOS IPA` في `.github/workflows/ios.yml` يفعل نفس الخطوات على `macos-15`
ويجمع الناتج في `Aether-unsigned.ipa`، ثم يوقّعه جهازك أو SideStore/AltStore.

## ملاحظات

- `ios/Aether/Web/` يُملأ وقت البناء فقط (مُستثنى من git).
- أيقونة التطبيق تُولَّد من `scripts/icon.mjs` مع `npm run build`.
- `Info.plist` يُولَّد بواسطة XcodeGen من `project.yml`.

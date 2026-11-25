# تفعيل وركات التجميع

GitHub يمنع إنشاء أي ملف داخل `.github/workflows/` من التوكن الذي رُفع به المشروع
(يحتاج صلاحية `workflow`)، ولهذا وُضعت نسختا الوركين هنا. أمامك طريقتان:

## ١) إضافتهما يدويًا (٣٠ ثانية)

افتح رابط إنشاء الملف مباشرة، ثم الصق المحتوى من الملف المقابل واضغط **Commit changes**:

| الورك | رابط الإنشاء | المحتوى من |
| --- | --- | --- |
| بناء IPA | <https://github.com/hfip/aether/new/main?filename=.github/workflows/ios.yml> | [`ci/ios.yml`](ios.yml) |
| نشر الويب | <https://github.com/hfip/aether/new/main?filename=.github/workflows/pages.yml> | [`ci/pages.yml`](pages.yml) |

ثم:

1. **Settings → Pages → Source: GitHub Actions** (مرة واحدة).
2. **Actions → iOS IPA → Run workflow** لبناء أول IPA.
3. **Actions → Web → Run workflow** لنشر الصفحة.

## ٢) السماح للمساعد بدفعهما

أعد ربط تكامل GitHub في التطبيق مع صلاحية `workflow` (أو استخدم مفتاحًا شخصيًا
يحمل `repo` و`workflow`)، ثم اطلب من المساعد دفعهما من جديد — الملفان جاهزان هنا.

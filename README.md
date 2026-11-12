# نظام إدارة نتائج الطلبة – قسم الطوارئ / Student Results Management System

موقع ثابت (HTML + CSS + JavaScript فقط) لإدارة درجات طلبة معهد الصحة العالي – قسم الطوارئ، وحساب النتائج وفق معادلات كشف الدرجات المعتمد، وطباعة بطاقات النتائج. **البيانات تبقى على جهازك ولا تُرفع لأي خادم.**

A fully static, offline-capable web app (no backend, no build step) for managing grades, computing results exactly like the department's Excel master sheet, and exporting result cards. All data stays in the browser (IndexedDB).

---

## العربية

### النشر على GitHub Pages (5 خطوات)
1. أنشئ مستودعاً جديداً على GitHub (مثلاً `student-results`).
2. ارفع **محتويات** هذا المجلد إلى جذر المستودع (يجب أن يكون `index.html` في الجذر مباشرة).
3. افتح **Settings → Pages**.
4. في **Build and deployment** اختر **Deploy from a branch**، ثم الفرع **main** والمجلد **/ (root)** واضغط **Save**.
5. انتظر دقيقة ثم افتح الرابط `https://<اسم-المستخدم>.github.io/student-results/`.

> ملف `.nojekyll` موجود لمنع GitHub من معالجة الملفات.

### التشغيل محلياً
المتصفحات تمنع وحدات JavaScript عند فتح الملف مباشرة (`file://`)، لذا شغّل خادماً محلياً بسيطاً:
```bash
cd student-results
python -m http.server 8000
# ثم افتح http://localhost:8000
```

### الصفحات
| الصفحة | الوظيفة |
|---|---|
| لوحة المعلومات | عدد الطلبة، الناجحون، المكملون، الراسبون، معدل الصف، الخريجون؛ توزيع التقديرات، نسبة النجاح لكل مادة، معدل/أعلى/أدنى درجة لكل مادة، حلقات نسب النجاح؛ تبديل المرحلة |
| رفع ملف Excel | سحب وإفلات، كشف تلقائي للأعمدة، ملخص ومعاينة وتنبيهات، ربط يدوي للأعمدة عند الحاجة، تنزيل قالب فارغ |
| الطلبة / إدخال الدرجات | جدول بأسلوب Excel: اكتب مباشرة، Enter للأسفل، Tab للتالي، الأسهم، F2 للتعديل، Del للمسح، لصق كتلة من Excel، تراجع/إعادة، حفظ تلقائي، بحث وتصفية وترتيب، طي المراحل، لوحة جانبية لكل طالب |
| بطاقات النتائج | المرحلة الاولى / الثانية / التخرج، الدور الاول/الثاني، 1 أو 2 أو 4 بطاقات في الصفحة، تحديد الطلبة، معاينة A4، طباعة (PDF متجهي)، تنزيل PDF، صورة PNG لبطاقة واحدة |
| كشف الدرجات | جدول أفقي لكل الطلبة مع عدد ونسبة الناجحين لكل مادة، طباعة أفقية، تصدير Excel |
| الإعدادات | كل النصوص والتواقيع والشعار، قائمة المواد (الاسم، الإنكليزي، النوع، الوحدات، درجة النجاح، اسم البطاقة وموقعها، الاحتساب)، احتساب اخلاقيات المهنة، نسخ احتياطي/استعادة JSON |

### قواعد الاحتساب (مطابقة لملف Excel)
- التراجيح = الدرجة × الوحدات. نتيجة المادة: ≥ 50 ناجح وإلا راسب.
- التقدير: ≥90 امتياز، ≥80 جيد جدا، ≥70 جيد، ≥60 متوسط، ≥50 مقبول، وإلا ضعيف.
- معدل المرحلة = مجموع تراجيح كل المواد المحتسبة (ومنها الراسبة) ÷ مجموع وحدات المرحلة (60 للأولى، 76 للثانية).
- نتيجة المرحلة حسب عدد المواد الراسبة F: صفر → ناجح (معدل ≥ 60) أو مكمل بالمعدل؛ 1 → مكمل بمادة أو مكمل بمادة+المعدل؛ 2 → مكمل بمادتين أو راسب؛ 3 فأكثر → راسب.
- النتيجة النهائية: ناجح فقط إذا كانت المرحلتان ناجح والتدريب الصيفي مستوفي؛ المعدل النهائي = 0.4 × م1 + 0.6 × م2 (وإلا 0).
- **الخلية الفارغة = غير مدخلة** (تظهر "—")، ولا تُحتسب رسوباً، وتُستبعد من نسب النجاح، ويظهر الطالب "غير مكتمل" حتى تكتمل درجاته.

### الاختبار الذاتي
افتح `tests.html` (رابط "الاختبار الذاتي" أسفل القائمة). يتضمن 41 اختباراً منها مثال المواصفات: الدرجات `[88, 84, 91.5, 87.5, 86, 79, 100, 87, 100, 98]` ← مجموع التراجيح **5276**، المعدل **87.9333**، النتيجة **ناجح**، التقدير **جيد جدا**؛ ودرجة 45 واحدة مع معدل ≥ 60 ← **مكمل بمادة**؛ واختبار تصدير ثم استيراد Excel.

### ملاحظات
- **البيانات محفوظة في هذا المتصفح فقط.** مسح بيانات المتصفح يحذفها؛ نزّل نسخة احتياطية JSON بانتظام (الإعدادات ← النسخ الاحتياطي)، واستخدمها أيضاً لنقل البيانات إلى جهاز آخر.
- أفضل جودة PDF: زر **طباعة / حفظ PDF** ثم اختر "حفظ كـ PDF" (نص متجهي قابل للتحديد). زر **تنزيل PDF** يولّد الملف مباشرة كصور عالية الدقة.

---

## English

### Deploy to GitHub Pages (5 steps)
1. Create a new GitHub repository (e.g. `student-results`).
2. Upload the **contents** of this folder to the repository root (`index.html` must be at the root).
3. Open **Settings → Pages**.
4. Under **Build and deployment** choose **Deploy from a branch**, branch **main**, folder **/ (root)**, then **Save**.
5. After ~1 minute open `https://<username>.github.io/student-results/`.

Local use: ES modules do not load from `file://`; run `python -m http.server 8000` in the folder and open `http://localhost:8000`.

### Tech
- Plain HTML/CSS/vanilla JS (ES modules), no build step, no server, no CDN.
- Data: IndexedDB (localStorage fallback), autosave, undo/redo (200 steps).
- Vendored libraries in `/vendor` (pinned): SheetJS `xlsx` 0.18.5 (Apache-2.0), jsPDF 2.5.2 (MIT), html2canvas 1.4.1 (MIT, fallback only). Charts are hand-made SVG.
- Font: Cairo (SIL OFL 1.1), bundled in `/fonts` (Arabic + Latin subsets, 400/600/700/800).
- Arabic in PDF/PNG: pages are rasterised by the browser's own text engine through an SVG `foreignObject` snapshot with the font embedded, so Arabic letters are correctly joined and right-to-left. html2canvas is used only if that fails. Browser print gives vector PDFs with embedded Cairo.

### File tree
```
index.html            app shell
tests.html            self-test page (41 tests)
README.md
.nojekyll
css/  fonts.css  main.css (theme)  grid.css (entry grid)  card.css (result card + A4, also embedded in exports)
js/   app.js        router, shell, shortcuts
      config.js     default subjects/settings (factory values)
      calc.js       academic rules (pure functions)
      store.js      state, IndexedDB persistence, undo/redo
      parser.js     Excel import with header-based auto-detection
      xlsxio.js     Excel export in the template's column layout
      export.js     JSON backup, PDF/PNG rendering, print
      cardview.js   result-card HTML
      charts.js     SVG charts
      ui.js         icons, modals, toasts
      utils.js      digit normalisation, grade parsing, helpers
      pages/ dashboard.js import.js students.js cards.js master.js settings.js
vendor/ xlsx.full.min.js jspdf.umd.min.js html2canvas.min.js
fonts/  cairo-*.woff2 OFL-LICENSE.txt
assets/ logo-default.jpeg   (logo taken from the department's Excel file)
```

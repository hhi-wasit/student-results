// =============================================================
// Import page – drag & drop Excel, auto-detect, summary, preview,
// confirm; manual column mapping when detection fails.
// =============================================================
import * as store from '../store.js';
import { parseWorkbook, extractStudents, detectLayout } from '../parser.js';
import { icon, toast, modal, confirmDialog, busy } from '../ui.js';
import { downloadTemplate } from '../export.js';
import { esc, colLetter, fmt } from '../utils.js';

let root;
let lastResult = null;

export function mount(el) {
  root = el;
  lastResult = null;
  render();
}

function render() {
  const n = store.students().length;
  root.innerHTML = `
  <div class="page-head">
    <div><h2>رفع ملف Excel</h2><div class="sub">يتم قراءة الملف داخل المتصفح فقط – لا يُرفع إلى أي خادم.</div></div>
    <div class="spacer"></div>
    <button class="btn" id="tpl">${icon('download')}تحميل قالب فارغ</button>
  </div>
  <div class="card">
    <label class="dropzone" id="dz" tabindex="0" role="button" aria-label="اختر ملف Excel أو اسحبه هنا">
      <div class="big">${icon('excel')}</div>
      <h3>اسحب ملف Excel وأفلته هنا</h3>
      <p class="muted">أو انقر لاختيار ملف (.xlsx / .xls / .xlsm) – يُبحث عن ورقة <b>mastersheet</b> تلقائياً</p>
      <input type="file" id="file" accept=".xlsx,.xls,.xlsm,.xlsb,.ods,.csv" hidden />
    </label>
    ${n ? `<div class="note-box" style="margin-top:14px">${icon('info')}<div>يوجد حالياً <b>${n}</b> طالب في النظام. يمكنك عند التأكيد استبدالهم أو إضافة الطلبة الجدد إليهم.</div></div>` : ''}
  </div>
  <div id="result" style="margin-top:20px"></div>`;
  const dz = root.querySelector('#dz');
  const input = root.querySelector('#file');
  root.querySelector('#tpl').onclick = downloadTemplate;
  dz.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), input.click()));
  input.onchange = () => input.files[0] && handleFile(input.files[0]);
  ['dragenter', 'dragover'].forEach((t) => dz.addEventListener(t, (e) => (e.preventDefault(), dz.classList.add('over'))));
  ['dragleave', 'drop'].forEach((t) => dz.addEventListener(t, (e) => (e.preventDefault(), dz.classList.remove('over'))));
  dz.addEventListener('drop', (e) => e.dataTransfer.files[0] && handleFile(e.dataTransfer.files[0]));
}

async function handleFile(file) {
  const b = busy('جارٍ قراءة الملف…');
  try {
    const buf = await file.arrayBuffer();
    await new Promise((r) => setTimeout(r, 30));
    const res = parseWorkbook(new Uint8Array(buf), store.subjects());
    res.fileName = file.name;
    lastResult = res;
    b.close();
    if (!res.ok) {
      toast('تعذّر التعرف على ترتيب الأعمدة تلقائياً — حدّد الأعمدة يدوياً.', 'warn', 4500);
      openMapping(res);
    } else showResult(res);
  } catch (e) {
    b.close();
    console.error(e);
    root.querySelector('#result').innerHTML = `<div class="card note-box err">${icon('fail')}<div><b>تعذّرت قراءة الملف.</b><br/>${esc(e.message || e)}<br/>تأكد من أن الملف بصيغة Excel صالحة وغير محمي بكلمة مرور.</div></div>`;
  }
}

function showResult(res) {
  const subs = store.subjects();
  const cnt = (stage) => res.detected[stage].filter((d) => {
    const s = [...subs[stage], ...res.newSubjects[stage]].find((x) => x.id === d.subjectId);
    return s && s.counted !== false;
  }).length;
  const extra = (stage) => res.detected[stage].length - cnt(stage);
  const stuN = res.students.length;
  const allSubs = [...subs.s1, ...subs.s2, ...res.newSubjects.s1, ...res.newSubjects.s2];
  const chips = (stage) =>
    res.detected[stage]
      .map((d) => {
        const s = allSubs.find((x) => x.id === d.subjectId);
        const isNew = res.newSubjects[stage].some((x) => x.id === d.subjectId);
        return `<span class="chip ${isNew ? 'new' : s?.counted === false ? 'off' : ''}" title="العمود ${colLetter(d.gradeCol)}">${esc(s?.ar || d.name)} <small>(${s?.units ?? d.units ?? '?'} وحدات)</small></span>`;
      })
      .join('');
  const prevSubs = [...subs.s1, ...subs.s2, ...res.newSubjects.s1, ...res.newSubjects.s2].filter((s) => res.mapping.subjects[s.id] != null);
  const preview = res.students.slice(0, 50);
  const cur = store.students().length;
  root.querySelector('#result').innerHTML = `
  <div class="card">
    <div class="card-head"><div><h3>نتيجة القراءة</h3><div class="sub">الملف: ${esc(res.fileName)} – الورقة: <b>${esc(res.sheetName)}</b></div></div>
      <div class="spacer"></div><button class="btn btn-sm" id="remap">${icon('columns')}تعديل ربط الأعمدة</button></div>
    <p class="summary-line">تم العثور على ${stuN} طالب، ${cnt('s1')} مواد للمرحلة الاولى${extra('s1') ? ` (+${extra('s1')} غير محتسبة)` : ''}، ${cnt('s2')} للمرحلة الثانية${extra('s2') ? ` (+${extra('s2')} غير محتسبة)` : ''}</p>
    <div class="detected">
      <div><b>المرحلة الاولى</b><div>${chips('s1') || '<span class="muted">لا شيء</span>'}</div></div>
      <div><b>المرحلة الثانية</b><div>${chips('s2') || '<span class="muted">لا شيء</span>'}</div></div>
    </div>
    <p class="small muted" style="margin:8px 0 0">${res.mapping.cols.summer >= 0 ? `عمود التدريب الصيفي: ${colLetter(res.mapping.cols.summer)}` : 'لم يُعثر على عمود التدريب الصيفي'} · تُقرأ أعمدة "الدرجة النهائية" فقط، وتُعاد حساب كل الأعمدة المحسوبة داخل النظام.</p>
    ${res.warnings.length ? `<div class="note-box warn" style="margin-top:12px">${icon('warn')}<div><b>${res.warnings.length} تنبيه</b><ul class="warn-list">${res.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div></div>` : `<div class="note-box" style="margin-top:12px">${icon('pass')}<div>لا توجد تنبيهات — كل الدرجات صالحة.</div></div>`}
    ${stuN ? `<h4 style="margin:16px 0 8px">معاينة ${preview.length < stuN ? `(أول ${preview.length} من ${stuN})` : ''}</h4>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>ت</th><th>الاسم</th><th>المواليد</th><th>الجنس</th><th>التحصيل</th>${prevSubs.map((s) => `<th title="${esc(s.ar)}">${esc(s.cardName || s.ar)}</th>`).join('')}<th>التدريب</th></tr></thead>
    <tbody>${preview.map((s) => `<tr><td>${esc(s.serial)}</td><td>${esc(s.name)}</td><td>${esc(s.birth)}</td><td>${esc(s.gender)}</td><td>${esc(s.edu)}</td>${prevSubs.map((x) => `<td style="${s.invalid[x.id] != null ? 'background:#ffe3e7;color:#b0132b' : ''}">${s.invalid[x.id] != null ? esc(s.invalid[x.id]) : s.grades[x.id] != null ? fmt(s.grades[x.id], 2) : '—'}</td>`).join('')}<td>${esc(s.summer || '—')}</td></tr>`).join('')}</tbody></table></div>`
      : `<div class="note-box" style="margin-top:12px">${icon('info')}<div>الملف لا يحتوي على طلبة (قالب فارغ). يمكنك التأكيد ثم إضافة الطلبة من صفحة الإدخال.</div></div>`}
    <div class="btn-group" style="margin-top:16px">
      <button class="btn btn-primary" id="ok-replace">${icon('check')}تأكيد ${cur ? 'واستبدال البيانات الحالية' : 'الاستيراد'}</button>
      ${cur && stuN ? `<button class="btn" id="ok-append">${icon('plus')}إضافة إلى الطلبة الحاليين (${cur})</button>` : ''}
      <button class="btn btn-ghost" id="cancel">إلغاء</button>
    </div>
  </div>`;
  const r = root.querySelector('#result');
  r.querySelector('#remap').onclick = () => openMapping(res);
  r.querySelector('#cancel').onclick = () => (r.innerHTML = '');
  r.querySelector('#ok-replace').onclick = async () => {
    if (cur && !(await confirmDialog(`سيتم استبدال ${cur} طالب حالياً بـ ${stuN} طالب من الملف. يمكنك التراجع (Ctrl+Z) بعد ذلك. متابعة؟`, { okLabel: 'استبدال', danger: true }))) return;
    commit(res, 'replace');
  };
  r.querySelector('#ok-append')?.addEventListener('click', () => commit(res, 'append'));
  r.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function commit(res, mode) {
  for (const st of ['s1', 's2']) if (res.newSubjects[st].length) store.setSubjects(st, [...store.subjects()[st], ...res.newSubjects[st]]);
  if (mode === 'replace') store.replaceStudents(res.students, 'استيراد Excel');
  else store.addStudents(res.students.map((s) => ({ ...s, serial: '' })));
  toast(`تم استيراد ${res.students.length} طالب بنجاح`, 'success');
  location.hash = res.students.length ? '#students' : '#students';
}

/** Manual column mapping dialog. */
function openMapping(res) {
  const grid = res.grid;
  const width = Math.max(0, ...grid.slice(0, 40).map((r) => r.length));
  const sampleRows = 12;
  const mapping = res.mapping ? structuredClone(res.mapping) : { headerRow: 0, firstDataRow: 1, cols: {}, subjects: {} };
  const subs = store.subjects();
  const allSubs = [...subs.s1, ...subs.s2];
  const headerText = (c) => {
    for (let r = Math.min(mapping.headerRow ?? 0, grid.length - 1); r >= 0; r--) {
      const v = grid[r]?.[c];
      if (v != null && typeof v !== 'object' && String(v).trim()) return String(v).trim().slice(0, 28);
    }
    return '';
  };
  const colOptions = (sel) => `<option value="-1">— غير موجود —</option>` + Array.from({ length: width }, (_, c) => `<option value="${c}" ${sel === c ? 'selected' : ''}>${colLetter(c)} ${esc(headerText(c))}</option>`).join('');
  const fixed = [
    ['name', 'اسم الطالبة *'], ['serial', 'التسلسل (ت)'], ['birth', 'المواليد'], ['gender', 'النوع الاجتماعي'], ['edu', 'التحصيل الدراسي'], ['summer', 'التدريب الصيفي'], ['notes1', 'ملاحظات م1'], ['notes2', 'ملاحظات م2'], ['notesF', 'ملاحظات نهائية'],
  ];
  const preview = `<div class="tbl-wrap" style="max-height:220px"><table class="tbl"><thead><tr><th>#</th>${Array.from({ length: Math.min(width, 30) }, (_, c) => `<th>${colLetter(c)}</th>`).join('')}</tr></thead><tbody>
    ${grid.slice(0, sampleRows).map((row, r) => `<tr><td>${r + 1}</td>${Array.from({ length: Math.min(width, 30) }, (_, c) => `<td>${esc(row[c] == null || typeof row[c] === 'object' ? '' : String(row[c]).slice(0, 20))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const body = `
    <p class="small muted">${res.reason ? esc(res.reason) + ' ' : ''}حدّد العمود المقابل لكل حقل. تُقرأ الصفوف التي تحتوي على اسم فقط.</p>
    ${preview}
    <div class="form-grid" style="margin-top:14px">
      <label class="field"><span>رقم صف العناوين</span><input type="number" id="m-hr" min="1" value="${(mapping.headerRow ?? 0) + 1}"/></label>
      <label class="field"><span>أول صف للبيانات</span><input type="number" id="m-fr" min="1" value="${(mapping.firstDataRow ?? 1) + 1}"/></label>
      ${fixed.map(([k, l]) => `<label class="field"><span>${l}</span><select data-fixed="${k}">${colOptions(mapping.cols?.[k] ?? -1)}</select></label>`).join('')}
    </div>
    <h4 style="margin:16px 0 8px">أعمدة "الدرجة النهائية" للمواد</h4>
    <div class="form-grid">${allSubs.map((s) => `<label class="field"><span>${esc(s.ar)} <span class="hint">(${s.id.startsWith('s1') ? 'م1' : 'م2'})</span></span><select data-sub="${s.id}">${colOptions(mapping.subjects?.[s.id] ?? -1)}</select></label>`).join('')}</div>`;
  const m = modal({
    title: 'ربط الأعمدة يدوياً',
    body,
    wide: true,
    buttons: [
      { label: 'إلغاء', cls: 'btn-ghost', value: null },
      { label: 'محاولة الكشف التلقائي', value: 'auto' },
      { label: 'تطبيق', cls: 'btn-primary', value: 'apply' },
    ],
  });
  m.result.then((v) => {
    if (v === 'auto') {
      const det = detectLayout(grid, subs);
      if (det.ok) {
        Object.assign(res, det, extractStudents(grid, det.mapping, [...allSubs, ...det.newSubjects.s1, ...det.newSubjects.s2]), { ok: true });
        res.warnings = [...det.warnings, ...(res.warnings || [])];
        showResult(res);
      } else toast(det.reason, 'error');
      return;
    }
    if (v !== 'apply') return;
    const b = m.body;
    const mp = { headerRow: Number(b.querySelector('#m-hr').value) - 1, firstDataRow: Number(b.querySelector('#m-fr').value) - 1, cols: {}, subjects: {} };
    b.querySelectorAll('[data-fixed]').forEach((s) => (mp.cols[s.dataset.fixed] = Number(s.value)));
    b.querySelectorAll('[data-sub]').forEach((s) => Number(s.value) >= 0 && (mp.subjects[s.dataset.sub] = Number(s.value)));
    if (mp.cols.name < 0) return toast('يجب تحديد عمود اسم الطالبة.', 'error');
    const ex = extractStudents(grid, mp, allSubs);
    const detected = { s1: [], s2: [] };
    for (const s of allSubs) if (mp.subjects[s.id] != null) detected[s.id.startsWith('s1') ? 's1' : 's2'].push({ subjectId: s.id, gradeCol: mp.subjects[s.id], name: s.ar, units: s.units });
    Object.assign(res, { ok: true, mapping: mp, detected, newSubjects: { s1: [], s2: [] }, students: ex.students, warnings: ex.warnings });
    showResult(res);
  });
}

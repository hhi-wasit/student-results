// =============================================================
// Settings – institution texts, signatories, logo, rules, subjects,
// backup / restore, danger zone. Everything autosaves.
// =============================================================
import * as store from '../store.js';
import { icon, toast, confirmDialog } from '../ui.js';
import { SUBJECT_TYPES, DEFAULT_SUBJECTS, defaultState } from '../config.js';
import { exportJSON, readBackup, exportXlsx, downloadTemplate } from '../export.js';
import { esc, imageFileToDataURL, debounce } from '../utils.js';
import { logoSrc } from '../cardview.js';
import { stageTotalUnits } from '../calc.js';

let root;
export function mount(el) {
  root = el;
  render();
}

const TEXT_FIELDS = [
  ['ministry', 'الوزارة'], ['directorate', 'الدائرة'], ['institute', 'المعهد'], ['department', 'القسم'], ['year', 'السنة الدراسية'],
  ['stage1Name', 'اسم المرحلة الاولى'], ['stage2Name', 'اسم المرحلة الثانية'], ['finalName', 'عنوان النتيجة النهائية'],
];

function render() {
  const S = store.settings();
  const subs = store.subjects();
  const ethics = subs.s1.find((s) => s.id === 's1_ethics');
  root.innerHTML = `
  <div class="page-head"><div><h2>الإعدادات</h2><div class="sub">كل التغييرات تُحفظ تلقائياً في هذا المتصفح</div></div></div>
  <div class="stack">
    <div class="card">
      <h3 class="section-t">${icon('card')}بيانات المؤسسة والبطاقة</h3>
      <div class="form-grid">
        ${TEXT_FIELDS.map(([k, l]) => `<label class="field"><span>${l}</span><input type="text" data-s="${k}" value="${esc(S[k])}"/></label>`).join('')}
        <label class="field"><span>الدور</span><select data-s="round" data-num="1"><option value="1" ${S.round == 1 ? 'selected' : ''}>الدور الاول</option><option value="2" ${S.round == 2 ? 'selected' : ''}>الدور الثاني</option></select></label>
        <label class="field" style="grid-column:1/-1"><span>نص الملاحظة على البطاقة</span><input type="text" data-s="note" value="${esc(S.note)}"/></label>
      </div>
      <h3 class="section-t" style="margin-top:18px">التواقيع</h3>
      <div class="form-grid">
        <label class="field"><span>صفة الموقّع الأول</span><input type="text" data-s="chairTitle" value="${esc(S.chairTitle)}"/></label>
        <label class="field"><span>الاسم</span><input type="text" data-s="chairName" value="${esc(S.chairName)}"/></label>
        <label class="field"><span>صفة الموقّع الثاني</span><input type="text" data-s="deanTitle" value="${esc(S.deanTitle)}"/></label>
        <label class="field"><span>الاسم</span><input type="text" data-s="deanName" value="${esc(S.deanName)}"/></label>
      </div>
      <h3 class="section-t" style="margin-top:18px">الشعار (يظهر على البطاقة)</h3>
      <div class="logo-box"><img src="${esc(logoSrc(S))}" alt="الشعار" id="logo-img"/>
        <div class="btn-group"><label class="btn">${icon('image')}رفع شعار<input type="file" accept="image/*" id="logo-file" hidden/></label>
        <button class="btn btn-ghost" id="logo-reset" ${S.logo ? '' : 'disabled'}>استعادة الشعار الافتراضي</button></div></div>
    </div>

    <div class="card">
      <h3 class="section-t">${icon('test')}قواعد الاحتساب</h3>
      <div class="form-grid">
        <label class="field"><span>حد معدل المرحلة للنجاح</span><input type="number" step="0.01" data-s="avgPassMark" data-num="1" value="${S.avgPassMark}"/><span class="hint">افتراضياً 60 (يحدد ناجح / مكمل بالمعدل)</span></label>
        <label class="field"><span>وزن المرحلة الاولى في المعدل النهائي</span><input type="number" step="0.05" min="0" max="1" data-s="w1" data-num="1" value="${S.w1}"/></label>
        <label class="field"><span>وزن المرحلة الثانية</span><input type="number" step="0.05" min="0" max="1" data-s="w2" data-num="1" value="${S.w2}"/></label>
        <label class="field"><span>عدد المراتب العشرية للمعدل</span><input type="number" min="0" max="4" data-s="decimals" data-num="1" value="${S.decimals}"/></label>
      </div>
      <div class="btn-group" style="margin-top:14px;gap:22px">
        ${ethics ? `<label class="switch"><input type="checkbox" id="ethics" ${ethics.counted ? 'checked' : ''}/>احتساب مادة "${esc(ethics.ar)}" في المعدل</label>` : ''}
        <label class="switch"><input type="checkbox" data-s="showNumericOnCard" data-bool="1" ${S.showNumericOnCard ? 'checked' : ''}/>إظهار الدرجة الرقمية على البطاقة افتراضياً</label>
        <label class="field" style="flex-direction:row;align-items:center;gap:8px"><span>بطاقات في الصفحة افتراضياً</span><select data-s="cardsPerPage" data-num="1" style="width:auto">${[1, 2, 4].map((n) => `<option ${S.cardsPerPage == n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      </div>
    </div>

    ${['s1', 's2'].map((st) => subjectCard(st)).join('')}

    <div class="card">
      <h3 class="section-t">${icon('json')}النسخ الاحتياطي والتصدير</h3>
      <p class="small muted" style="margin-top:0">البيانات محفوظة في هذا المتصفح فقط. احفظ نسخة احتياطية JSON بانتظام، أو لنقل البيانات إلى جهاز آخر.</p>
      <div class="btn-group">
        <button class="btn btn-primary" id="bk">${icon('download')}تنزيل نسخة احتياطية (JSON)</button>
        <label class="btn">${icon('restore')}استعادة من نسخة احتياطية<input type="file" accept=".json,application/json" id="restore" hidden/></label>
        <button class="btn" id="xlsx">${icon('excel')}تصدير Excel</button>
        <button class="btn" id="tpl">${icon('download')}قالب Excel فارغ</button>
      </div>
    </div>

    <div class="card" style="border:1px solid #f6c9d0">
      <h3 class="section-t" style="color:var(--fail)">${icon('warn')}منطقة الخطر</h3>
      <div class="btn-group">
        <button class="btn" id="del-all">${icon('trash')}حذف جميع الطلبة</button>
        <button class="btn btn-danger" id="reset">${icon('restore')}إعادة ضبط النظام بالكامل</button>
      </div>
    </div>
  </div>`;
  wire();
}

function subjectCard(st) {
  const S = store.settings();
  const list = store.subjects()[st];
  const total = stageTotalUnits(list);
  return `<div class="card">
    <div class="card-head"><h3 class="section-t" style="margin:0">${icon('list')}مواد ${esc(st === 's1' ? S.stage1Name : S.stage2Name)}</h3><div class="spacer"></div>
      <span class="pill pill-inc">مجموع الوحدات المحتسبة: ${total}</span>
      <button class="btn btn-sm" data-add="${st}">${icon('plus')}إضافة مادة</button>
      <button class="btn btn-sm btn-ghost" data-reset-sub="${st}">استعادة الافتراضي</button></div>
    <div style="overflow:auto"><table class="tbl subj-tbl"><thead><tr><th>الاسم العربي</th><th>English</th><th>النوع</th><th>الوحدات</th><th>درجة النجاح</th><th>الاسم على البطاقة</th><th>سطر البطاقة</th><th>الترتيب</th><th>محتسبة</th><th></th></tr></thead>
    <tbody>${list.map((s, i) => `<tr data-st="${st}" data-i="${i}">
      <td><input data-k="ar" value="${esc(s.ar)}" style="min-width:170px"/></td>
      <td><input data-k="en" value="${esc(s.en)}" dir="ltr" style="min-width:150px"/></td>
      <td><select data-k="type">${SUBJECT_TYPES.map((t) => `<option ${t === s.type ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
      <td><input data-k="units" type="number" min="0" step="1" class="num" value="${s.units}"/></td>
      <td><input data-k="passMark" type="number" min="0" max="100" step="0.5" class="num" value="${s.passMark ?? 50}"/></td>
      <td><input data-k="cardName" value="${esc(s.cardName || '')}" style="min-width:150px"/></td>
      <td><select data-k="cardRow"><option value="1" ${s.cardRow == 1 ? 'selected' : ''}>1</option><option value="2" ${s.cardRow != 1 ? 'selected' : ''}>2</option></select></td>
      <td><input data-k="cardPos" type="number" min="1" class="num" style="width:56px" value="${s.cardPos ?? ''}"/></td>
      <td><label class="switch"><input type="checkbox" data-k="counted" ${s.counted ? 'checked' : ''}/></label></td>
      <td><button class="icon-btn danger" data-del-sub title="حذف المادة" aria-label="حذف المادة">${icon('trash')}</button></td>
    </tr>${s.hint ? `<tr class="hint-row"><td colspan="10">⚠ ${esc(s.hint)}</td></tr>` : ''}`).join('')}</tbody></table></div>
  </div>`;
}

function wire() {
  const saveField = debounce((k, v) => store.updateSettings({ [k]: v }), 250);
  root.querySelectorAll('[data-s]').forEach((inp) => {
    const ev = inp.tagName === 'SELECT' || inp.type === 'checkbox' ? 'change' : 'input';
    inp.addEventListener(ev, () => {
      let v = inp.dataset.bool ? inp.checked : inp.value;
      if (inp.dataset.num) {
        v = Number(v);
        if (!Number.isFinite(v)) return;
      }
      saveField(inp.dataset.s, v);
    });
  });
  // logo
  root.querySelector('#logo-file').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const url = await imageFileToDataURL(f, 360);
      store.updateSettings({ logo: url });
      toast('تم تحديث الشعار', 'success');
      render();
    } catch {
      toast('تعذّر قراءة الصورة', 'error');
    }
  };
  root.querySelector('#logo-reset').onclick = () => { store.updateSettings({ logo: '' }); render(); };
  // ethics toggle
  root.querySelector('#ethics')?.addEventListener('change', (e) => {
    const list = store.subjects().s1.map((s) => (s.id === 's1_ethics' ? { ...s, counted: e.target.checked } : s));
    store.setSubjects('s1', list);
    toast(e.target.checked ? 'أصبحت مادة اخلاقيات المهنة محتسبة' : 'مادة اخلاقيات المهنة غير محتسبة', 'info');
    render();
  });
  // subjects
  root.querySelectorAll('tr[data-st]').forEach((tr) => {
    const st = tr.dataset.st, i = Number(tr.dataset.i);
    tr.querySelectorAll('[data-k]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const list = store.subjects()[st].map((s) => ({ ...s }));
        const k = inp.dataset.k;
        let v = inp.type === 'checkbox' ? inp.checked : inp.value;
        if (['units', 'passMark', 'cardRow', 'cardPos'].includes(k)) {
          v = Number(v);
          if (!Number.isFinite(v) || v < 0) return toast('قيمة غير صالحة', 'error');
        }
        list[i][k] = v;
        store.setSubjects(st, list);
        if (['units', 'counted'].includes(k)) render();
      });
    });
    tr.querySelector('[data-del-sub]').onclick = async () => {
      const s = store.subjects()[st][i];
      if (!(await confirmDialog(`حذف المادة "${s.ar}"؟ لن تُحذف الدرجات المخزنة لكنها لن تظهر ولن تُحتسب.`, { okLabel: 'حذف', danger: true }))) return;
      store.setSubjects(st, store.subjects()[st].filter((_, j) => j !== i));
      render();
    };
  });
  root.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => {
    const st = b.dataset.add;
    const list = [...store.subjects()[st]];
    list.push({ id: `${st}_c${Date.now().toString(36)}`, ar: 'مادة جديدة', en: '', type: 'مساعدة', units: 2, passMark: 50, counted: true, cardName: 'مادة جديدة', cardRow: 2, cardPos: list.length + 1 });
    store.setSubjects(st, list);
    render();
  }));
  root.querySelectorAll('[data-reset-sub]').forEach((b) => (b.onclick = async () => {
    const st = b.dataset.resetSub;
    if (!(await confirmDialog('استعادة قائمة المواد الافتراضية لهذه المرحلة؟ (الدرجات المخزنة لا تُحذف)'))) return;
    store.setSubjects(st, structuredClone(DEFAULT_SUBJECTS[st]));
    render();
  }));
  // backup
  root.querySelector('#bk').onclick = exportJSON;
  root.querySelector('#xlsx').onclick = exportXlsx;
  root.querySelector('#tpl').onclick = downloadTemplate;
  root.querySelector('#restore').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const st = await readBackup(f);
      if (!(await confirmDialog(`استعادة النسخة (${st.students.length} طالب)؟ ستُستبدل كل البيانات والإعدادات الحالية.`, { okLabel: 'استعادة', danger: true }))) return;
      store.replaceAll(st);
      toast('تمت الاستعادة بنجاح', 'success');
      render();
    } catch (err) {
      toast(err.message || 'ملف غير صالح', 'error');
    }
    e.target.value = '';
  };
  // danger
  root.querySelector('#del-all').onclick = async () => {
    const n = store.students().length;
    if (!n) return toast('لا يوجد طلبة', 'info');
    if (!(await confirmDialog(`حذف جميع الطلبة (${n})؟ يمكنك التراجع مباشرة بـ Ctrl+Z.`, { okLabel: 'حذف الكل', danger: true }))) return;
    store.deleteStudents(store.students().map((s) => s.id));
    toast('تم حذف جميع الطلبة', 'success');
  };
  root.querySelector('#reset').onclick = async () => {
    if (!(await confirmDialog('إعادة ضبط النظام بالكامل؟ ستُحذف كل البيانات والإعدادات نهائياً. يُنصح بتنزيل نسخة احتياطية أولاً.', { okLabel: 'إعادة الضبط', danger: true }))) return;
    store.replaceAll(defaultState());
    toast('تمت إعادة الضبط', 'success');
    render();
  };
}

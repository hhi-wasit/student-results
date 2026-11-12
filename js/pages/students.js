// =============================================================
// Students / grade entry – spreadsheet-like grid built for speed.
//  • Enter/Tab/arrow navigation, type-to-edit, F2 / double-click to edit
//  • multi-cell copy/paste from Excel (TSV), Delete clears a range
//  • undo/redo (Ctrl+Z / Ctrl+Y), autosave
//  • validation 0–100 with decimals; invalid cells highlighted
//  • live computed columns; collapsible stage groups; search/filter/sort
//  • pagination above 150 rows; per-student side panel
// =============================================================
import * as store from '../store.js';
import { computeStudent, isNum } from '../calc.js';
import { icon, toast, confirmDialog, promptText, resultPill, emptyState } from '../ui.js';
import { GENDERS, EDUCATIONS, SUMMER_OPTIONS } from '../config.js';
import { esc, fmt, parseGrade, normalizeDigits, debounce, arCompare } from '../utils.js';

const ui = { q: '', filter: 'all', sort: 'serial', collapsed: { s1: false, s2: false }, details: false, page: 0, pageSize: 100 };
let root, wrap, table, tbody, off;
let cols = [];
let rows = []; // filtered + sorted students
let pageRows = [];
let act = { r: 0, c: 1 };
let anchor = null;
let editing = null;
let dragging = false;
let compCache = new Map();

const comp = (st) => {
  let c = compCache.get(st.id);
  if (!c) {
    const s = store.get();
    c = computeStudent(st, s.subjects, s.settings);
    compCache.set(st.id, c);
  }
  return c;
};

// ---------------------------------------------------------------- columns
function buildColumns() {
  const { subjects, settings } = store.get();
  const d = settings.decimals ?? 2;
  const C = [];
  C.push({ key: 'serial', label: 'ت', group: 'id', edit: 'text', cls: 'st-0 num', val: (s) => s.serial });
  C.push({ key: 'name', label: 'اسم الطالبة', group: 'id', edit: 'text', cls: 'st-1 t-l', val: (s) => s.name });
  C.push({ key: 'birth', label: 'المواليد', group: 'id', edit: 'text', cls: 'num', val: (s) => s.birth });
  C.push({ key: 'gender', label: 'النوع الاجتماعي', group: 'id', edit: 'select', options: GENDERS, val: (s) => s.gender });
  C.push({ key: 'edu', label: 'التحصيل الدراسي', group: 'id', edit: 'select', options: EDUCATIONS, val: (s) => s.edu });
  for (const stage of ['s1', 's2']) {
    const g = stage;
    if (!ui.collapsed[stage]) {
      for (const sub of subjects[stage]) {
        C.push({
          key: `g:${sub.id}`, label: sub.ar, sub, group: g, edit: 'num', cls: 'num',
          val: (s) => (s.invalid?.[sub.id] != null ? s.invalid[sub.id] : s.grades[sub.id] ?? ''),
          show: (s, c) => {
            if (s.invalid?.[sub.id] != null) return { html: esc(s.invalid[sub.id]), cls: 'invalid', title: 'قيمة غير صالحة — يجب أن تكون رقماً بين 0 و 100' };
            const row = c[stage].rows[sub.id];
            if (row.grade == null) return { html: '—', cls: 'empty-g' };
            return { html: fmt(row.grade, 2), cls: row.result === 'راسب' ? 'fail' : 'pass', title: `${row.label} – التراجيح ${fmt(row.weighted, 2)}` };
          },
        });
        if (ui.details) {
          C.push({ key: `w:${sub.id}`, label: 'التراجيح', group: g, cls: 'ro num', show: (s, c) => { const r = c[stage].rows[sub.id]; return { html: r.grade == null ? '—' : fmt(r.weighted, 2), cls: r.result === 'راسب' ? 'fail' : '' }; } });
          C.push({ key: `l:${sub.id}`, label: 'التقدير', group: g, cls: 'ro', show: (s, c) => { const r = c[stage].rows[sub.id]; return { html: r.grade == null ? '—' : esc(r.label), cls: r.result === 'راسب' ? 'fail' : r.result ? 'pass' : '' }; } });
        }
      }
    }
    if (ui.details) C.push({ key: `${stage}:sum`, label: 'مجموع التراجيح', group: g, cls: 'ro num sum-col', show: (s, c) => ({ html: c[stage].empty ? '—' : fmt(c[stage].sum, 2) }) });
    C.push({ key: `${stage}:avg`, label: 'المعدل', group: g, cls: 'ro num sum-col', show: (s, c) => ({ html: c[stage].complete ? fmt(c[stage].avg, d) : '—', title: c[stage].complete ? '' : `مفقود: ${c[stage].missing} مادة` }) });
    C.push({ key: `${stage}:res`, label: 'النتيجة', group: g, cls: 'ro sum-col', show: (s, c) => ({ html: resultPill(c[stage].result, c[stage].kind) }) });
    C.push({ key: `${stage}:lab`, label: 'التقدير', group: g, cls: 'ro sum-col', show: (s, c) => ({ html: esc(c[stage].label) }) });
    if (!ui.collapsed[stage]) C.push({ key: stage === 's1' ? 'notes1' : 'notes2', label: 'ملاحظات', group: g, edit: 'text', cls: 't-l', val: (s) => s[stage === 's1' ? 'notes1' : 'notes2'] });
  }
  C.push({ key: 'summer', label: 'التدريب الصيفي', group: 'fn', edit: 'select', options: SUMMER_OPTIONS, val: (s) => s.summer, show: (s) => ({ html: s.summer ? esc(s.summer) : '—', cls: s.summer === 'غير مستوفي' ? 'fail' : s.summer ? 'pass' : 'empty-g' }) });
  C.push({ key: 'f:avg', label: 'المعدل النهائي', group: 'fn', cls: 'ro num sum-col', show: (s, c) => ({ html: c.final.complete ? fmt(c.final.avg, d) : '—' }) });
  C.push({ key: 'f:res', label: 'النتيجة النهائية', group: 'fn', cls: 'ro sum-col', show: (s, c) => ({ html: resultPill(c.final.result, c.final.kind) }) });
  C.push({ key: 'f:lab', label: 'التقدير', group: 'fn', cls: 'ro sum-col', show: (s, c) => ({ html: esc(c.final.label) }) });
  C.push({ key: 'notesF', label: 'ملاحظات', group: 'fn', edit: 'text', cls: 't-l', val: (s) => s.notesF });
  C.push({ key: '_act', label: '', group: 'act', cls: 'ro act-col', show: (s) => ({ html: `<button class="icon-btn" data-open="${s.id}" title="لوحة الطالب" aria-label="فتح لوحة الطالب">${icon('panel')}</button><button class="icon-btn danger" data-del="${s.id}" title="حذف" aria-label="حذف الطالب">${icon('trash')}</button>` }) });
  cols = C;
}
const isEditable = (c) => !!cols[c]?.edit;

// ---------------------------------------------------------------- data view
function applyView() {
  compCache = new Map();
  const all = store.students();
  const q = normalizeDigits(ui.q.trim());
  let list = all.filter((s) => !q || String(s.name).includes(q) || String(s.serial) === q);
  if (ui.filter !== 'all') {
    const [stage, kind] = ui.filter.split(':');
    list = list.filter((s) => {
      const c = comp(s);
      if (kind === 'invalid') return Object.keys(s.invalid || {}).length > 0;
      const x = c[stage];
      if (kind === 'inc') return x.kind === 'inc' || x.kind === 'none';
      return x.kind === kind;
    });
  }
  if (ui.sort === 'alpha') list = [...list].sort((a, b) => arCompare(a.name, b.name));
  else if (ui.sort === 'final') {
    const key = (s) => {
      const c = comp(s);
      return [c.final.complete ? c.final.avg : -1, c.s2.avg ?? -1, c.s1.avg ?? -1];
    };
    list = [...list].sort((a, b) => {
      const ka = key(a), kb = key(b);
      for (let i = 0; i < 3; i++) if (kb[i] !== ka[i]) return kb[i] - ka[i];
      return arCompare(a.name, b.name);
    });
  } else list = [...list].sort((a, b) => (Number(a.serial) || 1e9) - (Number(b.serial) || 1e9) || a.id - b.id);
  rows = list;
  const paged = rows.length > 150;
  const pages = paged ? Math.ceil(rows.length / ui.pageSize) : 1;
  ui.page = Math.min(ui.page, pages - 1);
  pageRows = paged ? rows.slice(ui.page * ui.pageSize, (ui.page + 1) * ui.pageSize) : rows;
}

// ---------------------------------------------------------------- render
export function mount(el) {
  root = el;
  root.innerHTML = `
  <div class="page-head">
    <div><h2>الطلبة وإدخال الدرجات</h2><div class="sub">جدول سريع الإدخال – يُحفظ تلقائياً في المتصفح</div></div>
    <div class="spacer"></div>
    <div class="btn-group">
      <button class="btn btn-primary" id="add">${icon('plus')}إضافة طالب</button>
      <button class="btn" id="paste-names">${icon('list')}لصق قائمة أسماء</button>
    </div>
  </div>
  <div class="toolbar">
    <div class="search">${icon('search')}<input type="search" id="q" placeholder="بحث بالاسم أو التسلسل…" aria-label="بحث"/></div>
    <select id="filter" aria-label="تصفية حسب النتيجة">
      <option value="all">كل الطلبة</option>
      <optgroup label="المرحلة الاولى"><option value="s1:pass">ناجح</option><option value="s1:supp">مكمل</option><option value="s1:fail">راسب</option><option value="s1:inc">غير مكتمل</option></optgroup>
      <optgroup label="المرحلة الثانية"><option value="s2:pass">ناجح</option><option value="s2:supp">مكمل</option><option value="s2:fail">راسب</option><option value="s2:inc">غير مكتمل</option></optgroup>
      <optgroup label="النتيجة النهائية"><option value="final:pass">ناجح</option><option value="final:fail">راسب</option><option value="final:inc">غير مكتمل</option></optgroup>
      <optgroup label="أخرى"><option value="x:invalid">قيم غير صالحة</option></optgroup>
    </select>
    <div class="pills flat" aria-label="الترتيب">
      <button data-sort="serial">حسب التسلسل</button>
      <button data-sort="alpha">${''}أبجدياً</button>
      <button data-sort="final">تنازلياً حسب المعدل النهائي</button>
    </div>
    <span class="sep"></span>
    <label class="switch"><input type="checkbox" id="details"/>التراجيح والتقديرات</label>
    <span class="sep"></span>
    <button class="icon-btn" id="undo" title="تراجع (Ctrl+Z)" aria-label="تراجع">${icon('undo')}</button>
    <button class="icon-btn" id="redo" title="إعادة (Ctrl+Y)" aria-label="إعادة">${icon('redo')}</button>
    <button class="btn btn-sm" id="del-sel" title="حذف الطلبة في الصفوف المحددة">${icon('trash')}حذف المحدد</button>
    <button class="btn btn-sm" id="renumber" title="إعادة ترقيم التسلسل حسب الترتيب الحالي">إعادة الترقيم</button>
  </div>
  <div id="grid-host"></div>
  <div class="pager" id="pager"></div>
  <div class="grid-meta" id="meta"></div>`;

  root.querySelector('#q').value = ui.q;
  root.querySelector('#filter').value = ui.filter;
  root.querySelector('#details').checked = ui.details;
  root.querySelector('#q').addEventListener('input', debounce((e) => { ui.q = e.target.value; ui.page = 0; refresh(); }, 180));
  root.querySelector('#filter').onchange = (e) => { ui.filter = e.target.value; ui.page = 0; refresh(); };
  root.querySelector('#details').onchange = (e) => { ui.details = e.target.checked; refresh(); };
  root.querySelectorAll('[data-sort]').forEach((b) => (b.onclick = () => { ui.sort = b.dataset.sort; refresh(); }));
  root.querySelector('#add').onclick = addOne;
  root.querySelector('#paste-names').onclick = pasteNames;
  root.querySelector('#undo').onclick = () => doUndo();
  root.querySelector('#redo').onclick = () => doRedo();
  root.querySelector('#del-sel').onclick = deleteSelectedRows;
  root.querySelector('#renumber').onclick = async () => {
    if (!(await confirmDialog('سيُعاد ترقيم عمود التسلسل (ت) لكل الطلبة حسب ترتيبهم المخزّن 1، 2، 3… متابعة؟'))) return;
    store.renumber();
  };

  off = store.on((type, d) => {
    if (type === 'cells') {
      d.ids.forEach((id) => compCache.delete(id));
      updateRows(d.ids);
      updateMeta();
      drawerSync(d.ids);
    } else if (['students', 'all', 'subjects', 'settings'].includes(type)) refresh();
    else if (type === 'history') updateHistoryBtns();
  });
  document.addEventListener('paste', onPaste);
  document.addEventListener('copy', onCopy);
  document.addEventListener('mouseup', onMouseUp);
  refresh();
}
export function unmount() {
  off?.();
  document.removeEventListener('paste', onPaste);
  document.removeEventListener('copy', onCopy);
  document.removeEventListener('mouseup', onMouseUp);
  closeDrawer();
}

function refresh() {
  cancelEdit();
  buildColumns();
  applyView();
  root.querySelectorAll('[data-sort]').forEach((b) => b.classList.toggle('on', b.dataset.sort === ui.sort));
  const host = root.querySelector('#grid-host');
  const total = store.students().length;
  if (!total) {
    host.innerHTML = emptyState({
      iconName: 'users',
      title: 'لا يوجد طلبة بعد',
      text: 'أضف طالباً، أو الصق قائمة أسماء، أو ارفع ملف Excel. يتكيف الجدول تلقائياً مع أي عدد من الطلبة.',
      actions: `<button class="btn btn-primary" data-x="add">${icon('plus')}إضافة طالب</button><button class="btn" data-x="paste">${icon('list')}لصق قائمة أسماء</button><a class="btn" href="#import">${icon('upload')}رفع ملف Excel</a>`,
    });
    host.querySelector('[data-x=add]').onclick = addOne;
    host.querySelector('[data-x=paste]').onclick = pasteNames;
    root.querySelector('#pager').innerHTML = '';
    updateMeta();
    updateHistoryBtns();
    return;
  }
  const scroll = wrap ? [wrap.scrollTop, wrap.scrollLeft] : null;
  host.innerHTML = `<div class="sg-wrap" tabindex="0" role="grid" aria-label="جدول الدرجات" aria-rowcount="${rows.length}">
    <table class="sg"><thead>${headHTML()}</thead><tbody></tbody></table>
    ${pageRows.length ? '' : '<div class="grid-empty">لا توجد نتائج مطابقة للبحث أو التصفية.</div>'}</div>`;
  wrap = host.querySelector('.sg-wrap');
  table = wrap.querySelector('table');
  tbody = table.tBodies[0];
  tbody.innerHTML = pageRows.map((s, r) => rowHTML(s, r)).join('');
  if (scroll) [wrap.scrollTop, wrap.scrollLeft] = scroll;
  wireGrid();
  act.r = Math.min(act.r, Math.max(0, pageRows.length - 1));
  if (!isEditable(act.c)) act.c = 1;
  paintSel();
  renderPager();
  updateMeta();
  updateHistoryBtns();
}

function headHTML() {
  const { subjects, settings } = store.get();
  const groups = [];
  for (const c of cols) {
    const g = c.group;
    const last = groups[groups.length - 1];
    if (last && last.g === g) last.n++;
    else groups.push({ g, n: 1 });
  }
  const gname = { s1: settings.stage1Name, s2: settings.stage2Name, fn: settings.finalName };
  let r1 = '';
  let idSeen = 0;
  for (const gr of groups) {
    if (gr.g === 'id') {
      r1 += `<th class="st-0" rowspan="2">ت</th><th class="st-1" rowspan="2">اسم الطالبة</th>`;
      if (gr.n > 2) r1 += `<th colspan="${gr.n - 2}">بيانات الطالب</th>`;
      idSeen = 1;
    } else if (gr.g === 's1' || gr.g === 's2') {
      r1 += `<th colspan="${gr.n}" class="g-${gr.g}"><button class="grp-toggle ${ui.collapsed[gr.g] ? 'collapsed' : ''}" data-collapse="${gr.g}" aria-expanded="${!ui.collapsed[gr.g]}">${icon('chevronDown')}${esc(gname[gr.g])}${ui.collapsed[gr.g] ? ' (مطوية)' : ''}</button> <span class="units">مجموع الوحدات ${subjects[gr.g].filter((s) => s.counted).reduce((a, s) => a + Number(s.units || 0), 0)}</span></th>`;
    } else if (gr.g === 'fn') r1 += `<th colspan="${gr.n}" class="g-fn">${esc(gname.fn)}</th>`;
    else r1 += `<th rowspan="2"></th>`;
  }
  let r2 = '';
  cols.forEach((c, i) => {
    if (i < 2 || c.group === 'act') return;
    const gcls = c.group === 'id' ? '' : `g-${c.group}`;
    if (c.sub) {
      const off = c.sub.counted ? '' : ' style="opacity:.55" title="غير محتسبة في المعدل"';
      r2 += `<th class="${gcls}"${off}>${esc(c.label)}${c.sub.hint ? ` <span class="hint-dot" title="${esc(c.sub.hint)}">●</span>` : ''}<span class="units">${c.sub.units} وحدات${c.sub.counted ? '' : ' · غير محتسبة'}</span></th>`;
    } else r2 += `<th class="${gcls}">${esc(c.label)}</th>`;
  });
  return `<tr class="r1">${r1}</tr><tr class="r2">${r2}</tr>`;
}

function rowHTML(st, r) {
  const c = comp(st);
  return `<tr data-sid="${st.id}">${cols.map((col, ci) => cellHTML(col, st, c, r, ci)).join('')}</tr>`;
}
function cellHTML(col, st, c, r, ci) {
  let html, cls = col.cls || '', title = '';
  if (col.show) {
    const o = col.show(st, c);
    html = o.html;
    if (o.cls) cls += ' ' + o.cls;
    title = o.title || '';
  } else {
    const v = col.val(st);
    html = v === '' || v == null ? '' : esc(v);
  }
  if (!col.edit) cls += ' ro';
  return `<td data-r="${r}" data-c="${ci}" class="${cls}"${title ? ` title="${esc(title)}"` : ''}>${html}</td>`;
}

function updateRows(ids) {
  if (!tbody) return;
  for (const id of ids) {
    const tr = tbody.querySelector(`tr[data-sid="${id}"]`);
    if (!tr) continue;
    const r = Number(tr.firstElementChild?.dataset.r);
    const st = store.byId(id);
    if (!st) continue;
    tr.innerHTML = cols.map((col, ci) => cellHTML(col, st, comp(st), r, ci)).join('');
  }
  paintSel();
}

function renderPager() {
  const el = root.querySelector('#pager');
  if (rows.length <= 150) return (el.innerHTML = '');
  const pages = Math.ceil(rows.length / ui.pageSize);
  el.innerHTML = `<button class="btn btn-sm" data-p="${ui.page - 1}" ${ui.page === 0 ? 'disabled' : ''}>السابق</button>
    <span>صفحة ${ui.page + 1} من ${pages} (${ui.pageSize} صف في الصفحة)</span>
    <button class="btn btn-sm" data-p="${ui.page + 1}" ${ui.page >= pages - 1 ? 'disabled' : ''}>التالي</button>
    <select id="psize" style="width:auto">${[50, 100, 150].map((n) => `<option ${n === ui.pageSize ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
  el.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { ui.page = Number(b.dataset.p); act.r = 0; refresh(); wrap.scrollTop = 0; }));
  el.querySelector('#psize').onchange = (e) => { ui.pageSize = Number(e.target.value); ui.page = 0; refresh(); };
}

function updateMeta() {
  const all = store.students();
  let inc = 0, inv = 0;
  for (const s of all) {
    const c = comp(s);
    if (c.s1.kind === 'inc' || c.s2.kind === 'inc') inc++;
    if (Object.keys(s.invalid || {}).length) inv++;
  }
  root.querySelector('#meta').innerHTML = `<span>عرض <b>${rows.length}</b> من <b>${all.length}</b> طالب</span>
    ${inc ? `<span>غير مكتمل: <b>${inc}</b></span>` : ''}${inv ? `<span style="color:var(--fail)">قيم غير صالحة: <b>${inv}</b></span>` : ''}
    <span class="spacer" style="flex:1"></span>
    <span>اكتب للإدخال مباشرة · <span class="kbd">Enter</span> للأسفل · <span class="kbd">Tab</span> للتالي · <span class="kbd">F2</span> تعديل · <span class="kbd">Del</span> مسح · <span class="kbd">Ctrl+V</span> لصق من Excel · <span class="kbd">Ctrl+Z</span> تراجع</span>`;
}
function updateHistoryBtns() {
  const u = root.querySelector('#undo'), r = root.querySelector('#redo');
  if (u) u.disabled = !store.canUndo();
  if (r) r.disabled = !store.canRedo();
}

// ---------------------------------------------------------------- selection
let painted = [];
function cellEl(r, c) {
  return tbody?.rows[r]?.cells[c] || null;
}
function selRect() {
  const a = anchor || act;
  return { r1: Math.min(a.r, act.r), r2: Math.max(a.r, act.r), c1: Math.min(a.c, act.c), c2: Math.max(a.c, act.c) };
}
function paintSel() {
  painted.forEach((el) => el.classList.remove('sel', 'act'));
  painted = [];
  if (!tbody || !pageRows.length) return;
  const { r1, r2, c1, c2 } = selRect();
  if (anchor && (r1 !== r2 || c1 !== c2)) {
    for (let r = r1; r <= r2; r++)
      for (let c = c1; c <= c2; c++) {
        const el = cellEl(r, c);
        if (el) { el.classList.add('sel'); painted.push(el); }
      }
  }
  const a = cellEl(act.r, act.c);
  if (a) { a.classList.add('act'); painted.push(a); }
}
function scrollToAct() {
  const el = cellEl(act.r, act.c);
  if (!el || !wrap) return;
  const wr = wrap.getBoundingClientRect(), er = el.getBoundingClientRect();
  const headH = table.tHead.getBoundingClientRect().height;
  const stickyW = act.c > 1 ? (cellEl(act.r, 0)?.offsetWidth || 0) + (cellEl(act.r, 1)?.offsetWidth || 0) : 0;
  if (er.top < wr.top + headH) wrap.scrollTop -= wr.top + headH - er.top + 2;
  else if (er.bottom > wr.bottom - 14) wrap.scrollTop += er.bottom - wr.bottom + 16;
  // RTL: sticky columns are on the right
  if (er.right > wr.right - stickyW) wrap.scrollLeft += er.right - (wr.right - stickyW) + 4;
  else if (er.left < wr.left + 14) wrap.scrollLeft -= wr.left + 16 - er.left;
}
function moveTo(r, c, extend = false) {
  if (!pageRows.length) return;
  r = Math.max(0, Math.min(pageRows.length - 1, r));
  if (!isEditable(c)) return;
  if (extend) { if (!anchor) anchor = { ...act }; }
  else anchor = null;
  act = { r, c };
  paintSel();
  scrollToAct();
}
function nextEditable(c, dir) {
  for (let i = c + dir; i >= 0 && i < cols.length; i += dir) if (isEditable(i)) return i;
  return -1;
}

// ---------------------------------------------------------------- grid events
function wireGrid() {
  wrap.addEventListener('mousedown', (e) => {
    const btn = e.target.closest('button');
    if (btn) return;
    const td = e.target.closest('td');
    if (!td || td.classList.contains('editing')) return;
    const r = Number(td.dataset.r), c = Number(td.dataset.c);
    if (!isEditable(c)) return;
    e.preventDefault();
    if (editing) commitEdit();
    wrap.focus({ preventScroll: true });
    if (e.shiftKey) moveTo(r, c, true);
    else { anchor = null; act = { r, c }; anchor = { r, c }; paintSel(); dragging = true; }
  });
  wrap.addEventListener('mouseover', (e) => {
    if (!dragging) return;
    const td = e.target.closest('td');
    if (!td) return;
    const c = Number(td.dataset.c);
    if (!isEditable(c)) return;
    act = { r: Number(td.dataset.r), c };
    paintSel();
  });
  wrap.addEventListener('dblclick', (e) => {
    const td = e.target.closest('td');
    if (td && isEditable(Number(td.dataset.c))) startEdit();
  });
  wrap.addEventListener('click', async (e) => {
    const o = e.target.closest('[data-open]');
    if (o) return openDrawer(Number(o.dataset.open));
    const d = e.target.closest('[data-del]');
    if (d) {
      const st = store.byId(Number(d.dataset.del));
      if (st && (await confirmDialog(`حذف الطالب "${st.name || 'بدون اسم'}"؟ يمكنك التراجع بـ Ctrl+Z.`, { okLabel: 'حذف', danger: true }))) {
        store.deleteStudents([st.id]);
        toast('تم الحذف', 'success');
      }
    }
    const t = e.target.closest('[data-collapse]');
    if (t) { ui.collapsed[t.dataset.collapse] = !ui.collapsed[t.dataset.collapse]; act.c = 1; refresh(); }
  });
  wrap.addEventListener('keydown', onKey);
}
function onMouseUp() {
  if (!dragging) return;
  dragging = false;
  if (anchor && anchor.r === act.r && anchor.c === act.c) anchor = null;
}

function onKey(e) {
  if (editing) return; // the editor handles its own keys
  const k = e.key;
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl) {
    const kk = k.toLowerCase();
    if (kk === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); }
    else if (kk === 'y' || (kk === 'z' && e.shiftKey)) { e.preventDefault(); doRedo(); }
    else if (kk === 'a') {
      e.preventDefault();
      anchor = { r: 0, c: nextEditable(-1, 1) };
      act = { r: pageRows.length - 1, c: nextEditable(cols.length, -1) };
      paintSel();
    } else if (k === 'Home') { e.preventDefault(); moveTo(0, nextEditable(-1, 1)); }
    else if (k === 'End') { e.preventDefault(); moveTo(pageRows.length - 1, nextEditable(cols.length, -1)); }
    return;
  }
  const sh = e.shiftKey;
  switch (k) {
    case 'ArrowDown': e.preventDefault(); moveTo(act.r + 1, act.c, sh); break;
    case 'ArrowUp': e.preventDefault(); moveTo(act.r - 1, act.c, sh); break;
    case 'ArrowLeft': { e.preventDefault(); const n = nextEditable(act.c, 1); if (n >= 0) moveTo(act.r, n, sh); break; } // RTL: left = next
    case 'ArrowRight': { e.preventDefault(); const n = nextEditable(act.c, -1); if (n >= 0) moveTo(act.r, n, sh); break; }
    case 'Tab': e.preventDefault(); tabMove(sh ? -1 : 1); break;
    case 'Enter':
      e.preventDefault();
      if (cols[act.c].edit === 'select') startEdit();
      else moveTo(act.r + (sh ? -1 : 1), act.c);
      break;
    case 'F2': e.preventDefault(); startEdit(); break;
    case 'Home': e.preventDefault(); moveTo(act.r, nextEditable(-1, 1)); break;
    case 'End': e.preventDefault(); moveTo(act.r, nextEditable(cols.length, -1)); break;
    case 'PageDown': e.preventDefault(); moveTo(act.r + 15, act.c); break;
    case 'PageUp': e.preventDefault(); moveTo(act.r - 15, act.c); break;
    case 'Delete':
    case 'Backspace': e.preventDefault(); clearRange(); break;
    case 'Escape': anchor = null; paintSel(); break;
    default:
      if (k.length === 1 && !e.altKey) {
        e.preventDefault();
        startEdit(k);
      }
  }
}
function tabMove(dir) {
  let n = nextEditable(act.c, dir);
  if (n < 0) {
    const r = act.r + dir;
    if (r < 0 || r >= pageRows.length) return;
    n = dir > 0 ? nextEditable(-1, 1) : nextEditable(cols.length, -1);
    moveTo(r, n);
  } else moveTo(act.r, n);
}

// ---------------------------------------------------------------- editing
function startEdit(initial) {
  const col = cols[act.c];
  const st = pageRows[act.r];
  if (!col?.edit || !st) return;
  const td = cellEl(act.r, act.c);
  if (!td) return;
  anchor = null;
  paintSel();
  const raw = col.val(st);
  td.classList.add('editing');
  let input;
  if (col.edit === 'select') {
    input = document.createElement('select');
    input.innerHTML = `<option value="">—</option>` + col.options.map((o) => `<option ${o === raw ? 'selected' : ''}>${esc(o)}</option>`).join('');
    if (initial) {
      const t = normalizeDigits(initial);
      const idx = /^\d$/.test(t) ? Number(t) : col.options.findIndex((o) => o.startsWith(initial)) + 1;
      if (idx >= 0 && idx <= col.options.length) input.selectedIndex = idx;
    }
  } else {
    input = document.createElement('input');
    input.type = 'text';
    input.value = initial != null ? initial : raw == null ? '' : String(raw);
    if (col.edit === 'num') input.inputMode = 'decimal';
  }
  input.setAttribute('aria-label', col.label);
  td.innerHTML = '';
  td.appendChild(input);
  editing = { td, input, r: act.r, c: act.c, id: st.id, col };
  input.focus();
  if (input.setSelectionRange && initial == null) input.select();
  input.addEventListener('keydown', editorKey);
  input.addEventListener('blur', () => editing?.input === input && commitEdit());
  if (col.edit === 'select') input.addEventListener('change', () => { commitEdit(); wrap.focus({ preventScroll: true }); });
}
function editorKey(e) {
  e.stopPropagation(); // the editor sits inside the grid: keep its keys away from the grid handler
  const k = e.key;
  const isSel = editing.col.edit === 'select';
  if (k === 'Escape') { e.preventDefault(); cancelEdit(); wrap.focus({ preventScroll: true }); return; }
  if (k === 'Enter') { e.preventDefault(); const r = editing.r, c = editing.c; commitEdit(); wrap.focus({ preventScroll: true }); moveTo(r + (e.shiftKey ? -1 : 1), c); return; }
  if (k === 'Tab') { e.preventDefault(); commitEdit(); wrap.focus({ preventScroll: true }); tabMove(e.shiftKey ? -1 : 1); return; }
  if (!isSel && (k === 'ArrowDown' || k === 'ArrowUp') && editing.col.edit === 'num') {
    e.preventDefault();
    const r = editing.r, c = editing.c;
    commitEdit();
    wrap.focus({ preventScroll: true });
    moveTo(r + (k === 'ArrowDown' ? 1 : -1), c);
  }
}
function parseFor(col, text) {
  if (col.edit === 'num') {
    const p = parseGrade(text);
    if (p.error) {
      toast(`"${text}" ${p.error} — الدرجة يجب أن تكون بين 0 و 100`, 'error');
      return { invalid: String(text) };
    }
    return p.value;
  }
  if (col.key === 'serial') {
    const t = normalizeDigits(String(text)).trim();
    return /^\d+$/.test(t) ? Number(t) : t;
  }
  if (col.key === 'birth') return normalizeDigits(String(text)).trim();
  if (col.edit === 'select') {
    const t = String(text).trim();
    if (!t) return '';
    return col.options.find((o) => o === t) || col.options.find((o) => o.replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي') === t.replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي')) || null;
  }
  return String(text).replace(/\s+/g, ' ').trim();
}
function commitEdit() {
  if (!editing) return;
  const { input, id, col, td } = editing;
  editing = null;
  td.classList.remove('editing');
  const v = parseFor(col, input.value);
  const changed = v === null && col.edit === 'select' ? 0 : store.setCells([{ id, key: col.key, value: v }], 'تعديل خلية');
  if (!changed) updateRows([id]); // restore display
}
function cancelEdit() {
  if (!editing) return;
  const { id, td } = editing;
  editing = null;
  td.classList.remove('editing');
  updateRows([id]);
}

function rangeCells() {
  const { r1, r2, c1, c2 } = selRect();
  const out = [];
  for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) if (isEditable(c) && pageRows[r]) out.push({ r, c });
  return out;
}
function clearRange() {
  const cells = rangeCells();
  const ch = cells.map(({ r, c }) => ({ id: pageRows[r].id, key: cols[c].key, value: cols[c].edit === 'num' ? null : '' }));
  const n = store.setCells(ch, 'مسح خلايا');
  if (n > 1) toast(`تم مسح ${n} خلية`, 'info', 1500);
}

// ---------------------------------------------------------------- clipboard
const gridActive = () => wrap && document.activeElement === wrap && !editing;
function onCopy(e) {
  if (!gridActive()) return;
  const { r1, r2, c1, c2 } = selRect();
  const lines = [];
  for (let r = r1; r <= r2; r++) {
    const st = pageRows[r];
    if (!st) continue;
    const vals = [];
    for (let c = c1; c <= c2; c++) {
      const col = cols[c];
      if (col.edit) vals.push(String(col.val(st) ?? ''));
      else vals.push(cellEl(r, c)?.textContent.trim() || '');
    }
    lines.push(vals.join('\t'));
  }
  e.clipboardData.setData('text/plain', lines.join('\n'));
  e.preventDefault();
  toast('تم النسخ', 'info', 1000);
}
function onPaste(e) {
  if (!gridActive()) return;
  const text = e.clipboardData?.getData('text/plain');
  if (text == null) return;
  e.preventDefault();
  let data = text.replace(/\r/g, '').split('\n');
  if (data.length > 1 && data[data.length - 1] === '') data.pop();
  data = data.map((l) => l.split('\t'));
  const { r1, c1, r2, c2 } = selRect();
  // single value pasted into a range => fill the range
  if (data.length === 1 && data[0].length === 1 && (r1 !== r2 || c1 !== c2)) {
    const ch = rangeCells().map(({ r, c }) => ({ id: pageRows[r].id, key: cols[c].key, value: parseFor(cols[c], data[0][0]) })).filter((x) => x.value !== null || cols.find((c) => c.key === x.key).edit !== 'select');
    store.setCells(ch, 'لصق');
    return;
  }
  // editable target columns starting at c1
  const targetCols = [];
  for (let c = c1; c < cols.length && targetCols.length < Math.max(...data.map((r) => r.length)); c++) if (isEditable(c)) targetCols.push(c);
  // auto-append rows when pasting past the end (only when the view is the full, unfiltered list)
  const need = r1 + data.length - pageRows.length;
  const canAppend = !ui.q && ui.filter === 'all' && ui.sort === 'serial' && (rows.length <= 150 || ui.page === Math.ceil(rows.length / ui.pageSize) - 1);
  let skipped = 0;
  if (need > 0) {
    if (canAppend) {
      store.addStudents(Array.from({ length: need }, () => ({})));
      // refresh() ran via the store event; restore selection origin
    } else skipped = need;
  }
  const changes = [];
  let bad = 0;
  data.forEach((line, i) => {
    const st = pageRows[r1 + i];
    if (!st) return;
    line.forEach((val, j) => {
      const c = targetCols[j];
      if (c == null) return;
      const col = cols[c];
      let v;
      if (col.edit === 'num') {
        const p = parseGrade(val);
        if (p.error) { bad++; v = { invalid: String(val) }; } else v = p.value;
      } else v = parseFor(col, val);
      if (v === null && col.edit === 'select') { if (String(val).trim()) bad++; return; }
      changes.push({ id: st.id, key: col.key, value: v });
    });
  });
  const n = store.setCells(changes, 'لصق من Excel');
  act = { r: r1, c: c1 };
  anchor = { r: Math.min(r1 + data.length - 1, pageRows.length - 1), c: targetCols[targetCols.length - 1] ?? c1 };
  paintSel();
  toast(`تم لصق ${n} قيمة${bad ? ` · ${bad} قيمة غير صالحة (مظللة بالأحمر)` : ''}${skipped ? ` · تم تجاهل ${skipped} صف خارج الجدول` : ''}`, bad ? 'warn' : 'success', 3500);
}

// ---------------------------------------------------------------- actions
function addOne() {
  const [st] = store.addStudents([{}]);
  if (ui.q || ui.filter !== 'all') { ui.q = ''; ui.filter = 'all'; root.querySelector('#q').value = ''; root.querySelector('#filter').value = 'all'; refresh(); }
  if (rows.length > 150) { ui.page = Math.ceil(rows.length / ui.pageSize) - 1; refresh(); }
  const r = pageRows.findIndex((s) => s.id === st.id);
  if (r >= 0) {
    tbody.rows[r].classList.add('row-new');
    wrap.focus({ preventScroll: true });
    moveTo(r, 1);
    startEdit('');
  }
}
async function pasteNames() {
  const text = await promptText({ title: 'لصق قائمة أسماء', label: 'اسم واحد في كل سطر (يمكن النسخ مباشرة من عمود في Excel أو Word):', placeholder: 'زينب علي حسين\nفاطمة كاظم جاسم\n…', okLabel: 'إضافة' });
  if (text == null) return;
  const names = text.split(/\r?\n/).map((s) => s.split('\t')[0].replace(/^\s*\d+[\s.)\-–]+/, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!names.length) return toast('لم يتم العثور على أسماء', 'warn');
  store.addStudents(names.map((name) => ({ name })));
  toast(`تمت إضافة ${names.length} طالب`, 'success');
}
async function deleteSelectedRows() {
  if (!pageRows.length) return;
  const { r1, r2 } = selRect();
  const ids = pageRows.slice(r1, r2 + 1).map((s) => s.id);
  const names = pageRows.slice(r1, r2 + 1).map((s) => s.name || 'بدون اسم');
  if (!(await confirmDialog(`حذف ${ids.length} طالب: ${names.slice(0, 5).join('، ')}${names.length > 5 ? '…' : ''}؟ يمكنك التراجع بـ Ctrl+Z.`, { okLabel: 'حذف', danger: true }))) return;
  store.deleteStudents(ids);
  anchor = null;
  toast(`تم حذف ${ids.length} طالب`, 'success');
}
function doUndo() {
  const u = store.undo();
  if (!u) toast('لا يوجد ما يمكن التراجع عنه', 'warn', 1400);
}
function doRedo() {
  const r = store.redo();
  if (!r) toast('لا يوجد ما يمكن إعادته', 'warn', 1400);
}

// ---------------------------------------------------------------- per-student drawer
let drawer = null;
function openDrawer(id) {
  closeDrawer();
  const st = store.byId(id);
  if (!st) return;
  const back = document.createElement('div');
  back.className = 'drawer-backdrop';
  const el = document.createElement('aside');
  el.className = 'drawer';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  document.body.append(back, el);
  drawer = { el, back, id };
  back.onclick = closeDrawer;
  renderDrawer();
  requestAnimationFrame(() => { back.classList.add('show'); el.classList.add('show'); });
  el.addEventListener('keydown', (e) => e.key === 'Escape' && closeDrawer());
}
function closeDrawer() {
  if (!drawer) return;
  const { el, back } = drawer;
  drawer = null;
  el.classList.remove('show');
  back.classList.remove('show');
  setTimeout(() => { el.remove(); back.remove(); }, 250);
  wrap?.focus({ preventScroll: true });
}
function drawerSync(ids) {
  if (drawer && ids.includes(drawer.id)) updateDrawerComputed();
}
function renderDrawer() {
  const st = store.byId(drawer.id);
  const { subjects, settings } = store.get();
  const opt = (list, v) => `<option value="">—</option>` + list.map((o) => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('');
  const idx = rows.findIndex((s) => s.id === st.id);
  const gradeRows = (stage) => subjects[stage].map((sub) => {
    const inv = st.invalid?.[sub.id];
    const v = inv != null ? inv : st.grades[sub.id] ?? '';
    return `<div class="grade-row"><label for="dg-${sub.id}">${esc(sub.ar)} <span class="u">(${sub.units} وحدة${sub.counted ? '' : ' · غير محتسبة'})</span></label>
      <input id="dg-${sub.id}" data-g="${sub.id}" value="${esc(v)}" inputmode="decimal" class="${inv != null ? 'invalid' : ''}" aria-label="${esc(sub.ar)}"/>
      <span data-gl="${sub.id}"></span></div>`;
  }).join('');
  drawer.el.innerHTML = `
    <div class="drawer-head">
      <button class="icon-btn" data-nav="-1" ${idx <= 0 ? 'disabled' : ''} title="السابق" aria-label="الطالب السابق">${icon('chevron')}</button>
      <button class="icon-btn" data-nav="1" ${idx < 0 || idx >= rows.length - 1 ? 'disabled' : ''} title="التالي" aria-label="الطالب التالي" style="transform:scaleX(-1)">${icon('chevron')}</button>
      <h3>${esc(st.name || 'طالب جديد')}</h3>
      <button class="icon-btn danger" data-dd title="حذف" aria-label="حذف">${icon('trash')}</button>
      <button class="icon-btn" data-close aria-label="إغلاق">${icon('x')}</button>
    </div>
    <div class="drawer-body">
      <div class="form-grid" style="grid-template-columns:1fr 1fr">
        <label class="field" style="grid-column:1/-1"><span>اسم الطالبة</span><input data-f="name" value="${esc(st.name)}"/></label>
        <label class="field"><span>التسلسل</span><input data-f="serial" value="${esc(st.serial)}"/></label>
        <label class="field"><span>المواليد</span><input data-f="birth" value="${esc(st.birth)}"/></label>
        <label class="field"><span>النوع الاجتماعي</span><select data-f="gender">${opt(GENDERS, st.gender)}</select></label>
        <label class="field"><span>التحصيل الدراسي</span><select data-f="edu">${opt(EDUCATIONS, st.edu)}</select></label>
      </div>
      <h4>${esc(settings.stage1Name)}</h4><div class="grade-rows">${gradeRows('s1')}</div><div class="summary-box" data-sum="s1"></div>
      <label class="field" style="margin-top:8px"><span>ملاحظات ${esc(settings.stage1Name)}</span><input data-f="notes1" value="${esc(st.notes1)}"/></label>
      <h4>${esc(settings.stage2Name)}</h4><div class="grade-rows">${gradeRows('s2')}</div><div class="summary-box" data-sum="s2"></div>
      <label class="field" style="margin-top:8px"><span>ملاحظات ${esc(settings.stage2Name)}</span><input data-f="notes2" value="${esc(st.notes2)}"/></label>
      <h4>${esc(settings.finalName)}</h4>
      <div class="form-grid" style="grid-template-columns:1fr 1fr">
        <label class="field"><span>التدريب الصيفي</span><select data-f="summer">${opt(SUMMER_OPTIONS, st.summer)}</select></label>
        <label class="field"><span>ملاحظات</span><input data-f="notesF" value="${esc(st.notesF)}"/></label>
      </div>
      <div class="summary-box" data-sum="final"></div>
    </div>`;
  const el = drawer.el;
  el.querySelector('[data-close]').onclick = closeDrawer;
  el.querySelector('[data-dd]').onclick = async () => {
    if (await confirmDialog(`حذف الطالب "${st.name || 'بدون اسم'}"؟`, { okLabel: 'حذف', danger: true })) { const id = st.id; closeDrawer(); store.deleteStudents([id]); }
  };
  el.querySelectorAll('[data-nav]').forEach((b) => (b.onclick = () => { const n = rows[idx + Number(b.dataset.nav)]; if (n) { drawer.id = n.id; renderDrawer(); } }));
  el.querySelectorAll('[data-f]').forEach((inp) => inp.addEventListener('change', () => {
    const key = inp.dataset.f;
    let v = inp.value;
    if (key === 'serial') v = /^\d+$/.test(normalizeDigits(v).trim()) ? Number(normalizeDigits(v).trim()) : v.trim();
    else if (key === 'birth') v = normalizeDigits(v).trim();
    else v = v.replace(/\s+/g, ' ').trim();
    store.setCells([{ id: st.id, key, value: v }], 'تعديل من اللوحة');
    if (key === 'name') el.querySelector('.drawer-head h3').textContent = v || 'طالب جديد';
  }));
  el.querySelectorAll('[data-g]').forEach((inp) => {
    inp.addEventListener('input', () => {
      const p = parseGrade(inp.value);
      inp.classList.toggle('invalid', !!p.error);
    });
    inp.addEventListener('change', () => {
      const p = parseGrade(inp.value);
      if (p.error) toast(`"${inp.value}" ${p.error}`, 'error');
      store.setCells([{ id: st.id, key: `g:${inp.dataset.g}`, value: p.error ? { invalid: inp.value } : p.value }], 'تعديل درجة');
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const all = [...el.querySelectorAll('[data-g]')];
        all[all.indexOf(inp) + 1]?.focus();
      }
    });
  });
  updateDrawerComputed();
  setTimeout(() => el.querySelector('[data-f=name]').focus(), 50);
}
function updateDrawerComputed() {
  if (!drawer) return;
  const st = store.byId(drawer.id);
  if (!st) return closeDrawer();
  const { settings } = store.get();
  compCache.delete(st.id);
  const c = comp(st);
  const d = settings.decimals ?? 2;
  for (const stage of ['s1', 's2']) {
    for (const [id, row] of Object.entries(c[stage].rows)) {
      const el = drawer.el.querySelector(`[data-gl="${id}"]`);
      if (el) el.innerHTML = row.grade == null ? '<span class="muted">—</span>' : `<span class="pill pill-${row.result === 'راسب' ? 'fail' : 'pass'}">${esc(row.label)}</span>`;
    }
    const x = c[stage];
    drawer.el.querySelector(`[data-sum="${stage}"]`).innerHTML = `<div>مجموع التراجيح<b>${x.empty ? '—' : fmt(x.sum, 2)}</b></div><div>المعدل<b>${x.complete ? fmt(x.avg, d) : '—'}</b></div><div>النتيجة<b>${resultPill(x.result, x.kind)}</b></div>`;
  }
  drawer.el.querySelector('[data-sum="final"]').innerHTML = `<div>المعدل النهائي<b>${c.final.complete ? fmt(c.final.avg, d) : '—'}</b></div><div>التقدير<b>${esc(c.final.label)}</b></div><div>النتيجة<b>${resultPill(c.final.result, c.final.kind)}</b></div>`;
}

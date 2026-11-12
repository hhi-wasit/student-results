// =============================================================
// Result cards – options, student selection, live A4 preview,
// print (vector PDF via browser), Download PDF, single-card PNG.
// =============================================================
import * as store from '../store.js';
import { computeStudent } from '../calc.js';
import { cardHTML, pagesHTML } from '../cardview.js';
import { icon, toast, busy, emptyState } from '../ui.js';
import { pagesToPdf, cardToPng, printHTML } from '../export.js';
import { esc, debounce, arCompare } from '../utils.js';

const opt = { stage: 's1', round: null, perPage: null, showNumeric: null,  q: '', order: 'serial' };
const PREVIEW_PAGES = 12;
let root, ro;

export function mount(el) {
  root = el;
  const S = store.settings();
  opt.round ??= S.round;
  opt.perPage ??= S.cardsPerPage || 4;
  opt.showNumeric ??= !!S.showNumericOnCard;
  // track DE-selected students so newly added students are selected by default
  opt.off ??= new Set();
  render();
  ro = new ResizeObserver(debounce(fitPreview, 100));
  ro.observe(root);
}
export function unmount() {
  ro?.disconnect();
}

function ordered() {
  const list = [...store.students()];
  if (opt.order === 'alpha') list.sort((a, b) => arCompare(a.name, b.name));
  else list.sort((a, b) => (Number(a.serial) || 1e9) - (Number(b.serial) || 1e9) || a.id - b.id);
  return list;
}

function render() {
  const st = store.get();
  if (!st.students.length) {
    root.innerHTML = emptyState({ iconName: 'card', title: 'لا يوجد طلبة لعرض بطاقاتهم', text: 'أضف الطلبة أو ارفع ملف Excel أولاً.', actions: `<a class="btn btn-primary" href="#import">${icon('upload')}رفع ملف Excel</a>` });
    return;
  }
  const S = st.settings;
  const pill = (name, val, label) => `<button class="${opt[name] === val ? 'on' : ''}" data-o="${name}" data-v="${val}">${label}</button>`;
  root.innerHTML = `
  <div class="page-head">
    <div><h2>بطاقات النتائج</h2><div class="sub">معاينة مباشرة بحجم A4 – الطباعة تعطي PDF متجهي عالي الدقة</div></div>
    <div class="spacer"></div>
    <div class="btn-group">
      <button class="btn btn-primary" id="print">${icon('print')}طباعة / حفظ PDF</button>
      <button class="btn" id="pdf">${icon('pdf')}تنزيل PDF</button>
    </div>
  </div>
  <div class="cards-layout">
    <div class="card opts">
      <div class="field"><span>نوع البطاقة</span><div class="pills flat">${pill('stage', 's1', S.stage1Name)}${pill('stage', 's2', S.stage2Name)}${pill('stage', 'final', 'التخرج')}</div></div>
      <div class="field"><span>الدور</span><div class="pills flat">${pill('round', 1, 'الدور الاول')}${pill('round', 2, 'الدور الثاني')}</div></div>
      <div class="field"><span>عدد البطاقات في الصفحة</span><div class="pills flat">${pill('perPage', 1, '1')}${pill('perPage', 2, '2')}${pill('perPage', 4, '4')}</div></div>
      <label class="switch" style="margin-bottom:12px"><input type="checkbox" id="num" ${opt.showNumeric ? 'checked' : ''}/>إظهار الدرجة الرقمية مع التقدير</label>
      <div class="field"><span>الطلبة (<b id="selcount"></b>)</span>
        <div class="search">${icon('search')}<input type="search" id="sq" placeholder="بحث…" value="${esc(opt.q)}"/></div>
        <div class="btn-group" style="margin:4px 0"><button class="btn btn-sm" id="all">تحديد الكل</button><button class="btn btn-sm" id="none">إلغاء التحديد</button>
          <select id="order" style="width:auto;padding:3px 8px"><option value="serial">حسب التسلسل</option><option value="alpha" ${opt.order === 'alpha' ? 'selected' : ''}>أبجدياً</option></select></div>
        <div class="stu-list" id="slist"></div>
      </div>
      <p class="small muted">مرّر المؤشر فوق أي بطاقة في المعاينة لتنزيلها كصورة PNG.</p>
    </div>
    <div class="preview" id="preview" aria-label="معاينة البطاقات"></div>
  </div>`;
  root.querySelectorAll('[data-o]').forEach((b) => (b.onclick = () => {
    const v = b.dataset.v;
    opt[b.dataset.o] = isNaN(v) ? v : Number(v);
    render();
  }));
  root.querySelector('#num').onchange = (e) => { opt.showNumeric = e.target.checked; renderPreview(); };
  root.querySelector('#sq').oninput = debounce((e) => { opt.q = e.target.value; renderList(); }, 150);
  root.querySelector('#all').onclick = () => { visibleList().forEach((s) => opt.off.delete(s.id)); renderList(); renderPreview(); };
  root.querySelector('#none').onclick = () => { visibleList().forEach((s) => opt.off.add(s.id)); renderList(); renderPreview(); };
  root.querySelector('#order').onchange = (e) => { opt.order = e.target.value; renderList(); renderPreview(); };
  root.querySelector('#print').onclick = doPrint;
  root.querySelector('#pdf').onclick = doPdf;
  renderList();
  renderPreview();
}

const visibleList = () => ordered().filter((s) => !opt.q || s.name.includes(opt.q));

function renderList() {
  const st = store.get();
  const list = visibleList();
  const key = opt.stage;
  root.querySelector('#slist').innerHTML = list
    .map((s) => {
      const c = computeStudent(s, st.subjects, st.settings);
      const r = c[key].result;
      const kind = c[key].kind;
      return `<label><input type="checkbox" data-id="${s.id}" ${!opt.off.has(s.id) ? 'checked' : ''}/>${esc(s.name || '—')}<span class="r pill pill-${kind}">${esc(r || '—')}</span></label>`;
    })
    .join('') || '<p class="muted small" style="padding:8px">لا توجد نتائج.</p>';
  root.querySelector('#slist').onchange = (e) => {
    const id = Number(e.target.dataset.id);
    e.target.checked ? opt.off.delete(id) : opt.off.add(id);
    updateCount();
    renderPreview();
  };
  updateCount();
}
function updateCount() {
  root.querySelector('#selcount').textContent = `${store.students().filter((s) => !opt.off.has(s.id)).length} محدد`;
}

function buildCards() {
  const st = store.get();
  return ordered()
    .filter((s) => !opt.off.has(s.id))
    .map((s) => cardHTML(s, computeStudent(s, st.subjects, st.settings), st, { stage: opt.stage, round: opt.round, showNumeric: opt.showNumeric }));
}

function renderPreview() {
  const prev = root.querySelector('#preview');
  const cards = buildCards();
  if (!cards.length) {
    prev.innerHTML = '<div class="empty"><p>لم يتم تحديد أي طالب.</p></div>';
    return;
  }
  const pages = pagesHTML(cards, opt.perPage);
  const shown = pages.slice(0, PREVIEW_PAGES);
  prev.innerHTML =
    shown.map((p) => `<div class="page-wrap">${p}</div>`).join('') +
    (pages.length > PREVIEW_PAGES ? `<p class="muted" style="text-align:center">تعرض المعاينة أول ${PREVIEW_PAGES} صفحات من ${pages.length}. الطباعة والتنزيل تشمل جميع الصفحات.</p>` : `<p class="muted small" style="text-align:center">${pages.length} صفحة · ${cards.length} بطاقة</p>`);
  prev.querySelectorAll('.rc').forEach((rc) => {
    const b = document.createElement('button');
    b.className = 'btn btn-sm png-btn';
    b.innerHTML = `${icon('image')}PNG`;
    b.title = 'تنزيل هذه البطاقة كصورة PNG';
    b.onclick = (e) => { e.stopPropagation(); downloadPng(Number(rc.dataset.sid)); };
    rc.appendChild(b);
  });
  fitPreview();
}

function fitPreview() {
  const prev = root?.querySelector('#preview');
  if (!prev) return;
  const avail = prev.clientWidth - 36;
  const k = Math.min(1, avail / 794);
  prev.querySelectorAll('.page-wrap').forEach((w) => {
    const a4 = w.firstElementChild;
    a4.style.transform = `scale(${k})`;
    a4.style.transformOrigin = 'top right';
    w.style.width = `${794 * k}px`;
    w.style.height = `${1123 * k}px`;
    w.style.overflow = 'hidden';
  });
}

function doPrint() {
  const cards = buildCards();
  if (!cards.length) return toast('حدّد طالباً واحداً على الأقل', 'warn');
  printHTML(pagesHTML(cards, opt.perPage).join(''), 'portrait', 'print-cards');
}

async function doPdf() {
  const cards = buildCards();
  if (!cards.length) return toast('حدّد طالباً واحداً على الأقل', 'warn');
  const pages = pagesHTML(cards, opt.perPage);
  const b = busy('جارٍ إنشاء ملف PDF…');
  try {
    const name = `بطاقات-${opt.stage === 's1' ? 'المرحلة-الاولى' : opt.stage === 's2' ? 'المرحلة-الثانية' : 'التخرج'}-الدور-${opt.round}.pdf`;
    await pagesToPdf(pages, name, (i, n) => b.set(`جارٍ إنشاء الصفحة ${Math.min(i + 1, n)} من ${n}…`, i / n));
    toast('تم تنزيل ملف PDF', 'success');
  } catch (e) {
    console.error(e);
    toast('تعذّر إنشاء PDF: ' + e.message + ' — استخدم زر الطباعة ثم "حفظ كـ PDF".', 'error', 6000);
  } finally {
    b.close();
  }
}

async function downloadPng(id) {
  const st = store.get();
  const s = store.byId(id);
  if (!s) return;
  const html = cardHTML(s, computeStudent(s, st.subjects, st.settings), st, { stage: opt.stage, round: opt.round, showNumeric: opt.showNumeric });
  const b = busy('جارٍ إنشاء الصورة…');
  try {
    await cardToPng(html, `بطاقة-${(s.name || 'طالب').replace(/\s+/g, '-')}.png`);
  } catch (e) {
    console.error(e);
    toast('تعذّر إنشاء الصورة: ' + e.message, 'error');
  } finally {
    b.close();
  }
}

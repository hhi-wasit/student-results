// =============================================================
// Dashboard – KPIs, charts, rings. Stage switcher pills.
// =============================================================
import * as store from '../store.js';
import { classStats, LABELS } from '../calc.js';
import { icon, emptyState } from '../ui.js';
import { areaLineChart, barChart, hBars, ring } from '../charts.js';
import { fmt, pct, debounce } from '../utils.js';

let stage = 's1';
let lineMode = 'all';
let root, off, ro;

export function mount(el) {
  root = el;
  render();
  off = store.on((t) => {
    if (t !== 'saved' && t !== 'history') renderSoon();
  });
  ro = new ResizeObserver(debounce(() => renderCharts(), 150));
  ro.observe(root);
}
export function unmount() {
  off?.();
  ro?.disconnect();
}
const renderSoon = debounce(() => render(), 200);

let stats = null;
function render() {
  const st = store.get();
  if (!st.students.length) {
    root.innerHTML = emptyState({
      iconName: 'dashboard',
      title: 'لا توجد بيانات بعد',
      text: 'ارفع ملف Excel الخاص بكشف الدرجات أو أضف الطلبة يدوياً لعرض الإحصائيات.',
      actions: `<a class="btn btn-primary" href="#import">${icon('upload')}رفع ملف Excel</a><a class="btn" href="#students">${icon('plus')}إضافة طلبة</a>`,
    });
    return;
  }
  stats = classStats(st.students, st.subjects, st.settings, stage);
  const S = st.settings;
  const n = stats.n;
  const isFinal = stage === 'final';
  const kpi = (cls, title, value, unit, ratio, ic) => `
    <div class="kpi ${cls}">
      <div class="wm">${icon(ic)}</div>
      <div class="t">${title}</div>
      <div class="v">${value}<small>${unit}</small></div>
      <div class="bar"><span><i style="width:0" data-w="${ratio == null ? 0 : Math.round(ratio * 100)}%"></i></span>${ratio == null ? '—' : fmt(ratio * 100, 0) + '%'}</div>
    </div>`;
  const stageLabel = stage === 's1' ? S.stage1Name : stage === 's2' ? S.stage2Name : S.finalName;
  root.innerHTML = `
  <div class="page-head">
    <div><h2>نظرة عامة على النتائج</h2><div class="sub">${S.institute} – ${S.department} – السنة الدراسية ${S.year}</div></div>
    <div class="spacer"></div>
    <div class="pills" role="tablist" aria-label="المرحلة">
      ${[['s1', S.stage1Name], ['s2', S.stage2Name], ['final', S.finalName]].map(([k, l]) => `<button role="tab" aria-selected="${stage === k}" class="${stage === k ? 'on' : ''}" data-stage="${k}">${l}</button>`).join('')}
    </div>
  </div>
  <div class="grid g-kpi">
    ${kpi('k1', 'عدد الطلبة', n, 'طالب', stats.complete / (n || 1), 'users')}
    ${kpi('k2', isFinal ? 'الخريجون (ناجح)' : 'الناجحون', stats.pass, 'طالب', n ? stats.pass / n : null, 'pass')}
    ${isFinal ? kpi('k3', 'غير مكتمل', stats.inc + stats.none, 'طالب', n ? (stats.inc + stats.none) / n : null, 'warn') : kpi('k3', 'المكملون', stats.supp, 'طالب', n ? stats.supp / n : null, 'warn')}
    ${kpi('k4', 'الراسبون', stats.fail, 'طالب', n ? stats.fail / n : null, 'fail')}
  </div>
  <div class="grid g-main" style="margin-top:20px">
    <div class="card">
      <div class="card-head">
        <div><h3>معدل الدرجات لكل مادة</h3><div class="sub">${stageLabel} – الخط المتقطع = درجة النجاح 50</div></div>
        <div class="spacer"></div>
        <div class="pills flat" aria-label="عرض">
          <button class="${lineMode === 'all' ? 'on' : ''}" data-line="all">الكل</button>
          <button class="${lineMode === 'avg' ? 'on' : ''}" data-line="avg">المعدل فقط</button>
        </div>
      </div>
      <div class="legend"><span><i style="background:var(--c-blue)"></i>المعدل</span>${lineMode === 'all' ? '<span><i style="background:var(--c-green)"></i>أعلى درجة</span><span><i style="background:var(--c-pink)"></i>أدنى درجة</span>' : ''}</div>
      <div id="ch-line"></div>
    </div>
    <div class="card">
      <div class="card-head"><div><h3>نسب النجاح</h3><div class="sub">من الطلبة مكتملي الدرجات</div></div></div>
      <div class="rings">
        ${ringRow(stats.rates.s1, ['#4f6df5', '#c471ed'], S.stage1Name, stats.rates.s1n, '#4f6df5')}
        ${ringRow(stats.rates.s2, ['#f5576c', '#f8a05a'], S.stage2Name, stats.rates.s2n, '#f5576c')}
        ${ringRow(stats.rates.final, ['#2fd6a0', '#a8e063'], 'التخرج', stats.rates.finaln, '#21b886')}
      </div>
    </div>
  </div>
  <div class="grid g-2" style="margin-top:20px">
    <div class="card">
      <div class="card-head"><div><h3>توزيع التقديرات</h3><div class="sub">${isFinal ? 'حسب المعدل النهائي' : 'حسب معدل المرحلة'} – ${stats.complete} طالب مكتمل</div></div></div>
      <div class="ministats">
        <div class="ministat"><div class="l">معدل الصف</div><div class="n">${fmt(stats.avg, 2)}</div></div>
        <div class="ministat"><div class="l">الخريجون</div><div class="n">${stats.graduates}</div></div>
        <div class="ministat"><div class="l">غير مكتمل</div><div class="n">${stats.inc + stats.none}</div></div>
      </div>
      <div id="ch-bars"></div>
    </div>
    <div class="card">
      <div class="card-head"><div><h3>نسبة النجاح لكل مادة</h3><div class="sub">الدرجات الفارغة غير محتسبة</div></div></div>
      ${hBars(stats.subjects.map((s) => ({ label: s.short + (s.counted ? '' : ' (غير محتسبة)'), value: s.rate, text: s.n ? `${pct(s.pass, s.n, 0)} (${s.pass}/${s.n})` : '—' })))}
    </div>
  </div>`;

  root.querySelectorAll('[data-stage]').forEach((b) => (b.onclick = () => { stage = b.dataset.stage; render(); }));
  root.querySelectorAll('[data-line]').forEach((b) => (b.onclick = () => { lineMode = b.dataset.line; render(); }));
  requestAnimationFrame(() => root.querySelectorAll('.kpi .bar i').forEach((i) => (i.style.width = i.dataset.w)));
  renderCharts();
}

function ringRow(v, colors, title, [p, c], color) {
  return `<div class="ring-row">${ring({ value: v, colors, size: 116 })}<div><div class="rt" style="color:${color}">${title}</div><div class="rs">ناجح / مكتمل</div><div class="rn">${p} / ${c}</div></div></div>`;
}

function renderCharts() {
  if (!stats || !root.querySelector('#ch-line')) return;
  const line = root.querySelector('#ch-line');
  const subs = stats.subjects;
  const series = [{ name: 'المعدل', color: '#4a8cf7', values: subs.map((s) => s.avg) }];
  if (lineMode === 'all') {
    series.push({ name: 'أعلى درجة', color: '#3cc47c', values: subs.map((s) => s.max) });
    series.push({ name: 'أدنى درجة', color: '#f2637e', values: subs.map((s) => s.min) });
  }
  line.innerHTML = areaLineChart({ labels: subs.map((s) => s.short), series, width: line.clientWidth, height: 290, passLine: 50, aria: 'معدل الدرجات لكل مادة' });
  const bars = root.querySelector('#ch-bars');
  bars.innerHTML = barChart({
    labels: LABELS,
    values: LABELS.map((l) => stats.labels[l] || 0),
    colors: [['#4f6df5', '#c471ed'], ['#36b9ff', '#6b7cff'], ['#2fd6a0', '#a8e063'], ['#ffb347', '#ffcc33'], ['#f8a05a', '#f5576c'], ['#f5576c', '#c0392b']],
    width: bars.clientWidth,
    height: 250,
    aria: 'توزيع التقديرات',
  });
}

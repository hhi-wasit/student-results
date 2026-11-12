// =============================================================
// Master sheet (كشف الدرجات) – landscape, print/export friendly,
// with pass counts and pass percentages per subject in the footer.
// =============================================================
import * as store from '../store.js';
import { computeStudent, subjectPassCounts } from '../calc.js';
import { icon, emptyState } from '../ui.js';
import { exportXlsx, printHTML } from '../export.js';
import { esc, fmt, pct } from '../utils.js';
import { ROUND_LABEL } from '../config.js';

let view = 's1';
let root;

export function mount(el) {
  root = el;
  render();
}

function tableHTML() {
  const { students, subjects, settings: S } = store.get();
  const d = S.decimals ?? 2;
  const list = [...students].sort((a, b) => (Number(a.serial) || 1e9) - (Number(b.serial) || 1e9) || a.id - b.id);
  const comps = new Map(list.map((s) => [s.id, computeStudent(s, subjects, S)]));
  const stages = view === 'all' ? ['s1', 's2'] : view === 'final' ? [] : [view];
  const withFinal = view === 'final' || view === 'all';
  const name = { s1: S.stage1Name, s2: S.stage2Name };

  let h1 = `<th rowspan="2">ت</th><th rowspan="2" class="nm">اسم الطالبة</th>`;
  let h2 = '';
  for (const st of stages) {
    h1 += `<th class="grp" colspan="${subjects[st].length + 3}">${esc(name[st])} (${subjects[st].filter((x) => x.counted).reduce((a, x) => a + Number(x.units || 0), 0)} وحدة)</th>`;
    h2 += subjects[st].map((x) => `<th title="${esc(x.ar)}"${x.counted ? '' : ' style="opacity:.6"'}>${esc(x.cardName || x.ar)}<br/><small>${x.units} وحدة</small></th>`).join('') + `<th>المعدل</th><th>النتيجة</th><th>التقدير</th>`;
  }
  if (withFinal) {
    if (view === 'final') {
      h1 += `<th class="grp" colspan="2">معدلات المراحل</th>`;
      h2 += `<th>معدل ${esc(S.stage1Name)}</th><th>معدل ${esc(S.stage2Name)}</th>`;
    }
    h1 += `<th class="grp" colspan="4">${esc(S.finalName)}</th>`;
    h2 += `<th>التدريب الصيفي</th><th>المعدل النهائي</th><th>النتيجة</th><th>التقدير</th>`;
  }

  const body = list
    .map((s) => {
      const c = comps.get(s.id);
      let tds = `<td>${esc(s.serial)}</td><td class="nm">${esc(s.name)}</td>`;
      for (const st of stages) {
        tds += subjects[st].map((x) => {
          const r = c[st].rows[x.id];
          if (s.invalid?.[x.id] != null) return `<td class="f">!</td>`;
          return `<td class="${r.result === 'راسب' ? 'f' : ''}">${r.grade == null ? '—' : fmt(r.grade, 2)}</td>`;
        }).join('');
        tds += `<td>${c[st].complete ? fmt(c[st].avg, d) : '—'}</td><td class="${c[st].kind === 'fail' ? 'f' : ''}">${esc(c[st].result || '—')}</td><td>${esc(c[st].label)}</td>`;
      }
      if (withFinal) {
        if (view === 'final') tds += `<td>${c.s1.complete ? fmt(c.s1.avg, d) : '—'}</td><td>${c.s2.complete ? fmt(c.s2.avg, d) : '—'}</td>`;
        tds += `<td class="${s.summer === 'غير مستوفي' ? 'f' : ''}">${esc(s.summer || '—')}</td><td>${c.final.complete ? fmt(c.final.avg, d) : '—'}</td><td class="${c.final.kind === 'fail' ? 'f' : ''}">${esc(c.final.result || '—')}</td><td>${esc(c.final.label)}</td>`;
      }
      return `<tr>${tds}</tr>`;
    })
    .join('');

  // footer: subject pass counts (blank grades excluded) + stage result counts
  let f1 = `<td colspan="2" class="nm">عدد الناجحين</td>`,
    f2 = `<td colspan="2" class="nm">النسبة المئوية للناجحين</td>`;
  const resCount = (key) => {
    let n = 0, p = 0;
    for (const s of list) {
      const x = comps.get(s.id)[key];
      if (!x.complete) continue;
      n++;
      if (x.result === 'ناجح') p++;
    }
    return { n, p };
  };
  for (const st of stages) {
    for (const x of subjects[st]) {
      const r = subjectPassCounts(list, x);
      f1 += `<td>${r.pass}</td>`;
      f2 += `<td>${r.n ? pct(r.pass, r.n, 1) : '0%'}</td>`;
    }
    const rc = resCount(st);
    f1 += `<td></td><td>${rc.p}</td><td></td>`;
    f2 += `<td></td><td>${rc.n ? pct(rc.p, rc.n, 1) : '0%'}</td><td></td>`;
  }
  if (withFinal) {
    const rc = resCount('final');
    const pre = view === 'final' ? '<td></td><td></td>' : '';
    f1 += `${pre}<td></td><td></td><td>${rc.p}</td><td></td>`;
    f2 += `${pre}<td></td><td></td><td>${rc.n ? pct(rc.p, rc.n, 1) : '0%'}</td><td></td>`;
  }
  const title = view === 'final' ? S.finalName : view === 'all' ? 'المرحلتان والنتيجة النهائية' : name[view];
  const head = `<div class="master-print-head"><b>${esc(S.ministry)} / ${esc(S.directorate)} / ${esc(S.institute)}</b><br/>كشف درجات ${esc(title)} – ${esc(S.department)} – السنة الدراسية ${esc(S.year)} – ${ROUND_LABEL(S.round)}</div>`;
  const sign = `<div class="master-sign"><div>${esc(S.chairTitle)}<br/>${esc(S.chairName)}</div><div>${esc(S.deanTitle)}<br/>${esc(S.deanName)}</div></div>`;
  return `${head}<table class="master"><thead><tr>${h1}</tr><tr>${h2}</tr></thead><tbody>${body}</tbody><tfoot><tr>${f1}</tr><tr>${f2}</tr></tfoot></table>${sign}`;
}

function render() {
  const { students, settings: S } = store.get();
  if (!students.length) {
    root.innerHTML = emptyState({ iconName: 'sheet', title: 'كشف الدرجات فارغ', text: 'أضف الطلبة أو ارفع ملف Excel لعرض الكشف.', actions: `<a class="btn btn-primary" href="#import">${icon('upload')}رفع ملف Excel</a>` });
    return;
  }
  const p = (v, l) => `<button class="${view === v ? 'on' : ''}" data-v="${v}">${l}</button>`;
  root.innerHTML = `
  <div class="page-head">
    <div><h2>كشف الدرجات</h2><div class="sub">${students.length} طالب – الدرجات الفارغة لا تدخل في نسب النجاح</div></div>
    <div class="spacer"></div>
    <div class="pills">${p('s1', S.stage1Name)}${p('s2', S.stage2Name)}${p('final', S.finalName)}${p('all', 'الكل')}</div>
    <div class="btn-group">
      <button class="btn btn-primary" id="print">${icon('print')}طباعة أفقية / PDF</button>
      <button class="btn" id="xlsx">${icon('excel')}تصدير Excel</button>
    </div>
  </div>
  <div class="master-wrap">${tableHTML()}</div>`;
  root.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => { view = b.dataset.v; render(); }));
  root.querySelector('#xlsx').onclick = exportXlsx;
  root.querySelector('#print').onclick = () => printHTML(tableHTML(), 'landscape', 'print-master');
}

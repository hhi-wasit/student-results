// =============================================================
// cardview.js – HTML for printable result cards (shared by the
// preview, browser print, PDF and PNG export). Styles: css/card.css
// =============================================================
import { esc, fmt } from './utils.js';
import { ROUND_RESULTS_LABEL } from './config.js';

export const DEFAULT_LOGO = 'assets/logo-default.jpeg';
let logoDataUrl = null; // resolved default logo (data URL) for canvas export

export async function resolveDefaultLogo() {
  if (logoDataUrl) return logoDataUrl;
  try {
    const b = await (await fetch(DEFAULT_LOGO)).blob();
    logoDataUrl = await new Promise((res) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.readAsDataURL(b);
    });
  } catch {
    logoDataUrl = DEFAULT_LOGO;
  }
  return logoDataUrl;
}
export const logoSrc = (settings) => settings.logo || logoDataUrl || DEFAULT_LOGO;

const stageName = (settings, stage) => (stage === 's1' ? settings.stage1Name : stage === 's2' ? settings.stage2Name : settings.finalName);

/** Arrange the subjects of a stage into the two card rows (by cardRow / cardPos). */
export function cardRows(subjects) {
  const list = subjects.filter((s) => s.counted || s.showOnCard);
  const rows = [1, 2].map((r) => list.filter((s) => (Number(s.cardRow) || 2) === r).sort((a, b) => (a.cardPos ?? 99) - (b.cardPos ?? 99)));
  return rows.filter((r) => r.length);
}

function gradeCell(row, showNumeric) {
  if (!row || row.grade == null) return '<td class="g">—</td>';
  const f = row.result === 'راسب' ? ' f' : '';
  const num = showNumeric ? ` <span class="num">(${fmt(row.grade, 2)})</span>` : '';
  return `<td class="g${f}">${esc(row.label)}${num}</td>`;
}

/**
 * One result card.
 * @param {object} st student
 * @param {object} comp computeStudent() output
 * @param {object} state {settings, subjects}
 * @param {object} o {stage:'s1'|'s2'|'final', round, showNumeric}
 */
export function cardHTML(st, comp, state, o) {
  const S = state.settings;
  const stage = o.stage;
  const round = o.round ?? S.round;
  const result = stage === 'final' ? comp.final.result : comp[stage].result;
  const resCls = result === 'ناجح' ? 'ok' : result === 'راسب' ? 'f' : '';
  const head = `
  <table class="rc-head">
    <tr>
      <td class="rc-org"><div>${esc(S.ministry)}</div><div>${esc(S.directorate)}</div><div>${esc(S.institute)}</div></td>
      <td class="rc-title"><div>${esc(stageName(S, stage))} / ${esc(S.department)}</div><div>السنة الدراسية&#160;&#160;${esc(S.year)}</div><div>${esc(ROUND_RESULTS_LABEL(round))}</div></td>
      <td class="rc-logo" rowspan="2"><img src="${esc(logoSrc(S))}" alt=""/></td>
    </tr>
    <tr><td colspan="2" class="rc-nrw"><table class="rc-nr"><tr>
      <td class="k">الاسم :</td><td class="v name">${esc(st.name) || '&#160;'}</td>
      <td class="k">النتيجة</td><td class="v res ${resCls}">${esc(result || '—')}</td>
    </tr></table></td></tr>
  </table>`;

  let tables = '';
  if (stage === 'final') {
    const f = comp.final;
    const a = (x) => (x == null ? '—' : fmt(x, S.decimals ?? 2));
    tables = `<table class="rc-subj"><tr><th>معدل ${esc(S.stage1Name)}</th><th>معدل ${esc(S.stage2Name)}</th><th>التدريب الصيفي</th><th>المعدل النهائي</th><th>التقدير</th></tr>
      <tr><td class="g">${a(comp.s1.avg)}</td><td class="g">${a(comp.s2.avg)}</td><td class="g${st.summer === 'غير مستوفي' ? ' f' : ''}">${esc(st.summer || '—')}</td><td class="g">${f.complete ? a(f.avg) : '—'}</td><td class="g${f.result === 'راسب' ? ' f' : ''}">${esc(f.complete ? f.label : '—')}</td></tr></table>
      <table class="rc-subj"><tr><th>نتيجة ${esc(S.stage1Name)}</th><th>نتيجة ${esc(S.stage2Name)}</th><th>النتيجة النهائية</th></tr>
      <tr><td class="g${['fail', 'supp'].includes(comp.s1.kind) ? ' f' : ''}">${esc(comp.s1.result || '—')}</td><td class="g${['fail', 'supp'].includes(comp.s2.kind) ? ' f' : ''}">${esc(comp.s2.result || '—')}</td><td class="g${f.result === 'راسب' ? ' f' : ''}">${esc(f.result || '—')}</td></tr></table>`;
  } else {
    const subs = state.subjects[stage];
    tables = cardRows(subs)
      .map(
        (row) => `<table class="rc-subj"><tr>${row.map((s) => `<th>${esc(s.cardName || s.ar)}</th>`).join('')}</tr>
          <tr>${row.map((s) => gradeCell(comp[stage].rows[s.id], o.showNumeric)).join('')}</tr></table>`
      )
      .join('');
  }

  const foot = `<div class="rc-foot">
      <div class="rc-note">${esc(S.note)}</div>
      <div class="rc-sig"><div>${esc(S.chairTitle)}</div><div>${esc(S.chairName)}</div></div>
      <div class="rc-sig"><div>${esc(S.deanTitle)}</div><div>${esc(S.deanName)}</div></div>
    </div>`;
  return `<div class="rc" data-sid="${st.id}">${head}<div class="rc-tables">${tables}</div>${foot}</div>`;
}

/** Group card HTML strings into A4 pages. */
export function pagesHTML(cards, perPage) {
  const pages = [];
  for (let i = 0; i < cards.length; i += perPage) {
    const slots = cards.slice(i, i + perPage);
    while (perPage > 1 && slots.length < perPage) slots.push('<div class="rc-empty"></div>');
    pages.push(`<div class="a4 per-${perPage}">${slots.map((c) => `<div class="slot">${c}</div>`).join('')}</div>`);
  }
  return pages;
}

// =============================================================
// xlsxio.js – build an .xlsx in the same column layout as the
// department's master-sheet template (values + computed columns).
// Pure (no DOM); uses the global XLSX from /vendor.
// =============================================================
import { computeStudent, subjectPassCounts, isNum } from './calc.js';

const STAGE_HDR = { s1: 'نتيجــــــة المرحلــــــة الاولـــــــى', s2: 'نتيجــــــة المرحلــــــة الثانيــــة' };
const NOTES_HDR = 'ملاحظـــــــــــــات';

/**
 * @param {object} state app state {settings, subjects, students}
 * @param {object} opts {emptyRows:number} – for the blank template
 */
export function buildWorkbook(state, opts = {}) {
  const { subjects, settings } = state;
  const students = opts.emptyRows ? [] : state.students;
  const aoa = [[], [], [], [], [], []];
  const merges = [];
  const cols = [];
  const M = (r1, c1, r2, c2) => merges.push({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });
  const put = (r, c, v) => {
    while (aoa.length <= r) aoa.push([]);
    aoa[r][c] = v;
  };

  // ---- fixed columns ----
  put(0, 0, settings.department || '');
  M(0, 0, 3, 4);
  ['ت', 'اسم الطالبة', 'المواليد', 'النوع الاجتماعي', 'التحصيل الدراسي'].forEach((h, i) => {
    put(4, i, h);
    M(4, i, 5, i);
  });
  cols.push({ wch: 5 }, { wch: 30 }, { wch: 9 }, { wch: 10 }, { wch: 14 });

  // ---- column plan ----
  let c = 5;
  const plan = []; // {kind, ...}
  const subjectBlock = (sub) => {
    put(0, c, `اسم المادة : ${sub.ar}`);
    put(1, c, sub.en || '');
    put(2, c, `نوع المادة : ${sub.type}`);
    put(3, c, `عدد الوحدات = ${sub.units}`);
    for (let r = 0; r < 4; r++) M(r, c, r, c + 3);
    ['الدرجة النهائية', 'التراجيح', 'النتيجة', 'التقدير'].forEach((h, i) => {
      put(4, c + i, h);
      M(4, c + i, 5, c + i);
    });
    cols.push({ wch: 9 }, { wch: 9 }, { wch: 7 }, { wch: 8 });
    plan.push({ kind: 'subject', sub, col: c });
    c += 4;
  };
  const stageSummary = (key) => {
    put(0, c, STAGE_HDR[key]);
    M(0, c, 3, c + 4);
    ['مجموع التراجيح', 'مجموع الوحدات', 'المعدل', 'النتيجة', 'التقدير'].forEach((h, i) => {
      put(4, c + i, h);
      M(4, c + i, 5, c + i);
    });
    cols.push({ wch: 10 }, { wch: 9 }, { wch: 9 }, { wch: 16 }, { wch: 9 });
    plan.push({ kind: 'summary', key, col: c });
    c += 5;
  };
  const notes = (field) => {
    put(0, c, NOTES_HDR);
    M(0, c, 5, c);
    cols.push({ wch: 16 });
    plan.push({ kind: 'text', field, col: c });
    c += 1;
  };

  subjects.s1.forEach(subjectBlock);
  stageSummary('s1');
  notes('notes1');
  subjects.s2.forEach(subjectBlock);
  stageSummary('s2');
  notes('notes2');
  put(0, c, 'التدريب الصيفي');
  M(0, c, 5, c);
  cols.push({ wch: 11 });
  plan.push({ kind: 'text', field: 'summer', col: c });
  c += 1;
  put(0, c, 'النتيجــــة النهائيـــــة');
  M(0, c, 3, c + 2);
  ['المعدل النهائي', 'النتيجة', 'التقدير'].forEach((h, i) => {
    put(4, c + i, h);
    M(4, c + i, 5, c + i);
  });
  cols.push({ wch: 10 }, { wch: 9 }, { wch: 9 });
  plan.push({ kind: 'final', col: c });
  c += 3;
  notes('notesF');

  // ---- data rows (start at Excel row 7 => index 6) ----
  const round = (x) => (isNum(x) ? Math.round(x * 10000) / 10000 : '');
  let r = 6;
  const rows = opts.emptyRows ? Array.from({ length: opts.emptyRows }, (_, i) => ({ serial: i + 1, empty: true })) : students;
  for (const st of rows) {
    put(r, 0, st.serial ?? '');
    if (!st.empty) {
      put(r, 1, st.name);
      put(r, 2, st.birth && /^\d+$/.test(String(st.birth)) ? Number(st.birth) : st.birth || '');
      put(r, 3, st.gender || '');
      put(r, 4, st.edu || '');
      const comp = computeStudent(st, subjects, settings);
      for (const p of plan) {
        if (p.kind === 'subject') {
          const stage = subjects.s1.includes(p.sub) ? 's1' : 's2';
          const row = comp[stage].rows[p.sub.id];
          const inv = st.invalid?.[p.sub.id];
          if (row.grade != null) {
            put(r, p.col, row.grade);
            put(r, p.col + 1, round(row.weighted));
            put(r, p.col + 2, row.result);
            put(r, p.col + 3, row.label);
          } else if (inv != null) put(r, p.col, inv);
        } else if (p.kind === 'summary') {
          const x = comp[p.key];
          if (!x.empty) {
            put(r, p.col, round(x.sum));
            put(r, p.col + 1, x.totalUnits);
            put(r, p.col + 2, x.complete ? round(x.avg) : '');
            put(r, p.col + 3, x.result || '');
            put(r, p.col + 4, x.complete ? x.label : '');
          }
        } else if (p.kind === 'text') put(r, p.col, st[p.field] || '');
        else if (p.kind === 'final') {
          const f = comp.final;
          if (f.result) {
            put(r, p.col, f.complete ? round(f.avg) : '');
            put(r, p.col + 1, f.result);
            put(r, p.col + 2, f.complete ? f.label : '');
          }
        }
      }
    }
    r++;
  }

  // ---- footer: pass counts / percentages per subject (blank grades excluded) ----
  if (!opts.emptyRows) {
    const fr = r;
    for (const p of plan.filter((x) => x.kind === 'subject')) {
      const s = subjectPassCounts(students, p.sub);
      put(fr, p.col, 'عدد الناجحين');
      M(fr, p.col, fr, p.col + 2);
      put(fr, p.col + 3, s.pass);
      put(fr + 1, p.col, 'النسبة المئوية للناجحين');
      M(fr + 1, p.col, fr + 1, p.col + 2);
      put(fr + 1, p.col + 3, s.rate == null ? 0 : Math.round(s.rate * 10000) / 10000);
    }
  }

  // normalise ragged rows
  const width = c;
  for (const row of aoa) for (let i = 0; i < width; i++) if (row[i] === undefined) row[i] = null;
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = merges;
  ws['!cols'] = cols;
  // percentage format for footer row
  if (!opts.emptyRows) {
    for (const p of plan.filter((x) => x.kind === 'subject')) {
      const addr = XLSX.utils.encode_cell({ r: r + 1, c: p.col + 3 });
      if (ws[addr]) ws[addr].z = '0.0%';
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'mastersheet');
  wb.Workbook = { Views: [{ RTL: true }] };
  return wb;
}

export function workbookToArrayBuffer(wb) {
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
}

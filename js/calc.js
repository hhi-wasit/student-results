// =============================================================
// calc.js – academic rules. Pure functions, no DOM.
// Mirrors the formulas of the department's Excel master sheet:
//   weighted   = grade × units
//   subject    = grade ≥ passMark ? ناجح : راسب
//   label      = ≥90 امتياز, ≥80 جيد جدا, ≥70 جيد, ≥60 متوسط, ≥50 مقبول, else ضعيف
//   stage avg  = Σ weighted (all counted subjects, failed included) ÷ Σ units of the stage
//   stage res  = by number of failed subjects F and avg (threshold 60)
//   final      = ناجح iff stage1 = stage2 = ناجح and summer training = مستوفي
//   final avg  = w1·avg1 + w2·avg2 when final = ناجح, else 0
// Differences from Excel (intentional, as requested):
//   an empty grade is "not entered" (not a fail); a stage with any
//   missing counted grade is "غير مكتمل" and excluded from statistics.
// =============================================================
import { R } from './config.js';

const BANDS = [
  [90, 'امتياز'],
  [80, 'جيد جدا'],
  [70, 'جيد'],
  [60, 'متوسط'],
  [50, 'مقبول'],
];
export const LABELS = ['امتياز', 'جيد جدا', 'جيد', 'متوسط', 'مقبول', 'ضعيف'];

export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export function gradeLabel(x) {
  if (!isNum(x)) return '—';
  for (const [min, label] of BANDS) if (x >= min) return label;
  return 'ضعيف';
}

export function subjectResult(grade, passMark = 50) {
  if (!isNum(grade)) return null;
  return grade >= passMark ? R.PASS : R.FAIL;
}

/** Stage result from number of failed subjects F and the stage average. */
export function stageResult(avg, F, avgPass = 60) {
  if (F === 0) return avg >= avgPass ? R.PASS : R.SUPP_AVG;
  if (F === 1) return avg >= avgPass ? R.SUPP_1 : R.SUPP_1_AVG;
  if (F === 2) return avg >= avgPass ? R.SUPP_2 : R.FAIL;
  return R.FAIL;
}

/** Category used for colouring / statistics. */
export function resultKind(result) {
  if (!result) return 'none';
  if (result === R.PASS) return 'pass';
  if (result === R.FAIL) return 'fail';
  if (result.startsWith('مكمل')) return 'supp';
  if (result === R.INCOMPLETE) return 'inc';
  return 'none';
}

export const stageTotalUnits = (subjects) =>
  subjects.filter((s) => s.counted).reduce((a, s) => a + (Number(s.units) || 0), 0);

/**
 * Compute one stage for a student.
 * @param {object} grades map subjectId -> number|null
 * @param {Array} subjects subject definitions of the stage
 * @returns {{rows, sum, totalUnits, avg, failed, entered, missing, complete, empty, result, label, kind}}
 */
export function computeStage(grades, subjects, opts = {}) {
  const avgPass = opts.avgPassMark ?? 60;
  const totalUnits = stageTotalUnits(subjects);
  let sum = 0,
    failed = 0,
    entered = 0,
    missing = 0;
  const rows = {};
  for (const sub of subjects) {
    const g = grades?.[sub.id];
    const has = isNum(g);
    const units = Number(sub.units) || 0;
    const res = has ? subjectResult(g, sub.passMark ?? 50) : null;
    rows[sub.id] = {
      grade: has ? g : null,
      weighted: has ? g * units : null,
      result: res,
      label: has ? gradeLabel(g) : '—',
      counted: !!sub.counted,
    };
    if (!sub.counted) continue;
    if (has) {
      entered++;
      sum += g * units;
      if (res === R.FAIL) failed++;
    } else missing++;
  }
  const complete = missing === 0 && entered > 0;
  const empty = entered === 0;
  // Excel: IF(sum=0, 0, sum/units)
  const avg = complete ? (sum === 0 || !totalUnits ? 0 : sum / totalUnits) : null;
  const result = complete ? stageResult(avg, failed, avgPass) : empty ? null : R.INCOMPLETE;
  return {
    rows,
    sum,
    totalUnits,
    avg,
    failed,
    entered,
    missing,
    complete,
    empty,
    result,
    label: complete ? gradeLabel(avg) : '—',
    kind: complete ? resultKind(result) : empty ? 'none' : 'inc',
  };
}

/** Final (graduation) result. */
export function computeFinal(st1, st2, summer, opts = {}) {
  const w1 = opts.w1 ?? 0.4,
    w2 = opts.w2 ?? 0.6;
  if (st1.empty && st2.empty && !summer) return { avg: null, result: null, label: '—', complete: false, kind: 'none' };
  if (!st1.complete || !st2.complete || !summer) {
    return { avg: null, result: R.INCOMPLETE, label: '—', complete: false, kind: 'inc' };
  }
  const pass = st1.result === R.PASS && st2.result === R.PASS && summer === R.MET;
  const avg = pass ? w1 * st1.avg + w2 * st2.avg : 0;
  const result = pass ? R.PASS : R.FAIL;
  return { avg, result, label: gradeLabel(avg), complete: true, kind: resultKind(result) };
}

/** Full computation for a student given the app state's subjects + settings. */
export function computeStudent(st, subjects, settings = {}) {
  const s1 = computeStage(st.grades, subjects.s1, settings);
  const s2 = computeStage(st.grades, subjects.s2, settings);
  const final = computeFinal(s1, s2, st.summer, settings);
  return { s1, s2, final };
}

/** Class statistics for one stage key ('s1' | 's2' | 'final'). */
export function classStats(students, subjects, settings, stageKey) {
  const out = { n: students.length, pass: 0, supp: 0, fail: 0, inc: 0, none: 0, complete: 0, avgSum: 0, labels: {} };
  LABELS.forEach((l) => (out.labels[l] = 0));
  let graduates = 0,
    finalComplete = 0,
    s1c = 0,
    s1p = 0,
    s2c = 0,
    s2p = 0;
  const comps = students.map((st) => computeStudent(st, subjects, settings));
  comps.forEach((c) => {
    const x = c[stageKey];
    out[x.kind] = (out[x.kind] || 0) + 1;
    if (x.complete) {
      out.complete++;
      out.avgSum += x.avg;
      out.labels[x.label] = (out.labels[x.label] || 0) + 1;
    }
    if (c.final.complete) {
      finalComplete++;
      if (c.final.result === R.PASS) graduates++;
    }
    if (c.s1.complete) {
      s1c++;
      if (c.s1.result === R.PASS) s1p++;
    }
    if (c.s2.complete) {
      s2c++;
      if (c.s2.result === R.PASS) s2p++;
    }
  });
  out.avg = out.complete ? out.avgSum / out.complete : null;
  out.graduates = graduates;
  out.rates = {
    s1: s1c ? s1p / s1c : null,
    s2: s2c ? s2p / s2c : null,
    final: finalComplete ? graduates / finalComplete : null,
    s1n: [s1p, s1c],
    s2n: [s2p, s2c],
    finaln: [graduates, finalComplete],
  };
  // per-subject stats
  const subs = stageKey === 'final' ? [...subjects.s1, ...subjects.s2] : subjects[stageKey];
  out.subjects = subs.map((sub) => {
    let n = 0,
      p = 0,
      sum = 0,
      min = Infinity,
      max = -Infinity;
    for (const st of students) {
      const g = st.grades?.[sub.id];
      if (!isNum(g)) continue;
      n++;
      sum += g;
      if (g >= (sub.passMark ?? 50)) p++;
      if (g < min) min = g;
      if (g > max) max = g;
    }
    return { id: sub.id, name: sub.ar, short: sub.cardName || sub.ar, counted: sub.counted, n, pass: p, rate: n ? p / n : null, avg: n ? sum / n : null, min: n ? min : null, max: n ? max : null };
  });
  out.comps = comps;
  return out;
}

/** Per-subject pass counts (for the master sheet footer). Blank grades are excluded. */
export function subjectPassCounts(students, sub) {
  let n = 0,
    p = 0;
  for (const st of students) {
    const g = st.grades?.[sub.id];
    if (!isNum(g)) continue;
    n++;
    if (g >= (sub.passMark ?? 50)) p++;
  }
  return { n, pass: p, rate: n ? p / n : null };
}

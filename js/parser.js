// =============================================================
// parser.js – robust import of the department's Excel master sheet.
// Uses SheetJS (global XLSX, vendored in /vendor).
//
// Strategy (no hard-coded column letters):
//  1. pick sheet "mastersheet" or the first sheet containing "اسم الطالبة"
//  2. header row = row containing "اسم الطالبة"; fixed columns found by header text
//  3. subject blocks = cells "اسم المادة : <name>" in the rows above the header;
//     units from "عدد الوحدات = N", type from "نوع المادة : X",
//     grade column = the "الدرجة النهائية" cell inside the block (formula columns ignored)
//  4. stage split by the "نتيجة المرحلة الاولى / الثانية" markers
//  5. a row is a student only when its name cell is non-empty
// If detection fails the caller shows a manual column-mapping dialog
// and calls extractStudents() with the user's mapping.
// =============================================================
import { normAr, looseAr, normalizeDigits, parseGrade, colLetter } from './utils.js';
import { GENDERS, EDUCATIONS, R } from './config.js';

const N = (s) => normAr(s);
const HDR = {
  name: ['اسم الطالبة', 'اسم الطالب', 'الاسم', 'اسم الطالب/ة', 'الاسم الثلاثي', 'اسم الطالبه'].map(N),
  serial: ['ت', 'التسلسل', 'تسلسل', 'م'].map(N),
  birth: ['المواليد', 'سنة الميلاد', 'التولد', 'المواليد/السنة'].map(N),
  gender: ['النوع الاجتماعي', 'الجنس', 'النوع'].map(N),
  edu: ['التحصيل الدراسي', 'التحصيل', 'الشهادة', 'الفرع'].map(N),
};
const GRADE_HDR = N('الدرجة النهائية');

/** Read a worksheet into an absolute-indexed 2D array of raw cell values (formulas ignored, cached values kept). */
export function sheetToGrid(ws) {
  if (!ws || !ws['!ref']) return [];
  const range = XLSX.utils.decode_range(ws['!ref']);
  const grid = [];
  for (let r = 0; r <= range.e.r; r++) {
    const row = [];
    for (let c = 0; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (!cell) row.push(null);
      else if (cell.t === 'e') row.push({ error: cell.w || '#ERR' });
      else row.push(cell.v ?? null);
    }
    grid.push(row);
  }
  return grid;
}

const txt = (v) => (v == null || typeof v === 'object' ? '' : String(v));

export function pickSheet(wb) {
  const byName = wb.SheetNames.find((n) => n.trim().toLowerCase() === 'mastersheet');
  if (byName) return byName;
  for (const n of wb.SheetNames) {
    const g = sheetToGrid(wb.Sheets[n]);
    for (let r = 0; r < Math.min(g.length, 40); r++) if (g[r].some((v) => HDR.name.includes(N(txt(v))))) return n;
  }
  return wb.SheetNames[0];
}

/** Find best app subject for a detected block. */
function matchSubject(block, candidates, used) {
  const ln = looseAr(block.name);
  let best = null,
    bestScore = 0;
  for (const s of candidates) {
    if (used.has(s.id)) continue;
    let score = 0;
    const la = looseAr(s.ar),
      lc = looseAr(s.cardName || '');
    if (ln === la || ln === lc) score = 3;
    else if (ln && (la.includes(ln) || ln.includes(la))) score = 2;
    if (block.en && s.en && block.en.trim().toLowerCase() === s.en.trim().toLowerCase()) score += 1.5;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return bestScore >= 2 ? best : null;
}

/**
 * Detect layout automatically.
 * @returns {{ok:boolean, reason?:string, mapping, detected, newSubjects, warnings}}
 */
export function detectLayout(grid, appSubjects) {
  const warnings = [];
  // --- header row ---
  let headerRow = -1,
    nameCol = -1;
  for (let r = 0; r < Math.min(grid.length, 40) && headerRow < 0; r++) {
    grid[r].forEach((v, c) => {
      if (headerRow < 0 && HDR.name.includes(N(txt(v)))) {
        headerRow = r;
        nameCol = c;
      }
    });
  }
  if (headerRow < 0) return { ok: false, reason: 'لم يتم العثور على عمود "اسم الطالبة".', warnings };

  const hdr = grid[headerRow].map((v) => N(txt(v)));
  const findCol = (keys) => hdr.findIndex((h) => keys.includes(h));
  const cols = {
    name: nameCol,
    serial: findCol(HDR.serial),
    birth: findCol(HDR.birth),
    gender: findCol(HDR.gender),
    edu: findCol(HDR.edu),
    summer: -1,
    notes1: -1,
    notes2: -1,
    notesF: -1,
  };
  if (cols.serial < 0 && nameCol > 0) cols.serial = nameCol - 1;

  // --- scan header rows (above + header row) for blocks and markers ---
  const blocks = [];
  const markers = []; // {col, stage}
  const notesCols = [];
  for (let r = 0; r <= headerRow; r++) {
    grid[r].forEach((v, c) => {
      const t = N(txt(v));
      if (!t) return;
      const m = t.match(/^اسم الماده\s*(.*)$/);
      if (m) blocks.push({ col: c, row: r, name: m[1].trim(), rawName: txt(v).replace(/^.*?:/, '').trim() });
      else if (t.includes('نتيجه المرحله')) markers.push({ col: c, stage: /الثاني/.test(t) ? 2 : 1 });
      else if (t.includes('التدريب الصيفي')) cols.summer = c;
      else if (t === 'ملاحظات' || t.startsWith('ملاحظات')) notesCols.push(c);
      else if (t.includes('النتيجه النهائيه')) markers.push({ col: c, stage: 3 });
    });
  }
  blocks.sort((a, b) => a.col - b.col);
  if (!blocks.length) return { ok: false, reason: 'لم يتم العثور على أعمدة المواد ("اسم المادة : ...").', warnings, mapping: { headerRow, firstDataRow: headerRow + 1, cols, subjects: {} } };

  const boundaries = [...blocks.map((b) => b.col), ...markers.map((m) => m.col), ...notesCols, cols.summer].filter((x) => x >= 0).sort((a, b) => a - b);
  const nextBoundary = (c) => boundaries.find((x) => x > c) ?? c + 4;

  for (const b of blocks) {
    const end = nextBoundary(b.col);
    for (let r = b.row + 1; r < headerRow; r++) {
      const raw = txt(grid[r][b.col]);
      const t = N(normalizeDigits(raw));
      if (!t) continue;
      let m;
      if ((m = t.match(/عدد الوحدات\s*(\d+(?:\.\d+)?)/))) b.units = Number(m[1]);
      else if ((m = t.match(/^نوع الماده\s*(.*)$/))) b.type = m[1].trim();
      else if (/[a-z]/i.test(raw) && !b.en) b.en = raw.trim();
    }
    b.gradeCol = -1;
    for (let c = b.col; c < end; c++) if (hdr[c] === GRADE_HDR) { b.gradeCol = c; break; }
    if (b.gradeCol < 0) {
      b.gradeCol = b.col;
      warnings.push(`لم يُعثر على عمود "الدرجة النهائية" للمادة "${b.rawName}" — استُخدم العمود ${colLetter(b.col)}.`);
    }
  }

  // --- stage assignment ---
  const m1 = markers.filter((m) => m.stage === 1).map((m) => m.col)[0];
  const m2 = markers.filter((m) => m.stage === 2).map((m) => m.col)[0];
  if (m1 != null) {
    for (const b of blocks) b.stage = b.col < m1 ? 's1' : m2 == null || b.col < m2 ? 's2' : 'x';
  } else {
    // no markers: match names, moving forward through stages
    let cur = 's1';
    const used = new Set();
    for (const b of blocks) {
      if (cur === 's1' && !matchSubject(b, appSubjects.s1, used) && matchSubject(b, appSubjects.s2, used)) cur = 's2';
      b.stage = cur;
    }
  }

  // --- match blocks to app subjects ---
  const subjMap = {};
  const newSubjects = { s1: [], s2: [] };
  const detected = { s1: [], s2: [] };
  for (const stage of ['s1', 's2']) {
    const used = new Set();
    for (const b of blocks.filter((x) => x.stage === stage)) {
      const s = matchSubject(b, appSubjects[stage], used);
      detected[stage].push({ ...b, subjectId: s?.id || null });
      if (s) {
        used.add(s.id);
        subjMap[s.id] = b.gradeCol;
        if (b.units != null && Number(b.units) !== Number(s.units)) {
          warnings.push(`المادة "${s.ar}": عدد الوحدات في رأس الملف = ${b.units} بينما الإعدادات = ${s.units}. تم الإبقاء على قيمة الإعدادات (${s.units}) — يمكنك تعديلها من الإعدادات.`);
        }
      } else {
        const id = `${stage}_x${Date.now().toString(36)}${detected[stage].length}`;
        const ns = { id, ar: b.rawName || b.name, en: b.en || '', type: b.type || 'مساعدة', units: b.units || 2, passMark: 50, counted: true, cardName: b.rawName || b.name, cardRow: 2, cardPos: 9 };
        newSubjects[stage].push(ns);
        subjMap[id] = b.gradeCol;
        detected[stage][detected[stage].length - 1].subjectId = id;
        warnings.push(`مادة غير موجودة في الإعدادات: "${ns.ar}" — ستُضاف تلقائياً إلى ${stage === 's1' ? 'المرحلة الاولى' : 'المرحلة الثانية'}.`);
      }
    }
  }
  const missingSubjects = ['s1', 's2'].flatMap((st) => appSubjects[st].filter((s) => subjMap[s.id] == null).map((s) => s.ar));
  if (missingSubjects.length) warnings.push(`مواد في الإعدادات غير موجودة في الملف: ${missingSubjects.join('، ')}.`);

  // --- notes columns by position ---
  const s2First = detected.s2[0]?.col ?? Infinity;
  for (const c of notesCols) {
    if (c < s2First && cols.notes1 < 0) cols.notes1 = c;
    else if (c >= s2First && (cols.summer < 0 || c < cols.summer) && cols.notes2 < 0) cols.notes2 = c;
    else if (cols.notesF < 0 && c > s2First) cols.notesF = c;
  }

  // data starts after header row; skip a fully empty row directly under it (merged header in template)
  let firstDataRow = headerRow + 1;
  return {
    ok: true,
    mapping: { headerRow, firstDataRow, cols, subjects: subjMap },
    detected,
    newSubjects,
    warnings,
  };
}

const normGender = (v) => {
  const t = N(v);
  if (!t) return '';
  if (/^(انثي|انثى|اناث|female|f|ا)$/i.test(t)) return 'انثى';
  if (/^(ذكر|ذكور|male|m|ذ)$/i.test(t)) return 'ذكر';
  return GENDERS.find((g) => N(g) === t) || String(v).trim();
};
const normEdu = (v) => {
  const t = looseAr(v);
  if (!t) return '';
  return EDUCATIONS.find((e) => looseAr(e) === t || looseAr(e).includes(t) || t.includes(looseAr(e))) || String(v).trim();
};
export const normSummer = (v) => {
  const t = N(v);
  if (!t) return '';
  if (t.startsWith('غير')) return R.NOT_MET;
  if (t.startsWith('مستوف')) return R.MET;
  return '';
};

/**
 * Extract students using a mapping (auto-detected or user supplied).
 * @returns {{students, warnings}}
 */
export function extractStudents(grid, mapping, allSubjects) {
  const warnings = [];
  const students = [];
  const subName = {};
  allSubjects.forEach((s) => (subName[s.id] = s.ar));
  const { cols } = mapping;
  const val = (row, c) => (c != null && c >= 0 ? row[c] : null);
  for (let r = mapping.firstDataRow; r < grid.length; r++) {
    const row = grid[r] || [];
    const name = txt(val(row, cols.name)).replace(/\s+/g, ' ').trim();
    if (!name) continue;
    if (/^(عدد الناجحين|النسبه المئويه)/.test(N(name))) continue;
    const st = {
      serial: (() => {
        const v = normalizeDigits(txt(val(row, cols.serial))).trim();
        return /^\d+$/.test(v) ? Number(v) : '';
      })(),
      name,
      birth: normalizeDigits(txt(val(row, cols.birth))).trim(),
      gender: normGender(txt(val(row, cols.gender))),
      edu: normEdu(txt(val(row, cols.edu))),
      summer: normSummer(txt(val(row, cols.summer))),
      notes1: txt(val(row, cols.notes1)).trim(),
      notes2: txt(val(row, cols.notes2)).trim(),
      notesF: txt(val(row, cols.notesF)).trim(),
      grades: {},
      invalid: {},
    };
    for (const [sid, c] of Object.entries(mapping.subjects || {})) {
      if (c == null || c < 0) continue;
      let raw = row[c];
      if (raw && typeof raw === 'object' && raw.error) {
        warnings.push(`الصف ${r + 1} (${name}) – ${subName[sid] || sid}: خطأ في الخلية ${raw.error}`);
        st.invalid[sid] = raw.error;
        continue;
      }
      if (typeof raw === 'boolean') raw = String(raw);
      const p = parseGrade(raw);
      if (p.error) {
        warnings.push(`الصف ${r + 1} (${name}) – ${subName[sid] || sid}: "${p.raw}" ${p.error}`);
        st.invalid[sid] = p.raw;
      } else if (p.value != null) st.grades[sid] = p.value;
    }
    if (txt(val(row, cols.summer)).trim() && !st.summer) warnings.push(`الصف ${r + 1} (${name}): قيمة التدريب الصيفي "${txt(val(row, cols.summer))}" غير معروفة.`);
    students.push(st);
  }
  return { students, warnings };
}

/**
 * Parse an ArrayBuffer of an .xlsx/.xls/.csv file.
 * @returns {{ok, reason?, sheetName, sheetNames, grid, mapping, detected, newSubjects, students, warnings}}
 */
export function parseWorkbook(data, appSubjects) {
  const wb = XLSX.read(data, { type: 'array', cellFormula: false, cellHTML: false, cellText: true, cellDates: false });
  const sheetName = pickSheet(wb);
  const grid = sheetToGrid(wb.Sheets[sheetName]);
  const det = detectLayout(grid, appSubjects);
  const base = { sheetName, sheetNames: wb.SheetNames, grid, wb };
  if (!det.ok) return { ...base, ...det, students: [] };
  const all = [...appSubjects.s1, ...appSubjects.s2, ...det.newSubjects.s1, ...det.newSubjects.s2];
  const ex = extractStudents(grid, det.mapping, all);
  return { ...base, ...det, students: ex.students, warnings: [...det.warnings, ...ex.warnings] };
}

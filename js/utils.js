// =============================================================
// utils.js – small pure helpers shared across modules.
// =============================================================

const AR_INDIC = '٠١٢٣٤٥٦٧٨٩';
const FA_INDIC = '۰۱۲۳۴۵۶۷۸۹';

/** Convert Arabic-Indic / Persian digits and Arabic decimal/thousands marks to ASCII. */
export function normalizeDigits(v) {
  if (v == null) return v;
  return String(v)
    .replace(/[٠-٩]/g, (d) => AR_INDIC.indexOf(d))
    .replace(/[۰-۹]/g, (d) => FA_INDIC.indexOf(d))
    .replace(/٫/g, '.')
    .replace(/[٬،]/g, ',');
}

/**
 * Parse a grade entered by a user or read from Excel.
 * Returns {value:number|null, error:string|null, raw}
 *  - '' / null  -> value null (not entered), no error
 *  - non-numeric or outside 0..100 -> value null + error
 */
export function parseGrade(raw) {
  if (raw == null) return { value: null, error: null, raw: '' };
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return { value: null, error: 'قيمة غير رقمية', raw: String(raw) };
    if (raw < 0 || raw > 100) return { value: null, error: 'خارج المدى 0–100', raw: String(raw) };
    return { value: raw, error: null, raw: String(raw) };
  }
  let t = normalizeDigits(String(raw)).trim();
  if (t === '' || t === '-' || t === '—') return { value: null, error: null, raw: '' };
  // a single comma used as decimal separator (e.g. "87,5")
  if (/^\d+,\d+$/.test(t)) t = t.replace(',', '.');
  if (!/^[+]?\d+(\.\d+)?$|^[+]?\.\d+$/.test(t)) return { value: null, error: 'قيمة غير رقمية', raw: String(raw) };
  const n = Number(t);
  if (n < 0 || n > 100) return { value: null, error: 'خارج المدى 0–100', raw: String(raw) };
  return { value: n, error: null, raw: String(raw) };
}

/** Normalise Arabic text for fuzzy matching of headers / subject names. */
export function normAr(s) {
  return String(s ?? '')
    .replace(/[ـ]/g, '') // tatweel
    .replace(/[ً-ْ]/g, '') // harakat
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[:：=]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Same as normAr but also drops spaces and the definite article, for loose comparisons. */
export function looseAr(s) {
  return normAr(s)
    .split(' ')
    .map((w) => (w.startsWith('ال') && w.length > 3 ? w.slice(2) : w))
    .join('');
}

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

/** Format a number with up to `d` decimals, trimming trailing zeros. */
export function fmt(n, d = 2) {
  if (n == null || Number.isNaN(n)) return '—';
  const r = Math.round(n * 10 ** d) / 10 ** d;
  return String(r);
}
export const pct = (a, b, d = 1) => (b ? fmt((a / b) * 100, d) + '%' : '—');

export function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1500);
}

export function todayStamp() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Excel column letter from 0-based index. */
export function colLetter(i) {
  let s = '';
  i += 1;
  while (i > 0) {
    const m = (i - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

export function blobToDataURL(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

/** Resize an image file to fit maxPx and return a PNG data URL (keeps logos small in storage). */
export async function imageFileToDataURL(file, maxPx = 360) {
  const url = await blobToDataURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  const k = Math.min(1, maxPx / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

export const arCompare = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'ar');

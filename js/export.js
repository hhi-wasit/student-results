// =============================================================
// export.js – Excel / JSON / PDF / PNG / print.
//
// PDF & PNG: pages are rendered by the BROWSER's own text engine via
// an SVG <foreignObject> snapshot (fonts embedded as data URLs), so
// Arabic letters are joined and ordered right-to-left exactly as on
// screen. html2canvas is only a fallback (some Safari versions).
// For crisp vector PDFs use "طباعة / حفظ PDF" (browser print).
// =============================================================
import * as store from './store.js';
import { buildWorkbook, workbookToArrayBuffer } from './xlsxio.js';
import { downloadBlob, todayStamp, blobToDataURL } from './utils.js';
import { resolveDefaultLogo } from './cardview.js';
import { APP_VERSION } from './config.js';

// ---------- Excel ----------
export function exportXlsx() {
  const wb = buildWorkbook(store.get());
  const buf = workbookToArrayBuffer(wb);
  downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `mastersheet-${todayStamp()}.xlsx`);
}
export function downloadTemplate() {
  const wb = buildWorkbook(store.get(), { emptyRows: 100 });
  const buf = workbookToArrayBuffer(wb);
  downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'قالب-كشف-الدرجات.xlsx');
}

// ---------- JSON backup ----------
export function exportJSON() {
  const data = { app: 'srms-results', version: APP_VERSION, exportedAt: new Date().toISOString(), state: store.get() };
  downloadBlob(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), `backup-${todayStamp()}.json`);
}
export async function readBackup(file) {
  const obj = JSON.parse(await file.text());
  const st = obj.state || obj;
  if (!st || !Array.isArray(st.students) || !st.subjects) throw new Error('ملف النسخة الاحتياطية غير صالح.');
  return st;
}

// ---------- embedded CSS for snapshots ----------
let embedCssCache = null;
async function fontFace(file, weight, range) {
  const blob = await (await fetch(file)).blob();
  const url = await blobToDataURL(blob);
  return `@font-face{font-family:'Cairo';font-weight:${weight};font-style:normal;src:url(${url}) format('woff2');unicode-range:${range};}`;
}
async function embedCss() {
  if (embedCssCache) return embedCssCache;
  let css = '';
  try {
    css = await (await fetch('css/card.css')).text();
  } catch {
    // file:// fallback – collect rules from the loaded stylesheet
    for (const sh of document.styleSheets) {
      if (!(sh.href || '').includes('card.css')) continue;
      try {
        css += [...sh.cssRules].map((r) => r.cssText).join('\n');
      } catch {}
    }
  }
  const AR = 'U+0600-06FF,U+0750-077F,U+08A0-08FF,U+200C-200E,U+FB50-FDFF,U+FE70-FEFC';
  const LA = 'U+0000-00FF,U+2000-206F';
  try {
    const faces = await Promise.all([
      fontFace('fonts/cairo-arabic-400-normal.woff2', 400, AR),
      fontFace('fonts/cairo-arabic-600-normal.woff2', 600, AR),
      fontFace('fonts/cairo-arabic-700-normal.woff2', 700, AR),
      fontFace('fonts/cairo-latin-400-normal.woff2', 400, LA),
      fontFace('fonts/cairo-latin-700-normal.woff2', 700, LA),
    ]);
    css = faces.join('\n') + '\n' + css;
  } catch (e) {
    console.warn('font embedding failed (using system Arabic font)', e);
  }
  embedCssCache = css;
  return css;
}

/** Wait for an <img> to be ready. */
const loadImg = (src) =>
  new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });

/**
 * Snapshot an HTML string (one page or one card) to a canvas.
 * @param {string} html markup using classes from card.css
 * @param {number} w CSS px width, h CSS px height
 */
export async function htmlToCanvas(html, w, h, scale = 2) {
  await resolveDefaultLogo();
  const css = await embedCss();
  // turn the markup into well-formed XHTML
  const holder = document.createElement('div');
  holder.innerHTML = html;
  // inline relative image URLs as data URLs (foreignObject images must be self-contained)
  for (const img of holder.querySelectorAll('img')) {
    const src = img.getAttribute('src') || '';
    if (src && !src.startsWith('data:')) {
      try {
        img.setAttribute('src', await blobToDataURL(await (await fetch(src)).blob()));
      } catch {}
    }
  }
  const xhtml = new XMLSerializer().serializeToString(holder);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w * scale}" height="${h * scale}" viewBox="0 0 ${w} ${h}">` +
    `<foreignObject x="0" y="0" width="${w}" height="${h}"><div xmlns="http://www.w3.org/1999/xhtml" dir="rtl" style="width:${w}px;height:${h}px;background:#fff">` +
    `<style>${css.replace(/<\/style/gi, '')}</style>${xhtml}</div></foreignObject></svg>`;
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  const img = await loadImg(url);
  // give the SVG image a moment to apply its embedded web fonts
  await new Promise((r) => setTimeout(r, 60));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  canvas.toDataURL('image/png').slice(0, 30); // throws if tainted -> caller falls back
  return canvas;
}

/** Fallback renderer using html2canvas on an off-screen node. */
async function html2canvasFallback(html, w, h, scale) {
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${w}px;height:${h}px;background:#fff`;
  host.setAttribute('dir', 'rtl');
  host.innerHTML = html;
  document.body.appendChild(host);
  try {
    await document.fonts.ready;
    return await window.html2canvas(host, { scale, backgroundColor: '#fff', useCORS: true, logging: false, width: w, height: h });
  } finally {
    host.remove();
  }
}

export async function renderCanvas(html, w, h, scale = 2) {
  try {
    return await htmlToCanvas(html, w, h, scale);
  } catch (e) {
    console.warn('foreignObject renderer failed, falling back to html2canvas', e);
    return html2canvasFallback(html, w, h, scale);
  }
}

/** Measure rendered height of markup at width w (for single-card PNG). */
export async function measure(html, w) {
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${w}px;background:#fff`;
  host.setAttribute('dir', 'rtl');
  host.innerHTML = html;
  document.body.appendChild(host);
  await document.fonts.ready;
  await Promise.all([...host.querySelectorAll('img')].map((i) => (i.complete ? 0 : new Promise((r) => (i.onload = i.onerror = r)))));
  const h = Math.ceil(host.firstElementChild.getBoundingClientRect().height);
  host.remove();
  return h;
}

/** Build a PDF from A4 page HTML strings. onProgress(i, n). */
export async function pagesToPdf(pages, filename, onProgress, orientation = 'p') {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4', compress: true });
  const [W, H] = orientation === 'p' ? [794, 1123] : [1123, 794];
  for (let i = 0; i < pages.length; i++) {
    onProgress?.(i, pages.length);
    const canvas = await renderCanvas(pages[i], W, H, 2);
    if (i > 0) pdf.addPage('a4', orientation);
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, orientation === 'p' ? 210 : 297, orientation === 'p' ? 297 : 210, undefined, 'FAST');
    await new Promise((r) => setTimeout(r, 0)); // keep UI responsive
  }
  onProgress?.(pages.length, pages.length);
  pdf.save(filename);
}

export async function cardToPng(cardHtml, filename) {
  const html = `<div class="rc-png-wrap" style="width:734px;padding:0;background:#fff">${cardHtml.replace('class="rc"', 'class="rc single"')}</div>`;
  const h = await measure(html, 734);
  const canvas = await renderCanvas(html, 734, h, 3);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  downloadBlob(blob, filename);
}

// ---------- browser print ----------
/**
 * Print arbitrary HTML via the browser (vector output; "Save as PDF").
 * @param {string} html
 * @param {'portrait'|'landscape'} orientation
 */
export function printHTML(html, orientation = 'portrait', bodyClass = '') {
  document.getElementById('print-root')?.remove();
  document.getElementById('print-page-style')?.remove();
  const root = document.createElement('div');
  root.id = 'print-root';
  root.setAttribute('dir', 'rtl');
  root.innerHTML = html;
  document.body.appendChild(root);
  const st = document.createElement('style');
  st.id = 'print-page-style';
  st.textContent = `@page { size: A4 ${orientation}; margin: ${orientation === 'landscape' ? '8mm' : '0'}; }`;
  document.head.appendChild(st);
  document.body.classList.add('is-printing');
  if (bodyClass) document.body.classList.add(bodyClass);
  const cleanup = () => {
    document.body.classList.remove('is-printing');
    if (bodyClass) document.body.classList.remove(bodyClass);
    root.remove();
    st.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  const imgs = [...root.querySelectorAll('img')];
  Promise.all([document.fonts.ready, ...imgs.map((i) => (i.complete ? 0 : new Promise((r) => (i.onload = i.onerror = r))))]).then(() =>
    setTimeout(() => {
      window.print();
      setTimeout(() => document.body.classList.contains('is-printing') && !matchMedia('print').matches && cleanup(), 1500);
    }, 50)
  );
}

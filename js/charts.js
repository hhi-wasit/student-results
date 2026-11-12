// =============================================================
// charts.js – hand-made SVG charts in the dashboard style
// (smooth gradient area lines, gradient bars, gradient rings).
// Charts are laid out right-to-left (first category on the right).
// =============================================================
import { esc, fmt } from './utils.js';

let uid = 0;
const nid = (p) => `${p}${++uid}`;

/** Catmull-Rom → cubic Bézier path through points. */
function smoothPath(pts) {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i],
      p1 = pts[i],
      p2 = pts[i + 1],
      p3 = pts[i + 2] || p2;
    const t = 0.18;
    const c1 = [p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t];
    const c2 = [p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

/**
 * Smooth multi-series area/line chart.
 * @param {{labels:string[], series:{name,color,values:(number|null)[]}[], width, height, min, max, unit}} o
 */
export function areaLineChart(o) {
  const W = Math.max(320, o.width || 640),
    H = o.height || 260;
  const padL = 34,
    padR = 18,
    padT = 26,
    padB = 62;
  const min = o.min ?? 0,
    max = o.max ?? 100;
  const n = o.labels.length;
  const iw = W - padL - padR,
    ih = H - padT - padB;
  // RTL: index 0 on the right
  const x = (i) => (n <= 1 ? padL + iw / 2 : W - padR - (i * iw) / (n - 1));
  const y = (v) => padT + ih - ((v - min) / (max - min)) * ih;
  const ticks = [0, 25, 50, 75, 100].filter((t) => t >= min && t <= max);
  let defs = '',
    body = '';
  // grid
  body += ticks.map((t) => `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" class="grid-line"/><text x="${padL - 6}" y="${y(t) + 4}" class="axis-t" text-anchor="end">${t}</text>`).join('');
  // pass line
  if (o.passLine != null) body += `<line x1="${padL}" x2="${W - padR}" y1="${y(o.passLine)}" y2="${y(o.passLine)}" class="pass-line"/>`;
  o.series.forEach((s, si) => {
    const gid = nid('ag'),
      fid = nid('gl');
    defs += `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity="${si === 0 ? 0.28 : 0.12}"/><stop offset="1" stop-color="${s.color}" stop-opacity="0"/></linearGradient>
      <filter id="${fid}" x="-10%" y="-30%" width="120%" height="160%"><feDropShadow dx="0" dy="6" stdDeviation="5" flood-color="${s.color}" flood-opacity=".35"/></filter>`;
    const pts = s.values.map((v, i) => (v == null ? null : [x(i), y(v)])).filter(Boolean);
    if (!pts.length) return;
    const line = smoothPath(pts);
    const area = `${line} L${pts[pts.length - 1][0]},${y(min)} L${pts[0][0]},${y(min)} Z`;
    body += `<path d="${area}" fill="url(#${gid})" class="area-anim"/>`;
    body += `<path d="${line}" fill="none" stroke="${s.color}" stroke-width="3" stroke-linecap="round" filter="url(#${fid})" class="line-anim"/>`;
    body += s.values
      .map((v, i) => (v == null ? '' : `<g class="pt"><circle cx="${x(i)}" cy="${y(v)}" r="4.5" fill="#fff" stroke="${s.color}" stroke-width="2.5"/><title>${esc(o.labels[i])} — ${esc(s.name)}: ${fmt(v, 2)}</title></g>`))
      .join('');
  });
  // highlight max of first series
  const s0 = o.series[0];
  if (s0) {
    let bi = -1;
    s0.values.forEach((v, i) => {
      if (v != null && (bi < 0 || v > s0.values[bi])) bi = i;
    });
    if (bi >= 0) {
      const tx = x(bi),
        ty = y(s0.values[bi]) - 16;
      const label = fmt(s0.values[bi], 1);
      body += `<g class="bubble"><rect x="${tx - 26}" y="${ty - 15}" width="52" height="22" rx="11" fill="#fff" stroke="${s0.color}" stroke-opacity=".5"/><text x="${tx}" y="${ty + 1}" text-anchor="middle" fill="${s0.color}" class="bubble-t">${label}</text></g>`;
    }
  }
  // x labels (rotated)
  body += o.labels
    .map((l, i) => {
      const short = l.length > 14 ? l.slice(0, 13) + '…' : l;
      return `<text transform="translate(${x(i) + 4},${H - padB + 14}) rotate(-35)" class="axis-x" text-anchor="start" direction="rtl"><title>${esc(l)}</title>${esc(short)}</text>`;
    })
    .join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${esc(o.aria || '')}"><defs>${defs}</defs>${body}</svg>`;
}

/**
 * Vertical gradient bars.
 * @param {{labels, values, colors:[[top,bottom],...]|[top,bottom], width, height}} o
 */
export function barChart(o) {
  const W = Math.max(280, o.width || 420),
    H = o.height || 240;
  const padL = 30,
    padR = 12,
    padT = 24,
    padB = 34;
  const n = o.labels.length;
  const max = Math.max(1, ...o.values);
  const niceMax = Math.ceil(max / 5) * 5 || 5;
  const iw = W - padL - padR,
    ih = H - padT - padB;
  const slot = iw / n,
    bw = Math.min(38, slot * 0.46);
  let defs = '',
    body = '';
  for (let k = 0; k <= 4; k++) {
    const v = (niceMax * k) / 4,
      yy = padT + ih - (v / niceMax) * ih;
    body += `<line x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}" class="grid-line"/><text x="${padL - 6}" y="${yy + 4}" text-anchor="end" class="axis-t">${fmt(v, 0)}</text>`;
  }
  o.values.forEach((v, i) => {
    const [c1, c2] = Array.isArray(o.colors[0]) ? o.colors[i % o.colors.length] : o.colors;
    const gid = nid('bg');
    defs += `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>`;
    const cx = W - padR - slot * (i + 0.5); // RTL
    const h = (v / niceMax) * ih;
    const yy = padT + ih - h;
    const r = Math.min(bw / 2, h);
    body += `<g class="bar"><path d="M${cx - bw / 2},${padT + ih} V${yy + r} Q${cx - bw / 2},${yy} ${cx - bw / 2 + r},${yy} H${cx + bw / 2 - r} Q${cx + bw / 2},${yy} ${cx + bw / 2},${yy + r} V${padT + ih} Z" fill="url(#${gid})" class="bar-anim" style="transform-origin:${cx}px ${padT + ih}px"><title>${esc(o.labels[i])}: ${v}</title></path>
      <text x="${cx}" y="${yy - 7}" text-anchor="middle" class="bar-v">${v}</text>
      <text x="${cx}" y="${H - padB + 18}" text-anchor="middle" class="axis-x">${esc(o.labels[i])}</text></g>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${esc(o.aria || '')}"><defs>${defs}</defs>${body}</svg>`;
}

/** Horizontal gradient progress bars (HTML). items: {label, value 0..1|null, text} */
export function hBars(items, grad = ['#36b9ff', '#6b4cf5']) {
  if (!items.length) return '<p class="muted">لا توجد بيانات.</p>';
  return `<div class="hbars">${items
    .map((it) => {
      const p = it.value == null ? 0 : Math.max(0, Math.min(1, it.value)) * 100;
      const low = it.value != null && it.value < 0.5;
      return `<div class="hbar" title="${esc(it.label)}"><span class="hbar-l">${esc(it.label)}</span><span class="hbar-track"><i style="width:${p}%;background:linear-gradient(90deg, ${low ? '#f8a05a,#f2637e' : grad.join(',')})"></i></span><span class="hbar-v">${esc(it.text)}</span></div>`;
    })
    .join('')}</div>`;
}

/** Ring / donut gauge with gradient stroke and big percentage. */
export function ring({ value, colors = ['#4f6df5', '#c471ed'], size = 132, stroke = 11, sub = '' }) {
  const gid = nid('rg');
  const r = (size - stroke) / 2 - 4,
    c = 2 * Math.PI * r;
  const v = value == null ? 0 : Math.max(0, Math.min(1, value));
  const text = value == null ? '—' : `${fmt(v * 100, 0)}%`;
  return `<svg class="ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${text}">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${colors[0]}"/><stop offset="1" stop-color="${colors[1]}"/></linearGradient></defs>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#eef1f7" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="url(#${gid})" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${(c * v).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})" class="ring-anim" style="--c:${c.toFixed(2)}"/>
    <text x="50%" y="${sub ? '47%' : '52%'}" text-anchor="middle" dominant-baseline="middle" class="ring-t" fill="${colors[0]}">${text}</text>
    ${sub ? `<text x="50%" y="66%" text-anchor="middle" class="ring-s">${esc(sub)}</text>` : ''}
  </svg>`;
}

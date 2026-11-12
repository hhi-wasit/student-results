// =============================================================
// ui.js – icons, toasts, modals, confirm dialogs, drawers.
// =============================================================
import { esc } from './utils.js';

// Simple 24×24 stroke icons (hand-drawn paths, stroke = currentColor)
const P = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  upload: '<path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  download: '<path d="M12 4v12"/><path d="M7 11l5 5 5-5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17.5" cy="9" r="2.6"/><path d="M17 14.6c2.4.2 4 1.8 4.6 4.6"/>',
  card: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M7 13h4M7 16h7"/><circle cx="17" cy="14.5" r="1.8"/>',
  sheet: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  check: '<path d="M4 12.5l5 5L20 6.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  print: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  pdf: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 15h6M9 18h4"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  excel: '<rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M8 8l8 8M16 8l-8 8"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  sortAz: '<path d="M4 6h9M4 12h6M4 18h3"/><path d="M17 4v16M14 17l3 3 3-3"/>',
  sortDesc: '<path d="M4 6h3M4 12h6M4 18h9"/><path d="M17 4v16M14 17l3 3 3-3"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  grad: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3.5 2.5 8.5 2.5 12 0v-5"/><path d="M22 9v6"/>',
  pass: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>',
  fail: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
  warn: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4.5M12 17.5v.2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.2"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  columns: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>',
  test: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/><path d="M7.5 15h9"/>',
  json: '<path d="M8 4c-2 0-3 1-3 3v2c0 1.5-1 3-2 3 1 0 2 1.5 2 3v2c0 2 1 3 3 3M16 4c2 0 3 1 3 3v2c0 1.5 1 3 2 3-1 0-2 1.5-2 3v2c0 2-1 3-3 3"/>',
  restore: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  logo: '<path d="M12 3v18M3 12h18" stroke-width="3.2"/>',
};
export const icon = (name, cls = '') =>
  `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;

// ---------- toasts ----------
export function toast(msg, type = 'info', ms = 3200) {
  let box = document.getElementById('toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    document.body.appendChild(box);
  }
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `${icon(type === 'error' ? 'fail' : type === 'success' ? 'pass' : type === 'warn' ? 'warn' : 'info')}<span>${esc(msg)}</span>`;
  box.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, ms);
}

// ---------- modal ----------
/**
 * Open a modal. Returns {el, close, body}. `onClose` called once.
 * buttons: [{label, cls, value, icon}] – clicking resolves `result` with value.
 */
export function modal({ title, body = '', buttons = [], wide = false, onClose } = {}) {
  const prevFocus = document.activeElement;
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `
    <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="إغلاق">${icon('x')}</button></div>
      <div class="modal-body"></div>
      ${buttons.length ? `<div class="modal-foot">${buttons.map((b, i) => `<button class="btn ${b.cls || ''}" data-btn="${i}">${b.icon ? icon(b.icon) : ''}${esc(b.label)}</button>`).join('')}</div>` : ''}
    </div>`;
  const bodyEl = wrap.querySelector('.modal-body');
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else bodyEl.appendChild(body);
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('show'));
  let resolveFn;
  const result = new Promise((r) => (resolveFn = r));
  let closed = false;
  const close = (value) => {
    if (closed) return;
    closed = true;
    wrap.classList.remove('show');
    document.removeEventListener('keydown', onKey, true);
    setTimeout(() => wrap.remove(), 200);
    resolveFn(value);
    onClose?.(value);
    prevFocus?.focus?.();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close(undefined);
    }
    if (e.key === 'Tab') {
      // focus trap
      const f = [...wrap.querySelectorAll('button,input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent);
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) {
        e.preventDefault();
        f[f.length - 1].focus();
      } else if (!e.shiftKey && i === f.length - 1) {
        e.preventDefault();
        f[0].focus();
      }
    }
  };
  document.addEventListener('keydown', onKey, true);
  wrap.addEventListener('mousedown', (e) => {
    if (e.target === wrap) close(undefined);
  });
  wrap.querySelector('[data-close]').onclick = () => close(undefined);
  wrap.querySelectorAll('[data-btn]').forEach((b) => (b.onclick = () => {
    const def = buttons[+b.dataset.btn];
    if (def.onClick) {
      const r = def.onClick();
      if (r === false) return;
    }
    close(def.value);
  }));
  setTimeout(() => {
    const first = bodyEl.querySelector('input,textarea,select') || wrap.querySelector('.modal-foot .btn-primary') || wrap.querySelector('[data-close]');
    first?.focus();
  }, 30);
  return { el: wrap, body: bodyEl, close, result };
}

export function confirmDialog(message, { title = 'تأكيد', okLabel = 'تأكيد', danger = false } = {}) {
  return modal({
    title,
    body: `<p class="confirm-msg">${esc(message)}</p>`,
    buttons: [
      { label: 'إلغاء', cls: 'btn-ghost', value: false },
      { label: okLabel, cls: danger ? 'btn-danger' : 'btn-primary', value: true },
    ],
  }).result.then((v) => !!v);
}

export function promptText({ title, label, placeholder = '', rows = 8, okLabel = 'موافق' }) {
  const m = modal({
    title,
    body: `<label class="field"><span>${esc(label)}</span><textarea rows="${rows}" placeholder="${esc(placeholder)}"></textarea></label>`,
    buttons: [
      { label: 'إلغاء', cls: 'btn-ghost', value: null },
      { label: okLabel, cls: 'btn-primary', value: 'ok' },
    ],
  });
  return m.result.then((v) => (v === 'ok' ? m.body.querySelector('textarea').value : null));
}

// ---------- busy overlay ----------
export function busy(text = 'جارٍ المعالجة…') {
  const el = document.createElement('div');
  el.className = 'busy';
  el.innerHTML = `<div class="busy-box"><div class="spinner"></div><div class="busy-text">${esc(text)}</div><div class="busy-bar"><i></i></div></div>`;
  document.body.appendChild(el);
  return {
    set(t, p) {
      el.querySelector('.busy-text').textContent = t;
      if (p != null) el.querySelector('.busy-bar i').style.width = Math.round(p * 100) + '%';
    },
    close() {
      el.remove();
    },
  };
}

/** Result pill HTML. */
export function resultPill(result, kind) {
  if (!result) return '<span class="muted">—</span>';
  return `<span class="pill pill-${kind}">${esc(result)}</span>`;
}

export function emptyState({ iconName = 'users', title, text, actions = '' }) {
  return `<div class="empty card"><div class="empty-ic">${icon(iconName)}</div><h3>${esc(title)}</h3><p>${esc(text)}</p><div class="empty-actions">${actions}</div></div>`;
}

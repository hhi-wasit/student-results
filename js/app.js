// =============================================================
// app.js – shell: navigation, hash router, save indicator, shortcuts.
// =============================================================
import * as store from './store.js';
import { icon, toast } from './ui.js';
import { resolveDefaultLogo, logoSrc } from './cardview.js';
import * as dashboard from './pages/dashboard.js';
import * as importer from './pages/import.js';
import * as students from './pages/students.js';
import * as cards from './pages/cards.js';
import * as master from './pages/master.js';
import * as settingsPage from './pages/settings.js';

const ROUTES = [
  { id: 'dashboard', title: 'لوحة المعلومات', icon: 'dashboard', page: dashboard },
  { id: 'import', title: 'رفع ملف Excel', icon: 'upload', page: importer },
  { id: 'students', title: 'الطلبة / إدخال الدرجات', icon: 'users', page: students },
  { id: 'cards', title: 'بطاقات النتائج', icon: 'card', page: cards },
  { id: 'master', title: 'كشف الدرجات', icon: 'sheet', page: master },
  { id: 'settings', title: 'الإعدادات', icon: 'settings', page: settingsPage },
];

let current = null;
const view = document.getElementById('view');

function buildNav() {
  document.getElementById('nav').innerHTML = ROUTES.map((r) => `<li><a href="#${r.id}" data-route="${r.id}">${icon(r.icon)}<span>${r.title}</span></a></li>`).join('');
  document.getElementById('menu-btn').innerHTML = icon('menu');
  document.getElementById('privacy-ic').innerHTML = icon('shield');
  document.getElementById('menu-btn').onclick = () => document.body.classList.toggle('nav-open');
  document.addEventListener('click', (e) => {
    if (document.body.classList.contains('nav-open') && !e.target.closest('.sidebar') && !e.target.closest('#menu-btn')) document.body.classList.remove('nav-open');
  });
}

function updateBrand() {
  const s = store.settings();
  document.getElementById('brand-logo').src = logoSrc(s);
  document.getElementById('brand-sub').textContent = `${s.department} – ${s.institute}`;
}

async function route() {
  const id = (location.hash || '#dashboard').slice(1).split('?')[0];
  const r = ROUTES.find((x) => x.id === id) || ROUTES[0];
  if (current?.page.unmount) current.page.unmount();
  current = r;
  document.querySelectorAll('#nav a').forEach((a) => {
    a.classList.toggle('active', a.dataset.route === r.id);
    a.setAttribute('aria-current', a.dataset.route === r.id ? 'page' : 'false');
  });
  document.getElementById('page-title').textContent = r.title;
  document.title = `${r.title} – نتائج الطلبة`;
  document.body.classList.remove('nav-open');
  view.classList.remove('enter');
  void view.offsetWidth;
  view.classList.add('enter');
  try {
    await r.page.mount(view);
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="card note-box err">${icon('fail')}<div>حدث خطأ أثناء عرض الصفحة: ${e.message}</div></div>`;
  }
}

function saveIndicator(type) {
  const el = document.getElementById('save-ind');
  const st = store.getSaveStatus();
  el.className = `save-ind ${st}`;
  el.querySelector('span').textContent = st === 'saving' ? 'جارٍ الحفظ…' : st === 'error' ? 'تعذّر الحفظ' : 'محفوظ تلقائياً';
  if (type === 'settings' || type === 'all') updateBrand();
}

// global undo / redo (the grid handles its own when focused; this covers other pages)
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (['input', 'textarea', 'select'].includes(tag)) return;
  if (e.target.closest?.('.sg-wrap')) return;
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) {
    e.preventDefault();
    const u = store.undo();
    toast(u ? `تراجع: ${u.label}` : 'لا يوجد ما يمكن التراجع عنه', u ? 'info' : 'warn', 1600);
  } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
    e.preventDefault();
    const r = store.redo();
    toast(r ? `إعادة: ${r.label}` : 'لا يوجد ما يمكن إعادته', r ? 'info' : 'warn', 1600);
  }
});
window.addEventListener('beforeunload', () => store.flush());

(async function start() {
  buildNav();
  await store.init();
  await resolveDefaultLogo();
  updateBrand();
  store.on(saveIndicator);
  saveIndicator();
  window.addEventListener('hashchange', route);
  route();
})();

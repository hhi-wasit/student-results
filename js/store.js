// =============================================================
// store.js – single source of truth + persistence + undo/redo.
// Data lives only in this browser (IndexedDB, with localStorage fallback).
// =============================================================
import { defaultState, DEFAULT_SETTINGS, DEFAULT_SUBJECTS, SCHEMA_VERSION } from './config.js';
import { debounce } from './utils.js';

const DB_NAME = 'srms-results';
const DB_STORE = 'kv';
const KEY = 'state';
const LS_KEY = 'srms-results-state';

let db = null;
let state = defaultState();
const listeners = new Set();
const undoStack = [];
const redoStack = [];
const UNDO_LIMIT = 200;

// ---------- IndexedDB helpers ----------
function openDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('no idb'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function idbGet(key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const r = tx.objectStore(DB_STORE).get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
function idbSet(key, val) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Bring older/partial saved states up to the current shape. */
export function migrate(s) {
  const base = defaultState();
  if (!s || typeof s !== 'object') return base;
  const out = { ...base, ...s };
  out.settings = { ...DEFAULT_SETTINGS, ...(s.settings || {}) };
  out.subjects = {
    s1: Array.isArray(s.subjects?.s1) ? s.subjects.s1 : structuredClone(DEFAULT_SUBJECTS.s1),
    s2: Array.isArray(s.subjects?.s2) ? s.subjects.s2 : structuredClone(DEFAULT_SUBJECTS.s2),
  };
  out.students = (Array.isArray(s.students) ? s.students : []).map(normalizeStudent);
  out.nextId = Math.max(s.nextId || 1, ...out.students.map((x) => x.id + 1), 1);
  out.schema = SCHEMA_VERSION;
  return out;
}

export function normalizeStudent(x) {
  return {
    id: x.id,
    serial: x.serial ?? '',
    name: x.name ?? '',
    birth: x.birth ?? '',
    gender: x.gender ?? '',
    edu: x.edu ?? '',
    grades: { ...(x.grades || {}) },
    invalid: { ...(x.invalid || {}) }, // subjectId -> raw invalid text (highlighted until fixed)
    summer: x.summer ?? '',
    notes1: x.notes1 ?? '',
    notes2: x.notes2 ?? '',
    notesF: x.notesF ?? '',
  };
}

// ---------- persistence ----------
let saveStatus = 'saved';
const persistNow = async () => {
  state.updatedAt = new Date().toISOString();
  const snapshot = JSON.parse(JSON.stringify(state));
  try {
    if (db) await idbSet(KEY, snapshot);
    else localStorage.setItem(LS_KEY, JSON.stringify(snapshot));
    saveStatus = 'saved';
  } catch (e) {
    console.error(e);
    saveStatus = 'error';
  }
  emit('saved');
};
const persist = debounce(persistNow, 350);

export async function init() {
  try {
    db = await openDB();
    const saved = await idbGet(KEY);
    if (saved) state = migrate(saved);
    else {
      // migrate from localStorage if a previous fallback save exists
      const ls = localStorage.getItem(LS_KEY);
      if (ls) state = migrate(JSON.parse(ls));
    }
  } catch (e) {
    console.warn('IndexedDB unavailable, using localStorage', e);
    db = null;
    try {
      const ls = localStorage.getItem(LS_KEY);
      if (ls) state = migrate(JSON.parse(ls));
    } catch {}
  }
  return state;
}

// ---------- events ----------
export function on(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit(type, detail) {
  listeners.forEach((fn) => {
    try {
      fn(type, detail);
    } catch (e) {
      console.error(e);
    }
  });
}
export const getSaveStatus = () => saveStatus;

function changed(type, detail) {
  saveStatus = 'saving';
  emit(type, detail);
  persist();
}

// ---------- getters ----------
export const get = () => state;
export const settings = () => state.settings;
export const subjects = () => state.subjects;
export const students = () => state.students;
export const byId = (id) => state.students.find((s) => s.id === id);

// ---------- field access (used by grid + undo) ----------
// field keys: 'name' | 'birth' | 'gender' | 'edu' | 'summer' | 'notes1' | 'notes2' | 'notesF' | 'serial' | 'g:<subjectId>'
export function readField(st, key) {
  if (key.startsWith('g:')) {
    const id = key.slice(2);
    if (st.invalid?.[id] != null) return { invalid: st.invalid[id] };
    return st.grades[id] ?? null;
  }
  return st[key];
}
function writeField(st, key, val) {
  if (key.startsWith('g:')) {
    const id = key.slice(2);
    if (val && typeof val === 'object' && 'invalid' in val) {
      st.invalid[id] = val.invalid;
      delete st.grades[id];
    } else {
      delete st.invalid[id];
      if (val == null || val === '') delete st.grades[id];
      else st.grades[id] = val;
    }
  } else st[key] = val;
}

/**
 * Apply a batch of cell changes as one undoable action.
 * @param {Array<{id:number,key:string,value:any}>} changes
 */
export function setCells(changes, label = 'تعديل') {
  const rec = [];
  for (const c of changes) {
    const st = byId(c.id);
    if (!st) continue;
    const old = readField(st, c.key);
    if (JSON.stringify(old) === JSON.stringify(c.value ?? null)) continue;
    rec.push({ id: c.id, key: c.key, old, value: c.value ?? null });
    writeField(st, c.key, c.value);
  }
  if (!rec.length) return 0;
  pushUndo({ type: 'cells', changes: rec, label });
  changed('cells', { ids: [...new Set(rec.map((r) => r.id))] });
  return rec.length;
}

// structural changes are stored as student-array snapshots
function snapshotStudents() {
  return JSON.parse(JSON.stringify({ students: state.students, nextId: state.nextId }));
}
function structural(label, mutator) {
  const before = snapshotStudents();
  mutator();
  const after = snapshotStudents();
  pushUndo({ type: 'snap', before, after, label });
  changed('students');
}

export function addStudents(list) {
  const added = [];
  structural('إضافة طلبة', () => {
    let serial = Math.max(0, ...state.students.map((s) => Number(s.serial) || 0));
    for (const x of list) {
      const st = normalizeStudent({ ...x, id: state.nextId++ });
      if (st.serial === '' || st.serial == null) st.serial = ++serial;
      else serial = Math.max(serial, Number(st.serial) || serial);
      state.students.push(st);
      added.push(st);
    }
  });
  return added;
}
export function deleteStudents(ids) {
  const set = new Set(ids);
  structural('حذف طلبة', () => {
    state.students = state.students.filter((s) => !set.has(s.id));
  });
}
export function replaceStudents(list, label = 'استيراد') {
  structural(label, () => {
    state.nextId = 1;
    state.students = list.map((x, i) => normalizeStudent({ ...x, id: state.nextId++, serial: x.serial || i + 1 }));
  });
}
export function renumber() {
  structural('إعادة الترقيم', () => state.students.forEach((s, i) => (s.serial = i + 1)));
}

// settings / subjects are not part of undo history (they are edited in forms)
export function updateSettings(patch) {
  Object.assign(state.settings, patch);
  changed('settings');
}
export function setSubjects(stage, list) {
  state.subjects[stage] = list;
  changed('subjects');
}
export function replaceAll(newState) {
  state = migrate(newState);
  undoStack.length = 0;
  redoStack.length = 0;
  changed('all');
}

// ---------- undo / redo ----------
function pushUndo(entry) {
  undoStack.push(entry);
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  redoStack.length = 0;
  emit('history');
}
export const canUndo = () => undoStack.length > 0;
export const canRedo = () => redoStack.length > 0;
export function undo() {
  const e = undoStack.pop();
  if (!e) return null;
  if (e.type === 'cells') for (const c of [...e.changes].reverse()) { const st = byId(c.id); if (st) writeField(st, c.key, c.old); }
  else Object.assign(state, JSON.parse(JSON.stringify(e.before)));
  redoStack.push(e);
  changed(e.type === 'cells' ? 'cells' : 'students', e.type === 'cells' ? { ids: e.changes.map((c) => c.id), undo: true } : {});
  emit('history');
  return e;
}
export function redo() {
  const e = redoStack.pop();
  if (!e) return null;
  if (e.type === 'cells') for (const c of e.changes) { const st = byId(c.id); if (st) writeField(st, c.key, c.value); }
  else Object.assign(state, JSON.parse(JSON.stringify(e.after)));
  undoStack.push(e);
  changed(e.type === 'cells' ? 'cells' : 'students', e.type === 'cells' ? { ids: e.changes.map((c) => c.id), undo: true } : {});
  emit('history');
  return e;
}

export const flush = () => persistNow();

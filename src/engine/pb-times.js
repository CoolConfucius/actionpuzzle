// Per-level personal-best clear times, persisted in localStorage.
// Lower is better. Pure logic; tests inject a storage stub.

const STORAGE_KEY = 'pbTimes';

function safeStore(store) {
  if (store) return store;
  if (typeof localStorage !== 'undefined' && localStorage !== null) return localStorage;
  return null;
}

export function readPbTimes(store) {
  const s = safeStore(store);
  if (!s) return {};
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

export function writePbTimes(pbs, store) {
  const s = safeStore(store);
  if (!s) return;
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(pbs));
  } catch (e) {
    // ignore
  }
}

export function getPb(levelId, store) {
  const all = readPbTimes(store);
  const v = all[levelId];
  return typeof v === 'number' && v >= 0 ? v : null;
}

// Returns { isNewPb, previous, recorded } where recorded is the time
// actually stored (always the lower of the two).
export function recordClearTime(levelId, clearMs, store) {
  if (!levelId || !Number.isFinite(clearMs) || clearMs < 0) {
    return { isNewPb: false, previous: null, recorded: null };
  }
  const all = readPbTimes(store);
  const prev = typeof all[levelId] === 'number' ? all[levelId] : null;
  if (prev == null || clearMs < prev) {
    all[levelId] = clearMs;
    writePbTimes(all, store);
    return { isNewPb: true, previous: prev, recorded: clearMs };
  }
  return { isNewPb: false, previous: prev, recorded: prev };
}

export function formatPbTime(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '--';
  const totalCs = Math.floor(ms / 10);
  const m = Math.floor(totalCs / 6000);
  const s = Math.floor((totalCs / 100) % 60);
  const cs = totalCs % 100;
  const pad = (n, w) => String(n).padStart(w, '0');
  if (m > 0) return `${m}:${pad(s, 2)}.${pad(cs, 2)}`;
  return `${s}.${pad(cs, 2)}s`;
}

export function clearPb(levelId, store) {
  const all = readPbTimes(store);
  delete all[levelId];
  writePbTimes(all, store);
}

export function clearAllPbs(store) {
  writePbTimes({}, store);
}

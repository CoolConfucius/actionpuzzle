// Daily Challenge: date-seeded single-level run. Score per day persists in
// localStorage so the player can see their best for today (and historical
// dates). Pure logic; tests inject the date+storage.

const STORAGE_KEY = 'dailyScores';

function safeStore(store) {
  if (store) return store;
  if (typeof localStorage !== 'undefined' && localStorage !== null) return localStorage;
  return null;
}

// Returns YYYY-MM-DD for the supplied Date (or now if omitted), in UTC so
// players around the globe see the same daily challenge.
export function todayKey(now) {
  const d = now instanceof Date ? now : new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Deterministic 32-bit seed from a YYYY-MM-DD key. FNV-1a style hash so two
// adjacent days produce wildly different seeds.
export function seedForDate(key) {
  let h = 0x811c9dc5 >>> 0;
  const s = String(key);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// Pick which base level to play today. We cycle through the W7 finale +
// W8 levels — late-game content where the daily challenge feels meaningful.
export function levelIdForDate(key) {
  const seed = seedForDate(key);
  // Pool: LV-37..48 (12 levels)
  const idx = seed % 12;
  const id = 37 + idx;
  return String(id).padStart(2, '0');
}

export function readDailyScores(store) {
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

export function writeDailyScores(scores, store) {
  const s = safeStore(store);
  if (!s) return;
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(scores));
  } catch (e) {
    // ignore
  }
}

// Records a score for the given day if higher than the previous best.
// Returns { isNewBest, previous, recorded }.
export function recordDailyScore(dateKey, score, levelId, store) {
  if (!dateKey || !Number.isFinite(score) || score < 0) {
    return { isNewBest: false, previous: null, recorded: null };
  }
  const scores = readDailyScores(store);
  const prev = scores[dateKey];
  if (!prev || score > prev.score) {
    scores[dateKey] = { score: Math.floor(score), levelId: String(levelId || '') };
    writeDailyScores(scores, store);
    return { isNewBest: true, previous: prev ? prev.score : null, recorded: scores[dateKey].score };
  }
  return { isNewBest: false, previous: prev.score, recorded: prev.score };
}

export function getDailyScore(dateKey, store) {
  const scores = readDailyScores(store);
  const entry = scores[dateKey];
  return entry ? entry.score : null;
}

export function clearDailyScores(store) {
  writeDailyScores({}, store);
}

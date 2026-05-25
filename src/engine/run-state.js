import { BALANCE } from './constants.js';

const BEST_LEVEL_KEY = 'bestLevel';
const SCOREBOARD_KEY = 'scoreboard';
const RUN_MODE_KEY = 'runMode';
const SETTINGS_KEY = 'settings';
const DEFAULT_LEVEL = '01';
const LEADERBOARD_CAP = 20;
const NAME_MAX = 6;
const DEFAULT_NAME = 'PLAYER';
const FINAL_LEVEL_ID = '48';

const MODE_ARCADE = 'arcade';
const MODE_CAMPAIGN = 'campaign';
const MODE_COOP = 'coop';
const MODE_CAMPAIGN_COOP = 'campaign-coop';
const MODE_ENDLESS = 'endless';
const MODE_BOSS_RUSH = 'boss-rush';
const MODE_RANDOM = 'random';
const MODE_TUTORIAL = 'tutorial';
const MODE_DAILY = 'daily';
const MODE_TEST = 'test';

export const RANDOM_RUN_LENGTH = 8;

// Levels played in Boss Rush mode (world finales).
export const BOSS_RUSH_SEQUENCE = ['12', '18', '24', '30', '36', '42', '48'];

export function nextBossInRush(currentLevelId) {
  const idx = BOSS_RUSH_SEQUENCE.indexOf(currentLevelId);
  if (idx === -1 || idx === BOSS_RUSH_SEQUENCE.length - 1) return null;
  return BOSS_RUSH_SEQUENCE[idx + 1];
}

// Returns an array of RANDOM_RUN_LENGTH unique level IDs ("01".."48") in a
// deterministic shuffle keyed by seed. Pure function — tests inject any seed.
export function generateRandomRunSequence(seed) {
  const all = [];
  for (let i = 1; i <= 48; i++) all.push(String(i).padStart(2, '0'));
  let s = (seed >>> 0) || 1;
  // Fisher-Yates with a small LCG (deterministic, no external rng needed).
  for (let i = all.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    const t = all[i]; all[i] = all[j]; all[j] = t;
  }
  return all.slice(0, RANDOM_RUN_LENGTH);
}

export const DEFAULT_SETTINGS = {
  volume: { master: 0.8, music: 0.7, sfx: 0.9 },
  muted: false,
  bindings: {
    p1: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', hurl: 'Space', destroy: 'ShiftLeft' },
    p2: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', hurl: 'Enter', destroy: 'ShiftRight' },
    shared: { pause: 'KeyP', mute: 'KeyM' },
  },
};

function isValidLevelId(value) {
  return typeof value === 'string' && /^\d{2}$/.test(value);
}

function isValidMode(value) {
  return value === MODE_ARCADE
    || value === MODE_CAMPAIGN
    || value === MODE_COOP
    || value === MODE_CAMPAIGN_COOP
    || value === MODE_ENDLESS
    || value === MODE_BOSS_RUSH
    || value === MODE_RANDOM
    || value === MODE_TUTORIAL
    || value === MODE_DAILY
    || value === MODE_TEST;
}

function getStorage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch (e) {
    // sandboxed
  }
  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage;
  } catch (e) {
    // ignore
  }
  return null;
}

function clamp01(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

function mergeSettings(stored) {
  const out = cloneDefaults();
  if (!stored || typeof stored !== 'object') return out;
  if (stored.volume && typeof stored.volume === 'object') {
    for (const ch of ['master', 'music', 'sfx']) {
      if (typeof stored.volume[ch] === 'number') {
        out.volume[ch] = clamp01(stored.volume[ch]);
      }
    }
  }
  if (typeof stored.muted === 'boolean') out.muted = stored.muted;
  if (stored.bindings && typeof stored.bindings === 'object') {
    for (const slot of ['p1', 'p2', 'shared']) {
      if (stored.bindings[slot] && typeof stored.bindings[slot] === 'object') {
        for (const action of Object.keys(out.bindings[slot])) {
          const v = stored.bindings[slot][action];
          if (typeof v === 'string' && v.length > 0) {
            out.bindings[slot][action] = v;
          }
        }
      }
    }
  }
  return out;
}

export function loadSettings(storage) {
  const store = storage || getStorage();
  if (!store) return cloneDefaults();
  let raw;
  try {
    raw = store.getItem(SETTINGS_KEY);
  } catch (e) {
    return cloneDefaults();
  }
  if (!raw) return cloneDefaults();
  try {
    const parsed = JSON.parse(raw);
    return mergeSettings(parsed);
  } catch (e) {
    return cloneDefaults();
  }
}

export function saveSettings(settings, storage) {
  const store = storage || getStorage();
  if (!store) return;
  try {
    store.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    // ignore quota / sandbox
  }
}

export function loadBestLevel() {
  const storage = getStorage();
  if (!storage) return DEFAULT_LEVEL;
  try {
    const raw = storage.getItem(BEST_LEVEL_KEY);
    if (isValidLevelId(raw)) return raw;
  } catch (e) {
    // ignore
  }
  return DEFAULT_LEVEL;
}

export function getMode() {
  const storage = getStorage();
  if (!storage) return MODE_ARCADE;
  try {
    const raw = storage.getItem(RUN_MODE_KEY);
    if (isValidMode(raw)) return raw;
  } catch (e) {
    // ignore
  }
  return MODE_ARCADE;
}

export function setMode(mode) {
  if (!isValidMode(mode)) return;
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(RUN_MODE_KEY, mode);
  } catch (e) {
    // ignore
  }
}

export function isCampaign() {
  const m = getMode();
  return m === MODE_CAMPAIGN || m === MODE_CAMPAIGN_COOP;
}

export function isCoop() {
  const m = getMode();
  return m === MODE_COOP || m === MODE_CAMPAIGN_COOP;
}

export function isFinalLevelId(levelId) {
  return levelId === FINAL_LEVEL_ID;
}

function rebuildBindingMap(settings) {
  const map = {};
  const b = settings.bindings;
  for (const slot of ['p1', 'p2']) {
    for (const action of ['up', 'down', 'left', 'right']) {
      map[b[slot][action]] = { type: 'move', playerId: slot, dir: action };
    }
    map[b[slot].hurl] = { type: 'hurl', playerId: slot };
    map[b[slot].destroy] = { type: 'destroy', playerId: slot };
  }
  map[b.shared.pause] = { type: 'pause' };
  map[b.shared.mute] = { type: 'mute' };
  return map;
}

export function createRunState() {
  const settings = loadSettings();
  return {
    runScore: 0,
    bestLevel: loadBestLevel(),
    nameEntry: null,
    leaderboard: null,
    mode: getMode(),
    settings,
    bindingMap: rebuildBindingMap(settings),
  };
}

export function getBinding(runState, action, playerId) {
  if (!runState || !runState.settings) return null;
  const slot = runState.settings.bindings[playerId];
  if (!slot) return null;
  return slot[action] || null;
}

export function setBinding(runState, action, playerId, keyCode) {
  if (!runState || !runState.settings || !keyCode) return;
  const b = runState.settings.bindings;
  if (!b[playerId] || !(action in b[playerId])) return;
  outer: for (const slot of ['p1', 'p2', 'shared']) {
    for (const a of Object.keys(b[slot])) {
      if (b[slot][a] === keyCode && !(slot === playerId && a === action)) {
        b[slot][a] = b[playerId][action];
        break outer;
      }
    }
  }
  b[playerId][action] = keyCode;
  runState.bindingMap = rebuildBindingMap(runState.settings);
  saveSettings(runState.settings);
}

export function getVolume(runState, channel) {
  if (!runState || !runState.settings) return 0;
  const v = runState.settings.volume[channel];
  return typeof v === 'number' ? v : 0;
}

export function setVolume(runState, channel, value) {
  if (!runState || !runState.settings) return;
  if (!(channel in runState.settings.volume)) return;
  runState.settings.volume[channel] = clamp01(value);
  saveSettings(runState.settings);
}

export function setMuted(runState, muted) {
  if (!runState || !runState.settings) return;
  runState.settings.muted = !!muted;
  saveSettings(runState.settings);
}

export function isMuted(runState) {
  return !!(runState && runState.settings && runState.settings.muted);
}

export function updateBestLevel(runState, levelId) {
  if (!isValidLevelId(levelId)) return;
  if (levelId > runState.bestLevel) {
    runState.bestLevel = levelId;
    const storage = getStorage();
    if (!storage) return;
    try {
      storage.setItem(BEST_LEVEL_KEY, levelId);
    } catch (e) {
      // ignore
    }
  }
}

export function recordLevelClear(runState, state) {
  if (!state || !state.level) return;
  let levelScore = 0;
  if (Array.isArray(state.players)) {
    for (const p of state.players) {
      levelScore += (p.score || 0);
    }
  }
  runState.runScore += levelScore;
  updateBestLevel(runState, state.level.id);
}

export function resetRun(runState) {
  runState.runScore = 0;
  runState.nameEntry = null;
  runState.leaderboard = null;
  runState.mode = getMode();
}

export function beginCampaignRetry(runState, failedLevelId) {
  runState.runScore = 0;
  runState.nameEntry = null;
  runState.leaderboard = null;
  runState.mode = MODE_CAMPAIGN;
  runState.retryLevelId = isValidLevelId(failedLevelId) ? failedLevelId : DEFAULT_LEVEL;
  runState.retryLives = BALANCE.LIFE_STOCKS_INITIAL;
}

export function formatBestLevelLabel(levelId) {
  if (!isValidLevelId(levelId)) return 'W1L1';
  const n = parseInt(levelId, 10);
  const world = Math.floor((n - 1) / 6) + 1;
  const level = ((n - 1) % 6) + 1;
  return `W${world}L${level}`;
}

export function readLeaderboard(storage) {
  const store = storage || getStorage();
  if (!store) return [];
  let raw;
  try {
    raw = store.getItem(SCOREBOARD_KEY);
  } catch (e) {
    return [];
  }
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const valid = parsed.filter(
    (e) => e && typeof e.name === 'string' && typeof e.score === 'number' && typeof e.dateMs === 'number',
  );
  valid.sort((a, b) => b.score - a.score);
  return valid.slice(0, LEADERBOARD_CAP);
}

export function writeLeaderboard(entries, storage) {
  const store = storage || getStorage();
  if (!store) return;
  const capped = entries.slice(0, LEADERBOARD_CAP);
  try {
    store.setItem(SCOREBOARD_KEY, JSON.stringify(capped));
  } catch (e) {
    // ignore
  }
}

export function insertScore(entries, entry) {
  const next = entries.slice();
  next.push(entry);
  next.sort((a, b) => b.score - a.score);
  return next.slice(0, LEADERBOARD_CAP);
}

export function beginNameEntry(runState) {
  if (runState.nameEntry) return;
  runState.nameEntry = {
    name: DEFAULT_NAME,
    submitted: false,
    persisted: false,
  };
}

export function isNameEntryActive(runState) {
  return !!(runState && runState.nameEntry && !runState.nameEntry.submitted);
}

const ALLOWED_CHAR = /^[A-Za-z0-9]$/;

export function nameEntryKey(runState, key) {
  if (!runState || !runState.nameEntry) return;
  const ne = runState.nameEntry;
  if (ne.submitted) return;
  if (key === 'Backspace') {
    if (ne.name.length > 0) ne.name = ne.name.slice(0, -1);
    return;
  }
  if (key === 'Enter') {
    if (ne.name.length === 0) ne.name = DEFAULT_NAME;
    ne.submitted = true;
    return;
  }
  if (typeof key !== 'string' || key.length !== 1) return;
  if (!ALLOWED_CHAR.test(key)) return;
  if (ne.name.length >= NAME_MAX) return;
  ne.name = ne.name + key.toUpperCase();
}

export function submitScore(runState, name, storage, nowMs) {
  if (runState && runState.nameEntry && runState.nameEntry.persisted && runState.leaderboard) {
    return runState.leaderboard;
  }
  const store = storage || getStorage();
  const finalName = (name && name.length > 0) ? name.slice(0, NAME_MAX) : DEFAULT_NAME;
  const entry = {
    name: finalName,
    score: runState.runScore || 0,
    dateMs: (typeof nowMs === 'number') ? nowMs : Date.now(),
  };
  const existing = readLeaderboard(store);
  const updated = insertScore(existing, entry);
  writeLeaderboard(updated, store);
  runState.leaderboard = updated;
  if (runState.nameEntry) runState.nameEntry.persisted = true;
  return updated;
}

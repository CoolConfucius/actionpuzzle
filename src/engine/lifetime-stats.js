// Cross-run stats persisted in localStorage. Pure logic; tests inject a
// storage stub via the optional `store` argument on read/write.

const STORAGE_KEY = 'lifetimeStats';

function defaultStats() {
  return {
    totalKills: 0,
    totalDeaths: 0,
    totalHurls: 0,
    totalLevelsCleared: 0,
    bestScore: 0,
    bestLevelReached: 1,
    totalPlayTimeMs: 0,
    longestStreak: 0,
    runsPlayed: 0,
    explosions: 0,
    fastestClearMs: 0, // 0 = "no fast clear yet"
    bestEndlessLoop: 0,
    killsByType: {
      enemy1: 0, enemy2: 0, enemy3: 0, enemy4: 0, enemy5: 0, enemy6: 0, enemy7: 0,
    },
    clonesSpawned: 0,
    rebirthsTriggered: 0,
    bombsDropped: 0,
    bossRushClears: 0,
  };
}

export function recordBossRushClear(stats) {
  if (!stats) return stats;
  stats.bossRushClears = (stats.bossRushClears || 0) + 1;
  return stats;
}

export function recordFastestClear(stats, clearMs) {
  if (!stats || !Number.isFinite(clearMs) || clearMs <= 0) return stats;
  if (stats.fastestClearMs === 0 || clearMs < stats.fastestClearMs) {
    stats.fastestClearMs = clearMs;
  }
  return stats;
}

export function recordEndlessLoop(stats, loops) {
  if (!stats || !Number.isFinite(loops) || loops <= 0) return stats;
  if (loops > (stats.bestEndlessLoop || 0)) stats.bestEndlessLoop = loops;
  return stats;
}

function safeStore(store) {
  if (store) return store;
  if (typeof localStorage !== 'undefined' && localStorage !== null) return localStorage;
  return null;
}

export function readStats(store) {
  const s = safeStore(store);
  if (!s) return defaultStats();
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return defaultStats();
    const parsed = JSON.parse(raw);
    return { ...defaultStats(), ...parsed };
  } catch (e) {
    return defaultStats();
  }
}

export function writeStats(stats, store) {
  const s = safeStore(store);
  if (!s) return;
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch (e) {
    // private mode / quota exceeded — swallow
  }
}

export function recordEvents(stats, events) {
  if (!stats || !events) return stats;
  for (const ev of events) {
    if (!ev || !ev.type) continue;
    if (ev.type === 'enemyDefeated') {
      stats.totalKills += 1;
      if (ev.enemyType) {
        stats.killsByType = stats.killsByType || {};
        stats.killsByType[ev.enemyType] = (stats.killsByType[ev.enemyType] || 0) + 1;
      }
    }
    else if (ev.type === 'playerDeath') stats.totalDeaths += 1;
    else if (ev.type === 'hurl') stats.totalHurls += 1;
    else if (ev.type === 'levelWon') stats.totalLevelsCleared += 1;
    else if (ev.type === 'explode') stats.explosions = (stats.explosions || 0) + 1;
    else if (ev.type === 'cloneSpawn') stats.clonesSpawned = (stats.clonesSpawned || 0) + 1;
    else if (ev.type === 'abilityFire' && ev.label === 'REBIRTH!') {
      stats.rebirthsTriggered = (stats.rebirthsTriggered || 0) + 1;
    }
    else if (ev.type === 'abilityFire' && ev.label === 'BOMB!') {
      stats.bombsDropped = (stats.bombsDropped || 0) + 1;
    }
  }
  return stats;
}

export function recordPlayTime(stats, dtMs) {
  if (!stats || !Number.isFinite(dtMs) || dtMs <= 0) return stats;
  stats.totalPlayTimeMs += dtMs;
  return stats;
}

export function recordRunEnd(stats, runScore, bestLevelId, streakInRun) {
  if (!stats) return stats;
  stats.runsPlayed += 1;
  if (typeof runScore === 'number' && runScore > stats.bestScore) {
    stats.bestScore = runScore;
  }
  if (typeof bestLevelId === 'string' && /^\d{2}$/.test(bestLevelId)) {
    const n = parseInt(bestLevelId, 10);
    if (n > stats.bestLevelReached) stats.bestLevelReached = n;
  } else if (typeof bestLevelId === 'number' && bestLevelId > stats.bestLevelReached) {
    stats.bestLevelReached = bestLevelId;
  }
  if (typeof streakInRun === 'number' && streakInRun > stats.longestStreak) {
    stats.longestStreak = streakInRun;
  }
  return stats;
}

export function formatPlayTime(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '0s';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function resetStats(store) {
  writeStats(defaultStats(), store);
}

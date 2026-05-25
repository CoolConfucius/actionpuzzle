import test from 'node:test';
import assert from 'node:assert';
import {
  readStats,
  writeStats,
  recordEvents,
  recordPlayTime,
  recordRunEnd,
  formatPlayTime,
  resetStats,
} from '../engine/lifetime-stats.js';

function makeStore(initial) {
  const data = initial ? { ...initial } : {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    _data: data,
  };
}

test('stats: default values when store empty', () => {
  const s = makeStore();
  const stats = readStats(s);
  assert.equal(stats.totalKills, 0);
  assert.equal(stats.totalDeaths, 0);
  assert.equal(stats.bestScore, 0);
  assert.equal(stats.runsPlayed, 0);
  assert.equal(stats.bestLevelReached, 1);
});

test('stats: writeStats and readStats round-trip', () => {
  const s = makeStore();
  const stats = readStats(s);
  stats.totalKills = 42;
  stats.bestScore = 12345;
  writeStats(stats, s);
  const re = readStats(s);
  assert.equal(re.totalKills, 42);
  assert.equal(re.bestScore, 12345);
});

test('stats: readStats handles corrupt JSON gracefully', () => {
  const s = makeStore({ lifetimeStats: '{not json}' });
  const stats = readStats(s);
  assert.equal(stats.totalKills, 0);
});

test('stats: recordEvents counts each event kind', () => {
  const stats = readStats(makeStore());
  recordEvents(stats, [
    { type: 'enemyDefeated' }, { type: 'enemyDefeated' }, { type: 'enemyDefeated' },
    { type: 'playerDeath' },
    { type: 'hurl' }, { type: 'hurl' },
    { type: 'levelWon' },
    { type: 'unrelated' },
    null,
  ]);
  assert.equal(stats.totalKills, 3);
  assert.equal(stats.totalDeaths, 1);
  assert.equal(stats.totalHurls, 2);
  assert.equal(stats.totalLevelsCleared, 1);
});

test('stats: recordPlayTime accumulates positive dt only', () => {
  const stats = readStats(makeStore());
  recordPlayTime(stats, 100);
  recordPlayTime(stats, 50);
  recordPlayTime(stats, -10);
  recordPlayTime(stats, NaN);
  assert.equal(stats.totalPlayTimeMs, 150);
});

test('stats: recordRunEnd updates best score only when higher', () => {
  const stats = readStats(makeStore());
  recordRunEnd(stats, 1000, '05', 3);
  assert.equal(stats.bestScore, 1000);
  assert.equal(stats.bestLevelReached, 5);
  assert.equal(stats.longestStreak, 3);
  recordRunEnd(stats, 500, '03', 2);
  assert.equal(stats.bestScore, 1000, 'lower score must not overwrite');
  assert.equal(stats.bestLevelReached, 5, 'earlier level must not overwrite');
  assert.equal(stats.longestStreak, 3, 'shorter streak must not overwrite');
  assert.equal(stats.runsPlayed, 2);
});

test('stats: formatPlayTime renders hours/minutes/seconds', () => {
  assert.equal(formatPlayTime(0), '0s');
  assert.equal(formatPlayTime(1500), '1s');
  assert.equal(formatPlayTime(65000), '1m 5s');
  assert.equal(formatPlayTime(3600000), '1h 0m');
  assert.equal(formatPlayTime(3725000), '1h 2m');
  assert.equal(formatPlayTime(-5), '0s');
  assert.equal(formatPlayTime(NaN), '0s');
});

test('stats: resetStats wipes counters', () => {
  const s = makeStore();
  const stats = readStats(s);
  stats.totalKills = 100;
  writeStats(stats, s);
  resetStats(s);
  const re = readStats(s);
  assert.equal(re.totalKills, 0);
});

test('stats: bestLevelReached accepts numeric input', () => {
  const stats = readStats(makeStore());
  recordRunEnd(stats, 0, 12, 0);
  assert.equal(stats.bestLevelReached, 12);
});

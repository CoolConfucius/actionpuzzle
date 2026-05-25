import test from 'node:test';
import assert from 'node:assert';
import {
  ACHIEVEMENTS,
  readUnlocks,
  writeUnlocks,
  checkAchievements,
  countUnlocked,
  lookupAchievement,
  resetUnlocks,
} from '../engine/achievements.js';

function makeStore() {
  const data = {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
  };
}

const EMPTY_STATS = { totalKills: 0, totalDeaths: 0, longestStreak: 0, bestLevelReached: 0, explosions: 0 };

test('ach: empty store yields empty unlocks', () => {
  const s = makeStore();
  assert.deepEqual(readUnlocks(s), {});
});

test('ach: definitions list expected ids', () => {
  const ids = ACHIEVEMENTS.map((a) => a.id);
  for (const expected of ['firstBlood', 'centurion', 'apotheosis', 'firstSteps', 'worldTour']) {
    assert.ok(ids.includes(expected), `missing achievement ${expected}`);
  }
});

test('ach: firstBlood unlocks at 1 kill, not before', () => {
  const u = {};
  let newly = checkAchievements(u, { stats: { ...EMPTY_STATS, totalKills: 0 } }, 100);
  assert.equal(newly.includes('firstBlood'), false);
  newly = checkAchievements(u, { stats: { ...EMPTY_STATS, totalKills: 1 } }, 200);
  assert.ok(newly.includes('firstBlood'));
  assert.equal(u.firstBlood, 200);
});

test('ach: already-unlocked does not re-fire', () => {
  const u = { firstBlood: 50 };
  const newly = checkAchievements(u, { stats: { ...EMPTY_STATS, totalKills: 999 } }, 100);
  assert.equal(newly.includes('firstBlood'), false);
  assert.equal(u.firstBlood, 50, 'timestamp preserved');
});

test('ach: centurion at 100 kills', () => {
  const u = {};
  const newly = checkAchievements(u, { stats: { ...EMPTY_STATS, totalKills: 100 } }, 0);
  assert.ok(newly.includes('centurion'));
});

test('ach: apotheosis on clearing LV-42', () => {
  const u = {};
  const newly = checkAchievements(u, { stats: EMPTY_STATS, clearedLevelId: '42' }, 0);
  assert.ok(newly.includes('apotheosis'));
});

test('ach: apotheosis does not fire on LV-41', () => {
  const u = {};
  const newly = checkAchievements(u, { stats: EMPTY_STATS, clearedLevelId: '41' }, 0);
  assert.equal(newly.includes('apotheosis'), false);
});

test('ach: tutorial flag drives firstSteps', () => {
  const u = {};
  const newly = checkAchievements(u, { stats: EMPTY_STATS, tutorialCompleted: true }, 0);
  assert.ok(newly.includes('firstSteps'));
});

test('ach: survivor needs 10-streak', () => {
  const u = {};
  checkAchievements(u, { stats: { ...EMPTY_STATS, longestStreak: 9 } }, 100);
  assert.equal(u.survivor, undefined);
  checkAchievements(u, { stats: { ...EMPTY_STATS, longestStreak: 10 } }, 100);
  assert.ok(u.survivor);
});

test('ach: worldTour at level 37+', () => {
  const u = {};
  checkAchievements(u, { stats: { ...EMPTY_STATS, bestLevelReached: 36 } }, 100);
  assert.equal(u.worldTour, undefined);
  checkAchievements(u, { stats: { ...EMPTY_STATS, bestLevelReached: 37 } }, 100);
  assert.ok(u.worldTour);
});

test('ach: countUnlocked counts truthy values', () => {
  assert.equal(countUnlocked({}), 0);
  assert.equal(countUnlocked({ a: 100, b: 200 }), 2);
  assert.equal(countUnlocked({ a: 100, b: 0 }), 1);
  assert.equal(countUnlocked(null), 0);
});

test('ach: lookupAchievement returns definition or null', () => {
  assert.equal(lookupAchievement('firstBlood').id, 'firstBlood');
  assert.equal(lookupAchievement('madeUp'), null);
});

test('ach: writeUnlocks/readUnlocks round-trip', () => {
  const s = makeStore();
  writeUnlocks({ firstBlood: 123 }, s);
  assert.deepEqual(readUnlocks(s), { firstBlood: 123 });
});

test('ach: resetUnlocks wipes all', () => {
  const s = makeStore();
  writeUnlocks({ firstBlood: 123 }, s);
  resetUnlocks(s);
  assert.deepEqual(readUnlocks(s), {});
});

test('ach: corrupt JSON yields empty unlocks', () => {
  const s = makeStore();
  s.setItem('achievements', 'not json');
  assert.deepEqual(readUnlocks(s), {});
});

test('ach: tankHunter unlocks at 10 enemy6 kills', () => {
  const u = {};
  let newly = checkAchievements(u, { stats: { ...EMPTY_STATS, killsByType: { enemy6: 9 } } }, 100);
  assert.equal(newly.includes('tankHunter'), false);
  newly = checkAchievements(u, { stats: { ...EMPTY_STATS, killsByType: { enemy6: 10 } } }, 100);
  assert.ok(newly.includes('tankHunter'));
});

test('ach: phantomSlayer unlocks at 5 enemy7 kills', () => {
  const u = {};
  const newly = checkAchievements(u, { stats: { ...EMPTY_STATS, killsByType: { enemy7: 5 } } }, 100);
  assert.ok(newly.includes('phantomSlayer'));
});

test('ach: coinTycoon unlocks at 10k lifetime coins', () => {
  const u = {};
  let newly = checkAchievements(u, {
    stats: EMPTY_STATS,
    campaign: { lifetimeCoinsEarned: 9999, upgrades: {} },
  }, 100);
  assert.equal(newly.includes('coinTycoon'), false);
  newly = checkAchievements(u, {
    stats: EMPTY_STATS,
    campaign: { lifetimeCoinsEarned: 10000, upgrades: {} },
  }, 100);
  assert.ok(newly.includes('coinTycoon'));
});

test('ach: fullLoadout unlocks at 3 upgrades on one character', () => {
  const u = {};
  let newly = checkAchievements(u, {
    stats: EMPTY_STATS,
    campaign: { upgrades: { bear: { fastStart1: true, persistentSpeed1: true } } },
  }, 100);
  assert.equal(newly.includes('fullLoadout'), false, '2 upgrades not enough');
  newly = checkAchievements(u, {
    stats: EMPTY_STATS,
    campaign: { upgrades: { bear: { fastStart1: true, persistentSpeed1: true, speedCapPlus1: true } } },
  }, 100);
  assert.ok(newly.includes('fullLoadout'));
});

test('ach: speedrunner unlocks when fastestClearMs < 30000', () => {
  const u = {};
  let newly = checkAchievements(u, { stats: { ...EMPTY_STATS, fastestClearMs: 35000 } }, 100);
  assert.equal(newly.includes('speedrunner'), false);
  newly = checkAchievements(u, { stats: { ...EMPTY_STATS, fastestClearMs: 25000 } }, 100);
  assert.ok(newly.includes('speedrunner'));
});

test('ach: endlessAdept unlocks at 2 loops', () => {
  const u = {};
  let newly = checkAchievements(u, { stats: { ...EMPTY_STATS, bestEndlessLoop: 1 } }, 100);
  assert.equal(newly.includes('endlessAdept'), false);
  newly = checkAchievements(u, { stats: { ...EMPTY_STATS, bestEndlessLoop: 2 } }, 100);
  assert.ok(newly.includes('endlessAdept'));
});

test('ach: lightspeedClear unlocks at fastest clear under 15s', () => {
  const u = {};
  let newly = checkAchievements(u, { stats: { ...EMPTY_STATS, fastestClearMs: 15000 } }, 100);
  assert.equal(newly.includes('lightspeedClear'), false, '15s not under');
  newly = checkAchievements(u, { stats: { ...EMPTY_STATS, fastestClearMs: 14999 } }, 100);
  assert.ok(newly.includes('lightspeedClear'));
});

test('ach: flawlessRun unlocks at streak 6', () => {
  const u = {};
  let newly = checkAchievements(u, { stats: { ...EMPTY_STATS, longestStreak: 5 } }, 100);
  assert.equal(newly.includes('flawlessRun'), false);
  newly = checkAchievements(u, { stats: { ...EMPTY_STATS, longestStreak: 6 } }, 100);
  assert.ok(newly.includes('flawlessRun'));
});

test('ach: bombsAway unlocks at 25 lifetime bombs', () => {
  const u = {};
  let newly = checkAchievements(u, { stats: { ...EMPTY_STATS, bombsDropped: 24 } }, 100);
  assert.equal(newly.includes('bombsAway'), false);
  newly = checkAchievements(u, { stats: { ...EMPTY_STATS, bombsDropped: 25 } }, 100);
  assert.ok(newly.includes('bombsAway'));
});

test('ach: bossRushChampion unlocks at 1 boss-rush clear', () => {
  const u = {};
  let newly = checkAchievements(u, { stats: { ...EMPTY_STATS, bossRushClears: 0 } }, 100);
  assert.equal(newly.includes('bossRushChampion'), false);
  newly = checkAchievements(u, { stats: { ...EMPTY_STATS, bossRushClears: 1 } }, 100);
  assert.ok(newly.includes('bossRushChampion'));
});

test('ach: cloneArmy unlocks at 25 lifetime clones', () => {
  const u = {};
  const newly = checkAchievements(u, { stats: { ...EMPTY_STATS, clonesSpawned: 25 } }, 100);
  assert.ok(newly.includes('cloneArmy'));
});

test('ach: phoenix unlocks at 10 lifetime rebirths', () => {
  const u = {};
  const newly = checkAchievements(u, { stats: { ...EMPTY_STATS, rebirthsTriggered: 10 } }, 100);
  assert.ok(newly.includes('phoenix'));
});

test('ach: masterOfAll requires at least 1 upgrade on all 10 characters', () => {
  const u = {};
  const partial = {};
  // Start with 9 of 10 — missing fox.
  for (const c of ['bear', 'wolf', 'monkey', 'lion', 'pig', 'mole', 'rabbit', 'elephant', 'owl']) {
    partial[c] = { someUpgrade: true };
  }
  let newly = checkAchievements(u, {
    stats: EMPTY_STATS,
    campaign: { upgrades: partial },
  }, 100);
  assert.equal(newly.includes('masterOfAll'), false, 'missing fox');
  partial.fox = { invInvisibility: true };
  newly = checkAchievements(u, {
    stats: EMPTY_STATS,
    campaign: { upgrades: partial },
  }, 100);
  assert.ok(newly.includes('masterOfAll'));
});

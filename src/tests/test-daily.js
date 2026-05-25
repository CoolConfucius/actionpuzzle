import test from 'node:test';
import assert from 'node:assert';
import {
  todayKey,
  seedForDate,
  levelIdForDate,
  readDailyScores,
  writeDailyScores,
  recordDailyScore,
  getDailyScore,
  clearDailyScores,
} from '../engine/daily.js';

function makeStore() {
  const data = {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
  };
}

test('daily: todayKey returns YYYY-MM-DD UTC', () => {
  const d = new Date('2026-05-22T08:00:00Z');
  assert.equal(todayKey(d), '2026-05-22');
  // Same calendar day in different time zones still yields the same UTC key.
  const d2 = new Date('2026-05-22T23:00:00Z');
  assert.equal(todayKey(d2), '2026-05-22');
});

test('daily: seedForDate is deterministic', () => {
  const a = seedForDate('2026-05-22');
  const b = seedForDate('2026-05-22');
  assert.equal(a, b);
});

test('daily: seedForDate differs across adjacent days', () => {
  const a = seedForDate('2026-05-22');
  const b = seedForDate('2026-05-23');
  assert.notEqual(a, b);
});

test('daily: levelIdForDate is in the 37..48 pool', () => {
  for (let day = 1; day <= 31; day++) {
    const key = `2026-05-${String(day).padStart(2, '0')}`;
    const id = levelIdForDate(key);
    const n = parseInt(id, 10);
    assert.ok(n >= 37 && n <= 48, `${key} → ${id} should be in 37..48`);
  }
});

test('daily: empty store returns empty scores', () => {
  assert.deepEqual(readDailyScores(makeStore()), {});
});

test('daily: recordDailyScore creates a new entry', () => {
  const s = makeStore();
  const r = recordDailyScore('2026-05-22', 1000, '37', s);
  assert.equal(r.isNewBest, true);
  assert.equal(r.previous, null);
  assert.equal(r.recorded, 1000);
  assert.equal(getDailyScore('2026-05-22', s), 1000);
});

test('daily: higher score overwrites lower', () => {
  const s = makeStore();
  recordDailyScore('2026-05-22', 500, '37', s);
  const r = recordDailyScore('2026-05-22', 1200, '37', s);
  assert.equal(r.isNewBest, true);
  assert.equal(r.previous, 500);
  assert.equal(r.recorded, 1200);
});

test('daily: lower score is rejected', () => {
  const s = makeStore();
  recordDailyScore('2026-05-22', 1200, '37', s);
  const r = recordDailyScore('2026-05-22', 500, '37', s);
  assert.equal(r.isNewBest, false);
  assert.equal(r.recorded, 1200);
});

test('daily: per-day isolation', () => {
  const s = makeStore();
  recordDailyScore('2026-05-22', 1000, '37', s);
  recordDailyScore('2026-05-23', 500, '38', s);
  assert.equal(getDailyScore('2026-05-22', s), 1000);
  assert.equal(getDailyScore('2026-05-23', s), 500);
});

test('daily: invalid inputs are no-ops', () => {
  const s = makeStore();
  assert.equal(recordDailyScore(null, 100, '37', s).isNewBest, false);
  assert.equal(recordDailyScore('2026-05-22', -1, '37', s).isNewBest, false);
  assert.equal(recordDailyScore('2026-05-22', NaN, '37', s).isNewBest, false);
});

test('daily: corrupt JSON falls back to empty', () => {
  const s = makeStore();
  s.setItem('dailyScores', 'not json');
  assert.deepEqual(readDailyScores(s), {});
});

test('daily: clearDailyScores wipes', () => {
  const s = makeStore();
  recordDailyScore('2026-05-22', 1000, '37', s);
  clearDailyScores(s);
  assert.deepEqual(readDailyScores(s), {});
});

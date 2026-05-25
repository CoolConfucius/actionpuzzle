import { test } from 'node:test';
import assert from 'node:assert/strict';

function makeStorage(initial) {
  const data = new Map(Object.entries(initial || {}));
  return {
    getItem(k) { return data.has(k) ? data.get(k) : null; },
    setItem(k, v) { data.set(k, String(v)); },
    removeItem(k) { data.delete(k); },
    _data: data,
  };
}

globalThis.localStorage = makeStorage({});

const rs = await import('../engine/run-state.js');

test('loadSettings returns defaults when storage empty', () => {
  globalThis.localStorage = makeStorage({});
  const s = rs.loadSettings();
  assert.equal(s.muted, false);
  assert.equal(s.bindings.p1.up, 'KeyW');
  assert.ok(s.volume.master >= 0 && s.volume.master <= 1);
});

test('saveSettings round-trips', () => {
  const store = makeStorage({});
  const next = JSON.parse(JSON.stringify(rs.DEFAULT_SETTINGS));
  next.volume.master = 0.25;
  next.muted = true;
  rs.saveSettings(next, store);
  const loaded = rs.loadSettings(store);
  assert.equal(loaded.volume.master, 0.25);
  assert.equal(loaded.muted, true);
});

test('setBinding updates and getBinding reflects', () => {
  globalThis.localStorage = makeStorage({});
  const runState = rs.createRunState();
  rs.setBinding(runState, 'up', 'p1', 'KeyR');
  assert.equal(rs.getBinding(runState, 'up', 'p1'), 'KeyR');
  assert.ok(runState.bindingMap['KeyR']);
  assert.equal(runState.bindingMap['KeyR'].dir, 'up');
});

test('setBinding swaps duplicate key', () => {
  globalThis.localStorage = makeStorage({});
  const runState = rs.createRunState();
  rs.setBinding(runState, 'down', 'p1', 'KeyW');
  assert.equal(rs.getBinding(runState, 'down', 'p1'), 'KeyW');
  assert.equal(rs.getBinding(runState, 'up', 'p1'), 'KeyS');
});

test('corrupted settings JSON falls back to defaults', () => {
  const store = makeStorage({ settings: '{not json' });
  const s = rs.loadSettings(store);
  assert.equal(s.bindings.p1.up, 'KeyW');
});

test('loadSettings merges missing fields over defaults', () => {
  const store = makeStorage({ settings: JSON.stringify({ volume: { master: 0.1 } }) });
  const s = rs.loadSettings(store);
  assert.equal(s.volume.master, 0.1);
  assert.equal(s.muted, false);
  assert.equal(s.bindings.p1.up, 'KeyW');
});

test('setVolume clamps to [0,1] and persists', () => {
  globalThis.localStorage = makeStorage({});
  const runState = rs.createRunState();
  rs.setVolume(runState, 'master', 2.5);
  assert.equal(rs.getVolume(runState, 'master'), 1);
  rs.setVolume(runState, 'sfx', -0.5);
  assert.equal(rs.getVolume(runState, 'sfx'), 0);
});

test('setMuted / isMuted toggle', () => {
  globalThis.localStorage = makeStorage({});
  const runState = rs.createRunState();
  assert.equal(rs.isMuted(runState), false);
  rs.setMuted(runState, true);
  assert.equal(rs.isMuted(runState), true);
});

test('loadSettings clamps out-of-range stored volume', () => {
  const store = makeStorage({ settings: JSON.stringify({ volume: { master: 5, sfx: -2 } }) });
  const s = rs.loadSettings(store);
  assert.equal(s.volume.master, 1);
  assert.equal(s.volume.sfx, 0);
});

test('loadSettings tolerates storage.getItem throwing', () => {
  const store = {
    getItem() { throw new Error('boom'); },
    setItem() {},
  };
  const s = rs.loadSettings(store);
  assert.equal(s.bindings.p1.up, 'KeyW');
});

test('setMode/getMode accepts coop', () => {
  globalThis.localStorage = makeStorage({});
  rs.setMode('coop');
  assert.equal(rs.getMode(), 'coop');
  assert.equal(rs.isCoop(), true);
  assert.equal(rs.isCampaign(), false);
});

test('isCoop is false for arcade and campaign', () => {
  globalThis.localStorage = makeStorage({});
  rs.setMode('arcade');
  assert.equal(rs.isCoop(), false);
  rs.setMode('campaign');
  assert.equal(rs.isCoop(), false);
});

test('setMode rejects unknown modes', () => {
  globalThis.localStorage = makeStorage({});
  rs.setMode('arcade');
  rs.setMode('not-a-mode');
  assert.equal(rs.getMode(), 'arcade');
});

test('boss-rush is a valid mode and persists', () => {
  globalThis.localStorage = makeStorage({});
  rs.setMode('boss-rush');
  assert.equal(rs.getMode(), 'boss-rush');
});

test('BOSS_RUSH_SEQUENCE chains the world finales in order', () => {
  assert.deepEqual(rs.BOSS_RUSH_SEQUENCE, ['12', '18', '24', '30', '36', '42', '48']);
});

test('nextBossInRush returns the next boss in sequence', () => {
  assert.equal(rs.nextBossInRush('12'), '18');
  assert.equal(rs.nextBossInRush('18'), '24');
  assert.equal(rs.nextBossInRush('42'), '48');
});

test('nextBossInRush returns null at the end of the sequence', () => {
  assert.equal(rs.nextBossInRush('48'), null);
});

test('nextBossInRush returns null for non-boss levels', () => {
  assert.equal(rs.nextBossInRush('01'), null);
  assert.equal(rs.nextBossInRush('25'), null);
});

test('random is a valid mode and persists', () => {
  globalThis.localStorage = makeStorage({});
  rs.setMode('random');
  assert.equal(rs.getMode(), 'random');
});

test('generateRandomRunSequence returns 8 unique level ids', () => {
  const seq = rs.generateRandomRunSequence(12345);
  assert.equal(seq.length, rs.RANDOM_RUN_LENGTH);
  assert.equal(seq.length, 8);
  const set = new Set(seq);
  assert.equal(set.size, 8, 'all entries unique');
  for (const id of seq) {
    assert.match(id, /^\d{2}$/, 'id is two-digit string');
    const n = parseInt(id, 10);
    assert.ok(n >= 1 && n <= 48, 'id is in 01..48');
  }
});

test('generateRandomRunSequence is deterministic for same seed', () => {
  const a = rs.generateRandomRunSequence(42);
  const b = rs.generateRandomRunSequence(42);
  assert.deepEqual(a, b);
});

test('generateRandomRunSequence differs across seeds', () => {
  const a = rs.generateRandomRunSequence(42);
  const b = rs.generateRandomRunSequence(43);
  assert.notDeepEqual(a, b);
});

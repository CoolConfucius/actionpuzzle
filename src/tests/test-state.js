import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, tick } from '../engine/state.js';

const minimalLevel = () => ({ id: '01', dims: { cols: 13, rows: 11 }, winConditions: [] });

test('createState builds a grid matching level.dims and zeroed clocks', () => {
  const state = createState(minimalLevel(), 12345);
  assert.equal(state.grid.length, 11);
  assert.equal(state.grid[0].length, 13);
  assert.equal(state.timeMs, 0);
  assert.equal(state.levelTimeMs, 0);
  assert.equal(state.status, 'playing');
  assert.equal(state.pauseState, 'running');
  assert.equal(state.level.runSeed, 12345);
});

test('state.rng is deterministic and bounded', () => {
  const a = createState(minimalLevel(), 12345);
  const b = createState(minimalLevel(), 12345);
  const v1 = a.rng();
  const v2 = b.rng();
  assert.equal(v1, v2);
  assert.ok(Number.isFinite(v1));
  assert.ok(v1 >= 0 && v1 < 1);
  const c = createState(minimalLevel(), 99999);
  assert.notEqual(c.rng(), v1);
});

test('queues and entity arrays start empty', () => {
  const state = createState(minimalLevel(), 0);
  for (const key of [
    'players', 'enemies', 'pendingSpawns', 'movingObjects',
    'balloons', 'explosions', 'commandQueue', 'eventQueue',
  ]) {
    assert.ok(Array.isArray(state[key]), `${key} is array`);
    assert.equal(state[key].length, 0, `${key} length 0`);
  }
});

test('id counters init to 1 (id 0 reserved for none); milestone 0; timeFreezeUntilMs null', () => {
  const state = createState(minimalLevel(), 0);
  assert.equal(state.nextEnemyId, 1);
  assert.equal(state.nextObjectId, 1);
  assert.equal(state.nextBalloonId, 1);
  assert.equal(state.nextExplosionId, 1);
  assert.equal(state.scoreMilestoneCrossed, 0);
  assert.equal(state.timeFreezeUntilMs, null);
});

test('tick advances timeMs and levelTimeMs by dtMs', () => {
  const state = createState(minimalLevel(), 12345);
  tick(state, 16);
  assert.equal(state.timeMs, 16);
  assert.equal(state.levelTimeMs, 16);
  tick(state, 4);
  assert.equal(state.timeMs, 20);
  assert.equal(state.levelTimeMs, 20);
  tick(state, 0);
  assert.equal(state.timeMs, 20);
});

test('tick does not mutate queues or entity arrays in the skeleton', () => {
  const state = createState(minimalLevel(), 12345);
  tick(state, 16);
  assert.equal(state.players.length, 0);
  assert.equal(state.enemies.length, 0);
  assert.equal(state.commandQueue.length, 0);
  assert.equal(state.eventQueue.length, 0);
  assert.equal(state.movingObjects.length, 0);
  assert.equal(state.balloons.length, 0);
});

test('createState accepts runSeed of 0 without producing degenerate rng', () => {
  const state = createState(minimalLevel(), 0);
  const v1 = state.rng();
  const v2 = state.rng();
  const v3 = state.rng();
  for (const v of [v1, v2, v3]) {
    assert.ok(Number.isFinite(v));
    assert.ok(v >= 0 && v < 1);
  }
  assert.ok(v1 !== v2 || v2 !== v3, 'rng should not return identical values across calls');
});

test('hashLevelId distinguishes different level ids', () => {
  const a = createState({ id: '01', dims: { cols: 13, rows: 11 } }, 12345);
  const b = createState({ id: '02', dims: { cols: 13, rows: 11 } }, 12345);
  assert.notEqual(a.rng(), b.rng());
});

test('pause command toggles pauseState to paused and halts time advance', () => {
  const state = createState(minimalLevel(), 12345);
  state.commandQueue.push({ type: 'pause' });
  tick(state, 16);
  assert.equal(state.pauseState, 'paused');
  assert.equal(state.timeMs, 0);
  assert.equal(state.levelTimeMs, 0);
});

test('second pause command resumes; time advances again', () => {
  const state = createState(minimalLevel(), 12345);
  state.commandQueue.push({ type: 'pause' });
  tick(state, 16);
  assert.equal(state.pauseState, 'paused');
  state.commandQueue.push({ type: 'pause' });
  tick(state, 10);
  assert.equal(state.pauseState, 'running');
  assert.equal(state.timeMs, 10);
  assert.equal(state.levelTimeMs, 10);
});

test('multiple ticks while paused do not advance clocks', () => {
  const state = createState(minimalLevel(), 12345);
  state.commandQueue.push({ type: 'pause' });
  tick(state, 16);
  tick(state, 50);
  tick(state, 100);
  assert.equal(state.pauseState, 'paused');
  assert.equal(state.timeMs, 0);
  assert.equal(state.levelTimeMs, 0);
});

test('mute command drains without throwing and leaves state coherent', () => {
  const state = createState(minimalLevel(), 12345);
  state.commandQueue.push({ type: 'mute' });
  assert.doesNotThrow(() => tick(state, 16));
  assert.equal(state.pauseState, 'running');
  assert.equal(state.timeMs, 16);
  assert.equal(state.commandQueue.length, 0);
});

test('player respawns after DEATH_ANIM_MS when lives remain', () => {
  const level = {
    id: '01', world: 1, dims: { cols: 19, rows: 15 },
    playerSpawns: [{ playerSlot: 1, col: 5, row: 5, dir: 'down' }],
    objects: [], eggCount: 0,
    enemySpawns: [{ type: 'enemy1', atTimeMs: 99999 }],
    enemyCap: 1, winConditions: ['allEnemiesDefeated'],
  };
  const state = createState(level, 1);
  const p = state.players[0];
  // Simulate a death
  p.alive = false;
  p.lives = 4;
  p.deathTimeMs = state.timeMs;
  // Tick past DEATH_ANIM_MS (1500ms)
  for (let i = 0; i < 20; i++) tick(state, 100);
  assert.equal(p.alive, true, 'player should respawn after DEATH_ANIM_MS');
  assert.equal(p.deathTimeMs, null, 'deathTimeMs should be cleared on respawn');
  assert.ok(p.status.invulnUntilMs > state.timeMs, 'respawn should grant invuln');
  // Single-player spawn is the grid center, regardless of playerSpawns in JSON.
  // Respawn cell is the player's current pos (the death cell), which equals
  // the spawn cell since they hadn't moved.
  assert.equal(p.pos.col, Math.floor(level.dims.cols / 2));
  assert.equal(p.pos.row, Math.floor(level.dims.rows / 2));
});

test('player does not respawn when out of lives', () => {
  const level = {
    id: '01', world: 1, dims: { cols: 19, rows: 15 },
    playerSpawns: [{ playerSlot: 1, col: 5, row: 5, dir: 'down' }],
    objects: [], eggCount: 0,
    enemySpawns: [{ type: 'enemy1', atTimeMs: 99999 }],
    enemyCap: 1, winConditions: ['allEnemiesDefeated'],
  };
  const state = createState(level, 1);
  const p = state.players[0];
  p.alive = false;
  p.lives = 0;
  p.deathTimeMs = state.timeMs;
  for (let i = 0; i < 20; i++) tick(state, 100);
  assert.equal(p.alive, false, 'no respawn when out of lives');
  assert.equal(state.status, 'lost', 'game ends in lost status');
});

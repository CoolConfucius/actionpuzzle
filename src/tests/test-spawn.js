import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveCap, tryScheduleSpawn, tickSpawns } from '../engine/spawn.js';
import { createGrid, setObject } from '../engine/grid.js';
import { mulberry32 } from '../engine/rng.js';

function makeState(opts = {}) {
  const dims = opts.dims || { cols: 13, rows: 11 };
  const grid = createGrid(dims);
  return {
    level: {
      id: '01',
      dims,
      enemyCap: opts.enemyCap == null ? 5 : opts.enemyCap,
      enemyBudget: opts.enemyBudget || { enemy1: 10, enemy2: 10 },
      enemySpawnPattern: opts.enemySpawnPattern || null,
    },
    grid,
    players: opts.players || [],
    enemies: opts.enemies || [],
    pendingSpawns: [],
    timeMs: 0,
    levelTimeMs: 0,
    timeFreezeUntilMs: null,
    rng: opts.rng || mulberry32(1),
    nextEnemyId: 1,
    nextObjectId: 1,
    spawnCycleIndex: 0,
  };
}

test('effectiveCap ramps from ENEMY_SPAWN_CAP_INITIAL over time, capped by level.enemyCap', () => {
  const s = makeState({ enemyCap: 5 });
  s.levelTimeMs = 0;       assert.equal(effectiveCap(s), 2);
  s.levelTimeMs = 4999;    assert.equal(effectiveCap(s), 2);
  s.levelTimeMs = 5000;    assert.equal(effectiveCap(s), 3);
  s.levelTimeMs = 15000;   assert.equal(effectiveCap(s), 4);
  s.levelTimeMs = 25000;   assert.equal(effectiveCap(s), 5);
  s.levelTimeMs = 35000;   assert.equal(effectiveCap(s), 5);
  s.levelTimeMs = 100000;  assert.equal(effectiveCap(s), 5);
});

test('no-clobber filter excludes rocks within Chebyshev radius 1 of a player', () => {
  const s = makeState({
    enemyCap: 5,
    enemyBudget: { enemy1: 1 },
    players: [{ id: 'p1', pos: { col: 1, row: 1 } }],
  });
  s.levelTimeMs = 100000;
  setObject(s.grid, 0, 0, { type: 'rock', id: 1 });
  setObject(s.grid, 5, 5, { type: 'rock', id: 2 });
  const ok = tryScheduleSpawn(s);
  assert.equal(ok, true);
  assert.equal(s.pendingSpawns.length, 1);
  assert.equal(s.pendingSpawns[0].cell.col, 5);
  assert.equal(s.pendingSpawns[0].cell.row, 5);
});

test('windup completes after ENEMY_SPAWN_WINDUP_MS, rock consumed and enemy emerges', () => {
  const s = makeState({
    enemyCap: 5,
    enemyBudget: { enemy1: 1 },
    players: [{ id: 'p1', pos: { col: 1, row: 1 } }],
  });
  s.levelTimeMs = 100000;
  setObject(s.grid, 5, 5, { type: 'rock', id: 1 });
  s.timeMs = 0;
  const scheduled = tryScheduleSpawn(s);
  assert.equal(scheduled, true);
  const cell = s.grid[5][5];
  assert.ok(cell.windup);
  assert.equal(cell.windup.enemyType, 'enemy1');
  assert.equal(cell.windup.startedMs, 0);
  assert.equal(cell.windup.emergesMs, 2000);
  s.timeMs = 2000;
  tickSpawns(s, 0);
  assert.equal(s.grid[5][5].object, null);
  assert.equal(s.grid[5][5].windup, null);
  assert.equal(s.enemies.length, 1);
  assert.equal(s.enemies[0].pos.col, 5);
  assert.equal(s.enemies[0].pos.row, 5);
  assert.equal(s.enemies[0].type, 'enemy1');
  assert.equal(s.pendingSpawns.length, 0);
});

test('cap-respect: with active enemies at effectiveCap, no new spawn', () => {
  const s = makeState({
    enemyCap: 2,
    enemyBudget: { enemy1: 5 },
    enemies: [
      { id: 1, type: 'enemy1', pos: { col: 8, row: 8 } },
      { id: 2, type: 'enemy1', pos: { col: 10, row: 10 } },
    ],
  });
  s.levelTimeMs = 0;
  setObject(s.grid, 1, 1, { type: 'rock', id: 1 });
  const ok = tryScheduleSpawn(s);
  assert.equal(ok, false);
  assert.equal(s.grid[1][1].windup, null);
  assert.equal(s.pendingSpawns.length, 0);
  assert.equal(s.level.enemyBudget.enemy1, 5);
});

test('cycle pattern picks enemy1, then enemy2, then exhausts budget', () => {
  const s = makeState({
    enemyCap: 10,
    enemyBudget: { enemy1: 1, enemy2: 1 },
  });
  s.levelTimeMs = 100000;
  for (let c = 1; c <= 10; c++) {
    setObject(s.grid, c, 5, { type: 'rock', id: c });
  }
  const ok1 = tryScheduleSpawn(s);
  assert.equal(ok1, true);
  assert.equal(s.pendingSpawns[0].type, 'enemy1');
  const ok2 = tryScheduleSpawn(s);
  assert.equal(ok2, true);
  assert.equal(s.pendingSpawns[1].type, 'enemy2');
  const ok3 = tryScheduleSpawn(s);
  assert.equal(ok3, false);
  assert.equal(s.pendingSpawns.length, 2);
});

test('empty candidate set: every rock clobbered → no spawn, budget and cycle preserved', () => {
  const s = makeState({
    enemyCap: 5,
    enemyBudget: { enemy1: 5 },
    players: [{ id: 'p1', pos: { col: 5, row: 5 } }],
  });
  s.levelTimeMs = 100000;
  setObject(s.grid, 4, 4, { type: 'rock', id: 1 });
  setObject(s.grid, 5, 4, { type: 'rock', id: 2 });
  setObject(s.grid, 6, 6, { type: 'rock', id: 3 });
  const cycleBefore = s.spawnCycleIndex;
  const ok = tryScheduleSpawn(s);
  assert.equal(ok, false);
  assert.equal(s.pendingSpawns.length, 0);
  assert.equal(s.level.enemyBudget.enemy1, 5);
  assert.equal(s.spawnCycleIndex, cycleBefore);
});

test('cancel-then-respawn: external windup clear and budget refund permits next schedule', () => {
  const s = makeState({
    enemyCap: 10,
    enemyBudget: { enemy1: 2 },
  });
  s.levelTimeMs = 100000;
  setObject(s.grid, 5, 5, { type: 'rock', id: 1 });
  setObject(s.grid, 7, 7, { type: 'rock', id: 2 });
  const okFirst = tryScheduleSpawn(s);
  assert.equal(okFirst, true);
  const first = s.pendingSpawns[0];
  const cancelCol = first.cell.col;
  const cancelRow = first.cell.row;
  s.pendingSpawns = [];
  s.grid[cancelRow][cancelCol].windup = null;
  s.grid[cancelRow][cancelCol].object = null;
  s.level.enemyBudget.enemy1 += 1;
  const remainingCol = cancelCol === 5 ? 7 : 5;
  const remainingRow = cancelRow === 5 ? 7 : 5;
  const okSecond = tryScheduleSpawn(s);
  assert.equal(okSecond, true);
  assert.equal(s.pendingSpawns.length, 1);
  assert.equal(s.pendingSpawns[0].cell.col, remainingCol);
  assert.equal(s.pendingSpawns[0].cell.row, remainingRow);
});

test('multiple windups complete on the same tick (large dtMs catch-up)', () => {
  const s = makeState({
    enemyCap: 10,
    enemyBudget: { enemy1: 0, enemy2: 0 },
  });
  s.levelTimeMs = 100000;
  setObject(s.grid, 3, 3, { type: 'rock', id: 1 });
  setObject(s.grid, 8, 8, { type: 'rock', id: 2 });
  s.timeMs = 0;
  s.grid[3][3].windup = { enemyType: 'enemy1', startedMs: 0, emergesMs: 2000 };
  s.grid[8][8].windup = { enemyType: 'enemy2', startedMs: 0, emergesMs: 2000 };
  s.pendingSpawns.push({ cell: { col: 3, row: 3 }, type: 'enemy1', startedMs: 0, emergesMs: 2000 });
  s.pendingSpawns.push({ cell: { col: 8, row: 8 }, type: 'enemy2', startedMs: 0, emergesMs: 2000 });
  s.timeMs = 2500;
  tickSpawns(s, 2500);
  assert.equal(s.enemies.length, 2);
  assert.equal(s.grid[3][3].object, null);
  assert.equal(s.grid[3][3].windup, null);
  assert.equal(s.grid[8][8].object, null);
  assert.equal(s.grid[8][8].windup, null);
  assert.equal(s.pendingSpawns.length, 0);
});

test('time-freeze does not block emergence', () => {
  const s = makeState({
    enemyCap: 5,
    enemyBudget: { enemy1: 1 },
    players: [{ id: 'p1', pos: { col: 1, row: 1 } }],
  });
  s.levelTimeMs = 100000;
  setObject(s.grid, 5, 5, { type: 'rock', id: 1 });
  s.timeMs = 0;
  const scheduled = tryScheduleSpawn(s);
  assert.equal(scheduled, true);
  s.timeFreezeUntilMs = 999999;
  s.timeMs = 2000;
  tickSpawns(s, 0);
  assert.equal(s.enemies.length, 1);
  assert.equal(s.enemies[0].type, 'enemy1');
});

test('lazy spawnCycleIndex initialization', () => {
  const s = makeState({
    enemyCap: 5,
    enemyBudget: { enemy1: 1 },
  });
  s.levelTimeMs = 100000;
  delete s.spawnCycleIndex;
  setObject(s.grid, 5, 5, { type: 'rock', id: 1 });
  const ok = tryScheduleSpawn(s);
  assert.equal(ok, true);
  assert.equal(typeof s.spawnCycleIndex, 'number');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../engine/state.js';
import { createGrid, cellAt, setObject } from '../engine/grid.js';
import { applyExplosion, tickExplosions } from '../engine/explode.js';

function freshState() {
  const level = { id: '01', dims: { cols: 13, rows: 11 } };
  return createState(level, 1);
}

test('explode destroys all rocks in 3x3 radius', () => {
  const state = freshState();
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      setObject(state.grid, 2 + dc, 2 + dr, { type: 'rock', id: 100 + dr * 3 + dc });
    }
  }
  applyExplosion(state, { col: 2, row: 2 });
  tickExplosions(state, 16);
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      assert.equal(cellAt(state.grid, 2 + dc, 2 + dr).object, null);
    }
  }
  const explodeEvents = state.eventQueue.filter((e) => e.type === 'explode');
  assert.equal(explodeEvents.length, 1);
});

test('egg in radius becomes fried-egg and emits chain popup', () => {
  const state = freshState();
  state.players.push({ id: 'p1', score: 0, lives: 3, alive: true, status: {} });
  setObject(state.grid, 2, 3, { type: 'egg', id: 1 });
  applyExplosion(state, { col: 2, row: 2 });
  tickExplosions(state, 16);
  const cell = cellAt(state.grid, 2, 3);
  assert.equal(cell.object && cell.object.type, 'fried-egg');
  const popups = state.eventQueue.filter((e) => e.type === 'scorePopup');
  assert.equal(popups.length, 1);
  // Cooking 1 egg → 1000 (doubling schedule starts at base 1000).
  assert.equal(popups[0].points, 1000);
});

test('two-egg chain awards 1000 then 2000 by chebyshev order', () => {
  const state = freshState();
  state.players.push({ id: 'p1', score: 0, lives: 3, alive: true, status: {} });
  setObject(state.grid, 2, 3, { type: 'egg', id: 1 });
  setObject(state.grid, 3, 3, { type: 'egg', id: 2 });
  applyExplosion(state, { col: 2, row: 2 });
  tickExplosions(state, 16);
  const popups = state.eventQueue.filter((e) => e.type === 'scorePopup');
  assert.equal(popups.length, 2);
  // Doubling schedule: 1st = 1000, 2nd = 2000, total = 3000.
  assert.equal(popups[0].points, 1000);
  assert.equal(popups[1].points, 2000);
  assert.equal(cellAt(state.grid, 2, 3).object.type, 'fried-egg');
  assert.equal(cellAt(state.grid, 3, 3).object.type, 'fried-egg');
});

test('fireball chain deferred to next tick', () => {
  const state = freshState();
  setObject(state.grid, 3, 2, { type: 'fireball', id: 1 });
  setObject(state.grid, 4, 2, { type: 'rock', id: 2 });
  applyExplosion(state, { col: 2, row: 2 });
  tickExplosions(state, 16);
  assert.equal(cellAt(state.grid, 3, 2).object, null, 'fireball cell cleared');
  assert.equal(cellAt(state.grid, 4, 2).object && cellAt(state.grid, 4, 2).object.type, 'rock',
    'rock at (4,2) survives first tick (outside original radius)');
  const pending = state.explosions.filter((e) => !e.resolved);
  assert.equal(pending.length, 1, 'one chain explosion queued');
  assert.equal(pending[0].centerCell.col, 3);
  assert.equal(pending[0].centerCell.row, 2);
  tickExplosions(state, 16);
  assert.equal(cellAt(state.grid, 4, 2).object, null, 'rock destroyed by chained explosion');
});

test('player invulnerability prevents life loss; non-invuln loses life', () => {
  const state = freshState();
  state.timeMs = 1000;
  state.players.push({
    id: 'p1', pos: { col: 2, row: 2 }, dir: 'down', lives: 3, alive: true,
    status: { invulnUntilMs: 5000 },
  });
  state.players.push({
    id: 'p2', pos: { col: 3, row: 2 }, dir: 'down', lives: 3, alive: true,
    status: {},
  });
  applyExplosion(state, { col: 2, row: 2 });
  tickExplosions(state, 16);
  assert.equal(state.players[0].lives, 3, 'invulnerable player keeps lives');
  assert.equal(state.players[1].lives, 2, 'vulnerable player loses one life');
  const deaths = state.eventQueue.filter((e) => e.type === 'playerDeath');
  assert.equal(deaths.length, 1);
  assert.equal(deaths[0].playerId, 'p2');
});

test('slow-trap hazard destroyed by explosion', () => {
  const state = freshState();
  const trapCell = cellAt(state.grid, 2, 3);
  trapCell.hazard = { type: 'slow-trap', sourceEnemyId: 1, expiresMs: 9999 };
  applyExplosion(state, { col: 2, row: 2 });
  tickExplosions(state, 16);
  assert.equal(cellAt(state.grid, 2, 3).hazard, null);
});

test('explosion at grid corner clips out-of-bounds cells', () => {
  const state = freshState();
  setObject(state.grid, 0, 0, { type: 'rock', id: 1 });
  setObject(state.grid, 1, 1, { type: 'rock', id: 2 });
  applyExplosion(state, { col: 0, row: 0 });
  tickExplosions(state, 16);
  assert.equal(cellAt(state.grid, 0, 0).object, null);
  assert.equal(cellAt(state.grid, 1, 1).object, null);
  const explodeEvents = state.eventQueue.filter((e) => e.type === 'explode');
  assert.equal(explodeEvents.length, 1);
});

test('fried-egg in radius is destroyed without scoring', () => {
  const state = freshState();
  setObject(state.grid, 2, 3, { type: 'fried-egg', id: 1 });
  applyExplosion(state, { col: 2, row: 2 });
  tickExplosions(state, 16);
  assert.equal(cellAt(state.grid, 2, 3).object, null);
  const popups = state.eventQueue.filter((e) => e.type === 'scorePopup');
  assert.equal(popups.length, 0);
});

test('donut in radius destroyed without bouncing', () => {
  const state = freshState();
  setObject(state.grid, 2, 3, { type: 'donut', id: 1 });
  applyExplosion(state, { col: 2, row: 2 });
  tickExplosions(state, 16);
  assert.equal(cellAt(state.grid, 2, 3).object, null);
  assert.equal(state.movingObjects.length, 0);
});

test('enemy in radius is removed and emits enemyDefeated', () => {
  const state = freshState();
  state.enemies.push({ id: 1, type: 'enemy1', pos: { col: 2, row: 3 } });
  applyExplosion(state, { col: 2, row: 2 });
  tickExplosions(state, 16);
  assert.equal(state.enemies.length, 0);
  const defeats = state.eventQueue.filter((e) => e.type === 'enemyDefeated');
  assert.equal(defeats.length, 1);
  assert.equal(defeats[0].enemyType, 'enemy1');
  assert.equal(defeats[0].cell.col, 2);
  assert.equal(defeats[0].cell.row, 3);
});

test('applyExplosion lazy-initializes state.explosions and nextExplosionId', () => {
  const state = { grid: createGrid({ cols: 5, rows: 5 }), timeMs: 0 };
  applyExplosion(state, { col: 2, row: 2 });
  assert.ok(Array.isArray(state.explosions));
  assert.equal(state.explosions.length, 1);
  assert.equal(state.nextExplosionId, 1);
  assert.equal(state.explosions[0].resolved, false);
  assert.equal(state.explosions[0].centerCell.col, 2);
  assert.equal(state.explosions[0].centerCell.row, 2);
});

test('balloons in radius are unaffected', () => {
  const state = freshState();
  state.balloons.push({ id: 1, type: 'berserk', col: 2, rowFloat: 2.0 });
  applyExplosion(state, { col: 2, row: 2 });
  tickExplosions(state, 16);
  assert.equal(state.balloons.length, 1);
  assert.equal(state.balloons[0].id, 1);
  assert.equal(state.balloons[0].type, 'berserk');
  assert.equal(state.balloons[0].col, 2);
  assert.equal(state.balloons[0].rowFloat, 2.0);
});

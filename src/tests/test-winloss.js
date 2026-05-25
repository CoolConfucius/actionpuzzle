import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkWinLoss } from '../engine/winloss.js';
import { createGrid } from '../engine/grid.js';

function makeState(overrides = {}) {
  const dims = overrides.dims || { cols: 5, rows: 5 };
  const base = {
    status: 'playing',
    enemies: [],
    pendingSpawns: [],
    movingObjects: [],
    balloons: [],
    explosions: [],
    players: [{ id: 'p1', lives: 3, alive: true }],
    grid: createGrid(dims),
    level: {
      enemyBudget: {},
      winConditions: ['allEnemiesDefeated', 'allObjectsDestroyed'],
    },
    eventQueue: [],
  };
  return Object.assign(base, overrides);
}

test('all enemies defeated and budget empty triggers won + levelWon event', () => {
  const s = makeState();
  s.grid[1][1].object = { type: 'rock', id: 1 };
  checkWinLoss(s);
  assert.equal(s.status, 'won');
  assert.equal(s.eventQueue.length, 1);
  assert.equal(s.eventQueue[0].type, 'levelWon');
});

test('all objects destroyed triggers won even with enemies present', () => {
  const s = makeState({
    enemies: [{ id: 1, type: 'enemy1' }],
    level: { enemyBudget: { enemy1: 2 }, winConditions: ['allEnemiesDefeated', 'allObjectsDestroyed'] },
  });
  checkWinLoss(s);
  assert.equal(s.status, 'won');
  assert.equal(s.eventQueue[0].type, 'levelWon');
});

test('single player out of lives triggers lost + gameOver event', () => {
  const s = makeState({
    players: [{ id: 'p1', lives: 0, alive: false }],
  });
  s.grid[0][0].object = { type: 'rock', id: 1 };
  checkWinLoss(s);
  assert.equal(s.status, 'lost');
  assert.equal(s.eventQueue.length, 1);
  assert.equal(s.eventQueue[0].type, 'gameOver');
});

test('co-op last player standing keeps level playing', () => {
  const s = makeState({
    players: [
      { id: 'p1', lives: 0, alive: false },
      { id: 'p2', lives: 2, alive: true },
    ],
  });
  s.grid[0][0].object = { type: 'rock', id: 1 };
  s.enemies.push({ id: 1, type: 'enemy1' });
  s.level.enemyBudget = { enemy1: 1 };
  checkWinLoss(s);
  assert.equal(s.status, 'playing');
  assert.equal(s.eventQueue.length, 0);
});

test('idempotent: calling twice after a win emits exactly one event', () => {
  const s = makeState();
  s.grid[1][1].object = { type: 'rock', id: 1 };
  checkWinLoss(s);
  checkWinLoss(s);
  assert.equal(s.status, 'won');
  assert.equal(s.eventQueue.filter((e) => e.type === 'levelWon').length, 1);
});

test('pending spawn windup keeps level not-won', () => {
  const s = makeState({
    pendingSpawns: [{ cell: { col: 0, row: 0 }, type: 'enemy1', startedMs: 0, emergesMs: 2000 }],
  });
  s.grid[1][1].object = { type: 'rock', id: 1 };
  checkWinLoss(s);
  assert.equal(s.status, 'playing');
  assert.equal(s.eventQueue.length, 0);
});

test('moving objects count as objects remaining', () => {
  const s = makeState({
    movingObjects: [{ id: 1, type: 'rock', pos: { col: 0, row: 0 }, dir: 'right', progress: 0.3 }],
    level: { enemyBudget: { enemy1: 1 }, winConditions: ['allEnemiesDefeated', 'allObjectsDestroyed'] },
  });
  checkWinLoss(s);
  assert.equal(s.status, 'playing');
  assert.equal(s.eventQueue.length, 0);
});

test('balloons do not count as objects for win check', () => {
  const s = makeState({
    enemies: [{ id: 1, type: 'enemy1' }],
    balloons: [{ id: 1, type: 'berserk', col: 2, rowFloat: 4 }],
    level: { enemyBudget: { enemy1: 1 }, winConditions: ['allObjectsDestroyed'] },
  });
  checkWinLoss(s);
  assert.equal(s.status, 'won');
  assert.equal(s.eventQueue[0].type, 'levelWon');
});

test('status already lost is idempotent and does not re-emit', () => {
  const s = makeState({ status: 'lost' });
  checkWinLoss(s);
  assert.equal(s.status, 'lost');
  assert.equal(s.eventQueue.length, 0);
});

test('default winConditions when field absent', () => {
  const s = makeState({
    level: { enemyBudget: {} },
  });
  s.grid[1][1].object = { type: 'rock', id: 1 };
  checkWinLoss(s);
  assert.equal(s.status, 'won');
  assert.equal(s.eventQueue[0].type, 'levelWon');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGrid, setObject } from '../engine/grid.js';
import { applyMoveCommand, tickPlayerMovement } from '../engine/move.js';
import { applyHurlCommand, tickMovingObjects } from '../engine/hurl.js';
import { applyExplosion, tickExplosions } from '../engine/explode.js';
import { tickEnemies } from '../engine/enemies.js';
import { pickEnemyDirection } from '../engine/enemy-ai.js';
import { BALANCE } from '../engine/constants.js';

function makePlayer(id, col, row) {
  return {
    id,
    character: 'bear',
    pos: { col, row },
    dir: 'right',
    move: null,
    speedStacks: 0,
    lives: 5,
    score: 0,
    status: {},
    commandQueue: [],
    alive: true,
  };
}

function makeState() {
  return {
    level: { id: 'test', dims: { cols: BALANCE.GRID_COLS, rows: BALANCE.GRID_ROWS } },
    grid: createGrid({ cols: BALANCE.GRID_COLS, rows: BALANCE.GRID_ROWS }),
    players: [makePlayer('p1', 5, 5)],
    enemies: [],
    movingObjects: [],
    explosions: [],
    balloons: [],
    pendingSpawns: [],
    commandQueue: [],
    eventQueue: [],
    timeMs: 0,
    levelTimeMs: 0,
    timeFreezeUntilMs: null,
    rng: () => 0.5,
    status: 'playing',
    pauseState: 'running',
    nextEnemyId: 1,
    nextObjectId: 1,
    nextBalloonId: 1,
    nextExplosionId: 1,
    scoreMilestoneCrossed: 0,
  };
}

test('player on slow-trap moves at base * TRAP_SLOW_MULTIPLIER speed', () => {
  const state = makeState();
  const p = state.players[0];
  state.grid[p.pos.row][p.pos.col].hazard = {
    type: 'slow-trap',
    sourceEnemyId: 1,
    expiresMs: 1e9,
  };
  applyMoveCommand(state, 'p1', 'right');
  assert.ok(p.move, 'move should start');
  tickPlayerMovement(state, 100);
  const expectedT = (BALANCE.PLAYER_BASE_SPEED * BALANCE.TRAP_SLOW_MULTIPLIER) * 100 / 1000;
  assert.ok(p.move != null, 'still traversing under slow');
  assert.ok(
    Math.abs(p.move.t - expectedT) < 1e-6,
    `t=${p.move.t} expected ${expectedT}`,
  );
});

test('berserk player walking on trap clears berserk and applies slow', () => {
  const state = makeState();
  const p = state.players[0];
  state.timeMs = 0;
  p.status.berserkUntilMs = 5000;
  state.grid[p.pos.row][p.pos.col].hazard = {
    type: 'slow-trap',
    sourceEnemyId: 1,
    expiresMs: 1e9,
  };
  applyMoveCommand(state, 'p1', 'right');
  tickPlayerMovement(state, 100);
  assert.equal(p.status.berserkUntilMs, 0, 'berserk consumed');
  assert.equal(p.lives, 5, 'no life lost');
});

test('invisible player on trap takes no slow and trap remains', () => {
  const state = makeState();
  const p = state.players[0];
  state.timeMs = 0;
  p.status.invisibleUntilMs = 5000;
  const hazard = { type: 'slow-trap', sourceEnemyId: 1, expiresMs: 1e9 };
  state.grid[p.pos.row][p.pos.col].hazard = hazard;
  applyMoveCommand(state, 'p1', 'right');
  tickPlayerMovement(state, 100);
  const expectedT = BALANCE.PLAYER_BASE_SPEED * 100 / 1000;
  assert.ok(Math.abs(p.move.t - expectedT) < 1e-6, 'no slow applied');
  assert.equal(state.grid[5][5].hazard, hazard, 'trap remains');
});

test('hurled object passes through trap cell, destroying the hazard', () => {
  const state = makeState();
  const p = state.players[0];
  p.pos = { col: 0, row: 5 };
  p.dir = 'right';
  setObject(state.grid, 1, 5, { type: 'rock', id: 1 });
  state.grid[5][3].hazard = {
    type: 'slow-trap',
    sourceEnemyId: 1,
    expiresMs: 1e9,
  };
  applyHurlCommand(state, 'p1');
  assert.equal(state.movingObjects.length, 1);
  for (let i = 0; i < 50; i++) {
    tickMovingObjects(state, 100);
  }
  assert.equal(state.grid[5][3].hazard, null, 'hazard destroyed');
  let restingFound = false;
  for (let c = 0; c < BALANCE.GRID_COLS; c++) {
    if (state.grid[5][c].object && state.grid[5][c].object.type === 'rock') {
      restingFound = true;
    }
  }
  assert.ok(restingFound, 'rock came to rest somewhere');
});

test('explosion destroys hazard in its 3x3 footprint', () => {
  const state = makeState();
  state.grid[5][6].hazard = {
    type: 'slow-trap',
    sourceEnemyId: 1,
    expiresMs: 1e9,
  };
  applyExplosion(state, { col: 5, row: 5 });
  tickExplosions(state, 0);
  assert.equal(state.grid[5][6].hazard, null);
});

test('hazard expires when expiresMs elapses (via tickEnemies sweep)', () => {
  const state = makeState();
  state.grid[2][2].hazard = {
    type: 'slow-trap',
    sourceEnemyId: 1,
    expiresMs: 500,
  };
  state.timeMs = 501;
  tickEnemies(state, 0);
  assert.equal(state.grid[2][2].hazard, null);
});

test('enemy-ai blocks movement into trap cell', () => {
  const state = makeState();
  state.players[0].pos = { col: 0, row: 0 };
  const enemy = {
    id: 1,
    type: 'enemy1',
    pos: { col: 5, row: 5 },
    dir: 'right',
    move: null,
    enteredFromDir: null,
    abilityCooldownUntilMs: 0,
    cast: null,
  };
  state.enemies.push(enemy);
  state.grid[5][4].hazard = { type: 'slow-trap', sourceEnemyId: 2, expiresMs: 1e9 };
  state.grid[5][6].hazard = { type: 'slow-trap', sourceEnemyId: 2, expiresMs: 1e9 };
  state.grid[4][5].hazard = { type: 'slow-trap', sourceEnemyId: 2, expiresMs: 1e9 };
  state.grid[6][5].hazard = { type: 'slow-trap', sourceEnemyId: 2, expiresMs: 1e9 };
  const dir = pickEnemyDirection(state, enemy);
  assert.equal(dir, null, 'no valid direction when all neighbors are trapped');
});

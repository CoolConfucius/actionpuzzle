import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDestroyCommand } from '../engine/destroy.js';
import { createGrid } from '../engine/grid.js';
import { BALANCE } from '../engine/constants.js';

function makeState(opts = {}) {
  const cols = opts.cols || 5;
  const rows = opts.rows || 5;
  const grid = createGrid({ cols, rows });
  return {
    level: {
      id: '01',
      dims: { cols, rows },
      enemyBudget: { enemy1: 0, enemy2: 0 },
    },
    grid,
    players: [{
      id: 'p1',
      pos: opts.playerPos || { col: 1, row: 1 },
      dir: opts.dir || 'right',
      move: null,
      speedStacks: 0,
      lives: 5,
      score: 0,
      status: {},
      commandQueue: [],
      alive: true,
    }],
    enemies: [],
    pendingSpawns: [],
    movingObjects: [],
    balloons: [],
    explosions: [],
    commandQueue: [],
    eventQueue: [],
    timeMs: 0,
    levelTimeMs: 0,
    timeFreezeUntilMs: null,
    rng: () => 0,
    status: 'playing',
    pauseState: 'running',
    nextEnemyId: 0,
    nextObjectId: 0,
    nextBalloonId: 0,
    nextExplosionId: 0,
    scoreMilestoneCrossed: 0,
  };
}

test('destroy on empty front cell is a no-op', () => {
  const state = makeState();
  applyDestroyCommand(state, 'p1');
  assert.equal(state.eventQueue.length, 0);
  assert.equal(state.players[0].score, 0);
  assert.equal(state.grid[1][2].object, null);
});

test('destroy on rock removes object and silently awards +1 (no popup)', () => {
  const state = makeState();
  state.grid[1][2].object = { type: 'rock', id: 1 };
  applyDestroyCommand(state, 'p1');
  assert.equal(state.grid[1][2].object, null);
  assert.equal(state.players[0].score, 1);
  const evt = state.eventQueue.find((e) => e.type === 'objectDestroy');
  assert.ok(evt, 'expected objectDestroy event');
  assert.equal(evt.objectType, 'rock');
  const popups = state.eventQueue.filter((e) => e.type === 'scorePopup');
  assert.equal(popups.length, 0, 'rock-break is silent — no popup');
});

test('destroy on egg awards SCORE_EGG_CRACK and clears cell', () => {
  const state = makeState();
  state.grid[1][2].object = { type: 'egg', id: 2 };
  applyDestroyCommand(state, 'p1');
  assert.equal(state.grid[1][2].object, null);
  assert.equal(state.players[0].score, BALANCE.SCORE_EGG_CRACK);
});

test('destroy on fireball detonates in place', () => {
  const state = makeState();
  state.grid[1][2].object = { type: 'fireball', id: 3 };
  applyDestroyCommand(state, 'p1');
  assert.equal(state.grid[1][2].object, null);
  const queued = state.explosions.length > 0;
  const eventEmitted = state.eventQueue.some((e) => e.type === 'explode');
  assert.ok(queued || eventEmitted, 'expected explosion to be queued or explode event emitted');
});

test('destroy on rock during windup kills the spawning enemy, drops the rock, no budget refund, awards full enemy kill score', () => {
  const state = makeState();
  state.grid[1][2].object = { type: 'rock', id: 4 };
  state.grid[1][2].windup = { enemyType: 'enemy1', startedMs: 0, emergesMs: 2000 };
  state.pendingSpawns.push({
    cell: { col: 2, row: 1 },
    type: 'enemy1',
    startedMs: 0,
    emergesMs: 2000,
  });
  applyDestroyCommand(state, 'p1');
  assert.equal(state.grid[1][2].object, null);
  assert.equal(state.grid[1][2].windup, null);
  assert.equal(state.level.enemyBudget.enemy1, 0, 'budget must NOT be refunded');
  assert.equal(state.pendingSpawns.length, 0);
  assert.equal(state.players[0].score, BALANCE.SCORE_E1_KILL);
  const defeat = state.eventQueue.find((e) => e.type === 'enemyDefeated');
  assert.ok(defeat, 'expected enemyDefeated event');
  assert.equal(defeat.enemyType, 'enemy1');
  assert.equal(defeat.cause, 'spawnKill');
});

test('destroy on windup rock by enemy type awards that enemy-tier kill score', () => {
  const state = makeState();
  state.level.enemyBudget = { enemy3: 0 };
  state.grid[1][2].object = { type: 'rock', id: 11 };
  state.grid[1][2].windup = { enemyType: 'enemy3', startedMs: 0, emergesMs: 2000 };
  applyDestroyCommand(state, 'p1');
  assert.equal(state.players[0].score, BALANCE.SCORE_E3_KILL);
});

test('destroy on donut removes without scoring or bouncing', () => {
  const state = makeState();
  state.grid[1][2].object = { type: 'donut', id: 5 };
  applyDestroyCommand(state, 'p1');
  assert.equal(state.grid[1][2].object, null);
  assert.equal(state.players[0].score, 0);
  assert.equal(state.movingObjects.length, 0);
});

test('destroy on fried-egg is a pure no-op', () => {
  const state = makeState();
  state.grid[1][2].object = { type: 'fried-egg', id: 6 };
  applyDestroyCommand(state, 'p1');
  assert.equal(state.grid[1][2].object && state.grid[1][2].object.type, 'fried-egg');
  assert.equal(state.players[0].score, 0);
  assert.equal(state.eventQueue.length, 0);
});

test('destroy facing off-grid edge is a no-op', () => {
  const state = makeState({ playerPos: { col: 0, row: 0 }, dir: 'left' });
  applyDestroyCommand(state, 'p1');
  assert.equal(state.eventQueue.length, 0);
  assert.equal(state.players[0].score, 0);
});

test('destroy when player.alive is false is a no-op', () => {
  const state = makeState();
  state.grid[1][2].object = { type: 'rock', id: 7 };
  state.players[0].alive = false;
  applyDestroyCommand(state, 'p1');
  assert.equal(state.grid[1][2].object && state.grid[1][2].object.type, 'rock');
  assert.equal(state.eventQueue.length, 0);
  assert.equal(state.players[0].score, 0);
});

test('destroy with unknown playerId is a no-op', () => {
  const state = makeState();
  state.grid[1][2].object = { type: 'rock', id: 8 };
  applyDestroyCommand(state, 'pX');
  assert.equal(state.grid[1][2].object && state.grid[1][2].object.type, 'rock');
  assert.equal(state.eventQueue.length, 0);
});

test('rock-with-windup leaves enemyBudget untouched (no refund) even if key was undefined', () => {
  const state = makeState();
  delete state.level.enemyBudget.enemy1;
  state.grid[1][2].object = { type: 'rock', id: 9 };
  state.grid[1][2].windup = { enemyType: 'enemy1', startedMs: 0, emergesMs: 2000 };
  applyDestroyCommand(state, 'p1');
  assert.ok(
    state.level.enemyBudget.enemy1 == null || state.level.enemyBudget.enemy1 === 0,
    'budget for the killed enemy must not be incremented',
  );
  assert.equal(state.players[0].score, BALANCE.SCORE_E1_KILL);
});

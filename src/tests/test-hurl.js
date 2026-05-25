import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyHurlCommand, tickMovingObjects, resolveSlideCollision } from '../engine/hurl.js';
import { applyExplosion, tickExplosions } from '../engine/explode.js';
import { BALANCE } from '../engine/constants.js';

const STEP_MS = 1000 / BALANCE.HURL_OBJECT_SPEED;

function makeState(opts = {}) {
  const dims = opts.dims || { cols: 13, rows: 11 };
  const grid = [];
  for (let r = 0; r < dims.rows; r++) {
    const row = [];
    for (let c = 0; c < dims.cols; c++) {
      row.push({ object: null, hazard: null, windup: null });
    }
    grid.push(row);
  }
  return {
    level: { id: '01', dims, runSeed: 0 },
    grid,
    players: [],
    enemies: [],
    movingObjects: [],
    balloons: [],
    explosions: [],
    commandQueue: [],
    eventQueue: [],
    timeMs: 0,
    levelTimeMs: 0,
    timeFreezeUntilMs: null,
    rng: () => 0.5,
    status: 'playing',
    pauseState: 'running',
    nextEnemyId: 0,
    nextObjectId: 0,
    nextBalloonId: 0,
    nextExplosionId: 0,
    scoreMilestoneCrossed: 0,
  };
}

function makePlayer(id, col, row, dir) {
  return {
    id,
    character: 'bear',
    pos: { col, row },
    dir: dir || 'down',
    move: null,
    speedStacks: 0,
    lives: 5,
    score: 0,
    status: {},
    commandQueue: [],
    alive: true,
  };
}

function makeEnemy(id, type, col, row) {
  return {
    id,
    type,
    pos: { col, row },
    dir: 'down',
    move: null,
    enteredFromDir: null,
    abilityCooldownUntilMs: 0,
    cast: null,
  };
}

function placeObject(state, col, row, type) {
  state.grid[row][col].object = { type, id: 9000 + col * 100 + row };
}

function settle(state, maxTicks) {
  const limit = maxTicks || 200;
  let n = 0;
  while (state.movingObjects.length > 0 && n < limit) {
    tickMovingObjects(state, STEP_MS);
    n++;
  }
}

test('rock slides to grid edge and lands there', () => {
  const state = makeState();
  state.players.push(makePlayer('p1', 0, 5, 'right'));
  placeObject(state, 1, 5, 'rock');
  applyHurlCommand(state, 'p1');
  assert.equal(state.movingObjects.length, 1);
  settle(state);
  assert.equal(state.movingObjects.length, 0);
  assert.equal(state.grid[5][1].object, null);
  assert.equal(state.grid[5][12].object && state.grid[5][12].object.type, 'rock');
});

test('rock destroyed in place when two-ahead is off-grid', () => {
  const state = makeState();
  state.players.push(makePlayer('p1', 11, 5, 'right'));
  placeObject(state, 12, 5, 'rock');
  applyHurlCommand(state, 'p1');
  assert.equal(state.movingObjects.length, 0);
  assert.equal(state.grid[5][12].object, null);
  const ev = state.eventQueue.find((e) => e.type === 'objectDestroy');
  assert.ok(ev, 'objectDestroy event emitted');
  assert.equal(ev.objectType, 'rock');
});

test('egg destroyed in place awards SCORE_EGG_CRACK to hurler', () => {
  const state = makeState();
  const p1 = makePlayer('p1', 11, 5, 'right');
  state.players.push(p1);
  placeObject(state, 12, 5, 'egg');
  applyHurlCommand(state, 'p1');
  assert.equal(state.movingObjects.length, 0);
  assert.equal(state.grid[5][12].object, null);
  assert.equal(p1.score, BALANCE.SCORE_EGG_CRACK);
});

test('hurled rock kills enemy in path; slide continues to edge', () => {
  const state = makeState();
  state.players.push(makePlayer('p1', 0, 5, 'right'));
  placeObject(state, 1, 5, 'rock');
  state.enemies.push(makeEnemy(state.nextEnemyId++, 'enemy1', 5, 5));
  applyHurlCommand(state, 'p1');
  settle(state);
  assert.equal(state.enemies.length, 0);
  assert.equal(state.grid[5][12].object && state.grid[5][12].object.type, 'rock');
  const defeat = state.eventQueue.find((e) => e.type === 'enemyDefeated');
  assert.ok(defeat, 'enemyDefeated event emitted');
  assert.equal(defeat.enemyType, 'enemy1');
});

test('hurled rock from p1 kills p2 (coop friendly fire enabled)', () => {
  const state = makeState();
  const p1 = makePlayer('p1', 0, 5, 'right');
  const p2 = makePlayer('p2', 5, 5, 'down');
  state.players.push(p1, p2);
  placeObject(state, 1, 5, 'rock');
  applyHurlCommand(state, 'p1');
  settle(state);
  assert.equal(p2.alive, false, 'p2 should be killed by p1\'s hurled rock');
  const death = state.eventQueue.find((e) => e.type === 'playerDeath' && e.playerId === 'p2');
  assert.ok(death, 'playerDeath event for p2 should be emitted');
});

test('hurled rock does not kill the hurler themselves', () => {
  const state = makeState();
  const p1 = makePlayer('p1', 0, 5, 'right');
  state.players.push(p1);
  // Manually inject a mover where p1 is the hurler AND p1 is in the path
  state.movingObjects.push({
    id: state.nextObjectId++,
    type: 'rock',
    pos: { col: 5, row: 5 },
    dir: 'left',
    progress: 0,
    hurlerId: 'p1',
    bouncesUsed: 0,
    killChainCount: 0,
  });
  settle(state);
  assert.equal(p1.alive, true, 'p1 should survive their own hurled rock');
});

test('hurled rock from non-partner hurler kills player in path', () => {
  const state = makeState();
  const p2 = makePlayer('p2', 5, 5, 'down');
  state.players.push(p2);
  state.movingObjects.push({
    id: state.nextObjectId++,
    type: 'rock',
    pos: { col: 1, row: 5 },
    dir: 'right',
    progress: 0,
    hurlerId: 99,
    bouncesUsed: 0,
  });
  settle(state);
  assert.equal(p2.alive, false);
  assert.equal(p2.lives, 4);
  const death = state.eventQueue.find((e) => e.type === 'playerDeath');
  assert.ok(death);
  assert.equal(death.playerId, 'p2');
});

test('fireball stopping at grid edge enqueues an explosion', () => {
  const state = makeState();
  state.players.push(makePlayer('p1', 0, 5, 'right'));
  placeObject(state, 1, 5, 'fireball');
  applyHurlCommand(state, 'p1');
  const before = state.explosions.length;
  settle(state);
  assert.equal(state.movingObjects.length, 0);
  assert.ok(state.explosions.length > before, 'explosion enqueued');
});

test('two hurled rocks meeting same target reverse and increment bouncesUsed', () => {
  const state = makeState();
  state.players.push(makePlayer('p1', 3, 5, 'right'));
  state.players.push(makePlayer('p2', 7, 5, 'left'));
  placeObject(state, 4, 5, 'rock');
  placeObject(state, 6, 5, 'rock');
  applyHurlCommand(state, 'p1');
  applyHurlCommand(state, 'p2');
  assert.equal(state.movingObjects.length, 2);
  tickMovingObjects(state, STEP_MS);
  const movers = state.movingObjects;
  assert.equal(movers.length, 2);
  const m1 = movers.find((m) => m.hurlerId === 'p1');
  const m2 = movers.find((m) => m.hurlerId === 'p2');
  assert.ok(m1 && m2, 'both movers present');
  assert.equal(m1.bouncesUsed, 1);
  assert.equal(m2.bouncesUsed, 1);
  assert.equal(m1.dir, 'left');
  assert.equal(m2.dir, 'right');
});

test('resolveSlideCollision returns stopped for off-grid and stationary-object cells', () => {
  const state = makeState();
  const mover = {
    id: 0, type: 'rock', pos: { col: 0, row: 0 }, dir: 'left',
    progress: 1, hurlerId: 'p1', bouncesUsed: 0,
  };
  const offGrid = resolveSlideCollision(state, mover, { col: -1, row: 0 });
  assert.equal(offGrid.stopped, true);
  placeObject(state, 1, 0, 'rock');
  const blocked = resolveSlideCollision(state, mover, { col: 1, row: 0 });
  assert.equal(blocked.stopped, true);
  const open = resolveSlideCollision(state, mover, { col: 2, row: 0 });
  assert.equal(open.stopped, false);
});

test('hurl on empty front cell is a no-op and emits no events', () => {
  const state = makeState();
  state.players.push(makePlayer('p1', 5, 5, 'right'));
  applyHurlCommand(state, 'p1');
  assert.equal(state.movingObjects.length, 0);
  assert.equal(state.eventQueue.length, 0);
});

test('fireball destroyed in place against wall detonates', () => {
  const state = makeState();
  state.players.push(makePlayer('p1', 11, 5, 'right'));
  placeObject(state, 12, 5, 'fireball');
  const before = state.explosions.length;
  applyHurlCommand(state, 'p1');
  assert.equal(state.movingObjects.length, 0);
  assert.equal(state.grid[5][12].object, null);
  assert.ok(state.explosions.length > before, 'explosion enqueued from hurl-against-wall');
});

test('multi-cell-per-tick traversal advances the mover safely', () => {
  const state = makeState();
  state.players.push(makePlayer('p1', 0, 5, 'right'));
  placeObject(state, 1, 5, 'rock');
  applyHurlCommand(state, 'p1');
  tickMovingObjects(state, 5 * STEP_MS);
  if (state.movingObjects.length > 0) {
    assert.ok(state.movingObjects[0].pos.col >= 6, 'mover advanced multiple cells in one tick');
  } else {
    assert.equal(state.grid[5][12].object && state.grid[5][12].object.type, 'rock');
  }
});

test('tickMovingObjects is safe when state.movingObjects is undefined', () => {
  const state = makeState();
  state.movingObjects = undefined;
  assert.doesNotThrow(() => tickMovingObjects(state, STEP_MS));
});

test('donut bounces once at edge then stops at opposite edge', () => {
  const state = makeState();
  state.players.push(makePlayer('p1', 0, 5, 'right'));
  placeObject(state, 1, 5, 'donut');
  applyHurlCommand(state, 'p1');
  assert.equal(state.movingObjects.length, 1);
  settle(state);
  assert.equal(state.movingObjects.length, 0);
  assert.equal(state.grid[5][0].object && state.grid[5][0].object.type, 'donut');
});

test('donut at bouncesUsed=1 stops on next stationary collision (no second reverse)', () => {
  const state = makeState();
  placeObject(state, 5, 3, 'rock');
  state.movingObjects.push({
    id: state.nextObjectId++,
    type: 'donut',
    pos: { col: 2, row: 3 },
    dir: 'right',
    progress: 0,
    hurlerId: 'p1',
    bouncesUsed: 1,
  });
  settle(state);
  assert.equal(state.movingObjects.length, 0);
  assert.equal(state.grid[3][4].object && state.grid[3][4].object.type, 'donut');
  assert.equal(state.grid[3][5].object && state.grid[3][5].object.type, 'rock');
});

test('two moving donuts head-on collide → both reverse, bouncesUsed=1 each', () => {
  const state = makeState();
  state.movingObjects.push({
    id: state.nextObjectId++,
    type: 'donut',
    pos: { col: 3, row: 5 },
    dir: 'right',
    progress: 0,
    hurlerId: 'p1',
    bouncesUsed: 0,
  });
  state.movingObjects.push({
    id: state.nextObjectId++,
    type: 'donut',
    pos: { col: 4, row: 5 },
    dir: 'left',
    progress: 0,
    hurlerId: 'p2',
    bouncesUsed: 0,
  });
  tickMovingObjects(state, STEP_MS);
  assert.equal(state.movingObjects.length, 2);
  const a = state.movingObjects.find((m) => m.hurlerId === 'p1');
  const b = state.movingObjects.find((m) => m.hurlerId === 'p2');
  assert.ok(a && b, 'both donuts present');
  assert.equal(a.bouncesUsed, 1);
  assert.equal(b.bouncesUsed, 1);
  assert.equal(a.dir, 'left');
  assert.equal(b.dir, 'right');
});

test('donut at bouncesUsed=1 collides with moving rock → donut stops, rock reverses', () => {
  const state = makeState();
  state.movingObjects.push({
    id: state.nextObjectId++,
    type: 'donut',
    pos: { col: 3, row: 5 },
    dir: 'right',
    progress: 0,
    hurlerId: 'p1',
    bouncesUsed: 1,
  });
  const rockId = state.nextObjectId++;
  state.movingObjects.push({
    id: rockId,
    type: 'rock',
    pos: { col: 4, row: 5 },
    dir: 'left',
    progress: 0,
    hurlerId: 'p2',
    bouncesUsed: 0,
  });
  tickMovingObjects(state, STEP_MS);
  assert.equal(state.grid[5][3].object && state.grid[5][3].object.type, 'donut');
  const remainingRock = state.movingObjects.find((m) => m.id === rockId);
  assert.ok(remainingRock, 'rock still moving');
  assert.equal(remainingRock.dir, 'right');
  assert.equal(remainingRock.bouncesUsed, 1);
});

test('donut destroyed by explosion does not bounce', () => {
  const state = makeState();
  placeObject(state, 5, 5, 'donut');
  applyExplosion(state, { col: 5, row: 5 });
  tickExplosions(state, 16);
  assert.equal(state.movingObjects.length, 0);
  assert.equal(state.grid[5][5].object, null);
});

test('hurl against rock-stack: only the front rock breaks; +1 silent for the broken rock; no popup', () => {
  const state = makeState();
  const p1 = makePlayer('p1', 1, 5, 'right');
  state.players.push(p1);
  placeObject(state, 2, 5, 'rock');
  placeObject(state, 3, 5, 'rock');
  placeObject(state, 4, 5, 'rock');
  applyHurlCommand(state, 'p1');
  assert.equal(state.movingObjects.length, 0);
  assert.equal(state.grid[5][2].object, null, 'front rock destroyed');
  assert.equal(state.grid[5][3].object && state.grid[5][3].object.type, 'rock', 'second rock intact');
  assert.equal(state.grid[5][4].object && state.grid[5][4].object.type, 'rock', 'third rock intact');
  // +1 silent for the broken front rock. No bonus for trailing rocks.
  assert.equal(p1.score, 1, 'one rock broken = +1 silent score');
  const destroys = state.eventQueue.filter((e) => e.type === 'objectDestroy');
  assert.equal(destroys.length, 1, 'only the front rock is destroyed');
  const scorePopups = state.eventQueue.filter((e) => e.type === 'scorePopup');
  assert.equal(scorePopups.length, 0, 'rock-break is silent — no popup');
});

test('hurl against six-rock line: only the front rock breaks; +1 silent for it; no popup', () => {
  const state = makeState();
  const p1 = makePlayer('p1', 1, 5, 'right');
  state.players.push(p1);
  for (let c = 2; c <= 7; c++) placeObject(state, c, 5, 'rock');
  applyHurlCommand(state, 'p1');
  assert.equal(state.grid[5][2].object, null, 'col 2 cleared');
  for (let c = 3; c <= 7; c++) {
    assert.equal(state.grid[5][c].object && state.grid[5][c].object.type, 'rock', `col ${c} intact`);
  }
  assert.equal(p1.score, 1, 'one rock broken = +1 silent score');
  const scorePopups = state.eventQueue.filter((e) => e.type === 'scorePopup');
  assert.equal(scorePopups.length, 0, 'rock-break is silent — no popup');
});

test('hurl against rock-then-egg: only the front rock breaks; +1 silent; egg untouched', () => {
  const state = makeState();
  const p1 = makePlayer('p1', 1, 5, 'right');
  state.players.push(p1);
  placeObject(state, 2, 5, 'rock');
  placeObject(state, 3, 5, 'egg');
  applyHurlCommand(state, 'p1');
  assert.equal(state.grid[5][2].object, null, 'front rock destroyed');
  assert.equal(state.grid[5][3].object && state.grid[5][3].object.type, 'egg', 'egg intact');
  assert.equal(p1.score, 1, 'rock break = +1 silent');
});

test('hurl rock against edge: destroyed in place; +1 silent; no popup', () => {
  const state = makeState();
  const p1 = makePlayer('p1', 11, 5, 'right');
  state.players.push(p1);
  placeObject(state, 12, 5, 'rock');
  applyHurlCommand(state, 'p1');
  assert.equal(state.grid[5][12].object, null);
  assert.equal(p1.score, 1);
  const scorePopups = state.eventQueue.filter((e) => e.type === 'scorePopup');
  assert.equal(scorePopups.length, 0);
});

test('hurl rock into fireball: front rock breaks (+1 silent); fireball untouched', () => {
  const state = makeState();
  const p1 = makePlayer('p1', 1, 5, 'right');
  state.players.push(p1);
  placeObject(state, 2, 5, 'rock');
  placeObject(state, 3, 5, 'fireball');
  applyHurlCommand(state, 'p1');
  assert.equal(state.grid[5][2].object, null);
  assert.equal(state.grid[5][3].object && state.grid[5][3].object.type, 'fireball');
  assert.equal(p1.score, 1);
});

test('multi-kill chain: 2nd enemy gives 2x score, 3rd gives 4x', () => {
  const state = makeState();
  const p1 = makePlayer('p1', 0, 5, 'right');
  state.players.push(p1);
  placeObject(state, 1, 5, 'rock');
  // Three enemy1 in the slide path
  state.enemies.push(makeEnemy(1, 'enemy1', 4, 5));
  state.enemies.push(makeEnemy(2, 'enemy1', 7, 5));
  state.enemies.push(makeEnemy(3, 'enemy1', 10, 5));
  applyHurlCommand(state, 'p1');
  settle(state);
  const base = BALANCE.SCORE_E1_KILL;
  // 1x + 2x + 4x = 7 * base
  assert.equal(p1.score, base * 7,
    `expected ${base * 7} (1x + 2x + 4x), got ${p1.score}`);
});

test('multi-kill chain: explosion kills also chain after slide kills', () => {
  const state = makeState();
  const p1 = makePlayer('p1', 0, 5, 'right');
  state.players.push(p1);
  placeObject(state, 1, 5, 'fireball');
  // One enemy in the slide path, two in the explosion radius
  state.enemies.push(makeEnemy(1, 'enemy1', 4, 5));
  state.enemies.push(makeEnemy(2, 'enemy1', 11, 5)); // at fireball stop cell
  state.enemies.push(makeEnemy(3, 'enemy1', 12, 5)); // in explosion radius
  applyHurlCommand(state, 'p1');
  settle(state);
  tickExplosions(state, 0);
  const base = BALANCE.SCORE_E1_KILL;
  // Slide kill at 4: 1x; fireball stops at 11 → explosion radius 1 covers 10/11/12
  // Enemy at 11 is the stop cell, enemy at 12 is in radius. Both in same explosion.
  // Chain: slide 1x, then explosion: 2x for enemy@11, 4x for enemy@12 = 1+2+4 = 7
  assert.equal(state.enemies.length, 0, 'all enemies should be defeated');
  assert.equal(p1.score, base * 7,
    `expected ${base * 7} (1x slide + 2x+4x explosion), got ${p1.score}`);
});

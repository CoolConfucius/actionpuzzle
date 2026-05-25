import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  tickEnemies,
  defeatEnemy,
  processEnemyAction,
  resolveEnemyContactKills,
} from '../engine/enemies.js';
import { pickEnemyDirection } from '../engine/enemy-ai.js';
import { createGrid, setObject } from '../engine/grid.js';
import { mulberry32 } from '../engine/rng.js';
import { BALANCE } from '../engine/constants.js';

function makePlayer(id, col, row) {
  return {
    id,
    character: 'bear',
    pos: { col, row },
    dir: 'down',
    move: null,
    speedStacks: 0,
    lives: 5,
    score: 0,
    status: {},
    commandQueue: [],
    alive: true,
  };
}

function makeEnemy(type, col, row, id = 1) {
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

function makeState() {
  return {
    level: { id: 'test', dims: { cols: 13, rows: 11 } },
    grid: createGrid({ cols: 13, rows: 11 }),
    players: [makePlayer('p1', 0, 0)],
    enemies: [],
    movingObjects: [],
    explosions: [],
    balloons: [],
    pendingSpawns: [],
    commandQueue: [],
    eventQueue: [],
    timeMs: 0,
    // Past the LEVEL_COUNTDOWN_MS gate so tick() actually runs the enemy logic.
    levelTimeMs: 5000,
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

test('time-freeze halts enemy movement and emits no events', () => {
  const state = makeState();
  state.timeMs = 0;
  state.timeFreezeUntilMs = 1000;
  const e = makeEnemy('enemy1', 5, 5);
  e.frozenUntilMs = 1000;
  state.enemies.push(e);
  tickEnemies(state, 100);
  assert.equal(e.pos.col, 5);
  assert.equal(e.pos.row, 5);
  assert.equal(e.move, null);
  assert.equal(state.eventQueue.length, 0);
});

test('mid-traversal enemy snaps to target on completion', () => {
  const state = makeState();
  const e = makeEnemy('enemy1', 5, 5);
  e.dir = 'right';
  e.move = { from: { col: 5, row: 5 }, to: { col: 6, row: 5 }, t: 0 };
  state.enemies.push(e);
  tickEnemies(state, 700);
  assert.equal(e.move, null);
  assert.equal(e.pos.col, 6);
  assert.equal(e.pos.row, 5);
  assert.equal(e.enteredFromDir, 'left');
});

test('mid-traversal enemy advances t partially without snapping', () => {
  const state = makeState();
  const e = makeEnemy('enemy1', 5, 5);
  e.dir = 'right';
  e.move = { from: { col: 5, row: 5 }, to: { col: 6, row: 5 }, t: 0 };
  state.enemies.push(e);
  tickEnemies(state, 100);
  assert.ok(e.move != null, 'move should still be in progress');
  assert.ok(e.move.t > 0 && e.move.t < 1);
  assert.equal(e.pos.col, 5);
  assert.equal(e.pos.row, 5);
});

test('E1 destroys object in chosen direction without awarding score', () => {
  const state = makeState();
  const e = makeEnemy('enemy1', 1, 5);
  state.enemies.push(e);
  setObject(state.grid, 2, 5, { type: 'rock', id: 1 });
  processEnemyAction(state, e, 'right');
  assert.equal(state.grid[5][2].object, null);
  assert.equal(e.pos.col, 1);
  assert.equal(e.pos.row, 5);
  assert.equal(e.move, null);
  assert.equal(state.players[0].score, 0);
  const evt = state.eventQueue.find((ev) => ev.type === 'objectDestroy');
  assert.ok(evt, 'objectDestroy event should be emitted');
  assert.equal(evt.cell.col, 2);
  assert.equal(evt.cell.row, 5);
  assert.equal(evt.objectType, 'rock');
  assert.equal(e.dir, 'right');
});

test('E2 hurls front object spawning a MovingObject with enemy hurlerId', () => {
  const state = makeState();
  const e = makeEnemy('enemy2', 1, 5, 42);
  state.enemies.push(e);
  setObject(state.grid, 2, 5, { type: 'rock', id: 1 });
  processEnemyAction(state, e, 'right');
  assert.equal(state.grid[5][2].object, null);
  assert.equal(state.movingObjects.length, 1);
  const mover = state.movingObjects[0];
  assert.equal(mover.hurlerId, 42);
  assert.equal(mover.pos.col, 2);
  assert.equal(mover.pos.row, 5);
  assert.equal(mover.dir, 'right');
  assert.equal(mover.type, 'rock');
  assert.equal(mover.bouncesUsed, 0);
  const evt = state.eventQueue.find((ev) => ev.type === 'hurl');
  assert.ok(evt, 'hurl event should be emitted');
  assert.equal(evt.cell.col, 2);
  assert.equal(evt.cell.row, 5);
  assert.equal(evt.dir, 'right');
});

test('E2 hurl with two-ahead blocked destroys in place', () => {
  const state = makeState();
  const e = makeEnemy('enemy2', 1, 5);
  state.enemies.push(e);
  setObject(state.grid, 2, 5, { type: 'rock', id: 1 });
  setObject(state.grid, 3, 5, { type: 'rock', id: 2 });
  processEnemyAction(state, e, 'right');
  assert.equal(state.grid[5][2].object, null);
  assert.ok(state.grid[5][3].object != null, 'blocker should remain');
  assert.equal(state.movingObjects.length, 0);
  const evt = state.eventQueue.find((ev) => ev.type === 'objectDestroy');
  assert.ok(evt, 'objectDestroy event should be emitted');
  assert.equal(evt.cell.col, 2);
  assert.equal(evt.cell.row, 5);
  assert.equal(state.players[0].score, 0);
});

test('defeatEnemy E1 awards 100 to attributed player and emits event', () => {
  const state = makeState();
  const e = makeEnemy('enemy1', 4, 4);
  state.enemies.push(e);
  defeatEnemy(state, e, 'hurlSlam', 'p1');
  assert.equal(state.enemies.length, 0);
  assert.equal(state.players[0].score, BALANCE.SCORE_E1_KILL);
  const evt = state.eventQueue.find((ev) => ev.type === 'enemyDefeated');
  assert.ok(evt, 'enemyDefeated event should be emitted');
  assert.equal(evt.enemyType, 'enemy1');
  assert.equal(evt.cell.col, 4);
  assert.equal(evt.cell.row, 4);
  assert.equal(evt.cause, 'hurlSlam');
});

test('defeatEnemy E2 awards 200 to attributed player', () => {
  const state = makeState();
  const e = makeEnemy('enemy2', 3, 3);
  state.enemies.push(e);
  defeatEnemy(state, e, 'explosion', 'p1');
  assert.equal(state.players[0].score, BALANCE.SCORE_E2_KILL);
  const evt = state.eventQueue.find((ev) => ev.type === 'enemyDefeated');
  assert.ok(evt);
  assert.equal(evt.enemyType, 'enemy2');
  assert.equal(evt.cause, 'explosion');
});

test('defeatEnemy is idempotent on double call', () => {
  const state = makeState();
  const e = makeEnemy('enemy1', 2, 2);
  state.enemies.push(e);
  defeatEnemy(state, e, 'hurlSlam', 'p1');
  const scoreAfterFirst = state.players[0].score;
  const eventsAfterFirst = state.eventQueue.filter(
    (ev) => ev.type === 'enemyDefeated',
  ).length;
  defeatEnemy(state, e, 'explosion', 'p1');
  assert.equal(state.players[0].score, scoreAfterFirst);
  const eventsAfterSecond = state.eventQueue.filter(
    (ev) => ev.type === 'enemyDefeated',
  ).length;
  assert.equal(eventsAfterSecond, eventsAfterFirst);
  assert.equal(state.enemies.length, 0);
});

test('defeatEnemy with no attributed player defaults to first player', () => {
  const state = makeState();
  const e = makeEnemy('enemy1', 5, 5);
  state.enemies.push(e);
  defeatEnemy(state, e, 'berserk');
  assert.equal(state.players[0].score, BALANCE.SCORE_E1_KILL);
  const evt = state.eventQueue.find((ev) => ev.type === 'enemyDefeated');
  assert.ok(evt);
  assert.equal(evt.cause, 'berserk');
});

test('anti-target bias produces away-from-player histogram', () => {
  const state = makeState();
  state.players[0].pos = { col: 0, row: 0 };
  const e = makeEnemy('enemy1', 6, 5);
  state.enemies.push(e);
  state.rng = mulberry32(1);
  let right = 0;
  let down = 0;
  let left = 0;
  let up = 0;
  for (let i = 0; i < 1000; i++) {
    const dir = pickEnemyDirection(state, e);
    if (dir === 'right') right++;
    else if (dir === 'down') down++;
    else if (dir === 'left') left++;
    else if (dir === 'up') up++;
  }
  const away = right + down;
  const toward = left + up;
  assert.ok(
    away > toward,
    `away (right=${right} + down=${down} = ${away}) should exceed toward (left=${left} + up=${up} = ${toward})`,
  );
});

test('tickEnemies wired into state.tick at step 3', async () => {
  const { tick } = await import('../engine/state.js');
  const state = makeState();
  const e = makeEnemy('enemy1', 5, 5);
  e.dir = 'right';
  e.move = { from: { col: 5, row: 5 }, to: { col: 6, row: 5 }, t: 0.99 };
  state.enemies.push(e);
  tick(state, 700);
  assert.equal(e.move, null);
  assert.equal(e.pos.col, 6);
  assert.equal(e.pos.row, 5);
});

test('E3 stationary off-cooldown initiates trap cast', () => {
  const state = makeState();
  state.players[0].pos = { col: 0, row: 0 };
  state.timeMs = 1000;
  const e = makeEnemy('enemy3', 5, 5);
  state.enemies.push(e);
  tickEnemies(state, 0);
  assert.ok(e.cast, 'cast should be set');
  assert.equal(e.cast.kind, 'trap');
  assert.equal(e.cast.startedMs, 1000);
  assert.equal(e.cast.completesMs, 1000 + BALANCE.E3_TRAP_CAST_MS);
});

test('E3 cast completes after E3_TRAP_CAST_MS and places hazard with cooldown', () => {
  const state = makeState();
  const e = makeEnemy('enemy3', 5, 5);
  state.enemies.push(e);
  state.timeMs = 0;
  e.cast = { kind: 'trap', startedMs: 0, completesMs: BALANCE.E3_TRAP_CAST_MS };
  state.timeMs = BALANCE.E3_TRAP_CAST_MS;
  tickEnemies(state, 0);
  assert.equal(e.cast, null);
  const hazard = state.grid[5][5].hazard;
  assert.ok(hazard, 'hazard should be placed');
  assert.equal(hazard.type, 'slow-trap');
  assert.equal(hazard.sourceEnemyId, e.id);
  assert.equal(hazard.expiresMs, state.timeMs + BALANCE.E3_TRAP_DURATION_MS);
  assert.equal(e.abilityCooldownUntilMs, state.timeMs + BALANCE.E3_TRAP_COOLDOWN_MS);
});

test('E3 will not initiate cast on a cell that already has a hazard', () => {
  const state = makeState();
  const e = makeEnemy('enemy3', 5, 5);
  state.enemies.push(e);
  state.grid[5][5].hazard = { type: 'slow-trap', sourceEnemyId: 99, expiresMs: 1e9 };
  state.timeMs = 1000;
  tickEnemies(state, 0);
  assert.equal(e.cast, null, 'cast should not start');
});

test('time-freeze completes any E3 mid-cast immediately', () => {
  const state = makeState();
  const e = makeEnemy('enemy3', 5, 5);
  state.enemies.push(e);
  state.timeMs = 100;
  e.cast = { kind: 'trap', startedMs: 100, completesMs: 100 + BALANCE.E3_TRAP_CAST_MS };
  state.timeFreezeUntilMs = 10000;
  e.frozenUntilMs = 10000;
  tickEnemies(state, 0);
  assert.equal(e.cast, null);
  const hazard = state.grid[5][5].hazard;
  assert.ok(hazard, 'hazard placed during freeze');
  assert.equal(e.abilityCooldownUntilMs, state.timeMs + BALANCE.E3_TRAP_COOLDOWN_MS);
});

test('hazard expires when its expiresMs has passed', () => {
  const state = makeState();
  state.grid[3][3].hazard = { type: 'slow-trap', sourceEnemyId: 1, expiresMs: 500 };
  state.timeMs = 600;
  tickEnemies(state, 0);
  assert.equal(state.grid[3][3].hazard, null);
});

test('E3 hurls front object like E2', () => {
  const state = makeState();
  const e = makeEnemy('enemy3', 1, 5, 7);
  state.enemies.push(e);
  setObject(state.grid, 2, 5, { type: 'rock', id: 1 });
  processEnemyAction(state, e, 'right');
  assert.equal(state.grid[5][2].object, null);
  assert.equal(state.movingObjects.length, 1);
  assert.equal(state.movingObjects[0].hurlerId, 7);
});

test('E4 stationary off-cooldown with low rng initiates fireball cast and emits enemy4CastStart', () => {
  const state = makeState();
  state.players[0].pos = { col: 0, row: 0 };
  state.timeMs = 500;
  state.rng = () => 0.05;
  const e = makeEnemy('enemy4', 6, 5, 11);
  e.dir = 'right';
  state.enemies.push(e);
  tickEnemies(state, 0);
  assert.ok(e.cast, 'cast should be set');
  assert.equal(e.cast.kind, 'fireball');
  assert.equal(e.cast.startedMs, 500);
  assert.equal(e.cast.completesMs, 500 + BALANCE.E4_FIREBALL_CAST_MS);
  const evt = state.eventQueue.find((ev) => ev.type === 'enemy4CastStart');
  assert.ok(evt, 'enemy4CastStart event should be emitted');
  assert.equal(evt.cell.col, 6);
  assert.equal(evt.cell.row, 5);
});

test('E4 with rng above threshold does not start cast', () => {
  const state = makeState();
  state.players[0].pos = { col: 0, row: 0 };
  state.timeMs = 500;
  state.rng = () => 0.5;
  const e = makeEnemy('enemy4', 6, 5);
  state.enemies.push(e);
  tickEnemies(state, 0);
  assert.equal(e.cast, null);
  const evt = state.eventQueue.find((ev) => ev.type === 'enemy4CastStart');
  assert.equal(evt, undefined);
});

test('E4 fireball cast completes with empty front cell: spawns fireball and sets cooldown', () => {
  const state = makeState();
  state.timeMs = 0;
  const e = makeEnemy('enemy4', 5, 5, 21);
  e.dir = 'right';
  e.cast = { kind: 'fireball', startedMs: 0, completesMs: BALANCE.E4_FIREBALL_CAST_MS };
  state.enemies.push(e);
  state.timeMs = BALANCE.E4_FIREBALL_CAST_MS;
  tickEnemies(state, 0);
  assert.equal(e.cast, null);
  assert.equal(state.movingObjects.length, 1);
  const mover = state.movingObjects[0];
  assert.equal(mover.type, 'fireball');
  assert.equal(mover.pos.col, 6);
  assert.equal(mover.pos.row, 5);
  assert.equal(mover.dir, 'right');
  assert.equal(mover.hurlerId, 21);
  assert.equal(mover.bouncesUsed, 0);
  assert.equal(e.abilityCooldownUntilMs, state.timeMs + BALANCE.E4_FIREBALL_COOLDOWN_MS);
});

test('E4 fireball cast completes with blocked front cell: no fireball, cooldown still applied', () => {
  const state = makeState();
  state.timeMs = 0;
  const e = makeEnemy('enemy4', 5, 5);
  e.dir = 'right';
  e.cast = { kind: 'fireball', startedMs: 0, completesMs: BALANCE.E4_FIREBALL_CAST_MS };
  state.enemies.push(e);
  setObject(state.grid, 6, 5, { type: 'rock', id: 1 });
  state.timeMs = BALANCE.E4_FIREBALL_CAST_MS;
  tickEnemies(state, 0);
  assert.equal(e.cast, null);
  assert.equal(state.movingObjects.length, 0);
  assert.ok(state.grid[5][6].object != null, 'blocker rock should remain');
  assert.equal(e.abilityCooldownUntilMs, state.timeMs + BALANCE.E4_FIREBALL_COOLDOWN_MS);
});

test('E4 cooldown gates cast start even with rng = 0', () => {
  const state = makeState();
  state.timeMs = 1000;
  state.rng = () => 0.0;
  const e = makeEnemy('enemy4', 6, 5);
  e.abilityCooldownUntilMs = 5000;
  state.enemies.push(e);
  tickEnemies(state, 0);
  assert.equal(e.cast, null);
  const evt = state.eventQueue.find((ev) => ev.type === 'enemy4CastStart');
  assert.equal(evt, undefined);
});

test('time-freeze cancels in-progress E4 fireball cast and applies cooldown', () => {
  const state = makeState();
  state.timeMs = 200;
  const e = makeEnemy('enemy4', 5, 5);
  e.dir = 'right';
  e.cast = { kind: 'fireball', startedMs: 100, completesMs: 100 + BALANCE.E4_FIREBALL_CAST_MS };
  state.enemies.push(e);
  state.timeFreezeUntilMs = 10000;
  e.frozenUntilMs = 10000;
  tickEnemies(state, 0);
  assert.equal(e.cast, null);
  assert.equal(state.movingObjects.length, 0);
  assert.equal(e.abilityCooldownUntilMs, state.timeMs + BALANCE.E4_FIREBALL_COOLDOWN_MS);
});

test('E5 traverses one cell at ENEMY_5_SPEED faster than player base', () => {
  assert.ok(BALANCE.ENEMY_5_SPEED > BALANCE.PLAYER_BASE_SPEED,
    'E5 must outpace player base by design');
  const state = makeState();
  const e = makeEnemy('enemy5', 5, 5);
  e.dir = 'right';
  e.move = { from: { col: 5, row: 5 }, to: { col: 6, row: 5 }, t: 0 };
  state.enemies.push(e);
  const dtMs = (1 / BALANCE.ENEMY_5_SPEED) * 1000 + 1;
  tickEnemies(state, dtMs);
  assert.equal(e.move, null, 'E5 should complete one-cell traversal');
  assert.equal(e.pos.col, 6);
  assert.equal(e.pos.row, 5);
});

test('E5 hurls front object like E2', () => {
  const state = makeState();
  const e = makeEnemy('enemy5', 1, 5, 77);
  state.enemies.push(e);
  setObject(state.grid, 2, 5, { type: 'rock', id: 1 });
  processEnemyAction(state, e, 'right');
  assert.equal(state.grid[5][2].object, null);
  assert.equal(state.movingObjects.length, 1);
  const mover = state.movingObjects[0];
  assert.equal(mover.hurlerId, 77);
  assert.equal(mover.type, 'rock');
  assert.equal(mover.dir, 'right');
});

test('defeatEnemy E5 awards SCORE_E5_KILL (500) to attributed player', () => {
  const state = makeState();
  const e = makeEnemy('enemy5', 7, 7);
  state.enemies.push(e);
  defeatEnemy(state, e, 'hurlSlam', 'p1');
  assert.equal(state.enemies.length, 0);
  assert.equal(state.players[0].score, BALANCE.SCORE_E5_KILL);
  assert.equal(BALANCE.SCORE_E5_KILL, 500);
  const evt = state.eventQueue.find((ev) => ev.type === 'enemyDefeated');
  assert.ok(evt);
  assert.equal(evt.enemyType, 'enemy5');
});

test('enemy-contact: enemy sharing player cell kills the player', () => {
  const state = makeState();
  state.players[0].pos = { col: 5, row: 5 };
  const e = makeEnemy('enemy1', 5, 5);
  state.enemies.push(e);
  resolveEnemyContactKills(state);
  assert.equal(state.players[0].alive, false);
  assert.equal(state.players[0].lives, 4);
  const evt = state.eventQueue.find((ev) => ev.type === 'playerDeath');
  assert.ok(evt, 'expected playerDeath event');
  assert.equal(evt.cause, 'enemyContact');
});

test('enemy-contact: mid-move overlap (player moving into enemy) kills the player', () => {
  const state = makeState();
  state.players[0].pos = { col: 4, row: 5 };
  state.players[0].move = {
    from: { col: 4, row: 5 },
    to: { col: 5, row: 5 },
    t: 0.3,
  };
  state.enemies.push(makeEnemy('enemy2', 5, 5));
  resolveEnemyContactKills(state);
  assert.equal(state.players[0].alive, false);
});

test('enemy-contact: mid-move overlap (enemy moving into player) kills the player', () => {
  const state = makeState();
  state.players[0].pos = { col: 5, row: 5 };
  const e = makeEnemy('enemy1', 6, 5);
  e.move = { from: { col: 6, row: 5 }, to: { col: 5, row: 5 }, t: 0.3 };
  state.enemies.push(e);
  resolveEnemyContactKills(state);
  assert.equal(state.players[0].alive, false);
});

test('enemy-contact: respawn invuln window blocks contact kill', () => {
  const state = makeState();
  state.timeMs = 500;
  state.players[0].pos = { col: 5, row: 5 };
  state.players[0].status = { invulnUntilMs: 1000 };
  state.enemies.push(makeEnemy('enemy1', 5, 5));
  resolveEnemyContactKills(state);
  assert.equal(state.players[0].alive, true);
  assert.equal(state.players[0].lives, 5);
});

test('enemy-contact: dead player is not re-killed', () => {
  const state = makeState();
  state.players[0].pos = { col: 5, row: 5 };
  state.players[0].alive = false;
  state.players[0].lives = 2;
  state.enemies.push(makeEnemy('enemy1', 5, 5));
  resolveEnemyContactKills(state);
  assert.equal(state.players[0].alive, false);
  assert.equal(state.players[0].lives, 2);
});

test('enemy-contact: enemy AI no longer parks-blocks adjacent player; steps onto cell', () => {
  const state = makeState();
  state.players[0].pos = { col: 5, row: 5 };
  const e = makeEnemy('enemy1', 4, 5);
  e.dir = 'right';
  state.enemies.push(e);
  processEnemyAction(state, e, 'right');
  assert.ok(e.move, 'enemy should start moving onto player cell');
  assert.equal(e.move.to.col, 5);
  assert.equal(e.move.to.row, 5);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  tickBalloons,
  tickPowerupTimers,
  collectBalloon,
  applyPowerup,
  clearPowerupsOnDeath,
  clearPowerupsOnLevelClear,
  isTimeFrozen,
} from '../engine/powerup.js';
import { BALANCE } from '../engine/constants.js';

function makeBaseState(overrides = {}) {
  return Object.assign({
    level: { balloonSchedule: [] },
    grid: [],
    players: [],
    enemies: [],
    balloons: [],
    eventQueue: [],
    timeMs: 0,
    levelTimeMs: 0,
    timeFreezeUntilMs: null,
    nextBalloonId: 1,
    balloonScheduleIdx: 0,
  }, overrides);
}

function makeGrid(cols, rows) {
  const g = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) row.push({ object: null, hazard: null, windup: null });
    g.push(row);
  }
  return g;
}

test('tickBalloons spawns scheduled balloon and rises it', () => {
  const state = makeBaseState({
    level: { balloonSchedule: [{ atTimeMs: 1000, type: 'berserk', col: 5 }] },
    levelTimeMs: 1000,
  });
  tickBalloons(state, 16);
  assert.equal(state.balloons.length, 1);
  assert.equal(state.balloons[0].col, 5);
  assert.equal(state.balloons[0].type, 'berserk');
  assert.equal(state.balloonScheduleIdx, 1);
});

test('applyPowerup berserk sets timer; re-collect refreshes, no stack', () => {
  const state = makeBaseState({
    timeMs: 1000,
    players: [{ id: 'p1', pos: { col: 0, row: 0 }, status: {}, lives: 3, score: 0 }],
  });
  applyPowerup(state, 'p1', 'berserk');
  const first = state.players[0].status.berserkUntilMs;
  assert.equal(first, 1000 + BALANCE.BERSERK_DURATION_MS);
  state.timeMs = 3000;
  applyPowerup(state, 'p1', 'berserk');
  const second = state.players[0].status.berserkUntilMs;
  assert.equal(second, 3000 + BALANCE.BERSERK_DURATION_MS);
  assert.notEqual(first, second);
});

test('applyPowerup invisibility sets invisibleUntilMs', () => {
  const state = makeBaseState({
    timeMs: 500,
    players: [{ id: 'p1', pos: { col: 0, row: 0 }, status: {} }],
  });
  applyPowerup(state, 'p1', 'invisibility');
  assert.equal(state.players[0].status.invisibleUntilMs, 500 + BALANCE.INVISIBILITY_DURATION_MS);
});

test('applyPowerup timeFreeze sets world flag; mid-E3 cast lays trap; mid-E4 cast canceled', () => {
  const grid = makeGrid(5, 5);
  const e3 = {
    id: 1, type: 'enemy3', pos: { col: 2, row: 2 },
    cast: { kind: 'trap', startedMs: 0, completesMs: 9999 },
    abilityCooldownUntilMs: 0,
  };
  const e4 = {
    id: 2, type: 'enemy4', pos: { col: 3, row: 3 },
    cast: { kind: 'fireball', startedMs: 0, completesMs: 9999 },
    abilityCooldownUntilMs: 0,
  };
  const state = makeBaseState({
    timeMs: 1000,
    grid,
    enemies: [e3, e4],
    players: [{ id: 'p1', pos: { col: 0, row: 0 }, status: {} }],
  });
  applyPowerup(state, 'p1', 'timeFreeze');
  assert.equal(state.timeFreezeUntilMs, 1000 + BALANCE.TIME_FREEZE_DURATION_MS);
  assert.equal(isTimeFrozen(state), true);
  assert.equal(e3.cast, null);
  assert.equal(grid[2][2].hazard && grid[2][2].hazard.type, 'slow-trap');
  assert.equal(e3.abilityCooldownUntilMs, 1000 + BALANCE.E3_TRAP_COOLDOWN_MS);
  assert.equal(e4.cast, null);
  assert.equal(e4.abilityCooldownUntilMs, 1000 + BALANCE.E4_FIREBALL_COOLDOWN_MS);
});

test('applyPowerup lifePlus increments lives uncapped', () => {
  const state = makeBaseState({
    players: [{ id: 'p1', pos: { col: 0, row: 0 }, status: {}, lives: 99 }],
  });
  applyPowerup(state, 'p1', 'lifePlus');
  assert.equal(state.players[0].lives, 100);
});

test('applyPowerup scorePlus respects active multiplier', () => {
  const state = makeBaseState({
    players: [{
      id: 'p1', pos: { col: 1, row: 1 },
      status: { scoreMultiplier: 2 },
      score: 0,
    }],
  });
  applyPowerup(state, 'p1', 'scorePlus500');
  assert.equal(state.players[0].score, 1000);
});

test('applyPowerup multiplier balloons set scoreMultiplier (incl scoreMultiplier* aliases)', () => {
  const cases = [
    { type: 'multiplier2', expected: 2 },
    { type: 'multiplier3', expected: 3 },
    { type: 'scoreMultiplier', expected: 2 },
    { type: 'scoreMultiplier2', expected: 2 },
    { type: 'scoreMultiplier3', expected: 3 },
  ];
  for (const { type, expected } of cases) {
    const state = makeBaseState({
      players: [{ id: 'p1', pos: { col: 0, row: 0 }, status: {} }],
    });
    applyPowerup(state, 'p1', type);
    assert.equal(
      state.players[0].status.scoreMultiplier,
      expected,
      `type=${type} should set scoreMultiplier=${expected}`,
    );
  }
});

test('clearPowerupsOnLevelClear drops multiplier, statuses, and time freeze', () => {
  const state = makeBaseState({
    timeMs: 500,
    timeFreezeUntilMs: 10000,
    players: [{
      id: 'p1', pos: { col: 0, row: 0 },
      status: { scoreMultiplier: 3, berserkUntilMs: 9000, invulnUntilMs: 9000 },
      speedStacks: 2,
    }],
  });
  clearPowerupsOnLevelClear(state);
  assert.equal(state.timeFreezeUntilMs, null);
  assert.equal(state.players[0].status.scoreMultiplier, undefined);
  assert.equal(state.players[0].status.berserkUntilMs, undefined);
  assert.equal(state.players[0].status.invulnUntilMs, 9000);
  assert.equal(state.players[0].speedStacks, 0);
});

test('clearPowerupsOnDeath resets per-player effects but preserves invuln', () => {
  const state = makeBaseState();
  const p = {
    id: 'p1', pos: { col: 0, row: 0 },
    status: { berserkUntilMs: 9000, invisibleUntilMs: 9000, scoreMultiplier: 2, invulnUntilMs: 12000 },
    speedStacks: 3,
  };
  clearPowerupsOnDeath(state, p);
  assert.equal(p.status.berserkUntilMs, undefined);
  assert.equal(p.status.invisibleUntilMs, undefined);
  assert.equal(p.status.scoreMultiplier, undefined);
  assert.equal(p.status.invulnUntilMs, 12000);
  assert.equal(p.speedStacks, 0);
});

test('collectBalloon removes balloon, applies effect, and emits event', () => {
  const state = makeBaseState({
    timeMs: 100,
    balloons: [{ id: 7, type: 'lifePlus', col: 4, rowFloat: 6 }],
    players: [{ id: 'p1', pos: { col: 4, row: 6 }, status: {}, lives: 2 }],
  });
  collectBalloon(state, 'p1', 7);
  assert.equal(state.balloons.length, 0);
  assert.equal(state.players[0].lives, 3);
  assert.equal(state.eventQueue.length, 1);
  assert.equal(state.eventQueue[0].type, 'powerup');
  assert.equal(state.eventQueue[0].powerupType, 'lifePlus');
});

test('tickPowerupTimers expires berserk, invisibility, time-freeze, and traps', () => {
  const grid = makeGrid(2, 1);
  grid[0][0].hazard = { type: 'slow-trap', sourceEnemyId: 1, expiresMs: 1000 };
  const state = makeBaseState({
    timeMs: 5000,
    timeFreezeUntilMs: 4000,
    grid,
    players: [{ id: 'p1', status: { berserkUntilMs: 4000, invisibleUntilMs: 4000 } }],
  });
  tickPowerupTimers(state, 16);
  assert.equal(state.players[0].status.berserkUntilMs, undefined);
  assert.equal(state.players[0].status.invisibleUntilMs, undefined);
  assert.equal(state.timeFreezeUntilMs, null);
  assert.equal(grid[0][0].hazard, null);
});

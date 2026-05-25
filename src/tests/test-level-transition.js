import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyLevelClearBonuses,
  isInLevelTransition,
  tickLevelTransition,
  prepareNextLevelLoad,
  LEVEL_CLEAR_DURATION_MS,
} from '../engine/level-transition.js';
import { BALANCE } from '../engine/constants.js';

function makePlayer(overrides = {}) {
  return {
    id: 'p1',
    alive: true,
    lives: 3,
    score: 0,
    pos: { col: 0, row: 0 },
    status: {},
    ...overrides,
  };
}

function makeState(overrides = {}) {
  return {
    level: { id: '01' },
    levelTimeMs: 60000,
    timeMs: 5000,
    players: [makePlayer()],
    eventQueue: [],
    scoreMilestoneCrossed: 0,
    timeFreezeUntilMs: null,
    ...overrides,
  };
}

test('time bonus + flat bonus awarded with 120s remaining', () => {
  const state = makeState();
  applyLevelClearBonuses(state);
  const expected = 120 * BALANCE.TIME_BONUS_PER_SEC + BALANCE.LEVEL_CLEAR_BONUS;
  assert.equal(state.players[0].score, expected);
});

test('score multiplier doubles time + flat bonus', () => {
  const state = makeState();
  state.players[0].status.scoreMultiplier = 2;
  applyLevelClearBonuses(state);
  const expected = 2 * (120 * BALANCE.TIME_BONUS_PER_SEC + BALANCE.LEVEL_CLEAR_BONUS);
  assert.equal(state.players[0].score, expected);
});

test('time overrun floors time bonus at 0', () => {
  const state = makeState({ levelTimeMs: BALANCE.LEVEL_TIME_LIMIT_MS + 5000 });
  applyLevelClearBonuses(state);
  assert.equal(state.players[0].score, BALANCE.LEVEL_CLEAR_BONUS);
});

test('transition object set with proper endsMs and banner', () => {
  const state = makeState();
  applyLevelClearBonuses(state);
  assert.ok(state.transition);
  assert.equal(state.transition.endsMs, state.transition.startedMs + LEVEL_CLEAR_DURATION_MS);
  assert.equal(state.transition.bannerText, 'LEVEL CLEAR');
  assert.equal(isInLevelTransition(state), true);
});

test('tickLevelTransition returns true after full duration', () => {
  const state = makeState();
  applyLevelClearBonuses(state);
  assert.equal(tickLevelTransition(state, 1000), false);
  assert.equal(tickLevelTransition(state, 1000), true);
});

test('applyLevelClearBonuses is idempotent', () => {
  const state = makeState();
  applyLevelClearBonuses(state);
  const scoreAfterFirst = state.players[0].score;
  applyLevelClearBonuses(state);
  assert.equal(state.players[0].score, scoreAfterFirst);
});

test('prepareNextLevelLoad increments level id', () => {
  const state = makeState();
  applyLevelClearBonuses(state);
  const result = prepareNextLevelLoad(state);
  assert.equal(result.nextLevelId, '02');
  assert.equal(result.carry.players.length, 1);
  assert.equal(result.carry.players[0].id, 'p1');
});

test('prepareNextLevelLoad returns null on final level (48)', () => {
  const state = makeState({ level: { id: '48' } });
  applyLevelClearBonuses(state);
  const result = prepareNextLevelLoad(state);
  assert.equal(result.nextLevelId, null);
});

test('prepareNextLevelLoad advances past former-finale (36 → 37)', () => {
  const state = makeState({ level: { id: '36' } });
  applyLevelClearBonuses(state);
  const result = prepareNextLevelLoad(state);
  assert.equal(result.nextLevelId, '37');
});

test('prepareNextLevelLoad advances past prior-finale (42 → 43)', () => {
  const state = makeState({ level: { id: '42' } });
  applyLevelClearBonuses(state);
  const result = prepareNextLevelLoad(state);
  assert.equal(result.nextLevelId, '43');
});

test('dead players skipped from bonus award', () => {
  const state = makeState();
  state.players.push(makePlayer({ id: 'p2', alive: false, lives: 0, score: 500 }));
  applyLevelClearBonuses(state);
  assert.equal(state.players[1].score, 500);
});

test('multiplier cleared after award', () => {
  const state = makeState();
  state.players[0].status.scoreMultiplier = 3;
  applyLevelClearBonuses(state);
  assert.equal(state.players[0].status.scoreMultiplier, undefined);
});

test('time-freeze cleared at level clear', () => {
  const state = makeState({ timeFreezeUntilMs: 99999 });
  applyLevelClearBonuses(state);
  assert.equal(state.timeFreezeUntilMs, null);
});

test('co-op carry includes both alive players', () => {
  const state = makeState();
  state.players.push(makePlayer({ id: 'p2', lives: 2, score: 1234 }));
  applyLevelClearBonuses(state);
  const result = prepareNextLevelLoad(state);
  assert.equal(result.carry.players.length, 2);
  assert.deepEqual(
    result.carry.players.map((p) => p.id).sort(),
    ['p1', 'p2'],
  );
  const p2 = result.carry.players.find((p) => p.id === 'p2');
  assert.equal(p2.lives, 2);
  assert.ok(p2.score >= 1234);
});

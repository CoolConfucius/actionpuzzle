import { test } from 'node:test';
import assert from 'node:assert/strict';
import { awardScore, applyChainBonus, applyHurlTrainBonus, checkMilestoneLife } from '../engine/score.js';
import { BALANCE } from '../engine/constants.js';

function makeState() {
  const grid = [];
  for (let r = 0; r < 11; r++) {
    const row = [];
    for (let c = 0; c < 13; c++) {
      row.push({ object: null, hazard: null, windup: null });
    }
    grid.push(row);
  }
  return {
    grid,
    players: [{ id: 'p1', score: 0, lives: 5, status: {} }],
    eventQueue: [],
    scoreMilestoneCrossed: 0,
  };
}

test('awardScore credits player and emits a scorePopup', () => {
  const state = makeState();
  const credited = awardScore(state, 'p1', 100, 'enemy1Kill', { col: 3, row: 4 });
  assert.equal(credited, 100);
  assert.equal(state.players[0].score, 100);
  const popups = state.eventQueue.filter((e) => e.type === 'scorePopup');
  assert.equal(popups.length, 1);
  assert.equal(popups[0].points, 100);
  assert.equal(popups[0].label, '+100');
  assert.equal(popups[0].kind, 'enemy1Kill');
  assert.equal(popups[0].playerId, 'p1');
  assert.deepEqual(popups[0].cell, { col: 3, row: 4 });
});

test('awardScore multiplies credited points and label shows credited × multiplier', () => {
  const state = makeState();
  state.players[0].status.scoreMultiplier = 2;
  const credited = awardScore(state, 'p1', 100, 'enemy1Kill', null);
  assert.equal(credited, 200);
  assert.equal(state.players[0].score, 200);
  const popup = state.eventQueue.find((e) => e.type === 'scorePopup');
  assert.equal(popup.label, '+200 ×2');
  assert.equal(popup.points, 200);
});

test('applyChainBonus doubles per egg: 1000/2000/4000/8000 totaling 15000', () => {
  const state = makeState();
  const origin = { col: 5, row: 5 };
  const eggs = [
    { col: 5, row: 6 },
    { col: 7, row: 5 },
    { col: 5, row: 8 },
    { col: 9, row: 5 },
  ];
  const total = applyChainBonus(state, eggs, origin);
  assert.equal(total, 15000);
  assert.equal(state.players[0].score, 15000);
  const popups = state.eventQueue.filter((e) => e.type === 'scorePopup');
  assert.equal(popups.length, 4);
  assert.deepEqual(popups.map((p) => p.points), [1000, 2000, 4000, 8000]);
  assert.deepEqual(popups.map((p) => p.kind), ['eggChain', 'eggChain', 'eggChain', 'eggChain']);
});

test('chain bonus sorts by Chebyshev then row then col', () => {
  const state = makeState();
  const origin = { col: 5, row: 5 };
  const eggs = [
    { col: 7, row: 5 },
    { col: 6, row: 5 },
    { col: 5, row: 4 },
  ];
  applyChainBonus(state, eggs, origin);
  const popups = state.eventQueue.filter((e) => e.type === 'scorePopup');
  assert.deepEqual(popups[0].cell, { col: 5, row: 4 });
  assert.deepEqual(popups[1].cell, { col: 6, row: 5 });
  assert.deepEqual(popups[2].cell, { col: 7, row: 5 });
});

test('crossing one 50000 milestone grants a life and emits milestoneLife', () => {
  const state = makeState();
  state.players[0].score = 49900;
  awardScore(state, 'p1', 200, 'eggCrack', null);
  assert.equal(state.players[0].score, 50100);
  assert.equal(state.players[0].lives, 6);
  assert.equal(state.scoreMilestoneCrossed, 50000);
  const ml = state.eventQueue.filter((e) => e.type === 'milestoneLife');
  assert.equal(ml.length, 1);
  assert.equal(ml[0].playerId, 'p1');
  assert.equal(ml[0].newLives, 6);
});

test('jump from 49500 to 100100 grants 2 lives per M1 multi-crossing', () => {
  const state = makeState();
  state.players[0].score = 49500;
  awardScore(state, 'p1', 50600, 'big', null);
  assert.equal(state.players[0].score, 100100);
  assert.equal(state.players[0].lives, 7);
  assert.equal(state.scoreMilestoneCrossed, 100000);
  assert.equal(state.eventQueue.filter((e) => e.type === 'milestoneLife').length, 2);
});

test('jump from 0 to 150100 grants 3 lives', () => {
  const state = makeState();
  awardScore(state, 'p1', 150100, 'big', null);
  assert.equal(state.players[0].score, 150100);
  assert.equal(state.players[0].lives, 8);
  assert.equal(state.scoreMilestoneCrossed, 150000);
  assert.equal(state.eventQueue.filter((e) => e.type === 'milestoneLife').length, 3);
});

test('zero points is a no-op (no score, no popup, no milestone)', () => {
  const state = makeState();
  const credited = awardScore(state, 'p1', 0, 'noop', null);
  assert.equal(credited, 0);
  assert.equal(state.players[0].score, 0);
  assert.equal(state.eventQueue.length, 0);
});

test('negative points throws', () => {
  const state = makeState();
  assert.throws(() => awardScore(state, 'p1', -1, 'x', null));
});

test('unknown player throws', () => {
  const state = makeState();
  assert.throws(() => awardScore(state, 'p2', 100, 'x', null), /player not found/);
});

test('applyChainBonus with empty array is a no-op', () => {
  const state = makeState();
  const total = applyChainBonus(state, [], { col: 0, row: 0 });
  assert.equal(total, 0);
  assert.equal(state.players[0].score, 0);
  assert.equal(state.eventQueue.length, 0);
});

test('applyChainBonus with a single egg awards 1000', () => {
  const state = makeState();
  const total = applyChainBonus(state, [{ col: 1, row: 1 }], { col: 0, row: 0 });
  assert.equal(total, 1000);
  const popups = state.eventQueue.filter((e) => e.type === 'scorePopup');
  assert.equal(popups.length, 1);
  assert.equal(popups[0].points, 1000);
  assert.equal(popups[0].label, '+1000');
  assert.equal(popups[0].kind, 'eggChain');
});

test('chain mid-flight crosses a milestone', () => {
  const state = makeState();
  state.players[0].score = 49500;
  const origin = { col: 5, row: 5 };
  const eggs = [
    { col: 5, row: 6 },
    { col: 7, row: 5 },
    { col: 5, row: 8 },
    { col: 9, row: 5 },
  ];
  // 1000 + 2000 + 4000 + 8000 = 15000 → final score 64500, crosses 50000.
  applyChainBonus(state, eggs, origin);
  assert.equal(state.players[0].score, 64500);
  assert.equal(state.players[0].lives, 6);
  assert.ok(state.eventQueue.filter((e) => e.type === 'milestoneLife').length >= 1);
});

test('checkMilestoneLife is idempotent below the next threshold', () => {
  const state = makeState();
  state.players[0].score = 49999;
  const first = checkMilestoneLife(state, 'p1');
  const second = checkMilestoneLife(state, 'p1');
  assert.equal(first, 0);
  assert.equal(second, 0);
  assert.equal(state.players[0].lives, 5);
  assert.equal(state.eventQueue.filter((e) => e.type === 'milestoneLife').length, 0);
});

test('multiplier applies per chain step independently', () => {
  const state = makeState();
  state.players[0].status.scoreMultiplier = 2;
  const origin = { col: 5, row: 5 };
  const eggs = [
    { col: 5, row: 6 },
    { col: 7, row: 5 },
    { col: 5, row: 8 },
  ];
  applyChainBonus(state, eggs, origin);
  // Base 1000/2000/4000 × 2 = 2000/4000/8000 → 14000.
  assert.equal(state.players[0].score, 14000);
  const popups = state.eventQueue.filter((e) => e.type === 'scorePopup');
  assert.deepEqual(popups.map((p) => p.label), ['+2000 ×2', '+4000 ×2', '+8000 ×2']);
  assert.deepEqual(popups.map((p) => p.points), [2000, 4000, 8000]);
});

test('applyHurlTrainBonus: 3-rock pure train awards 50+100+200=350 and clears grid', () => {
  const state = makeState();
  state.grid[5][2].object = { type: 'rock', id: 1 };
  state.grid[5][3].object = { type: 'rock', id: 2 };
  state.grid[5][4].object = { type: 'rock', id: 3 };
  const stack = [
    { col: 2, row: 5, objectType: 'rock' },
    { col: 3, row: 5, objectType: 'rock' },
    { col: 4, row: 5, objectType: 'rock' },
  ];
  const total = applyHurlTrainBonus(state, stack, 'p1');
  assert.equal(total, 350);
  assert.equal(state.players[0].score, 350);
  assert.equal(state.grid[5][2].object, null);
  assert.equal(state.grid[5][3].object, null);
  assert.equal(state.grid[5][4].object, null);
  const popups = state.eventQueue.filter((e) => e.type === 'scorePopup');
  assert.deepEqual(popups.map((p) => p.points), [50, 100, 200]);
  assert.deepEqual(popups.map((p) => p.kind), ['hurlTrain', 'hurlTrain', 'hurlTrain']);
  const destroys = state.eventQueue.filter((e) => e.type === 'objectDestroy');
  assert.equal(destroys.length, 3);
});

test('applyHurlTrainBonus: egg terminator uses SCORE_EGG_CRACK and stops schedule', () => {
  const state = makeState();
  state.grid[5][2].object = { type: 'rock', id: 1 };
  state.grid[5][3].object = { type: 'rock', id: 2 };
  state.grid[5][4].object = { type: 'egg', id: 3 };
  const stack = [
    { col: 2, row: 5, objectType: 'rock' },
    { col: 3, row: 5, objectType: 'rock' },
    { col: 4, row: 5, objectType: 'egg' },
  ];
  const total = applyHurlTrainBonus(state, stack, 'p1');
  assert.equal(total, 50 + 100 + BALANCE.SCORE_EGG_CRACK);
  const popups = state.eventQueue.filter((e) => e.type === 'scorePopup');
  assert.deepEqual(popups.map((p) => p.kind), ['hurlTrain', 'hurlTrain', 'eggCrack']);
  assert.deepEqual(popups.map((p) => p.points), [50, 100, BALANCE.SCORE_EGG_CRACK]);
  assert.equal(state.grid[5][4].object, null);
});

test('applyHurlTrainBonus: empty stack is a no-op', () => {
  const state = makeState();
  const total = applyHurlTrainBonus(state, [], 'p1');
  assert.equal(total, 0);
  assert.equal(state.players[0].score, 0);
  assert.equal(state.eventQueue.length, 0);
});

test('applyHurlTrainBonus respects active scoreMultiplier on each step', () => {
  const state = makeState();
  state.players[0].status.scoreMultiplier = 2;
  state.grid[5][2].object = { type: 'rock', id: 1 };
  state.grid[5][3].object = { type: 'rock', id: 2 };
  state.grid[5][4].object = { type: 'rock', id: 3 };
  const stack = [
    { col: 2, row: 5, objectType: 'rock' },
    { col: 3, row: 5, objectType: 'rock' },
    { col: 4, row: 5, objectType: 'rock' },
  ];
  applyHurlTrainBonus(state, stack, 'p1');
  assert.equal(state.players[0].score, 700);
  const popups = state.eventQueue.filter((e) => e.type === 'scorePopup');
  assert.deepEqual(popups.map((p) => p.label), ['+100 ×2', '+200 ×2', '+400 ×2']);
  assert.deepEqual(popups.map((p) => p.points), [100, 200, 400]);
});

test('applyHurlTrainBonus: 5-rock train caps point schedule at 800', () => {
  const state = makeState();
  for (let c = 2; c <= 6; c++) state.grid[5][c].object = { type: 'rock', id: c };
  const stack = [];
  for (let c = 2; c <= 6; c++) stack.push({ col: c, row: 5, objectType: 'rock' });
  const total = applyHurlTrainBonus(state, stack, 'p1');
  assert.equal(total, 1550);
  const popups = state.eventQueue.filter((e) => e.type === 'scorePopup');
  assert.deepEqual(popups.map((p) => p.points), [50, 100, 200, 400, 800]);
});

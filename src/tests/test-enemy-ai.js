import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  pickEnemyDirection,
  enemyAttemptStep,
  computeEnemyWeights,
} from '../engine/enemy-ai.js';
import {createGrid, setObject} from '../engine/grid.js';
import {mulberry32} from '../engine/rng.js';

function makeState({cols = 13, rows = 11, players = [], enemies = [], rng} = {}) {
  return {
    grid: createGrid({cols, rows}),
    players,
    enemies,
    rng: rng || mulberry32(42),
  };
}

function makeEnemy({
  id = 1,
  type = 'enemy2',
  col = 5,
  row = 5,
  dir = 'down',
  enteredFromDir = null,
} = {}) {
  return {
    id,
    type,
    pos: {col, row},
    dir,
    move: null,
    enteredFromDir,
    abilityCooldownUntilMs: 0,
    cast: null,
  };
}

test('uniform default weights when no players and no blockers', () => {
  const state = makeState({rng: mulberry32(123)});
  const enemy = makeEnemy({col: 6, row: 5});
  state.enemies = [enemy];
  const counts = {up: 0, down: 0, left: 0, right: 0};
  for (let i = 0; i < 4000; i++) {
    const dir = pickEnemyDirection(state, enemy);
    counts[dir]++;
  }
  for (const d of ['up', 'down', 'left', 'right']) {
    assert.ok(
      counts[d] > 850 && counts[d] < 1150,
      `${d} count ${counts[d]} outside 850..1150`,
    );
  }
});

test('anti-target bias adjusts horizontal weights only when row-aligned', () => {
  const state = makeState();
  state.players = [{id: 'p1', pos: {col: 5, row: 5}, alive: true}];
  const enemy = makeEnemy({col: 4, row: 5});
  const w = computeEnemyWeights(state, enemy);
  assert.equal(w.right, 15);
  assert.equal(w.left, 35);
  assert.equal(w.up, 25);
  assert.equal(w.down, 25);
});

test('p1 wins nearest-player ties at equal manhattan distance', () => {
  const state = makeState();
  state.players = [
    {id: 'p1', pos: {col: 5, row: 5}, alive: true},
    {id: 'p2', pos: {col: 3, row: 5}, alive: true},
  ];
  const enemy = makeEnemy({col: 4, row: 5});
  const w = computeEnemyWeights(state, enemy);
  assert.equal(w.right, 15);
  assert.equal(w.left, 35);
});

test('anti-reverse halves the entered-from direction weight', () => {
  const state = makeState();
  const enemy = makeEnemy({col: 5, row: 5, enteredFromDir: 'left'});
  const w = computeEnemyWeights(state, enemy);
  assert.equal(w.left, 12.5);
  assert.equal(w.right, 25);
  assert.equal(w.up, 25);
  assert.equal(w.down, 25);
});

test('anti-clobber returns the only open direction; null when all blocked', () => {
  const state = makeState({rng: mulberry32(7)});
  const enemy = makeEnemy({col: 5, row: 5});
  state.enemies = [enemy];
  setObject(state.grid, 5, 4, {type: 'rock', id: 1});
  setObject(state.grid, 5, 6, {type: 'rock', id: 2});
  setObject(state.grid, 4, 5, {type: 'rock', id: 3});
  for (let i = 0; i < 200; i++) {
    assert.equal(pickEnemyDirection(state, enemy), 'right');
  }
  setObject(state.grid, 6, 5, {type: 'rock', id: 4});
  assert.equal(pickEnemyDirection(state, enemy), null);
});

test('enemyAttemptStep — E1 with object ahead returns destroy', () => {
  const state = makeState({rng: () => 0});
  const enemy = makeEnemy({type: 'enemy1', col: 5, row: 5});
  state.enemies = [enemy];
  setObject(state.grid, 5, 4, {type: 'rock', id: 1});
  const result = enemyAttemptStep(state, enemy);
  assert.equal(result.action, 'destroy');
  assert.equal(result.dir, 'up');
  assert.equal(enemy.move, null);
  assert.equal(enemy.dir, 'up');
});

test('enemyAttemptStep — E2 with object ahead returns hurl; empty cell returns move', () => {
  const stateA = makeState({rng: () => 0});
  const enemyA = makeEnemy({type: 'enemy2', col: 5, row: 5});
  stateA.enemies = [enemyA];
  setObject(stateA.grid, 5, 4, {type: 'rock', id: 1});
  const hurlResult = enemyAttemptStep(stateA, enemyA);
  assert.equal(hurlResult.action, 'hurl');
  assert.equal(hurlResult.dir, 'up');
  assert.equal(enemyA.move, null);

  const stateB = makeState({rng: () => 0});
  const enemyB = makeEnemy({type: 'enemy2', col: 5, row: 5});
  stateB.enemies = [enemyB];
  const moveResult = enemyAttemptStep(stateB, enemyB);
  assert.equal(moveResult.action, 'move');
  assert.equal(moveResult.dir, 'up');
  assert.deepEqual(enemyB.move.from, {col: 5, row: 5});
  assert.deepEqual(enemyB.move.to, {col: 5, row: 4});
  assert.equal(enemyB.move.t, 0);
  assert.equal(enemyB.dir, 'up');
});

test('enemyAttemptStep — corner with two enemy neighbors returns stay', () => {
  const state = makeState({rng: mulberry32(99)});
  const enemy = makeEnemy({id: 1, type: 'enemy2', col: 0, row: 0});
  const blocker1 = makeEnemy({id: 2, type: 'enemy2', col: 1, row: 0});
  const blocker2 = makeEnemy({id: 3, type: 'enemy2', col: 0, row: 1});
  state.enemies = [enemy, blocker1, blocker2];
  const result = enemyAttemptStep(state, enemy);
  assert.equal(result.action, 'stay');
  assert.equal(result.dir, null);
  assert.equal(enemy.move, null);
});

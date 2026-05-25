import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadLevel, hashLevelId, loadLevelByIdWithVariant } from '../engine/level-loader.js';
import { BALANCE } from '../engine/constants.js';

function minimalLevel(overrides = {}) {
  return {
    id: '01',
    world: 1,
    title: 'Test',
    dims: { cols: BALANCE.GRID_COLS, rows: BALANCE.GRID_ROWS },
    playerSpawns: [
      { col: 1, row: 1, dir: 'down' },
      { col: 11, row: 9, dir: 'up' },
    ],
    objects: [],
    eggCount: 0,
    enemyBudget: {},
    enemyCap: 1,
    winConditions: ['allEnemiesDefeated'],
    ...overrides,
  };
}

test('loadLevel hydrates dims and centers single-player spawn', () => {
  const state = loadLevel(minimalLevel(), 0);
  assert.equal(state.level.dims.cols, BALANCE.GRID_COLS);
  // Single-player ignores playerSpawns[0] and spawns P1 at the grid center.
  assert.equal(state.players[0].pos.col, Math.floor(BALANCE.GRID_COLS / 2));
  assert.equal(state.players[0].pos.row, Math.floor(BALANCE.GRID_ROWS / 2));
  assert.equal(state.players[0].dir, 'down');
});

test('loadLevel coop mode positions players at left/right quarter, p2 alive', () => {
  const state = loadLevel(minimalLevel(), 0, { mode: 'coop' });
  const cols = BALANCE.GRID_COLS;
  const rows = BALANCE.GRID_ROWS;
  assert.equal(state.players[0].pos.col, Math.floor(cols / 4));
  assert.equal(state.players[0].pos.row, Math.floor(rows / 2));
  assert.equal(state.players[0].dir, 'right');
  assert.equal(state.players[1].pos.col, Math.floor((3 * cols) / 4));
  assert.equal(state.players[1].pos.row, Math.floor(rows / 2));
  assert.equal(state.players[1].dir, 'left');
  assert.equal(state.players[1].alive, true);
});

test('loadLevel solo mode keeps p2 inactive', () => {
  const state = loadLevel(minimalLevel(), 0, { mode: 'arcade' });
  assert.equal(state.players[1].alive, false);
});

test('loadLevel coop mode smart-finds nearest empty cell when formula spot is blocked', () => {
  const cols = BALANCE.GRID_COLS;
  const rows = BALANCE.GRID_ROWS;
  const leftQ = Math.floor(cols / 4);
  const vmid = Math.floor(rows / 2);
  const state = loadLevel(minimalLevel({
    objects: [{ type: 'rock', col: leftQ, row: vmid }],
  }), 0, { mode: 'coop' });
  // p1 should land on an adjacent empty cell, not on the rock
  const p1 = state.players[0];
  assert.ok(!(p1.pos.col === leftQ && p1.pos.row === vmid),
    'p1 should not be on the rock cell');
});

test('loadLevel places eggs up to rock count', () => {
  const json = minimalLevel({
    objects: [
      { type: 'rock', col: 2, row: 2 },
      { type: 'rock', col: 3, row: 2 },
      { type: 'rock', col: 4, row: 2 },
    ],
    eggCount: 2,
  });
  const state = loadLevel(json, 0);
  let eggs = 0;
  for (const row of state.grid) {
    for (const cell of row) {
      if (cell.object && cell.object.type === 'egg') eggs++;
    }
  }
  assert.equal(eggs, 2);
});

test('loadLevel caps eggCount at rock count', () => {
  const json = minimalLevel({
    objects: [{ type: 'rock', col: 2, row: 2 }],
    eggCount: 5,
  });
  const state = loadLevel(json, 0);
  let eggs = 0;
  for (const row of state.grid) {
    for (const cell of row) {
      if (cell.object && cell.object.type === 'egg') eggs++;
    }
  }
  assert.equal(eggs, 1);
});

test('hashLevelId is deterministic', () => {
  assert.equal(hashLevelId('01'), hashLevelId('01'));
  assert.notEqual(hashLevelId('01'), hashLevelId('02'));
});

test('loadLevel applies options.skin to player 1 character', () => {
  const state = loadLevel(minimalLevel(), 0, { skin: 'wolf' });
  assert.equal(state.players[0].character, 'wolf');
});

test('loadLevel defaults P1 character to theodore when options omitted', () => {
  const state = loadLevel(minimalLevel(), 0);
  assert.equal(state.players[0].character, 'bear');
});

test('loadLevel defaults P2 character to theodora regardless of P1 skin', () => {
  const state = loadLevel(minimalLevel({ coop: true }), 0, { skin: 'lion' });
  assert.equal(state.players[0].character, 'lion');
  assert.equal(state.players[1].character, 'bear');
});

test('loadLevel ignores invalid skin id and falls back to default', () => {
  const state = loadLevel(minimalLevel(), 0, { skin: 'dragon' });
  assert.equal(state.players[0].character, 'bear');
});

test('loadLevel does not reference localStorage', () => {
  const prev = globalThis.localStorage;
  delete globalThis.localStorage;
  try {
    const state = loadLevel(minimalLevel(), 0, { skin: 'wolf' });
    assert.equal(state.players[0].character, 'wolf');
  } finally {
    if (prev !== undefined) globalThis.localStorage = prev;
  }
});

function makeStub(responses) {
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    const entry = responses[url];
    if (entry === undefined) {
      throw new Error(`unexpected url: ${url}`);
    }
    if (typeof entry === 'function') return entry(url);
    return entry;
  };
  return { fetchFn, calls };
}

test('loadLevelByIdWithVariant solo mode fetches solo url only', async () => {
  const solo = { id: '01', kind: 'solo' };
  const { fetchFn, calls } = makeStub({
    'data/levels/01.json': { ok: true, status: 200, json: async () => solo },
  });
  const result = await loadLevelByIdWithVariant('01', { mode: 'solo' }, 'data/levels', fetchFn);
  assert.equal(calls.length, 1);
  assert.equal(calls[0], 'data/levels/01.json');
  assert.deepEqual(result, solo);
});

test('loadLevelByIdWithVariant coop returns coop variant when present', async () => {
  const coop = { id: '01', kind: 'coop' };
  const { fetchFn, calls } = makeStub({
    'data/levels/01-coop.json': { ok: true, status: 200, json: async () => coop },
  });
  const result = await loadLevelByIdWithVariant('01', { mode: 'coop' }, 'data/levels', fetchFn);
  assert.deepEqual(result, coop);
  assert.equal(calls.length, 1);
  assert.equal(calls[0], 'data/levels/01-coop.json');
});

test('loadLevelByIdWithVariant coop 404 falls back to solo', async () => {
  const solo = { id: '01', kind: 'solo' };
  const { fetchFn, calls } = makeStub({
    'data/levels/01-coop.json': { ok: false, status: 404, json: async () => ({}) },
    'data/levels/01.json': { ok: true, status: 200, json: async () => solo },
  });
  const result = await loadLevelByIdWithVariant('01', { mode: 'coop' }, 'data/levels', fetchFn);
  assert.deepEqual(result, solo);
  assert.deepEqual(calls, ['data/levels/01-coop.json', 'data/levels/01.json']);
});

test('loadLevelByIdWithVariant coop throw falls back to solo', async () => {
  const solo = { id: '02', kind: 'solo' };
  const { fetchFn } = makeStub({
    'data/levels/02-coop.json': () => { throw new Error('network down'); },
    'data/levels/02.json': { ok: true, status: 200, json: async () => solo },
  });
  const result = await loadLevelByIdWithVariant('02', { mode: 'coop' }, 'data/levels', fetchFn);
  assert.deepEqual(result, solo);
});

test('loadLevelByIdWithVariant rejects when solo also 404s', async () => {
  const { fetchFn } = makeStub({
    'data/levels/03-coop.json': { ok: false, status: 404, json: async () => ({}) },
    'data/levels/03.json': { ok: false, status: 404, json: async () => ({}) },
  });
  await assert.rejects(
    () => loadLevelByIdWithVariant('03', { mode: 'coop' }, 'data/levels', fetchFn),
    (err) => {
      const msg = String(err.message);
      assert.ok(msg.includes('03'), 'message includes id');
      assert.ok(msg.includes('data/levels/03.json'), 'message includes url');
      assert.ok(msg.includes('404'), 'message includes status');
      return true;
    },
  );
});

test('loadLevelByIdWithVariant treats null runState as solo', async () => {
  const solo = { id: '01', kind: 'solo' };
  const { fetchFn, calls } = makeStub({
    'data/levels/01.json': { ok: true, status: 200, json: async () => solo },
  });
  const result = await loadLevelByIdWithVariant('01', null, 'data/levels', fetchFn);
  assert.deepEqual(result, solo);
  assert.deepEqual(calls, ['data/levels/01.json']);
});

test('loadLevelByIdWithVariant treats missing mode field as solo', async () => {
  const solo = { id: '01', kind: 'solo' };
  const { fetchFn, calls } = makeStub({
    'data/levels/01.json': { ok: true, status: 200, json: async () => solo },
  });
  const result = await loadLevelByIdWithVariant('01', {}, 'data/levels', fetchFn);
  assert.deepEqual(result, solo);
  assert.deepEqual(calls, ['data/levels/01.json']);
});

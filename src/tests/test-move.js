import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMoveCommand, tickPlayerMovement } from '../engine/move.js';
import { createGrid } from '../engine/grid.js';

function makePlayer(overrides = {}) {
  return Object.assign({
    id: 'p1',
    pos: { col: 1, row: 1 },
    dir: 'down',
    move: null,
    speedStacks: 0,
    lives: 5,
    score: 0,
    status: {},
    commandQueue: [],
    alive: true,
  }, overrides);
}

function makeState({ speedStacks = 0, objects = [], hazards = [], playerOverrides = {} } = {}) {
  const grid = createGrid({ cols: 13, rows: 11 });
  for (const o of objects) {
    grid[o.row][o.col].object = { type: o.type || 'rock', id: o.id != null ? o.id : 1 };
  }
  for (const h of hazards) {
    grid[h.row][h.col].hazard = {
      type: h.type || 'slow-trap',
      sourceEnemyId: 0,
      expiresMs: 9999,
    };
  }
  const baseOverrides = Object.assign({ speedStacks }, playerOverrides);
  return {
    grid,
    players: [makePlayer(baseOverrides)],
    commandQueue: [],
    eventQueue: [],
  };
}

test('applyMoveCommand starts a 1-cell traversal toward a free cell', () => {
  const state = makeState();
  applyMoveCommand(state, 'p1', 'right');
  const p = state.players[0];
  assert.equal(p.dir, 'right');
  assert.notEqual(p.move, null);
  assert.deepEqual(p.move.from, { col: 1, row: 1 });
  assert.deepEqual(p.move.to, { col: 2, row: 1 });
  assert.equal(p.move.t, 0);
  // 330 ms at base speed 3.0 → t ≈ 0.99 (no snap yet)
  tickPlayerMovement(state, 330);
  assert.notEqual(p.move, null);
  assert.ok(p.move.t > 0.98 && p.move.t < 1, `t=${p.move.t}`);
});

test('move into out-of-bounds turns in place without starting a move', () => {
  const state = makeState({ playerOverrides: { pos: { col: 0, row: 0 } } });
  applyMoveCommand(state, 'p1', 'left');
  const p = state.players[0];
  assert.equal(p.dir, 'left');
  assert.equal(p.move, null);
  assert.equal(p.commandQueue.length, 0);
});

test('move into a cell containing an object turns in place without starting a move', () => {
  const state = makeState({ objects: [{ col: 2, row: 1 }] });
  applyMoveCommand(state, 'p1', 'right');
  const p = state.players[0];
  assert.equal(p.dir, 'right');
  assert.equal(p.move, null);
});

test('slow trap (hazard layer) is enterable; movement starts normally', () => {
  const state = makeState({ hazards: [{ col: 2, row: 1, type: 'slow-trap' }] });
  applyMoveCommand(state, 'p1', 'right');
  const p = state.players[0];
  assert.notEqual(p.move, null);
  assert.deepEqual(p.move.to, { col: 2, row: 1 });
});

test('mid-traversal command buffers (depth 1), updates dir, drops overflow, fires on snap', () => {
  const state = makeState();
  applyMoveCommand(state, 'p1', 'right');
  tickPlayerMovement(state, 100); // t ≈ 0.3
  applyMoveCommand(state, 'p1', 'down');
  const p = state.players[0];
  assert.equal(p.dir, 'down', 'dir updates immediately on buffer');
  assert.equal(p.commandQueue.length, 1);
  // Overflow: a second buffer attempt drops silently
  applyMoveCommand(state, 'p1', 'up');
  assert.equal(p.commandQueue.length, 1);
  // Snap and fire buffered
  tickPlayerMovement(state, 300);
  assert.deepEqual(p.pos, { col: 2, row: 1 });
  assert.notEqual(p.move, null);
  assert.deepEqual(p.move.to, { col: 2, row: 2 });
  assert.equal(p.commandQueue.length, 0);
});

test('buffered command drops cleanly if its target became blocked before snap', () => {
  const state = makeState();
  applyMoveCommand(state, 'p1', 'right');
  tickPlayerMovement(state, 100);
  applyMoveCommand(state, 'p1', 'down');
  // Block the buffered target before snap
  state.grid[2][2].object = { type: 'rock', id: 99 };
  tickPlayerMovement(state, 300);
  const p = state.players[0];
  assert.deepEqual(p.pos, { col: 2, row: 1 });
  assert.equal(p.dir, 'down');
  assert.equal(p.move, null);
  assert.equal(p.commandQueue.length, 0);
});

test('move command mid-traversal does not cancel the current traversal', () => {
  const state = makeState();
  applyMoveCommand(state, 'p1', 'right');
  tickPlayerMovement(state, 100);
  const p = state.players[0];
  const moveRef = p.move;
  applyMoveCommand(state, 'p1', 'down');
  assert.equal(p.move, moveRef, 'move reference unchanged');
  assert.deepEqual(p.move.from, { col: 1, row: 1 });
  assert.deepEqual(p.move.to, { col: 2, row: 1 });
  assert.ok(p.move.t > 0 && p.move.t < 1, `t=${p.move.t}`);
});

test('speedStacks raises effective speed and clamps at FRIED_EGG_SPEED_CAP', () => {
  // stacks=5 → 3.0 + 2.5 = 5.5, clamped to 5.0; 200 ms * 5.0 / 1000 = 1.0 → snap
  const stateA = makeState({ speedStacks: 5 });
  applyMoveCommand(stateA, 'p1', 'right');
  tickPlayerMovement(stateA, 200);
  const pA = stateA.players[0];
  assert.equal(pA.move, null);
  assert.deepEqual(pA.pos, { col: 2, row: 1 });

  // 199 ms * 5.0 / 1000 = 0.995 → no snap (would snap if uncapped at 5.5)
  const stateB = makeState({ speedStacks: 5 });
  applyMoveCommand(stateB, 'p1', 'right');
  tickPlayerMovement(stateB, 199);
  const pB = stateB.players[0];
  assert.notEqual(pB.move, null);
  assert.ok(pB.move.t < 1, `t=${pB.move.t}`);
});

test('large dtMs snaps and does not advance into a second cell', () => {
  const state = makeState();
  applyMoveCommand(state, 'p1', 'right');
  tickPlayerMovement(state, 5000);
  const p = state.players[0];
  assert.deepEqual(p.pos, { col: 2, row: 1 });
  assert.equal(p.move, null);
  assert.equal(p.commandQueue.length, 0);
});

test('dead player is skipped by tickPlayerMovement and applyMoveCommand', () => {
  const state = makeState({ playerOverrides: { alive: false } });
  applyMoveCommand(state, 'p1', 'right');
  tickPlayerMovement(state, 1000);
  const p = state.players[0];
  assert.equal(p.dir, 'down');
  assert.equal(p.move, null);
  assert.deepEqual(p.pos, { col: 1, row: 1 });
});

test('unknown playerId is a no-op', () => {
  const state = makeState();
  assert.doesNotThrow(() => applyMoveCommand(state, 'pX', 'right'));
  const p = state.players[0];
  assert.equal(p.dir, 'down');
  assert.equal(p.move, null);
});

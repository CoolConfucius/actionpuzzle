import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE, COLORS, GLYPHS, BINDINGS } from '../engine/constants.js';

test('grid dimensions match mechanics spec', () => {
  assert.equal(BALANCE.GRID_COLS, 19);
  assert.equal(BALANCE.GRID_ROWS, 13);
});

test('player and enemy 5 speeds match spec', () => {
  assert.equal(BALANCE.PLAYER_BASE_SPEED, 3.0);
  assert.equal(BALANCE.ENEMY_5_SPEED, 3.6);
});

test('score chain and milestone constants match spec', () => {
  assert.equal(BALANCE.SCORE_EGG_CHAIN_STEP, 100);
  assert.equal(BALANCE.SCORE_MILESTONE_LIFE, 50000);
});

test('world background colors match spec', () => {
  assert.equal(COLORS['world-1'], '#C8E6C8');
  assert.equal(COLORS['world-6'], '#444444');
});

test('enemy 1 color matches spec', () => {
  assert.equal(COLORS.enemy1, '#D03A3A');
});

test('enemy 1 glyph matches spec', () => {
  assert.equal(GLYPHS.enemy1, '▼');
});

test('player bindings use KeyboardEvent.code values', () => {
  assert.equal(BINDINGS.p1.up, 'KeyW');
  assert.equal(BINDINGS.p1.hurl, 'Space');
  assert.equal(BINDINGS.p2.hurl, 'Enter');
  assert.equal(BINDINGS.p2.destroy, 'ShiftRight');
});

test('shared pause binding is KeyP', () => {
  assert.equal(BINDINGS.shared.pause, 'KeyP');
});

test('trap slow multiplier yields slowed-player speed slower than E1', () => {
  assert.equal(BALANCE.TRAP_SLOW_MULTIPLIER, 0.35);
  const slowed = BALANCE.PLAYER_BASE_SPEED * BALANCE.TRAP_SLOW_MULTIPLIER;
  assert.ok(Math.abs(slowed - 1.05) < 1e-9);
  assert.ok(slowed < BALANCE.ENEMY_1_SPEED);
});

test('command-queue depth and long-hurl telegraph lead cells', () => {
  assert.equal(BALANCE.COMMAND_QUEUE_DEPTH, 1);
  assert.equal(BALANCE.LONG_HURL_TELEGRAPH_LEAD_CELLS, 3);
});

test('destroy bindings split left/right Shift', () => {
  assert.equal(BINDINGS.p1.destroy, 'ShiftLeft');
  assert.equal(BINDINGS.p2.destroy, 'ShiftRight');
});

test('glyph star reused by enemy3 and scorePlus', () => {
  assert.equal(GLYPHS.enemy3, '★');
  assert.equal(GLYPHS.scorePlus, '★');
  assert.ok(Object.prototype.hasOwnProperty.call(GLYPHS, 'enemy3'));
  assert.ok(Object.prototype.hasOwnProperty.call(GLYPHS, 'scorePlus'));
});

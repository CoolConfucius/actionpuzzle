import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPauseMenu,
  openPauseMenu,
  closePauseMenu,
  isPauseMenuOpen,
  navigatePauseMenu,
  selectedPauseMenuAction,
  PAUSE_MENU_OPTIONS,
} from '../render/pause-menu.js';

test('createPauseMenu starts closed at cursor 0', () => {
  const m = createPauseMenu();
  assert.equal(m.open, false);
  assert.equal(m.cursor, 0);
});

test('openPauseMenu opens and resets cursor', () => {
  const m = createPauseMenu();
  m.cursor = 2;
  openPauseMenu(m);
  assert.equal(m.open, true);
  assert.equal(m.cursor, 0);
});

test('closePauseMenu closes', () => {
  const m = createPauseMenu();
  openPauseMenu(m);
  closePauseMenu(m);
  assert.equal(m.open, false);
});

test('isPauseMenuOpen reflects state', () => {
  const m = createPauseMenu();
  assert.equal(isPauseMenuOpen(m), false);
  openPauseMenu(m);
  assert.equal(isPauseMenuOpen(m), true);
});

test('navigatePauseMenu wraps cursor in range [0, options.length)', () => {
  const m = createPauseMenu();
  openPauseMenu(m);
  navigatePauseMenu(m, 1);
  assert.equal(m.cursor, 1);
  navigatePauseMenu(m, -2);
  assert.equal(m.cursor, PAUSE_MENU_OPTIONS.length - 1);
});

test('navigatePauseMenu does nothing when menu closed', () => {
  const m = createPauseMenu();
  navigatePauseMenu(m, 1);
  assert.equal(m.cursor, 0);
});

test('selectedPauseMenuAction returns the cursor option', () => {
  const m = createPauseMenu();
  openPauseMenu(m);
  assert.equal(selectedPauseMenuAction(m), PAUSE_MENU_OPTIONS[0]);
  navigatePauseMenu(m, 2);
  assert.equal(selectedPauseMenuAction(m), PAUSE_MENU_OPTIONS[2]);
});

test('selectedPauseMenuAction returns null when closed', () => {
  const m = createPauseMenu();
  assert.equal(selectedPauseMenuAction(m), null);
});

test('PAUSE_MENU_OPTIONS includes resume, toggleSound, toggleMusic, returnHome', () => {
  assert.ok(PAUSE_MENU_OPTIONS.includes('resume'));
  assert.ok(PAUSE_MENU_OPTIONS.includes('toggleSound'));
  assert.ok(PAUSE_MENU_OPTIONS.includes('toggleMusic'));
  assert.ok(PAUSE_MENU_OPTIONS.includes('returnHome'));
});

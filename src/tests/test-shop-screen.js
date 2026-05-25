import test from 'node:test';
import assert from 'node:assert';
import {
  createShopState,
  openShop,
  closeShop,
  isShopOpen,
  navigateShop,
  selectedShopUpgrade,
  cycleShopCharacter,
} from '../render/shop-screen.js';
import { upgradesForCharacter } from '../engine/upgrade-defs.js';

test('shop: fresh state is closed at theodore cursor 0', () => {
  const s = createShopState();
  assert.equal(s.open, false);
  assert.equal(s.character, 'bear');
  assert.equal(s.cursor, 0);
});

test('shop: open / close', () => {
  const s = createShopState();
  openShop(s, 'wolf');
  assert.equal(isShopOpen(s), true);
  assert.equal(s.character, 'wolf');
  closeShop(s);
  assert.equal(isShopOpen(s), false);
});

test('shop: navigateShop wraps both directions', () => {
  const s = createShopState();
  openShop(s, 'bear');
  const n = upgradesForCharacter('bear').length;
  navigateShop(s, -1);
  assert.equal(s.cursor, n - 1);
  navigateShop(s, 1);
  assert.equal(s.cursor, 0);
});

test('shop: selectedShopUpgrade points at the current row', () => {
  const s = createShopState();
  openShop(s, 'bear');
  const u = selectedShopUpgrade(s);
  assert.equal(u.character, 'bear');
});

test('shop: selectedShopUpgrade is null when closed', () => {
  const s = createShopState();
  assert.equal(selectedShopUpgrade(s), null);
});

test('shop: cycleShopCharacter rotates characters', () => {
  const s = createShopState();
  openShop(s, 'bear');
  cycleShopCharacter(s, 1);
  assert.equal(s.character, 'wolf');
  cycleShopCharacter(s, -1);
  assert.equal(s.character, 'bear');
});

test('shop: cycleShopCharacter resets cursor', () => {
  const s = createShopState();
  openShop(s, 'bear');
  s.cursor = 2;
  cycleShopCharacter(s, 1);
  assert.equal(s.cursor, 0);
});

test('shop: navigate is no-op when closed', () => {
  const s = createShopState();
  navigateShop(s, 1);
  assert.equal(s.cursor, 0);
});

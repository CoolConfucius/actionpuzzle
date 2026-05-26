import test from 'node:test';
import assert from 'node:assert';
import {
  createItemShopState,
  openItemShop,
  closeItemShop,
  isItemShopOpen,
  selectedItem,
  navigateItemShop,
  cycleLane,
  setLane,
  itemShopKey,
  consumeItemShopAction,
} from '../render/item-shop-screen.js';
import { itemsInLane, LANES } from '../engine/item-defs.js';

test('itemShop: opens on defense lane with cursor 0', () => {
  const s = createItemShopState();
  openItemShop(s, {});
  assert.equal(s.lane, 'defense');
  assert.equal(s.cursor, 0);
});

test('itemShop: tab keys 1-5 switch lane', () => {
  const s = createItemShopState();
  openItemShop(s, {});
  itemShopKey(s, '2');
  assert.equal(s.lane, 'offense');
  itemShopKey(s, '3');
  assert.equal(s.lane, 'lives');
  itemShopKey(s, '4');
  assert.equal(s.lane, 'speed');
  itemShopKey(s, '5');
  assert.equal(s.lane, 'utility');
});

test('itemShop: Tab cycles lanes', () => {
  const s = createItemShopState();
  openItemShop(s, {});
  itemShopKey(s, 'Tab');
  assert.equal(s.lane, 'offense');
  itemShopKey(s, 'Tab');
  assert.equal(s.lane, 'lives');
});

test('itemShop: setLane sets lane explicitly', () => {
  const s = createItemShopState();
  openItemShop(s, {});
  setLane(s, 'speed');
  assert.equal(s.lane, 'speed');
});

test('itemShop: navigation wraps within the current lane', () => {
  const s = createItemShopState();
  openItemShop(s, {});
  const list = itemsInLane(s.lane);
  navigateItemShop(s, -1);
  assert.equal(s.cursor, list.length - 1);
  navigateItemShop(s, 1);
  assert.equal(s.cursor, 0);
});

test('itemShop: selectedItem follows cursor within the lane', () => {
  const s = createItemShopState();
  openItemShop(s, {});
  navigateItemShop(s, 1);
  const it = selectedItem(s);
  const list = itemsInLane(s.lane);
  assert.equal(it.id, list[1].id);
});

test('itemShop: ArrowDown moves cursor by 3 (row width) in normal lanes', () => {
  const s = createItemShopState();
  openItemShop(s, {});
  itemShopKey(s, 'ArrowDown');
  assert.equal(s.cursor, 3);
});

test('itemShop: utility lane wraps cleanly with one item', () => {
  const s = createItemShopState();
  openItemShop(s, {});
  setLane(s, 'utility');
  itemShopKey(s, 'ArrowRight');
  assert.equal(s.cursor, 0);
});

test('itemShop: Escape requests close', () => {
  const s = createItemShopState();
  openItemShop(s, {});
  itemShopKey(s, 'Escape');
  assert.equal(consumeItemShopAction(s), 'close');
});

test('itemShop: Enter returns a buy intent with the cursor item id', () => {
  const s = createItemShopState();
  openItemShop(s, {});
  const intent = itemShopKey(s, 'Enter');
  assert.ok(intent);
  assert.equal(intent.type, 'buy');
  const list = itemsInLane(s.lane);
  assert.equal(intent.itemId, list[0].id);
});

test('itemShop: LANES match definition order', () => {
  assert.deepEqual(LANES, ['defense', 'offense', 'lives', 'speed', 'utility']);
});

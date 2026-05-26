import test from 'node:test';
import assert from 'node:assert';
import {
  ownsItem,
  itemCount,
  grantItem,
  consumeItem,
  spendCoins,
  awardCoins,
} from '../engine/campaign.js';
import {
  ITEMS,
  LANES,
  itemsInLane,
  lookupItem,
  isPermanent,
  isConsumable,
  highestPermanentTier,
  highestConsumableTier,
} from '../engine/item-defs.js';

function makeCampaign() {
  return {
    coins: 0, lifetimeCoinsEarned: 0, xp: {}, lifetimeXpEarned: {},
    upgrades: {}, items: {}, inventory: {},
  };
}

test('items: catalog has 4 main lanes (3 consumable + 3 permanent tiers each) + utility', () => {
  assert.equal(ITEMS.length, 25);
  for (const lane of ['defense', 'offense', 'lives', 'speed']) {
    const items = itemsInLane(lane);
    assert.equal(items.length, 6, `${lane} should have 6 items`);
    const consumables = items.filter((it) => it.type === 'consumable');
    const permanents = items.filter((it) => it.type === 'permanent');
    assert.equal(consumables.length, 3);
    assert.equal(permanents.length, 3);
    const cTiers = consumables.map((it) => it.tier).sort();
    const pTiers = permanents.map((it) => it.tier).sort();
    assert.deepEqual(cTiers, [1, 2, 3]);
    assert.deepEqual(pTiers, [1, 2, 3]);
  }
  assert.equal(itemsInLane('utility').length, 1);
});

test('items: permanent ladders are prereq-chained', () => {
  const t1 = lookupItem('shieldRing1');
  const t2 = lookupItem('shieldRing2');
  const t3 = lookupItem('shieldRing3');
  assert.equal(t1.prereq, null);
  assert.equal(t2.prereq, 'shieldRing1');
  assert.equal(t3.prereq, 'shieldRing2');
});

test('items: highestPermanentTier reports highest in ladder', () => {
  const c = makeCampaign();
  assert.equal(highestPermanentTier(c, 'shieldRing'), 0);
  grantItem(c, 'shieldRing1');
  assert.equal(highestPermanentTier(c, 'shieldRing'), 1);
  grantItem(c, 'shieldRing2');
  assert.equal(highestPermanentTier(c, 'shieldRing'), 2);
  grantItem(c, 'shieldRing3');
  assert.equal(highestPermanentTier(c, 'shieldRing'), 3);
});

test('items: highestConsumableTier picks the highest tier with stack > 0', () => {
  const c = makeCampaign();
  c.items.shieldPotion1 = 3;
  c.items.shieldPotion3 = 1;
  const h = highestConsumableTier(c, 'shieldPotion');
  assert.equal(h.tier, 3);
  assert.equal(h.count, 1);
});

test('items: isPermanent / isConsumable per tier', () => {
  assert.equal(isPermanent('shieldRing2'), true);
  assert.equal(isPermanent('shieldPotion2'), false);
  assert.equal(isConsumable('shieldPotion3'), true);
  assert.equal(isConsumable('throwTelegraph'), false);
});

test('items: throwTelegraph is the utility item', () => {
  const it = lookupItem('throwTelegraph');
  assert.ok(it);
  assert.equal(it.type, 'permanent');
  assert.equal(it.lane, 'utility');
});

test('items: buy flow with coins (consumable tier 2)', () => {
  const c = makeCampaign();
  awardCoins(c, 2000);
  const v = lookupItem('shieldPotion2');
  assert.equal(spendCoins(c, v.cost), true);
  grantItem(c, v.id, { stackable: true, max: v.stackMax });
  assert.equal(itemCount(c, 'shieldPotion2'), 1);
});

test('items: consumeItem decrements stack', () => {
  const c = makeCampaign();
  for (let i = 0; i < 3; i++) grantItem(c, 'revivalPotion1', { stackable: true, max: 9 });
  assert.equal(itemCount(c, 'revivalPotion1'), 3);
  consumeItem(c, 'revivalPotion1');
  assert.equal(itemCount(c, 'revivalPotion1'), 2);
});

test('items: cost is monotonic within each ladder', () => {
  for (const baseId of ['shieldRing', 'swordRing', 'heartRing', 'swiftRing',
                        'shieldPotion', 'swordPotion', 'revivalPotion', 'hastePotion']) {
    const t1 = lookupItem(`${baseId}1`).cost;
    const t2 = lookupItem(`${baseId}2`).cost;
    const t3 = lookupItem(`${baseId}3`).cost;
    assert.ok(t1 < t2 && t2 < t3, `${baseId} costs should ascend: ${t1} < ${t2} < ${t3}`);
  }
});

test('items: insufficient coins blocks buy', () => {
  const c = makeCampaign();
  awardCoins(c, 100);
  const t = lookupItem('shieldRing1');
  assert.equal(spendCoins(c, t.cost), false);
  assert.equal(ownsItem(c, 'shieldRing1'), false);
});

test('items: LANES order is stable', () => {
  assert.deepEqual(LANES, ['defense', 'offense', 'lives', 'speed', 'utility']);
});

test('items: labels follow Potion/Ring naming convention', () => {
  for (const baseId of ['shieldPotion', 'swordPotion', 'revivalPotion', 'hastePotion']) {
    const it = lookupItem(`${baseId}1`);
    assert.ok(/Potion/i.test(it.label), `${baseId}1 label "${it.label}" should contain "Potion"`);
  }
  for (const baseId of ['shieldRing', 'swordRing', 'heartRing', 'swiftRing']) {
    const it = lookupItem(`${baseId}1`);
    assert.ok(/Ring/i.test(it.label), `${baseId}1 label "${it.label}" should contain "Ring"`);
  }
});

// Integration: prove the full pipeline (level kill → coin/XP award → spend XP
// for skill → buy items → reload level with effects applied) works end-to-end.
import test from 'node:test';
import assert from 'node:assert';
import { loadLevel } from '../engine/level-loader.js';
import {
  awardCoinsForEnemyKills,
  awardXpForScoreEvents,
  spendXp,
  spendCoins,
  grantUpgrade,
  grantItem,
  ownsUpgrade,
  ownsItem,
  itemCount,
  getXp,
  getCoins,
} from '../engine/campaign.js';
import { lookupUpgrade } from '../engine/upgrade-defs.js';
import { lookupItem } from '../engine/item-defs.js';
import { awardScore } from '../engine/score.js';
import { BALANCE } from '../engine/constants.js';

const STUB_LEVEL = (id) => ({
  id,
  world: 1,
  title: `Stub ${id}`,
  dims: { cols: BALANCE.GRID_COLS, rows: BALANCE.GRID_ROWS },
  timeLimitMs: 60000,
  objects: [],
  enemySpawns: [],
  enemyBudget: { enemy1: 1 },
  enemyCap: 1,
  playerSpawns: [{ col: 1, row: 1, dir: 'down' }],
});

function makeCampaign() {
  return {
    coins: 0, lifetimeCoinsEarned: 0, xp: {}, lifetimeXpEarned: {},
    upgrades: {}, items: {}, inventory: {},
  };
}

test('pipeline: score → XP, kills → coins, in any mode (not tutorial/daily)', () => {
  const campaign = makeCampaign();
  const state = loadLevel(STUB_LEVEL('01'), 7, { mode: 'arcade', skin: 'bear' });
  const p = state.players[0];

  awardScore(state, p.id, 500, 'enemyKill', { col: 0, row: 0 });
  state.eventQueue.push({ type: 'enemyDefeated', enemyType: 'enemy5' });

  const xp = awardXpForScoreEvents(campaign, state.eventQueue, { p1: 'bear' });
  const coins = awardCoinsForEnemyKills(campaign, state.eventQueue);
  assert.equal(xp, 100); // 500 * 0.2
  assert.equal(coins, 100);
});

test('pipeline: spend XP to buy a skill', () => {
  const campaign = makeCampaign();
  campaign.xp.bear = 500;
  const u = lookupUpgrade('persistentSpeed1');
  assert.equal(spendXp(campaign, 'bear', u.cost), true);
  grantUpgrade(campaign, 'bear', u.id);
  assert.equal(ownsUpgrade(campaign, 'bear', 'persistentSpeed1'), true);
});

test('pipeline: Heart Ring grants tiered +lives at load', () => {
  const c = makeCampaign();
  grantItem(c, 'heartRing1');
  grantItem(c, 'heartRing2'); // requires t1
  const s = loadLevel(STUB_LEVEL('01'), 1, { mode: 'campaign', skin: 'bear', items: { ...c.items } });
  // T2 = +2 lives.
  assert.equal(s.players[0].lives, BALANCE.LIFE_STOCKS_INITIAL + 2);
});

test('pipeline: Shield Ring tier 3 = 3-hit shield budget', () => {
  const c = makeCampaign();
  grantItem(c, 'shieldRing1');
  grantItem(c, 'shieldRing2');
  grantItem(c, 'shieldRing3');
  const s = loadLevel(STUB_LEVEL('01'), 1, { mode: 'campaign', skin: 'bear', items: { ...c.items } });
  assert.equal(s.players[0].shieldBudget, 3);
});

test('pipeline: Shield Potion consumable adds to permanent budget', () => {
  const c = makeCampaign();
  grantItem(c, 'shieldRing1');               // +1 permanent
  c.items.shieldPotion2 = 1;                       // +2 consumable
  const s = loadLevel(STUB_LEVEL('01'), 1, { mode: 'campaign', skin: 'bear', items: { ...c.items } });
  // Total budget = perm tier (1) + consumable tier (2) = 3.
  assert.equal(s.players[0].shieldBudget, 3);
});

test('pipeline: Sword Ring tier 2 = 2 sword charges', () => {
  const c = makeCampaign();
  grantItem(c, 'swordRing1');
  grantItem(c, 'swordRing2');
  const s = loadLevel(STUB_LEVEL('01'), 1, { mode: 'campaign', skin: 'bear', items: { ...c.items } });
  assert.equal(s.players[0].swordCharges, 2);
});

test('pipeline: Revival Potion grants reviveBudget', () => {
  const c = makeCampaign();
  c.items.revivalPotion3 = 1;
  const s = loadLevel(STUB_LEVEL('01'), 1, { mode: 'campaign', skin: 'bear', items: { ...c.items } });
  assert.equal(s.players[0].reviveBudget, 3);
});

test('pipeline: speed items stack with Bear Fast Start ability', () => {
  const c = makeCampaign();
  // Bear's Fast Start I → +1 speed at spawn.
  c.upgrades = { bear: { fastStart1: true } };
  // Haste Potion tier 2 → +2 speed.
  c.items.hastePotion2 = 1;
  // Swift Ring tier 1 → +1 speed.
  grantItem(c, 'swiftRing1');
  const s = loadLevel(STUB_LEVEL('01'), 1, {
    mode: 'campaign', skin: 'bear',
    campaignUpgrades: c.upgrades,
    items: { ...c.items },
  });
  // 1 (Fast Start) + 2 (Haste Potion T2) + 1 (Swift Ring T1) = 4.
  assert.equal(s.players[0].speedStacks, 4);
});

test('pipeline: throwTelegraph propagates to player', () => {
  const c = makeCampaign();
  grantItem(c, 'throwTelegraph');
  const s = loadLevel(STUB_LEVEL('01'), 1, { mode: 'campaign', skin: 'bear', items: { ...c.items } });
  assert.equal(s.players[0].items.throwTelegraph, true);
});

test('pipeline: _consumedConsumables lists burned charges', () => {
  const c = makeCampaign();
  c.items.shieldPotion2 = 2;
  c.items.revivalPotion1 = 3;
  const itemsForLoad = { ...c.items };
  loadLevel(STUB_LEVEL('01'), 1, { mode: 'campaign', skin: 'bear', items: itemsForLoad });
  // One of each consumable lane gets burned at spawn.
  assert.ok(itemsForLoad._consumedConsumables.includes('shieldPotion2'));
  assert.ok(itemsForLoad._consumedConsumables.includes('revivalPotion1'));
});

test('pipeline: tutorial mode skips item effects', () => {
  const c = makeCampaign();
  grantItem(c, 'shieldRing3');
  grantItem(c, 'heartRing3');
  const s = loadLevel(STUB_LEVEL('01'), 1, { mode: 'tutorial', skin: 'bear', items: { ...c.items } });
  // No shield budget, no extra lives in tutorial.
  assert.equal(s.players[0].shieldBudget || 0, 0);
  assert.equal(s.players[0].lives, BALANCE.LIFE_STOCKS_INITIAL);
});

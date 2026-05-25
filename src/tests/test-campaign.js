import test from 'node:test';
import assert from 'node:assert';
import {
  readCampaign,
  writeCampaign,
  awardCoins,
  spendCoins,
  awardCoinsForEnemyKills,
  awardCoinsForLevelClear,
  ownsUpgrade,
  grantUpgrade,
  getCoins,
  resetCampaign,
} from '../engine/campaign.js';

function makeStore() {
  const data = {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    _data: data,
  };
}

test('campaign: empty store yields defaults', () => {
  const c = readCampaign(makeStore());
  assert.equal(c.coins, 0);
  assert.equal(c.lifetimeCoinsEarned, 0);
  assert.deepEqual(c.upgrades, {});
  assert.deepEqual(c.inventory, {});
});

test('campaign: writeCampaign + readCampaign round-trip', () => {
  const s = makeStore();
  const c = readCampaign(s);
  c.coins = 500;
  writeCampaign(c, s);
  const re = readCampaign(s);
  assert.equal(re.coins, 500);
});

test('campaign: awardCoins increases both balances', () => {
  const c = readCampaign(makeStore());
  awardCoins(c, 100);
  awardCoins(c, 50);
  assert.equal(c.coins, 150);
  assert.equal(c.lifetimeCoinsEarned, 150);
});

test('campaign: awardCoins ignores zero, negative, NaN', () => {
  const c = readCampaign(makeStore());
  awardCoins(c, 0);
  awardCoins(c, -10);
  awardCoins(c, NaN);
  assert.equal(c.coins, 0);
});

test('campaign: spendCoins succeeds when funds present', () => {
  const c = readCampaign(makeStore());
  awardCoins(c, 200);
  assert.equal(spendCoins(c, 150), true);
  assert.equal(c.coins, 50);
  // lifetime stays
  assert.equal(c.lifetimeCoinsEarned, 200);
});

test('campaign: spendCoins fails when insufficient', () => {
  const c = readCampaign(makeStore());
  awardCoins(c, 100);
  assert.equal(spendCoins(c, 150), false);
  assert.equal(c.coins, 100);
});

test('campaign: awardCoinsForEnemyKills uses per-type schedule', () => {
  const c = readCampaign(makeStore());
  const total = awardCoinsForEnemyKills(c, [
    { type: 'enemyDefeated', enemyType: 'enemy1' },
    { type: 'enemyDefeated', enemyType: 'enemy3' },
    { type: 'enemyDefeated', enemyType: 'enemy5' },
    { type: 'unrelated' },
    null,
  ]);
  // 10 + 30 + 100
  assert.equal(total, 140);
  assert.equal(c.coins, 140);
});

test('campaign: awardCoinsForLevelClear base + time bonus', () => {
  const c = readCampaign(makeStore());
  const total = awardCoinsForLevelClear(c, 5000);
  // 100 base + 5000 * 0.01 = 100 + 50 = 150
  assert.equal(total, 150);
  assert.equal(c.coins, 150);
});

test('campaign: awardCoinsForLevelClear with no time bonus', () => {
  const c = readCampaign(makeStore());
  const total = awardCoinsForLevelClear(c, 0);
  assert.equal(total, 100);
});

test('campaign: ownsUpgrade & grantUpgrade', () => {
  const c = readCampaign(makeStore());
  assert.equal(ownsUpgrade(c, 'bear', 'fastStart1'), false);
  grantUpgrade(c, 'bear', 'fastStart1');
  assert.equal(ownsUpgrade(c, 'bear', 'fastStart1'), true);
  // other characters unaffected
  assert.equal(ownsUpgrade(c, 'wolf', 'fastStart1'), false);
});

test('campaign: getCoins returns 0 for null', () => {
  assert.equal(getCoins(null), 0);
  assert.equal(getCoins({}), 0);
  assert.equal(getCoins({ coins: 42 }), 42);
});

test('campaign: corrupt JSON yields defaults', () => {
  const s = makeStore();
  s.setItem('campaign', 'not json');
  const c = readCampaign(s);
  assert.equal(c.coins, 0);
});

test('campaign: resetCampaign wipes everything', () => {
  const s = makeStore();
  const c = readCampaign(s);
  awardCoins(c, 500);
  grantUpgrade(c, 'bear', 'fastStart1');
  writeCampaign(c, s);
  resetCampaign(s);
  const re = readCampaign(s);
  assert.equal(re.coins, 0);
  assert.deepEqual(re.upgrades, {});
});

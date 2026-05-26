import test from 'node:test';
import assert from 'node:assert';
import {
  awardXp,
  spendXp,
  getXp,
  getLifetimeXp,
  awardXpForScoreEvents,
} from '../engine/campaign.js';

function makeCampaign() {
  return {
    coins: 0,
    lifetimeCoinsEarned: 0,
    xp: {},
    lifetimeXpEarned: {},
    upgrades: {},
    items: {},
    inventory: {},
  };
}

test('xp: awardXp credits both current + lifetime', () => {
  const c = makeCampaign();
  awardXp(c, 'bear', 200);
  awardXp(c, 'bear', 50);
  assert.equal(getXp(c, 'bear'), 250);
  assert.equal(getLifetimeXp(c, 'bear'), 250);
});

test('xp: spendXp succeeds when funds present and fails when not', () => {
  const c = makeCampaign();
  awardXp(c, 'wolf', 300);
  assert.equal(spendXp(c, 'wolf', 200), true);
  assert.equal(getXp(c, 'wolf'), 100);
  // Lifetime is not deducted.
  assert.equal(getLifetimeXp(c, 'wolf'), 300);
  assert.equal(spendXp(c, 'wolf', 250), false);
  assert.equal(getXp(c, 'wolf'), 100);
});

test('xp: each character has independent XP pool', () => {
  const c = makeCampaign();
  awardXp(c, 'bear', 100);
  awardXp(c, 'wolf', 50);
  assert.equal(getXp(c, 'bear'), 100);
  assert.equal(getXp(c, 'wolf'), 50);
  assert.equal(getXp(c, 'lion'), 0);
});

test('xp: awardXpForScoreEvents routes by player character', () => {
  const c = makeCampaign();
  const events = [
    { type: 'scorePopup', playerId: 'p1', points: 100 },
    { type: 'scorePopup', playerId: 'p2', points: 50 },
    { type: 'scorePopup', playerId: 'p1', points: 1000 },
    { type: 'enemyDefeated' }, // ignored
  ];
  const charMap = { p1: 'bear', p2: 'wolf' };
  const total = awardXpForScoreEvents(c, events, charMap);
  // XP per point = 0.2 → bear got (100 + 1000) * 0.2 = 220; wolf got 50 * 0.2 = 10
  assert.equal(getXp(c, 'bear'), 220);
  assert.equal(getXp(c, 'wolf'), 10);
  assert.equal(total, 230);
});

test('xp: zero / negative / NaN are ignored', () => {
  const c = makeCampaign();
  awardXp(c, 'bear', 0);
  awardXp(c, 'bear', -10);
  awardXp(c, 'bear', NaN);
  assert.equal(getXp(c, 'bear'), 0);
});

test('xp: spendXp rejects bad inputs', () => {
  const c = makeCampaign();
  awardXp(c, 'bear', 100);
  assert.equal(spendXp(c, 'bear', 0), false);
  assert.equal(spendXp(c, 'bear', -1), false);
  assert.equal(spendXp(c, '', 50), false);
  assert.equal(spendXp(c, null, 50), false);
  assert.equal(getXp(c, 'bear'), 100);
});

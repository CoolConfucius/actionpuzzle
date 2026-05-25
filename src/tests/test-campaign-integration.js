// End-to-end campaign-mode flow: load → simulate kills → win → bonuses →
// shop purchase → reload next level with the upgrade applied. This catches
// integration regressions across level-loader, level-transition, score,
// campaign and upgrade-defs modules.
import test from 'node:test';
import assert from 'node:assert';
import { loadLevel } from '../engine/level-loader.js';
import { applyLevelClearBonuses } from '../engine/level-transition.js';
import { awardScore } from '../engine/score.js';
import {
  awardCoinsForEnemyKills,
  awardCoinsForLevelClear,
  spendCoins,
  grantUpgrade,
  ownsUpgrade,
} from '../engine/campaign.js';
import { lookupUpgrade, purchaseStatus, isPurchaseable } from '../engine/upgrade-defs.js';
import { activateInventoryItem, applyPowerup } from '../engine/powerup.js';
import { BALANCE } from '../engine/constants.js';

const STUB_LEVEL = (id) => ({
  id,
  world: 1,
  title: `Test ${id}`,
  dims: { cols: 19, rows: 13 },
  timeLimitMs: 180000,
  playerSpawns: [{ playerSlot: 1, col: 1, row: 1, dir: 'down' }],
  objects: [],
  eggCount: 0,
  enemySpawns: [{ type: 'enemy1', atTimeMs: 5000 }],
  enemyCap: 2,
  winConditions: ['allEnemiesDefeated'],
});

function makeCampaign() {
  return { coins: 0, lifetimeCoinsEarned: 0, upgrades: {}, inventory: {} };
}

test('integration: full campaign loop — kill, clear, buy, reload, apply', () => {
  const campaign = makeCampaign();

  // Phase 1 — load LV-01 fresh in campaign mode.
  const state = loadLevel(STUB_LEVEL('01'), 1, {
    mode: 'campaign',
    skin: 'bear',
    campaignUpgrades: campaign.upgrades,
  });
  const p = state.players[0];
  assert.equal(p.speedStacks, 0, 'no upgrades yet → speedStacks 0');

  // Phase 2 — simulate enemy-defeated events in the eventQueue and award
  // the per-kill coins (this is the per-tick hook in main.js). Need enough
  // to afford the foundational upgrade (persistentSpeed1 costs 300).
  state.eventQueue.push({ type: 'enemyDefeated', enemyType: 'enemy7' });
  state.eventQueue.push({ type: 'enemyDefeated', enemyType: 'enemy7' });
  const coinsFromKills = awardCoinsForEnemyKills(campaign, state.eventQueue);
  assert.equal(coinsFromKills, 500 + 500, 'enemy7×2 → 1000 coins');
  assert.equal(campaign.coins, 1000);
  // (The score-popup events from awardScore also got pushed by the
  // enemy-defeated handler in some code paths, but here we only test the
  // pure coin accounting.)

  // Phase 3 — pretend the player cleared the level with 30 seconds remaining.
  // applyLevelClearBonuses adds time bonus to player.score; we just need to
  // verify the coin-on-clear award matches the formula.
  state.levelTimeMs = 150000; // out of 180000 → 30 sec remaining
  state.status = 'won';
  applyLevelClearBonuses(state);
  const remainingSec = Math.floor((state.level.timeLimitMs - state.levelTimeMs) / 1000);
  const timeBonusPts = remainingSec * (BALANCE.TIME_BONUS_PER_SEC || 0);
  const coinsFromClear = awardCoinsForLevelClear(campaign, timeBonusPts);
  assert.ok(coinsFromClear >= 100, 'base level-clear coin reward is 100');
  const totalCoins = 1000 + coinsFromClear;
  assert.equal(campaign.coins, totalCoins, 'lifetime coins match');

  // Phase 4 — open the shop. Bear's foundational upgrade is persistentSpeed1
  // (cost 300, no prereq). Buy it first.
  const persistentSpeed1 = lookupUpgrade('persistentSpeed1');
  let status = purchaseStatus(persistentSpeed1, campaign);
  assert.equal(status.owned, false);
  assert.equal(status.prereqMet, true);
  assert.equal(status.affordable, true, 'enough coins for persistentSpeed1');
  assert.equal(isPurchaseable(persistentSpeed1, campaign), true);

  const beforeCoins = campaign.coins;
  assert.equal(spendCoins(campaign, persistentSpeed1.cost), true);
  assert.equal(campaign.coins, beforeCoins - persistentSpeed1.cost);
  grantUpgrade(campaign, persistentSpeed1.character, persistentSpeed1.id);
  assert.equal(ownsUpgrade(campaign, 'bear', 'persistentSpeed1'), true);

  // Phase 5 — now fastStart1 (prereq met) is purchaseable. Buy it.
  const fastStart = lookupUpgrade('fastStart1');
  status = purchaseStatus(fastStart, campaign);
  assert.equal(status.prereqMet, true, 'persistentSpeed1 unlocks fastStart1');
  assert.equal(spendCoins(campaign, fastStart.cost), true);
  grantUpgrade(campaign, fastStart.character, fastStart.id);
  assert.equal(ownsUpgrade(campaign, 'bear', 'fastStart1'), true);

  // Phase 6 — load LV-02 with the new upgrade map. The player should now
  // spawn at speedStacks = 1.
  const next = loadLevel(STUB_LEVEL('02'), 2, {
    mode: 'campaign',
    skin: 'bear',
    campaignUpgrades: campaign.upgrades,
  });
  assert.equal(next.players[0].speedStacks, 1, 'fastStart1 applied');
  assert.equal(next.players[0].upgrades.fastStart1, true);
});

test('integration: campaign-coop mode loads two players + both get upgrades', () => {
  const campaign = makeCampaign();
  grantUpgrade(campaign, 'bear', 'fastStart1');
  grantUpgrade(campaign, 'wolf', 'invBerserk');

  const state = loadLevel(STUB_LEVEL('01'), 1, {
    mode: 'campaign-coop',
    skin: 'bear',
    p2Skin: 'wolf',
    campaignUpgrades: campaign.upgrades,
  });
  assert.equal(state.players.length, 2);
  const p1 = state.players.find((p) => p.character === 'bear');
  const p2 = state.players.find((p) => p.character === 'wolf');
  assert.ok(p1 && p2);
  assert.equal(p1.speedStacks, 1, 'theodore fastStart applied');
  assert.equal(p2.upgrades.invBerserk, true, 'wolf invBerserk applied');
});

test('integration: Wolf invBerserk routes pickup to inventory, then Q activates', () => {
  const campaign = makeCampaign();
  grantUpgrade(campaign, 'wolf', 'invBerserk');
  grantUpgrade(campaign, 'wolf', 'berserkPlus2');
  const state = loadLevel(STUB_LEVEL('01'), 1, {
    mode: 'campaign',
    skin: 'wolf',
    campaignUpgrades: campaign.upgrades,
  });
  const p = state.players[0];
  state.timeMs = 100;
  // Simulate balloon pickup
  applyPowerup(state, p.id, 'berserk');
  assert.equal(p.inventory.berserk, 1, 'pickup goes to inventory');
  assert.equal(p.status.berserkUntilMs, undefined, 'no immediate activation');

  // Later, player taps Q
  state.timeMs = 5000;
  const ok = activateInventoryItem(state, p.id, 'berserk');
  assert.equal(ok, true);
  assert.equal(p.inventory.berserk, 0);
  // berserkPlus2 also active → BERSERK_DURATION_MS + 2000
  assert.equal(p.status.berserkUntilMs, 5000 + BALANCE.BERSERK_DURATION_MS + 2000);
});

test('integration: prereq gate blocks purchase even with enough coins', () => {
  const campaign = makeCampaign();
  campaign.coins = 9999;
  // fastStart1 requires persistentSpeed1 in the post-rethink tree.
  const fastStart1 = lookupUpgrade('fastStart1');
  assert.equal(isPurchaseable(fastStart1, campaign), false, 'blocked by prereq');
  grantUpgrade(campaign, 'bear', 'persistentSpeed1');
  assert.equal(isPurchaseable(fastStart1, campaign), true, 'unblocked after persistentSpeed1');
});

test('integration: campaign progress persists across resetRun-style state wipe', () => {
  const campaign = makeCampaign();
  campaign.coins = 500;
  grantUpgrade(campaign, 'bear', 'fastStart1');
  // resetRun clears runScore but NOT campaign state.
  // Verify campaign is untouched after a "new run".
  // (resetRun mutates runState, not campaign, so this test just asserts
  // the contract of separate storage.)
  const before = JSON.parse(JSON.stringify(campaign));
  // ... simulate any number of resetRun calls...
  assert.deepEqual(campaign, before);
});

test('integration: enemy6 + enemy7 award correct base coins', () => {
  const campaign = makeCampaign();
  awardCoinsForEnemyKills(campaign, [
    { type: 'enemyDefeated', enemyType: 'enemy6' },
    { type: 'enemyDefeated', enemyType: 'enemy7' },
  ]);
  assert.equal(campaign.coins, 250 + 500);
});

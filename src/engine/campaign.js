// Campaign-mode persistence: coins, upgrades-owned, inventory contents.
// Cross-run state. See plans/2026-05-22-campaign-mode-design.md for the
// full vision; this module covers phase C0 (currency only).

const STORAGE_KEY = 'campaign';

const COIN_PER_ENEMY = {
  enemy1: 10,
  enemy2: 20,
  enemy3: 30,
  enemy4: 50,
  enemy5: 100,
  enemy6: 250,
  enemy7: 500,
};
const COIN_PER_LEVEL_CLEAR = 100;
const COIN_PER_TIME_BONUS_PT = 0.01; // 1 coin per 100 timeBonus points

function defaultCampaign() {
  return {
    coins: 0,
    lifetimeCoinsEarned: 0,
    upgrades: {},
    inventory: {},
  };
}

function safeStore(store) {
  if (store) return store;
  if (typeof localStorage !== 'undefined' && localStorage !== null) return localStorage;
  return null;
}

export function readCampaign(store) {
  const s = safeStore(store);
  if (!s) return defaultCampaign();
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return defaultCampaign();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaultCampaign();
    return migrateCampaign({ ...defaultCampaign(), ...parsed });
  } catch (e) {
    return defaultCampaign();
  }
}

// 2026-05-23: collapse Theodore + Theodora into Bear. Any pre-existing save
// with upgrades under 'theodore' (or stale 'theodora') gets rekeyed to 'bear'
// so player progress carries over the rename. Old upgrade IDs are also
// translated to the new persistentSpeed/fastStart tree where possible.
const LEGACY_UPGRADE_RENAMES = {
  fastStart: 'fastStart1',          // old: spawn at +1 → new: Fast Start I
  retainSpeed: 'persistentSpeed1',  // old: keep across death → new: Persistent Speed I
  // speedCapPlus1 has no equivalent — silently dropped.
};
function migrateCampaign(c) {
  if (!c || typeof c !== 'object') return c;
  if (!c.upgrades || typeof c.upgrades !== 'object') return c;
  const trees = c.upgrades;
  // Merge any theodora-keyed upgrades into theodore (shouldn't exist but be safe).
  if (trees.theodora) {
    trees.theodore = { ...(trees.theodore || {}), ...trees.theodora };
    delete trees.theodora;
  }
  // Rekey theodore → bear and translate legacy upgrade IDs.
  if (trees.theodore) {
    const oldTree = trees.theodore;
    const bearTree = { ...(trees.bear || {}) };
    for (const oldId of Object.keys(oldTree)) {
      if (!oldTree[oldId]) continue;
      const newId = LEGACY_UPGRADE_RENAMES[oldId] || oldId;
      bearTree[newId] = true;
    }
    trees.bear = bearTree;
    delete trees.theodore;
  }
  return c;
}

export function writeCampaign(c, store) {
  const s = safeStore(store);
  if (!s) return;
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(c));
  } catch (e) {
    // ignore
  }
}

export function awardCoins(campaign, amount) {
  if (!campaign || !Number.isFinite(amount) || amount <= 0) return campaign;
  const rounded = Math.floor(amount);
  campaign.coins = (campaign.coins || 0) + rounded;
  campaign.lifetimeCoinsEarned = (campaign.lifetimeCoinsEarned || 0) + rounded;
  return campaign;
}

export function spendCoins(campaign, amount) {
  if (!campaign || !Number.isFinite(amount) || amount <= 0) return false;
  const rounded = Math.floor(amount);
  if ((campaign.coins || 0) < rounded) return false;
  campaign.coins -= rounded;
  return true;
}

export function awardCoinsForEnemyKills(campaign, events, multiplier) {
  if (!campaign || !events) return 0;
  const mult = (typeof multiplier === 'number' && multiplier > 0) ? multiplier : 1;
  let total = 0;
  for (const ev of events) {
    if (!ev || ev.type !== 'enemyDefeated') continue;
    const reward = COIN_PER_ENEMY[ev.enemyType];
    if (reward) total += reward;
  }
  total = Math.floor(total * mult);
  if (total > 0) awardCoins(campaign, total);
  return total;
}

export function awardCoinsForLevelClear(campaign, timeBonusPts, multiplier) {
  if (!campaign) return 0;
  const mult = (typeof multiplier === 'number' && multiplier > 0) ? multiplier : 1;
  const base = COIN_PER_LEVEL_CLEAR;
  const bonus = Number.isFinite(timeBonusPts) && timeBonusPts > 0
    ? Math.floor(timeBonusPts * COIN_PER_TIME_BONUS_PT)
    : 0;
  const total = Math.floor((base + bonus) * mult);
  awardCoins(campaign, total);
  return total;
}

export function ownsUpgrade(campaign, charId, upgradeId) {
  if (!campaign || !campaign.upgrades || !charId || !upgradeId) return false;
  return !!(campaign.upgrades[charId] && campaign.upgrades[charId][upgradeId]);
}

export function grantUpgrade(campaign, charId, upgradeId) {
  if (!campaign || !charId || !upgradeId) return;
  campaign.upgrades = campaign.upgrades || {};
  campaign.upgrades[charId] = campaign.upgrades[charId] || {};
  campaign.upgrades[charId][upgradeId] = true;
}

export function getCoins(campaign) {
  if (!campaign) return 0;
  const n = campaign.coins;
  return Number.isFinite(n) ? n : 0;
}

export function resetCampaign(store) {
  writeCampaign(defaultCampaign(), store);
}

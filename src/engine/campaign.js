// Campaign-mode persistence: coins, per-character XP, skill ownership, items.
// Cross-run state. Coins fuel the Item Shop (consumables + equipment). XP is
// per-character and fuels each character's Skill Tree.

const STORAGE_KEY = 'campaign';

const COIN_PER_ENEMY = {
  enemy1: 10,
  enemy2: 20,
  enemy3: 30,
  enemy4: 50,
  enemy5: 100,
  enemy6: 250,
  enemy7: 500,
  enemy8: 300,
};
const COIN_PER_LEVEL_CLEAR = 100;
const COIN_PER_TIME_BONUS_PT = 0.01;
// XP awarded per point of score (1 XP per 5 points). A typical level yields
// 5-15k score so the player earns 1-3k XP per level.
const XP_PER_SCORE_POINT = 0.2;

function defaultCampaign() {
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

const LEGACY_UPGRADE_RENAMES = {
  fastStart: 'fastStart1',
  retainSpeed: 'persistentSpeed1',
};
// Pre-tier-rework single-flag items → tier-1 equivalent in the new ladder.
const LEGACY_ITEM_RENAMES = {
  shieldTalisman: { id: 'shieldRing1', type: 'permanent' },
  sageSword: { id: 'swordRing1', type: 'permanent' },
  heartLocket: { id: 'heartRing1', type: 'permanent' },
  enemyCompass: { id: 'throwTelegraph', type: 'permanent' },
  revivalPotion: { id: 'revivalPotion1', type: 'consumable' },
  timeLens: { id: 'hastePotion1', type: 'consumable' },
};

// Tiered base-id renames from the first tiered design (Charm/Talisman/Vial/etc)
// to the new Potion/Ring nomenclature. Applied per-tier so e.g.
// shieldCharm2 → shieldPotion2.
const TIERED_BASE_RENAMES = {
  shieldCharm: 'shieldPotion',
  shieldTalisman: 'shieldRing',
  swordVial: 'swordPotion',
  sageSword: 'swordRing',
  heartLocket: 'heartRing',
  energyBrew: 'hastePotion',
  runnerCharm: 'swiftRing',
};

function migrateCampaign(c) {
  if (!c || typeof c !== 'object') return c;
  if (!c.xp || typeof c.xp !== 'object') c.xp = {};
  if (!c.lifetimeXpEarned || typeof c.lifetimeXpEarned !== 'object') c.lifetimeXpEarned = {};
  if (!c.items || typeof c.items !== 'object') c.items = {};
  const items = c.items;
  // Tiered base renames first (e.g. shieldCharm2 → shieldPotion2).
  for (const oldBase of Object.keys(TIERED_BASE_RENAMES)) {
    const newBase = TIERED_BASE_RENAMES[oldBase];
    for (let t = 1; t <= 3; t++) {
      const oldId = `${oldBase}${t}`;
      const newId = `${newBase}${t}`;
      if (!(oldId in items)) continue;
      const v = items[oldId];
      if (v === true) {
        items[newId] = true;
      } else if (Number.isFinite(v) && v > 0) {
        items[newId] = (Number.isFinite(items[newId]) ? items[newId] : 0) + v;
      }
      delete items[oldId];
    }
  }
  // Then legacy single-flag renames.
  for (const oldId of Object.keys(LEGACY_ITEM_RENAMES)) {
    if (!(oldId in items)) continue;
    const spec = LEGACY_ITEM_RENAMES[oldId];
    const val = items[oldId];
    if (spec.type === 'permanent' && val === true) {
      items[spec.id] = true;
    } else if (spec.type === 'consumable' && Number.isFinite(val) && val > 0) {
      items[spec.id] = (Number.isFinite(items[spec.id]) ? items[spec.id] : 0) + val;
    }
    delete items[oldId];
  }
  if (!c.upgrades || typeof c.upgrades !== 'object') {
    c.upgrades = {};
    return c;
  }
  const trees = c.upgrades;
  if (trees.theodora) {
    trees.theodore = { ...(trees.theodore || {}), ...trees.theodora };
    delete trees.theodora;
  }
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

// --- XP (per-character) ------------------------------------------------------

export function getXp(campaign, charId) {
  if (!campaign || !charId) return 0;
  const v = campaign.xp && campaign.xp[charId];
  return Number.isFinite(v) ? v : 0;
}

export function getLifetimeXp(campaign, charId) {
  if (!campaign || !charId) return 0;
  const v = campaign.lifetimeXpEarned && campaign.lifetimeXpEarned[charId];
  return Number.isFinite(v) ? v : 0;
}

export function awardXp(campaign, charId, amount) {
  if (!campaign || !charId || !Number.isFinite(amount) || amount <= 0) return 0;
  const rounded = Math.floor(amount);
  campaign.xp = campaign.xp || {};
  campaign.lifetimeXpEarned = campaign.lifetimeXpEarned || {};
  campaign.xp[charId] = (campaign.xp[charId] || 0) + rounded;
  campaign.lifetimeXpEarned[charId] = (campaign.lifetimeXpEarned[charId] || 0) + rounded;
  return rounded;
}

export function spendXp(campaign, charId, amount) {
  if (!campaign || !charId || !Number.isFinite(amount) || amount <= 0) return false;
  const rounded = Math.floor(amount);
  campaign.xp = campaign.xp || {};
  if ((campaign.xp[charId] || 0) < rounded) return false;
  campaign.xp[charId] -= rounded;
  return true;
}

// Award XP from a stream of scorePopup events to whichever character produced
// the score. Players[].character is supplied as a lookup. Returns total XP
// awarded across all characters.
export function awardXpForScoreEvents(campaign, events, playerCharMap, multiplier) {
  if (!campaign || !events || !playerCharMap) return 0;
  const mult = (typeof multiplier === 'number' && multiplier > 0) ? multiplier : 1;
  let total = 0;
  for (const ev of events) {
    if (!ev || ev.type !== 'scorePopup') continue;
    const charId = playerCharMap[ev.playerId];
    if (!charId) continue;
    const pts = Number.isFinite(ev.points) ? ev.points : 0;
    const xp = Math.floor(pts * XP_PER_SCORE_POINT * mult);
    if (xp <= 0) continue;
    awardXp(campaign, charId, xp);
    total += xp;
  }
  return total;
}

// --- Upgrades ----------------------------------------------------------------

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

// --- Items -------------------------------------------------------------------

export function ownsItem(campaign, itemId) {
  if (!campaign || !campaign.items || !itemId) return false;
  return !!campaign.items[itemId];
}

export function itemCount(campaign, itemId) {
  if (!campaign || !campaign.items || !itemId) return 0;
  const v = campaign.items[itemId];
  if (v === true) return 1;
  return Number.isFinite(v) ? v : 0;
}

export function grantItem(campaign, itemId, opts) {
  if (!campaign || !itemId) return;
  campaign.items = campaign.items || {};
  if (opts && opts.stackable) {
    const cur = campaign.items[itemId];
    const curN = cur === true ? 1 : (Number.isFinite(cur) ? cur : 0);
    const max = Number.isFinite(opts.max) ? opts.max : 9;
    campaign.items[itemId] = Math.min(max, curN + 1);
  } else {
    campaign.items[itemId] = true;
  }
}

export function consumeItem(campaign, itemId) {
  if (!campaign || !campaign.items || !itemId) return false;
  const cur = campaign.items[itemId];
  if (cur === true) return false; // permanent items can't be consumed
  if (!Number.isFinite(cur) || cur <= 0) return false;
  const next = cur - 1;
  if (next <= 0) delete campaign.items[itemId];
  else campaign.items[itemId] = next;
  return true;
}

export function resetCampaign(store) {
  writeCampaign(defaultCampaign(), store);
}

// Item Shop catalog. Four lanes (defense / offense / lives / speed) each with
// a consumable ladder (3 tiers) and a permanent ladder (3 tiers). Plus the
// Throw Telegraph utility.
//
// Tier conventions for every lane:
//   I  → +1 of whatever the effect is (1 hit / 1 kill / 1 life / 1 speedStack)
//   II → +2
//   III → +3
//
// Consumables stack as charges; one charge is auto-consumed at level start.
// Permanents form a ladder (each tier requires the previous). Items and
// character abilities STACK: e.g. Elephant's Big Heart adds to Heart Locket
// adds to Revival Potion budget. Bear's Fast Start stacks with Runner's Charm
// and Energy Brew.

const TIER_LABEL = ['I', 'II', 'III'];

function tierItem(opts) {
  const tier = opts.tier;
  return {
    id: `${opts.baseId}${tier}`,
    baseId: opts.baseId,
    lane: opts.lane,
    label: `${opts.baseLabel} ${TIER_LABEL[tier - 1]}`,
    glyph: opts.glyph,
    color: opts.color,
    cost: opts.cost,
    type: opts.type,
    tier,
    stackMax: opts.type === 'consumable' ? 9 : null,
    prereq: opts.prereq,
    effect: opts.effect, // numeric magnitude this tier adds to the budget
    blurb: opts.blurb,
    howto: opts.howto,
  };
}

function lane(opts) {
  // Build [consumable1..3, permanent1..3].
  const out = [];
  const consumableCosts = opts.consumableCosts; // [c1, c2, c3]
  const permanentCosts = opts.permanentCosts;
  for (let t = 1; t <= 3; t++) {
    out.push(tierItem({
      baseId: opts.consumableBaseId,
      baseLabel: opts.consumableBaseLabel,
      lane: opts.lane,
      glyph: opts.consumableGlyph,
      color: opts.color,
      cost: consumableCosts[t - 1],
      type: 'consumable',
      tier: t,
      effect: t,
      prereq: null,
      blurb: opts.consumableBlurb(t),
      howto: opts.consumableHowto(t),
    }));
  }
  for (let t = 1; t <= 3; t++) {
    out.push(tierItem({
      baseId: opts.permanentBaseId,
      baseLabel: opts.permanentBaseLabel,
      lane: opts.lane,
      glyph: opts.permanentGlyph,
      color: opts.color,
      cost: permanentCosts[t - 1],
      type: 'permanent',
      tier: t,
      effect: t,
      prereq: t > 1 ? `${opts.permanentBaseId}${t - 1}` : null,
      blurb: opts.permanentBlurb(t),
      howto: opts.permanentHowto(t),
    }));
  }
  return out;
}

const DEFENSE = lane({
  lane: 'defense',
  color: '#88CCFF',
  consumableBaseId: 'shieldPotion',
  consumableBaseLabel: 'Shield Potion',
  consumableGlyph: '🛡',
  consumableBlurb: (t) => `Nullify ${t} hit${t === 1 ? '' : 's'} this level (+2s invuln each).`,
  consumableHowto: (t) => `Auto-triggers on any incoming damage up to ${t} time${t === 1 ? '' : 's'}. Each block grants 2s invuln so you can reposition.`,
  consumableCosts: [200, 450, 900],
  permanentBaseId: 'shieldRing',
  permanentBaseLabel: 'Shield Ring',
  permanentGlyph: '🛡',
  permanentBlurb: (t) => `Nullify ${t} hit${t === 1 ? '' : 's'} every level (+2s invuln each).`,
  permanentHowto: (t) => `Spawn with ${t} shield charge${t === 1 ? '' : 's'} per level. Each nullifies damage and grants 2s invuln. Stacks with Shield Potions.`,
  permanentCosts: [700, 1800, 4000],
});

const OFFENSE = lane({
  lane: 'offense',
  color: '#FFAA22',
  consumableBaseId: 'swordPotion',
  consumableBaseLabel: 'Sword Potion',
  consumableGlyph: '⚔️',
  consumableBlurb: (t) => `Mutual destruction on ${t} enemy contact${t === 1 ? '' : 's'}: enemy dies, you still take the hit.`,
  consumableHowto: (t) => `${t} sword charge${t === 1 ? '' : 's'} this level. On enemy contact the enemy dies but you also take damage — pair with a shield to survive.`,
  consumableCosts: [200, 450, 900],
  permanentBaseId: 'swordRing',
  permanentBaseLabel: 'Sword Ring',
  permanentGlyph: '⚔️',
  permanentBlurb: (t) => `${t} mutual-destruction charge${t === 1 ? '' : 's'} every level (passive).`,
  permanentHowto: (t) => `Spawn with ${t} sword charge${t === 1 ? '' : 's'} per level. Enemy contact kills the enemy but does NOT spare you — combine with a shield for full safety.`,
  permanentCosts: [700, 1800, 4000],
});

const LIVES = lane({
  lane: 'lives',
  color: '#FF66AA',
  consumableBaseId: 'revivalPotion',
  consumableBaseLabel: 'Revival Potion',
  consumableGlyph: '🍷',
  consumableBlurb: (t) => `+${t} auto-revive${t === 1 ? '' : 's'} this level.`,
  consumableHowto: (t) => `On death (with 0 lives left) this auto-revives you up to ${t} time${t === 1 ? '' : 's'} for this level. Charge is consumed at level start.`,
  consumableCosts: [200, 450, 900],
  permanentBaseId: 'heartRing',
  permanentBaseLabel: 'Heart Ring',
  permanentGlyph: '❤️',
  permanentBlurb: (t) => `+${t} bonus life every level (passive).`,
  permanentHowto: (t) => `Spawn every level with ${t} extra life on top of base. Stacks with Elephant's Big Heart, Revival Potions, etc.`,
  permanentCosts: [700, 1800, 4000],
});

const SPEED = lane({
  lane: 'speed',
  color: '#AAFFCC',
  consumableBaseId: 'hastePotion',
  consumableBaseLabel: 'Haste Potion',
  consumableGlyph: '⚡',
  consumableBlurb: (t) => `Spawn at +${t} speedStack${t === 1 ? '' : 's'} this level.`,
  consumableHowto: (t) => `One-shot speed boost — start this level ${t} stack${t === 1 ? '' : 's'} faster. Stacks with Bear's Fast Start.`,
  consumableCosts: [200, 450, 900],
  permanentBaseId: 'swiftRing',
  permanentBaseLabel: 'Swift Ring',
  permanentGlyph: '⚡',
  permanentBlurb: (t) => `+${t} starting speedStack${t === 1 ? '' : 's'} every level (passive).`,
  permanentHowto: (t) => `Every level begins with +${t} speedStack${t === 1 ? '' : 's'}. Stacks with Bear's Fast Start, Haste Potions, fried eggs.`,
  permanentCosts: [700, 1800, 4000],
});

const UTILITY = [
  {
    id: 'throwTelegraph',
    baseId: 'throwTelegraph',
    lane: 'utility',
    label: 'Throw Telegraph',
    glyph: '🎯',
    color: '#FFDD66',
    cost: 600,
    type: 'permanent',
    tier: 1,
    stackMax: null,
    prereq: null,
    effect: 1,
    blurb: 'Predicts your hurl: highlights the cell, marks KILL / MISS / ALLY HIT.',
    howto: 'When facing a hurlable object, the game draws the projected path and tints the impact cell. Coop-aware: a friendly hit shows as a warning.',
  },
];

export const ITEMS = [...DEFENSE, ...OFFENSE, ...LIVES, ...SPEED, ...UTILITY];

export const LANES = ['defense', 'offense', 'lives', 'speed', 'utility'];

export const LANE_META = {
  defense: { label: 'DEFENSE', glyph: '🛡', color: '#88CCFF' },
  offense: { label: 'OFFENSE', glyph: '⚔️', color: '#FFAA22' },
  lives:   { label: 'LIVES',   glyph: '❤️', color: '#FF66AA' },
  speed:   { label: 'SPEED',   glyph: '⚡', color: '#AAFFCC' },
  utility: { label: 'UTILITY', glyph: '🎯', color: '#FFDD66' },
};

export function itemsInLane(laneId) {
  return ITEMS.filter((it) => it.lane === laneId);
}

export function lookupItem(id) {
  for (const it of ITEMS) if (it.id === id) return it;
  return null;
}

export function isPermanent(id) {
  const it = lookupItem(id);
  return !!(it && it.type === 'permanent');
}

export function isConsumable(id) {
  const it = lookupItem(id);
  return !!(it && it.type === 'consumable');
}

// Highest tier owned in a permanent ladder. 0 if none.
export function highestPermanentTier(campaign, baseId) {
  if (!campaign || !campaign.items) return 0;
  for (let t = 3; t >= 1; t--) {
    if (campaign.items[`${baseId}${t}`] === true) return t;
  }
  return 0;
}

// Highest consumable tier the player has any charge of, with that count.
export function highestConsumableTier(campaign, baseId) {
  if (!campaign || !campaign.items) return { tier: 0, count: 0 };
  for (let t = 3; t >= 1; t--) {
    const v = campaign.items[`${baseId}${t}`];
    if (Number.isFinite(v) && v > 0) return { tier: t, count: v };
  }
  return { tier: 0, count: 0 };
}

// Auto-pick which consumable charge to consume at level start for a base id.
// Picks the highest tier with stack > 0. Returns the item id consumed, or null.
export function pickConsumableToBurn(campaign, baseId) {
  const h = highestConsumableTier(campaign, baseId);
  if (h.count <= 0) return null;
  return `${baseId}${h.tier}`;
}

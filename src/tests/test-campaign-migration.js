// Migration: legacy item ids from earlier designs translate to the current
// Potion / Ring nomenclature so existing player saves don't lose progress.
import test from 'node:test';
import assert from 'node:assert';
import { readCampaign, writeCampaign } from '../engine/campaign.js';

function makeStore() {
  const data = {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    _data: data,
  };
}

test('migrate: pre-tier item flags translate to tier-1 of new ladders', () => {
  const s = makeStore();
  s.setItem('campaign', JSON.stringify({
    coins: 100,
    items: {
      shieldTalisman: true,
      sageSword: true,
      heartLocket: true,
      enemyCompass: true,
      revivalPotion: 3,
      timeLens: 2,
    },
  }));
  const c = readCampaign(s);
  assert.equal(c.items.shieldRing1, true);
  assert.equal(c.items.swordRing1, true);
  assert.equal(c.items.heartRing1, true);
  assert.equal(c.items.throwTelegraph, true);
  assert.equal(c.items.revivalPotion1, 3);
  assert.equal(c.items.hastePotion1, 2);
  // Legacy keys should be gone.
  assert.equal('shieldTalisman' in c.items, false);
  assert.equal('sageSword' in c.items, false);
});

test('migrate: first-pass tiered base ids translate to Potion/Ring', () => {
  const s = makeStore();
  s.setItem('campaign', JSON.stringify({
    items: {
      shieldCharm1: 4,
      shieldCharm2: 1,
      shieldTalisman2: true,
      swordVial3: 2,
      sageSword1: true,
      heartLocket1: true,
      heartLocket2: true,
      energyBrew1: 5,
      runnerCharm1: true,
    },
  }));
  const c = readCampaign(s);
  assert.equal(c.items.shieldPotion1, 4);
  assert.equal(c.items.shieldPotion2, 1);
  assert.equal(c.items.shieldRing2, true);
  assert.equal(c.items.swordPotion3, 2);
  assert.equal(c.items.swordRing1, true);
  assert.equal(c.items.heartRing1, true);
  assert.equal(c.items.heartRing2, true);
  assert.equal(c.items.hastePotion1, 5);
  assert.equal(c.items.swiftRing1, true);
  // Old base ids gone.
  for (const oldBase of ['shieldCharm', 'shieldTalisman', 'swordVial', 'sageSword',
                          'heartLocket', 'energyBrew', 'runnerCharm']) {
    for (let t = 1; t <= 3; t++) {
      assert.equal(`${oldBase}${t}` in c.items, false, `${oldBase}${t} should be migrated`);
    }
  }
});

test('migrate: mixed legacy + tiered values do not collide', () => {
  const s = makeStore();
  s.setItem('campaign', JSON.stringify({
    items: {
      // Legacy single-flag AND tiered shouldn't double-count, but they should
      // be added (legacy migrates AFTER tiered so we land at one tier).
      shieldTalisman: true,       // legacy → shieldRing1
      shieldTalisman1: true,      // tiered → shieldRing1 (already exists)
      revivalPotion: 2,           // legacy → revivalPotion1 (count)
      revivalPotion1: 3,          // tiered, untouched
    },
  }));
  const c = readCampaign(s);
  // Both want shieldRing1=true → idempotent.
  assert.equal(c.items.shieldRing1, true);
  // revivalPotion1 accumulates: existing 3 + legacy 2 = 5.
  assert.equal(c.items.revivalPotion1, 5);
});

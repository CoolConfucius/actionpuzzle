import test from 'node:test';
import assert from 'node:assert';
import {
  UPGRADES,
  upgradesForCharacter,
  lookupUpgrade,
  isPurchaseable,
  purchaseStatus,
} from '../engine/upgrade-defs.js';

const EMPTY_CAMPAIGN = { coins: 0, upgrades: {}, inventory: {} };

test('upgrades: catalog covers all seven characters', () => {
  const chars = new Set(UPGRADES.map((u) => u.character));
  for (const c of ['bear','wolf','monkey','lion','pig','mole','rabbit']) {
    assert.ok(chars.has(c), `missing character ${c}`);
  }
});

test('upgrades: all entries have id/label/cost/character', () => {
  for (const u of UPGRADES) {
    assert.ok(typeof u.id === 'string' && u.id.length > 0);
    assert.ok(typeof u.label === 'string' && u.label.length > 0);
    assert.ok(Number.isFinite(u.cost) && u.cost > 0);
    assert.ok(typeof u.character === 'string');
    assert.ok(u.prereq === null || typeof u.prereq === 'string');
  }
});

test('upgrades: all prereqs reference real ids on the same character', () => {
  for (const u of UPGRADES) {
    if (!u.prereq) continue;
    const prereq = lookupUpgrade(u.prereq);
    assert.ok(prereq, `unknown prereq ${u.prereq} for ${u.id}`);
    assert.equal(prereq.character, u.character, 'cross-character prereq not allowed');
  }
});

test('upgrades: upgradesForCharacter filters', () => {
  const t = upgradesForCharacter('bear');
  assert.ok(t.length >= 3);
  for (const u of t) assert.equal(u.character, 'bear');
});

test('upgrades: lookupUpgrade returns null on missing', () => {
  assert.equal(lookupUpgrade('madeUp'), null);
  assert.equal(lookupUpgrade('fastStart1').id, 'fastStart1');
});

test('purchaseStatus: fresh state cannot afford anything', () => {
  // persistentSpeed1 is foundational (no prereq) — costs 300.
  const u = lookupUpgrade('persistentSpeed1');
  const s = purchaseStatus(u, EMPTY_CAMPAIGN);
  assert.equal(s.owned, false);
  assert.equal(s.prereqMet, true);
  assert.equal(s.affordable, false);
});

test('purchaseStatus: prereq gate', () => {
  // fastStart1 requires persistentSpeed1 in the post-rethink tree.
  const u = lookupUpgrade('fastStart1');
  const c = { coins: 1000, upgrades: {}, inventory: {} };
  const s = purchaseStatus(u, c);
  assert.equal(s.prereqMet, false, 'fastStart1 needs persistentSpeed1');
});

test('purchaseStatus: prereq met when owned', () => {
  const u = lookupUpgrade('fastStart1');
  const c = { coins: 1000, xp: { bear: 1000 }, upgrades: { bear: { persistentSpeed1: true } }, inventory: {} };
  const s = purchaseStatus(u, c);
  assert.equal(s.prereqMet, true);
  assert.equal(s.affordable, true);
});

test('purchaseStatus: owned upgrade reports owned', () => {
  const u = lookupUpgrade('persistentSpeed1');
  const c = { coins: 1000, xp: { bear: 1000 }, upgrades: { bear: { persistentSpeed1: true } }, inventory: {} };
  const s = purchaseStatus(u, c);
  assert.equal(s.owned, true);
});

test('isPurchaseable: full happy path', () => {
  const u = lookupUpgrade('persistentSpeed1');
  const c = { coins: 0, xp: { bear: 500 }, upgrades: {}, inventory: {} };
  assert.equal(isPurchaseable(u, c), true);
});

test('isPurchaseable: blocked by insufficient XP', () => {
  const u = lookupUpgrade('persistentSpeed1');
  const c = { coins: 9999, xp: { bear: 100 }, upgrades: {}, inventory: {} };
  assert.equal(isPurchaseable(u, c), false);
});

test('isPurchaseable: blocked by already owned', () => {
  const u = lookupUpgrade('persistentSpeed1');
  const c = { coins: 0, xp: { bear: 9999 }, upgrades: { bear: { persistentSpeed1: true } }, inventory: {} };
  assert.equal(isPurchaseable(u, c), false);
});

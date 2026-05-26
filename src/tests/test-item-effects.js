// Verify shield (nullify + invuln) and sword (mutual destruction) behaviors.
import test from 'node:test';
import assert from 'node:assert';
import { tryAbsorbHit } from '../engine/item-effects.js';

function makeState() {
  return { timeMs: 1000, enemies: [], eventQueue: [], players: [] };
}

function makePlayer(extras) {
  return {
    id: 'p1',
    alive: true,
    pos: { col: 5, row: 5 },
    lives: 3,
    items: {},
    inventory: {},
    status: {},
    ...(extras || {}),
  };
}

test('shield: nullifies damage and grants 2s invuln', () => {
  const s = makeState();
  const p = makePlayer({ shieldBudget: 2 });
  const r = tryAbsorbHit(s, p, { cause: 'enemyContact' });
  assert.equal(r.absorbed, true);
  assert.equal(p.shieldBudget, 1, 'one charge consumed');
  assert.equal(p.status.invulnUntilMs, s.timeMs + 2000, '2s invuln');
  assert.ok(s.eventQueue.some((e) => e.label === 'SHIELD!'));
});

test('shield: depletes when budget hits zero', () => {
  const s = makeState();
  const p = makePlayer({ shieldBudget: 1 });
  tryAbsorbHit(s, p, { cause: 'enemyContact' });
  assert.equal(p.shieldBudget, 0);
  // Next call has no shield → not absorbed.
  const r2 = tryAbsorbHit(s, p, { cause: 'enemyContact' });
  assert.equal(r2.absorbed, false);
});

test('sword: kills enemy on contact but does NOT absorb damage', () => {
  const s = makeState();
  const enemy = { id: 1, type: 'enemy3', pos: { col: 5, row: 6 } };
  s.enemies.push(enemy);
  const p = makePlayer({ swordCharges: 2 });
  const r = tryAbsorbHit(s, p, { cause: 'enemyContact', enemy });
  // Player still takes damage — sword is mutual destruction.
  assert.equal(r.absorbed, false);
  assert.equal(p.swordCharges, 1);
  assert.equal(s.enemies.length, 0, 'enemy removed');
  assert.ok(s.eventQueue.some((e) => e.type === 'enemyDefeated' && e.enemyType === 'enemy3'));
  assert.ok(s.eventQueue.some((e) => e.label === 'SWORD!'));
});

test('sword: does NOT trigger when no enemy ctx (e.g. hurl damage)', () => {
  const s = makeState();
  const p = makePlayer({ swordCharges: 3 });
  const r = tryAbsorbHit(s, p, { cause: 'hurl' });
  assert.equal(r.absorbed, false);
  assert.equal(p.swordCharges, 3, 'sword not consumed');
});

test('sword + shield combo: enemy dies AND player saved', () => {
  const s = makeState();
  const enemy = { id: 1, type: 'enemy1', pos: { col: 5, row: 6 } };
  s.enemies.push(enemy);
  const p = makePlayer({ swordCharges: 1, shieldBudget: 1 });
  const r = tryAbsorbHit(s, p, { cause: 'enemyContact', enemy });
  // Sword kills, shield then nullifies the damage.
  assert.equal(r.absorbed, true);
  assert.equal(p.swordCharges, 0);
  assert.equal(p.shieldBudget, 0);
  assert.equal(s.enemies.length, 0);
});

test('shield: works for explosion damage', () => {
  const s = makeState();
  const p = makePlayer({ shieldBudget: 1 });
  const r = tryAbsorbHit(s, p, { cause: 'explosion' });
  assert.equal(r.absorbed, true);
  assert.equal(p.shieldBudget, 0);
});

test('shield: works for hurl damage', () => {
  const s = makeState();
  const p = makePlayer({ shieldBudget: 1 });
  const r = tryAbsorbHit(s, p, { cause: 'hurl' });
  assert.equal(r.absorbed, true);
});

test('dead player short-circuits', () => {
  const s = makeState();
  const p = makePlayer({ alive: false, shieldBudget: 1 });
  const r = tryAbsorbHit(s, p, { cause: 'enemyContact' });
  assert.equal(r.absorbed, false);
  assert.equal(p.shieldBudget, 1, 'shield not consumed');
});

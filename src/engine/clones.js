// Monkey's "Stun Clone" upgrade. A clone is a stationary decoy at a cell that:
//   - freezes enemies within 1 cell while it exists (Chebyshev distance ≤ 1)
//   - detonates as a small explosion if owner has echoBlast AND an enemy is
//     adjacent at any tick after spawn
//   - lasts CLONE_LIFETIME_MS or until an enemy walks into its exact cell
import { BALANCE } from './constants.js';

export const CLONE_LIFETIME_MS = 5000;
const CLONE_STUN_MS = 250; // re-applied each tick while adjacent

export function spawnClone(state, player) {
  if (!state || !player) return false;
  if (player.alive === false) return false;
  const owned = (player.upgrades && player.upgrades.stunClone) || false;
  if (!owned) return false;
  state.clones = state.clones || [];
  // Active-clone cap: triple → 3, twin → 2, baseline → 1.
  let maxActive = 1;
  if (player.upgrades && player.upgrades.tripleClone) maxActive = 3;
  else if (player.upgrades && player.upgrades.twinClone) maxActive = 2;
  const mine = state.clones.filter((c) => c && c.ownerId === player.id).length;
  if (mine >= maxActive) return false;
  const cell = { col: player.pos.col, row: player.pos.row };
  if (typeof state.nextCloneId !== 'number') state.nextCloneId = 1;
  // Long Clone: TTL 5s → 8s.
  const lifetime = (player.upgrades && player.upgrades.longClone) ? 8000 : CLONE_LIFETIME_MS;
  state.clones.push({
    id: state.nextCloneId++,
    ownerId: player.id,
    pos: cell,
    spawnedMs: state.timeMs || 0,
    expiresMs: (state.timeMs || 0) + lifetime,
    echoBlast: !!(player.upgrades && player.upgrades.echoBlast),
    echoWave: !!(player.upgrades && player.upgrades.echoWave),
    // Big Echo: pulse range 2 → 3.
    echoPulseRange: (player.upgrades && player.upgrades.bigEcho) ? 3 : 2,
  });
  state.eventQueue = state.eventQueue || [];
  state.eventQueue.push({
    type: 'cloneSpawn',
    cell,
    playerId: player.id,
  });
  return true;
}

export function tickClones(state) {
  if (!state || !Array.isArray(state.clones) || state.clones.length === 0) return;
  const now = state.timeMs || 0;
  const enemies = state.enemies || [];
  const remaining = [];
  for (const clone of state.clones) {
    if (!clone) continue;
    let detonated = false;
    // Apply stun + detonation checks.
    for (const e of enemies) {
      if (!e || !e.pos) continue;
      const dx = Math.abs(e.pos.col - clone.pos.col);
      const dy = Math.abs(e.pos.row - clone.pos.row);
      if (Math.max(dx, dy) <= 1) {
        // Stun adjacent enemies.
        e.frozenUntilMs = Math.max(e.frozenUntilMs || 0, now + CLONE_STUN_MS);
        if (clone.echoBlast && dx === 0 && dy === 0) {
          // Enemy stepped onto clone cell — echo blast.
          detonated = true;
        }
      }
    }
    if (detonated) {
      state.explosions = state.explosions || [];
      state.explosions.push({
        id: state.nextExplosionId++,
        centerCell: { col: clone.pos.col, row: clone.pos.row },
        startedMs: now,
        resolved: false,
        hurlerId: clone.ownerId,
        chainCount: 0,
      });
      state.eventQueue = state.eventQueue || [];
      state.eventQueue.push({ type: 'explode', cell: { col: clone.pos.col, row: clone.pos.row } });
      continue; // skip; don't keep
    }
    if (now >= clone.expiresMs) {
      state.eventQueue = state.eventQueue || [];
      state.eventQueue.push({ type: 'cloneExpire', cell: { col: clone.pos.col, row: clone.pos.row } });
      // Echo Wave: on natural expiry (not enemy-detonated), pulse a 2-cell
      // stun outward. Owner must have the upgrade owned at spawn-time.
      if (clone.echoWave) {
        const pulseRange = clone.echoPulseRange || 2;
        for (const e of enemies) {
          if (!e || !e.pos) continue;
          const dx = Math.abs(e.pos.col - clone.pos.col);
          const dy = Math.abs(e.pos.row - clone.pos.row);
          if (Math.max(dx, dy) <= pulseRange) {
            e.frozenUntilMs = Math.max(e.frozenUntilMs || 0, now + 1500);
          }
        }
        state.eventQueue.push({
          type: 'abilityFire',
          label: 'ECHO WAVE!',
          cell: { col: clone.pos.col, row: clone.pos.row },
        });
      }
      continue;
    }
    remaining.push(clone);
  }
  state.clones = remaining;
}

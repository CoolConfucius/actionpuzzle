// Item Shop runtime effects. Centralizes shield/sword/revival behavior so the
// three damage call sites (enemies, explode, hurl) all behave consistently.
//
// Budgets are set at level start by level-loader.applyItemSpawnEffects:
//   player.shieldBudget  → number of hits the shield will absorb this level
//   player.swordCharges  → number of contact-kill charges (sword)
//   player.reviveBudget  → free revives left this level (consumed by state.js)

// Try to absorb / counter damage about to hit the player. Returns:
//   { absorbed: true }   → no damage taken; caller MUST NOT decrement lives.
//   { absorbed: false }  → caller proceeds with normal damage.
//
// Order: sword fires first (mutual destruction — kills the enemy but does
// NOT prevent damage), then shield (nullifies damage entirely + brief invuln).
// Owning both is a power combo: enemy dies AND you don't take the hit.
export function tryAbsorbHit(state, player, ctx) {
  if (!player || player.alive === false) return { absorbed: false };
  const cause = ctx && ctx.cause;
  const enemy = ctx && ctx.enemy;

  // Sword (Sage Sword / Sword Vial): on enemy CONTACT only. Consumes one
  // charge to kill the enemy. Player STILL takes damage — sword is mutual
  // destruction, not invulnerability. To prevent the damage entirely you
  // need a shield (which will then chain after this).
  if (cause === 'enemyContact' && (player.swordCharges || 0) > 0 && enemy) {
    player.swordCharges -= 1;
    const at = enemy.pos ? { col: enemy.pos.col, row: enemy.pos.row } : { col: player.pos.col, row: player.pos.row };
    const idx = (state.enemies || []).indexOf(enemy);
    if (idx >= 0) state.enemies.splice(idx, 1);
    state.eventQueue ??= [];
    state.eventQueue.push({
      type: 'enemyDefeated',
      enemyType: enemy.type,
      cell: at,
      cause: 'swordRing',
    });
    state.eventQueue.push({
      type: 'abilityFire',
      label: 'SWORD!',
      cell: { col: player.pos.col, row: player.pos.row },
    });
    // Fall through — damage still applies unless the shield catches it next.
  }

  // Shield (Shield Talisman / Shield Charm): nullifies damage + 2s invuln.
  if ((player.shieldBudget || 0) > 0) {
    player.shieldBudget -= 1;
    if (player.shieldBudget <= 0) player.shieldActive = false;
    player.status ??= {};
    player.status.invulnUntilMs = Math.max(player.status.invulnUntilMs || 0, state.timeMs + 2000);
    state.eventQueue ??= [];
    state.eventQueue.push({
      type: 'abilityFire',
      label: 'SHIELD!',
      cell: { col: player.pos.col, row: player.pos.row },
    });
    return { absorbed: true };
  }

  return { absorbed: false };
}

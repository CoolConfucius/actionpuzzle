import { cellAt, inBounds } from './grid.js';
import { applyChainBonus, awardScore } from './score.js';
import { clearPowerupsOnDeath } from './powerup.js';
import { BALANCE } from './constants.js';

const ENEMY_KILL_SCORE_KEY = {
  enemy1: 'SCORE_E1_KILL',
  enemy2: 'SCORE_E2_KILL',
  enemy3: 'SCORE_E3_KILL',
  enemy4: 'SCORE_E4_KILL',
  enemy5: 'SCORE_E5_KILL',
  enemy6: 'SCORE_E6_KILL',
  enemy7: 'SCORE_E7_KILL',
};

export function applyExplosion(state, centerCell, opts) {
  if (!state.explosions) state.explosions = [];
  if (state.nextExplosionId == null) state.nextExplosionId = 0;
  const options = opts || {};
  state.explosions.push({
    id: state.nextExplosionId++,
    centerCell: { col: centerCell.col, row: centerCell.row },
    startedMs: state.timeMs,
    resolved: false,
    hurlerId: options.hurlerId,
    chainCount: typeof options.chainCount === 'number' ? options.chainCount : 0,
  });
}

export function tickExplosions(state, _dtMs) {
  if (!state.explosions || state.explosions.length === 0) return;
  if (!state.enemies) state.enemies = [];
  if (!state.players) state.players = [];
  if (!state.eventQueue) state.eventQueue = [];
  if (state.nextObjectId == null) state.nextObjectId = 0;

  const toResolve = [];
  for (let i = 0; i < state.explosions.length; i++) {
    if (!state.explosions[i].resolved) toResolve.push(state.explosions[i]);
  }

  for (const exp of toResolve) {
    resolveExplosion(state, exp);
    exp.resolved = true;
  }
}

function resolveExplosion(state, exp) {
  const cc = exp.centerCell.col;
  const cr = exp.centerCell.row;
  // Lion's "Bigger Blast" upgrade adds +1 radius for player-triggered fireballs.
  // Enemy-triggered (no hurlerId, or hurlerId not in state.players) is unchanged.
  let radius = BALANCE.FIREBALL_EXPLOSION_RADIUS;
  if (exp.hurlerId && Array.isArray(state.players)) {
    const owner = state.players.find((p) => p && p.id === exp.hurlerId);
    if (owner && owner.upgrades) {
      if (owner.upgrades.megaBlast) radius += 2;
      else if (owner.upgrades.biggerBlast || owner.upgrades.biggerEgg) radius += 1;
    }
  }

  state.eventQueue.push({ type: 'explode', cell: { col: cc, row: cr }, radius });

  const affected = collectAffectedCells(state, cc, cr, radius);
  const eggCells = sortedEggCells(affected, cc, cr);

  applyCellEffects(state, affected, exp);

  if (eggCells.length > 0) {
    applyChainBonus(state, eggCells, { col: cc, row: cr });
  }

  killActorsInRadius(state, cc, cr, radius, exp);
}

function collectAffectedCells(state, cc, cr, radius) {
  const affected = [];
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      const c = cc + dc;
      const r = cr + dr;
      if (!inBounds(state.grid, c, r)) continue;
      const gc = cellAt(state.grid, c, r);
      affected.push({
        col: c,
        row: r,
        gc,
        originalObjectType: gc.object ? gc.object.type : null,
        hadHazard: gc.hazard != null,
      });
    }
  }
  return affected;
}

function sortedEggCells(affected, cc, cr) {
  const eggs = affected
    .filter((a) => a.originalObjectType === 'egg')
    .map((a) => ({ col: a.col, row: a.row }));
  eggs.sort((a, b) => {
    const da = Math.max(Math.abs(a.col - cc), Math.abs(a.row - cr));
    const db = Math.max(Math.abs(b.col - cc), Math.abs(b.row - cr));
    if (da !== db) return da - db;
    if (a.row !== b.row) return a.row - b.row;
    return a.col - b.col;
  });
  return eggs;
}

function applyCellEffects(state, affected, parentExp) {
  // Resolve the rock-credit recipient once: the explosion's hurler if known,
  // otherwise fall back to player 1. Matches killActorsInRadius's `scorer`.
  const hurlerId = parentExp && parentExp.hurlerId;
  const rockScorer = (typeof hurlerId === 'string' && (hurlerId === 'p1' || hurlerId === 'p2'))
    ? (state.players || []).find((p) => p.id === hurlerId)
    : (state.players && state.players[0]);
  for (const a of affected) {
    if (a.hadHazard) a.gc.hazard = null;
    const t = a.originalObjectType;
    if (t === 'rock' || t === 'donut' || t === 'fried-egg') {
      a.gc.object = null;
      if (t === 'rock' && rockScorer) {
        awardScore(state, rockScorer.id, 1, 'rockBreak', null, { silent: true });
      }
    } else if (t === 'fireball') {
      a.gc.object = null;
      // Chain explosions inherit hurler + ongoing kill chain.
      applyExplosion(state, { col: a.col, row: a.row }, {
        hurlerId: parentExp && parentExp.hurlerId,
        chainCount: (parentExp && typeof parentExp.chainCount === 'number') ? parentExp.chainCount : 0,
      });
    } else if (t === 'egg') {
      a.gc.object = { type: 'fried-egg', id: state.nextObjectId++ };
    }
  }
}

function killActorsInRadius(state, cc, cr, radius, exp) {
  for (const player of state.players) {
    if (!player || player.alive === false) continue;
    const posIn = withinRadius(player.pos, cc, cr, radius);
    const moveIn = player.move && player.move.to && withinRadius(player.move.to, cc, cr, radius);
    if (!posIn && !moveIn) continue;
    const invulnMs = player.status && player.status.invulnUntilMs;
    if (invulnMs != null && invulnMs > state.timeMs) continue;
    player.lives = Math.max(0, (player.lives || 0) - 1);
    player.alive = false;
    player.deathTimeMs = state.timeMs;
    clearPowerupsOnDeath(state, player);
    state.eventQueue.push({
      type: 'playerDeath',
      playerId: player.id,
      cell: { col: player.pos.col, row: player.pos.row },
    });
  }

  const hurlerId = exp && exp.hurlerId;
  const isPlayerHurler = (typeof hurlerId === 'string' && (hurlerId === 'p1' || hurlerId === 'p2'));
  const fallbackScorer = state.players && state.players[0];
  const scorer = isPlayerHurler
    ? (state.players || []).find((p) => p.id === hurlerId)
    : fallbackScorer;

  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const enemy = state.enemies[i];
    if (!enemy) continue;
    // Enemies (like players) can be mid-move; check both pos AND move.to so
    // an enemy stepping into or out of the blast at the same tick gets hit.
    const posIn = withinRadius(enemy.pos, cc, cr, radius);
    const moveIn = enemy.move && enemy.move.to && withinRadius(enemy.move.to, cc, cr, radius);
    if (!posIn && !moveIn) continue;
    const at = { col: enemy.pos.col, row: enemy.pos.row };
    // Tank check: explosions are big enough to fully destroy a Titan even
    // through its HP (it's an area attack), so apply lethal damage.
    enemy.hp = (typeof enemy.hp === 'number' ? enemy.hp : 1) - 99;
    if (enemy.hp > 0) {
      state.eventQueue.push({
        type: 'enemyHit',
        enemyType: enemy.type,
        cell: at,
        hpRemaining: enemy.hp,
      });
      continue;
    }
    state.eventQueue.push({
      type: 'enemyDefeated',
      enemyType: enemy.type,
      cell: at,
    });
    state.enemies.splice(i, 1);
    const scoreKey = ENEMY_KILL_SCORE_KEY[enemy.type];
    const basePoints = scoreKey ? BALANCE[scoreKey] : 0;
    if (basePoints > 0 && scorer && scorer.id) {
      const chainIdx = (exp && typeof exp.chainCount === 'number') ? exp.chainCount : 0;
      const multiplier = 1 << Math.min(chainIdx, 5);
      const points = basePoints * multiplier;
      if (exp) exp.chainCount = chainIdx + 1;
      awardScore(state, scorer.id, points, 'enemyKill', at);
    }
  }
}

function withinRadius(pos, cc, cr, radius) {
  if (!pos) return false;
  return Math.max(Math.abs(pos.col - cc), Math.abs(pos.row - cr)) <= radius;
}

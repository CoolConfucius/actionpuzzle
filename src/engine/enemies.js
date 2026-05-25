import { BALANCE } from './constants.js';
import { cellAt, inBounds, clearObject } from './grid.js';
import { pickEnemyDirection } from './enemy-ai.js';
import { awardScore } from './score.js';
import { clearPowerupsOnDeath } from './powerup.js';
import { applyExplosion } from './explode.js';

const SPEED_BY_TYPE = {
  enemy1: 'ENEMY_1_SPEED',
  enemy2: 'ENEMY_2_SPEED',
  enemy3: 'ENEMY_3_SPEED',
  enemy4: 'ENEMY_4_SPEED',
  enemy5: 'ENEMY_5_SPEED',
  enemy6: 'ENEMY_6_SPEED',
  enemy7: 'ENEMY_7_SPEED',
};

const KILL_SCORE_BY_TYPE = {
  enemy1: 'SCORE_E1_KILL',
  enemy2: 'SCORE_E2_KILL',
  enemy3: 'SCORE_E3_KILL',
  enemy4: 'SCORE_E4_KILL',
  enemy5: 'SCORE_E5_KILL',
  enemy6: 'SCORE_E6_KILL',
  enemy7: 'SCORE_E7_KILL',
};

const DIR_DELTAS = {
  up: { dc: 0, dr: -1 },
  down: { dc: 0, dr: 1 },
  left: { dc: -1, dr: 0 },
  right: { dc: 1, dr: 0 },
};

const REVERSE_DIR = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

const HURL_ENEMY_TYPES = new Set(['enemy2', 'enemy3', 'enemy4', 'enemy5']);

const E4_CAST_ROLL = 0.10;
const E1_AGGRO_DESTROY_ROLL = 0.25;
const HURL_AGGRO_ROLL = 0.18;

export function tickEnemies(state, dtMs) {
  expireHazards(state);
  const snapshot = state.enemies.slice();
  for (const enemy of snapshot) {
    if (!state.enemies.includes(enemy)) continue;
    // Frozen enemies don't move or start casts, but in-progress casts still
    // resolve (preserves the old "trap snaps into place" behavior).
    if (isEnemyFrozen(enemy, state)) {
      if (enemy.cast) {
        if (enemy.type === 'enemy3' && enemy.cast.kind === 'trap') {
          completeE3Cast(state, enemy);
        } else if (enemy.type === 'enemy4' && enemy.cast.kind === 'fireball') {
          enemy.cast = null;
          enemy.abilityCooldownUntilMs = state.timeMs + BALANCE.E4_FIREBALL_COOLDOWN_MS;
        }
      }
      continue;
    }
    // Post-spawn grace period: enemy is inert (no move, no actions). Player
    // can still die by touching it — this is intentional, just gives ~500ms
    // to read the room. Frozen state takes priority above (so freeze-bombing
    // a fresh spawn still freezes correctly).
    if (typeof enemy.inertUntilMs === 'number' && enemy.inertUntilMs > state.timeMs) {
      continue;
    }
    if (enemy.move) {
      advanceEnemyMove(state, enemy, dtMs);
      continue;
    }
    if (enemy.cast) {
      tickEnemyCast(state, enemy);
      continue;
    }
    // Phantom teleport: enemy7 picks a random open cell every 5s, ducking
    // the player and any rocks. Cheap, deterministic via state.rng.
    if (enemy.type === 'enemy7'
        && typeof enemy.teleportNextMs === 'number'
        && state.timeMs >= enemy.teleportNextMs) {
      tryTeleport(state, enemy);
      enemy.teleportNextMs = state.timeMs + 5000;
      continue;
    }
    if (enemy.type === 'enemy3' && canStartTrapCast(state, enemy)) {
      startE3Cast(state, enemy);
      continue;
    }
    if (enemy.type === 'enemy4' && canStartFireballCast(state, enemy)) {
      startE4Cast(state, enemy);
      continue;
    }
    const aggro = pickAggressiveDirection(state, enemy);
    if (aggro != null && aggro !== enemy.dir) {
      // Turn this tick so the player can see the enemy line up its target.
      // The next decision tick will act on the rock if it still qualifies.
      enemy.dir = aggro;
      continue;
    }
    if (aggro != null && !canEnemyAct(state, enemy)) {
      // Aggro fired, but we're still in the post-action cooldown — hold.
      continue;
    }
    const dir = aggro || pickEnemyDirection(state, enemy);
    if (dir != null) processEnemyAction(state, enemy, dir);
  }
}

function canEnemyAct(state, enemy) {
  const next = enemy.nextActionMs || 0;
  return state.timeMs >= next;
}

function pickAggressiveDirection(state, enemy) {
  if (typeof state.rng !== 'function') return null;
  let roll;
  if (enemy.type === 'enemy1') {
    roll = E1_AGGRO_DESTROY_ROLL;
  } else if (HURL_ENEMY_TYPES.has(enemy.type)) {
    roll = HURL_AGGRO_ROLL;
  } else {
    return null;
  }
  if (state.rng() >= roll) return null;
  // An enemy can only act on the rock directly in front of its current facing.
  // The caller turns the enemy toward a nearby rock on the prior tick if
  // needed; this keeps actions deliberate and readable to the player.
  const facing = enemy.dir;
  if (facing && rockActionable(state, enemy, facing)) return facing;
  // No rock dead ahead — try turning toward a neighbouring rock so the next
  // decision tick can act. Picking from the surrounding cells (other than
  // current dir) gives the enemy intent to line up.
  const candidates = [];
  for (const dir of ['up', 'down', 'left', 'right']) {
    if (dir === facing) continue;
    if (rockActionable(state, enemy, dir)) candidates.push(dir);
  }
  if (candidates.length === 0) return null;
  const idx = Math.min(Math.floor(state.rng() * candidates.length), candidates.length - 1);
  return candidates[idx];
}

function rockActionable(state, enemy, dir) {
  const delta = DIR_DELTAS[dir];
  if (!delta) return false;
  const c = enemy.pos.col + delta.dc;
  const r = enemy.pos.row + delta.dr;
  if (!inBounds(state.grid, c, r)) return false;
  const cell = cellAt(state.grid, c, r);
  if (!cell || !cell.object) return false;
  if (cell.object.type === 'fried-egg') return false;
  if (HURL_ENEMY_TYPES.has(enemy.type)) {
    const tc = c + delta.dc;
    const tr = r + delta.dr;
    if (!inBounds(state.grid, tc, tr)) return false;
    if (cellAt(state.grid, tc, tr).object) return false;
  }
  return true;
}

export function processEnemyAction(state, enemy, dir) {
  const delta = DIR_DELTAS[dir];
  if (!delta) return;
  enemy.dir = dir;
  const frontCol = enemy.pos.col + delta.dc;
  const frontRow = enemy.pos.row + delta.dr;
  if (!inBounds(state.grid, frontCol, frontRow)) return;
  const frontCell = cellAt(state.grid, frontCol, frontRow);
  if (frontCell.object) {
    if (frontCell.object.type === 'fried-egg') return;
    if (enemy.type === 'enemy1') {
      enemyDestroyInPlace(state, frontCol, frontRow);
      enemy.nextActionMs = state.timeMs + (BALANCE.ENEMY_ACTION_COOLDOWN_MS || 0);
    } else if (HURL_ENEMY_TYPES.has(enemy.type)) {
      enemyHurl(state, enemy, dir, frontCol, frontRow);
      enemy.nextActionMs = state.timeMs + (BALANCE.ENEMY_ACTION_COOLDOWN_MS || 0);
    }
    return;
  }
  if (frontCell.hazard) return;
  if (cellHasActor(state, frontCol, frontRow, enemy)) return;
  startEnemyStep(enemy, frontCol, frontRow);
}

// Damages an enemy. Returns true if the enemy actually died (HP went to 0).
// Returns false if the enemy is still alive (e.g. Titan after one hit).
// Callers that branch on "did it die?" should use this; callers that just
// want to defeat the enemy regardless can call this with damage=Infinity.
export function damageEnemy(state, enemy, cause, attributedPlayerId, damage) {
  if (!enemy) return false;
  const idx = state.enemies.indexOf(enemy);
  if (idx === -1) return false;
  const dmg = Number.isFinite(damage) ? damage : 1;
  enemy.hp = (typeof enemy.hp === 'number' ? enemy.hp : 1) - dmg;
  if (enemy.hp > 0) {
    state.eventQueue.push({
      type: 'enemyHit',
      enemyType: enemy.type,
      cell: { col: enemy.pos.col, row: enemy.pos.row },
      hpRemaining: enemy.hp,
      cause,
    });
    return false;
  }
  state.enemies.splice(idx, 1);
  const cell = { col: enemy.pos.col, row: enemy.pos.row };
  state.eventQueue.push({
    type: 'enemyDefeated',
    enemyType: enemy.type,
    cell,
    cause,
  });
  const playerId = attributedPlayerId
    || (state.players[0] && state.players[0].id)
    || 'p1';
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return true;
  const scoreKey = KILL_SCORE_BY_TYPE[enemy.type];
  const points = scoreKey ? BALANCE[scoreKey] : 0;
  if (points > 0) {
    awardScore(state, playerId, points, 'enemyKill', cell);
  }
  return true;
}

// Back-compat alias: existing callers used defeatEnemy meaning "kill it now".
export function defeatEnemy(state, enemy, cause, attributedPlayerId) {
  return damageEnemy(state, enemy, cause, attributedPlayerId, Infinity);
}

function isTimeFrozen(state) {
  return state.timeFreezeUntilMs != null
    && state.timeFreezeUntilMs > state.timeMs;
}

// Global enemy-speed multiplier. Combines Bear's slowEnemies upgrades and
// Owl's Time-Freeze Afterglow window. Per-enemy frozen/cast checks are
// orthogonal (handled in tickEnemies callers).
function enemySpeedMultiplier(state) {
  let mult = 1;
  if (Array.isArray(state.players)) {
    let bearMult = 1;
    for (const p of state.players) {
      if (!p || p.alive === false || !p.upgrades) continue;
      if (p.upgrades.slowEnemies2) { bearMult = Math.min(bearMult, 0.8); break; }
      if (p.upgrades.slowEnemies1) bearMult = Math.min(bearMult, 0.9);
    }
    mult *= bearMult;
  }
  // Afterglow: slow window kicks in after time-freeze ends.
  if (!isTimeFrozen(state)
      && typeof state.timeAfterglowEndMs === 'number'
      && state.timeAfterglowEndMs > state.timeMs) {
    mult *= 0.5;
  }
  return mult;
}

export function isEnemyFrozen(enemy, state) {
  return !!(enemy && typeof enemy.frozenUntilMs === 'number'
    && enemy.frozenUntilMs > state.timeMs);
}

function expireHazards(state) {
  const grid = state.grid;
  if (!grid) return;
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (cell && cell.hazard && typeof cell.hazard.expiresMs === 'number'
          && cell.hazard.expiresMs <= state.timeMs) {
        cell.hazard = null;
      }
    }
  }
}

function tickEnemyCast(state, enemy) {
  if (!enemy.cast) return;
  if (state.timeMs >= enemy.cast.completesMs) {
    if (enemy.cast.kind === 'trap') {
      completeE3Cast(state, enemy);
    } else if (enemy.cast.kind === 'fireball') {
      completeE4Cast(state, enemy);
    } else {
      enemy.cast = null;
    }
  }
}

function canStartTrapCast(state, enemy) {
  const cool = enemy.abilityCooldownUntilMs || 0;
  if (state.timeMs < cool) return false;
  const cell = cellAt(state.grid, enemy.pos.col, enemy.pos.row);
  if (!cell || cell.hazard) return false;
  return true;
}

function startE3Cast(state, enemy) {
  enemy.cast = {
    kind: 'trap',
    startedMs: state.timeMs,
    completesMs: state.timeMs + BALANCE.E3_TRAP_CAST_MS,
  };
}

function completeE3Cast(state, enemy) {
  const cell = cellAt(state.grid, enemy.pos.col, enemy.pos.row);
  if (cell && !cell.hazard) {
    cell.hazard = {
      type: 'slow-trap',
      sourceEnemyId: enemy.id,
      expiresMs: state.timeMs + BALANCE.E3_TRAP_DURATION_MS,
    };
  }
  enemy.cast = null;
  enemy.abilityCooldownUntilMs = state.timeMs + BALANCE.E3_TRAP_COOLDOWN_MS;
}

function canStartFireballCast(state, enemy) {
  const cool = enemy.abilityCooldownUntilMs || 0;
  if (state.timeMs < cool) return false;
  const rng = state.rng || Math.random;
  return rng() < E4_CAST_ROLL;
}

function startE4Cast(state, enemy) {
  enemy.cast = {
    kind: 'fireball',
    startedMs: state.timeMs,
    completesMs: state.timeMs + BALANCE.E4_FIREBALL_CAST_MS,
  };
  state.eventQueue.push({
    type: 'enemy4CastStart',
    cell: { col: enemy.pos.col, row: enemy.pos.row },
  });
}

function completeE4Cast(state, enemy) {
  const delta = DIR_DELTAS[enemy.dir];
  let spawned = false;
  if (delta) {
    const fc = enemy.pos.col + delta.dc;
    const fr = enemy.pos.row + delta.dr;
    if (inBounds(state.grid, fc, fr)) {
      const cell = cellAt(state.grid, fc, fr);
      if (!cell.object) {
        state.movingObjects.push({
          id: state.nextObjectId++,
          type: 'fireball',
          pos: { col: fc, row: fr },
          dir: enemy.dir,
          progress: 0,
          hurlerId: enemy.id,
          bouncesUsed: 0,
        });
        state.eventQueue.push({
          type: 'hurl',
          cell: { col: fc, row: fr },
          dir: enemy.dir,
        });
        spawned = true;
      }
    }
  }
  enemy.cast = null;
  enemy.abilityCooldownUntilMs = state.timeMs + BALANCE.E4_FIREBALL_COOLDOWN_MS;
  return spawned;
}

function advanceEnemyMove(state, enemy, dtMs) {
  // If the destination became blocked mid-move (e.g., a rock landed there
  // after the move started), abort IMMEDIATELY — not at completion. Without
  // this snap-back, the enemy keeps interpolating visually toward the now-
  // blocked cell and reads as "passing through" the obstacle.
  const target = enemy.move.to;
  const dstCell = cellAt(state.grid, target.col, target.row);
  if (dstCell && dstCell.object) {
    enemy.move = null;
    return;
  }
  const speedKey = SPEED_BY_TYPE[enemy.type];
  const speed = BALANCE[speedKey] * enemySpeedMultiplier(state);
  enemy.move.t += (speed * dtMs) / 1000;
  if (enemy.move.t >= 1) {
    enemy.pos = { col: target.col, row: target.row };
    enemy.enteredFromDir = REVERSE_DIR[enemy.dir];
    enemy.move = null;
  }
}

function enemyDestroyInPlace(state, col, row) {
  const cell = cellAt(state.grid, col, row);
  const objType = cell.object.type;
  clearObject(state.grid, col, row);
  state.eventQueue.push({
    type: 'objectDestroy',
    cell: { col, row },
    objectType: objType,
  });
  // If the destroyed object was a fireball, it explodes — the enemy that
  // triggered it is adjacent and gets caught in the radius.
  if (objType === 'fireball') {
    applyExplosion(state, { col, row });
  }
}

function enemyHurl(state, enemy, dir, frontCol, frontRow) {
  const cell = cellAt(state.grid, frontCol, frontRow);
  const objType = cell.object.type;
  const delta = DIR_DELTAS[dir];
  const twoCol = frontCol + delta.dc;
  const twoRow = frontRow + delta.dr;
  const twoInBounds = inBounds(state.grid, twoCol, twoRow);
  const twoCell = twoInBounds ? cellAt(state.grid, twoCol, twoRow) : null;
  const twoBlocked = !twoInBounds || twoCell.object != null;
  clearObject(state.grid, frontCol, frontRow);
  if (twoBlocked) {
    state.eventQueue.push({
      type: 'objectDestroy',
      cell: { col: frontCol, row: frontRow },
      objectType: objType,
    });
    return;
  }
  const moverId = state.nextObjectId++;
  state.movingObjects.push({
    id: moverId,
    type: objType,
    pos: { col: frontCol, row: frontRow },
    dir,
    progress: 0,
    hurlerId: enemy.id,
    bouncesUsed: 0,
  });
  state.eventQueue.push({
    type: 'hurl',
    cell: { col: frontCol, row: frontRow },
    dir,
  });
}

function cellHasActor(state, col, row, exceptEnemy) {
  for (const e of state.enemies) {
    if (e === exceptEnemy) continue;
    if (e.pos.col === col && e.pos.row === row) return true;
  }
  return false;
}

export function resolveEnemyContactKills(state) {
  if (!Array.isArray(state.players)) return;
  if (!Array.isArray(state.enemies) || state.enemies.length === 0) return;
  for (const player of state.players) {
    if (!player || player.alive === false) continue;
    const invulnUntil = player.status && player.status.invulnUntilMs;
    const isInvuln = typeof invulnUntil === 'number' && invulnUntil > state.timeMs;
    const berserkUntil = player.status && player.status.berserkUntilMs;
    const isBerserk = typeof berserkUntil === 'number' && berserkUntil > state.timeMs;
    // Pass 1: kill any frozen enemies the player overlaps — these stay killable
    // regardless of invuln status. While berserk, ALL contacted enemies count
    // (the player dishes out the kill instead of taking damage).
    for (let i = state.enemies.length - 1; i >= 0; i--) {
      const enemy = state.enemies[i];
      if (!enemy) continue;
      if (!actorsOverlap(player, enemy)) continue;
      if (isEnemyFrozen(enemy, state) || isBerserk) {
        killFrozenEnemyOnTouch(state, enemy, i, player);
      }
    }
    if (isInvuln || isBerserk) continue;
    // Pass 2: any remaining non-frozen overlap kills the player.
    for (const enemy of state.enemies) {
      if (!enemy) continue;
      if (!actorsOverlap(player, enemy)) continue;
      if (isEnemyFrozen(enemy, state)) continue;
      killPlayerOnContact(state, player);
      break;
    }
  }
}

// Phantom teleport: find a random open, in-bounds cell at least 3 cells away
// from any live player. Skip the teleport silently if nothing qualifies.
function tryTeleport(state, enemy) {
  const grid = state.grid;
  if (!grid || !grid[0]) return;
  const rows = grid.length;
  const cols = grid[0].length;
  const players = state.players || [];
  const candidates = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      if (!cell || cell.object || cell.windup || cell.hazard) continue;
      let safe = true;
      for (const p of players) {
        if (!p || p.alive === false || !p.pos) continue;
        const dx = Math.abs(p.pos.col - c);
        const dy = Math.abs(p.pos.row - r);
        if (Math.max(dx, dy) < 3) { safe = false; break; }
      }
      if (!safe) continue;
      // Also avoid stacking on top of another enemy.
      let occupied = false;
      for (const other of state.enemies) {
        if (other === enemy) continue;
        if (other.pos && other.pos.col === c && other.pos.row === r) { occupied = true; break; }
      }
      if (occupied) continue;
      candidates.push({ col: c, row: r });
    }
  }
  if (candidates.length === 0) return;
  const rng = typeof state.rng === 'function' ? state.rng : Math.random;
  const pick = candidates[Math.min(Math.floor(rng() * candidates.length), candidates.length - 1)];
  enemy.pos = { col: pick.col, row: pick.row };
  enemy.move = null;
  state.eventQueue ??= [];
  state.eventQueue.push({
    type: 'enemyTeleport',
    cell: { col: pick.col, row: pick.row },
    enemyType: enemy.type,
  });
}

function killFrozenEnemyOnTouch(state, enemy, index, player) {
  state.enemies.splice(index, 1);
  const at = { col: enemy.pos.col, row: enemy.pos.row };
  state.eventQueue.push({
    type: 'enemyDefeated',
    enemyType: enemy.type,
    cell: at,
    cause: 'frozenTouch',
  });
  const scoreKey = KILL_SCORE_BY_TYPE[enemy.type];
  const points = scoreKey ? BALANCE[scoreKey] : 0;
  if (points > 0 && player && player.id) {
    awardScore(state, player.id, points, 'enemyKill', at);
  }
}

function actorsOverlap(a, b) {
  if (sameCell(a.pos, b.pos)) return true;
  if (a.move && a.move.to && sameCell(a.move.to, b.pos)) return true;
  if (b.move && b.move.to && sameCell(a.pos, b.move.to)) return true;
  if (a.move && a.move.to && b.move && b.move.to
      && sameCell(a.move.to, b.move.to)) return true;
  return false;
}

function sameCell(a, b) {
  return !!a && !!b && a.col === b.col && a.row === b.row;
}

function killPlayerOnContact(state, player) {
  player.alive = false;
  player.deathTimeMs = state.timeMs;
  if (typeof player.lives === 'number') player.lives -= 1;
  clearPowerupsOnDeath(state, player);
  state.eventQueue.push({
    type: 'playerDeath',
    playerId: player.id,
    cell: { col: player.pos.col, row: player.pos.row },
    cause: 'enemyContact',
  });
}

function startEnemyStep(enemy, toCol, toRow) {
  enemy.move = {
    from: { col: enemy.pos.col, row: enemy.pos.row },
    to: { col: toCol, row: toRow },
    t: 0,
  };
}

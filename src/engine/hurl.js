import { BALANCE } from './constants.js';
import { inBounds } from './grid.js';
import { awardScore } from './score.js';
import { applyExplosion } from './explode.js';
import { cancelSpawnAt } from './destroy.js';
import { clearPowerupsOnDeath } from './powerup.js';
import { tryAbsorbHit as tryAbsorbItemHit } from './item-effects.js';

const DIR_DELTA = {
  up: { col: 0, row: -1 },
  down: { col: 0, row: 1 },
  left: { col: -1, row: 0 },
  right: { col: 1, row: 0 },
};

const REVERSE_DIR = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

export function applyHurlCommand(state, playerId) {
  const player = findPlayer(state, playerId);
  if (!player || player.alive === false) return;
  const dir = player.dir;
  if (!DIR_DELTA[dir]) return;
  const front = stepCell(player.pos, dir);
  if (!inBounds(state.grid, front.col, front.row)) return;
  const frontCell = state.grid[front.row][front.col];
  if (!frontCell.object) return;
  let objType = frontCell.object.type;
  if (objType === 'fried-egg') return;
  // Rabbit's "Easter Egg" upgrade: a hurled egg behaves as a fireball for the
  // duration of this hurl (explodes on stop, kills on slide, etc). The grid
  // cell is cleared the same way; only the in-flight type changes.
  if (objType === 'egg' && player.upgrades && player.upgrades.easterEgg) {
    objType = 'fireball';
  }
  // Lion's "Rock to Explosive" upgrade: when a charge is queued (via F key)
  // and the front cell is a rock, the rock becomes a fireball for this hurl.
  // "Twin Blast" lets the player fire TWO explosives before cooldown applies.
  if (objType === 'rock'
      && player.upgrades && player.upgrades.rockToExplosive
      && player.explosiveQueuedUntilMs && player.explosiveQueuedUntilMs > state.timeMs) {
    objType = 'fireball';
    // Charges per cooldown: triple → 3, twin → 2, baseline → 1.
    let chargesPerCooldown = 1;
    if (player.upgrades && player.upgrades.tripleBlast) chargesPerCooldown = 3;
    else if (player.upgrades && player.upgrades.twinBlast) chargesPerCooldown = 2;
    const used = (player.twinBlastChargesUsed || 0) + 1;
    if (used < chargesPerCooldown) {
      player.twinBlastChargesUsed = used;
      // Keep the queue open for the next charge.
    } else {
      player.explosiveQueuedUntilMs = 0;
      let cdMs = 30000;
      if (player.upgrades) {
        if (player.upgrades.instantCharge) cdMs = 7000;
        else if (player.upgrades.quickCharge) cdMs = 15000;
      }
      player.explosiveCooldownUntilMs = state.timeMs + cdMs;
      player.twinBlastChargesUsed = 0;
    }
  }
  if (frontCell.windup && objType === 'rock') {
    cancelSpawnAt(state, player, front, frontCell);
    return;
  }
  const twoAhead = stepCell(front, dir);
  if (isStopBoundary(state, twoAhead)) {
    destroyInPlace(state, player, front, objType);
    return;
  }
  spawnMover(state, player, front, dir, objType);
}

function destroyInPlace(state, player, cell, objType) {
  state.grid[cell.row][cell.col].object = null;
  state.eventQueue.push({
    type: 'objectDestroy',
    cell: { col: cell.col, row: cell.row },
    objectType: objType,
  });
  if (objType === 'egg') {
    awardScore(state, player.id, BALANCE.SCORE_EGG_CRACK, 'eggCrack', { col: cell.col, row: cell.row });
  } else if (objType === 'fireball') {
    applyExplosion(state, { col: cell.col, row: cell.row });
  } else if (objType === 'rock') {
    awardScore(state, player.id, 1, 'rockBreak', null, { silent: true });
  }
}

function spawnMover(state, player, frontCell, dir, objType) {
  // Pig's "Donut Mastery" upgrade: +1 max bounces for any donut hurled by the
  // owning player. Stored on the mover so the bounce logic stays player-agnostic.
  const upgrades = player.upgrades || {};
  // Donut Mastery+ → +2 bounces total; Donut Mastery → +1; baseline → 0.
  let bonusBounces = 0;
  if (objType === 'donut') {
    if (upgrades.donutMastery2) bonusBounces = 2;
    else if (upgrades.donutMastery) bonusBounces = 1;
  }
  // Pig's "Power Push": rocks hurled by this player travel 50% faster.
  // Power Push+ → 2.0× rock speed; Power Push → 1.5×; baseline → 1×.
  let speedMul = 1;
  if (objType === 'rock') {
    if (upgrades.powerPush2) speedMul = 2.0;
    else if (upgrades.powerPush) speedMul = 1.5;
  }
  const mover = {
    id: state.nextObjectId++,
    type: objType,
    pos: { col: frontCell.col, row: frontCell.row },
    dir,
    progress: 0,
    hurlerId: player.id,
    bouncesUsed: 0,
    killChainCount: 0,
    maxBouncesOverride: bonusBounces > 0 ? BALANCE.DONUT_MAX_BOUNCES + bonusBounces : null,
    speedMul,
  };
  state.grid[frontCell.row][frontCell.col].object = null;
  state.movingObjects.push(mover);
  state.eventQueue.push({
    type: 'hurl',
    cell: { col: frontCell.col, row: frontCell.row },
    dir,
  });
  emitTelegraphIfLong(state, mover);
}

function emitTelegraphIfLong(state, mover) {
  const threshold = BALANCE.LONG_HURL_TELEGRAPH_LEAD_CELLS;
  if (typeof threshold !== 'number') return;
  const lane = projectLane(state, mover);
  if (lane.length < threshold) return;
  const crossesPlayer = lane.some((cell) =>
    state.players.some((p) => p.alive !== false && p.pos.col === cell.col && p.pos.row === cell.row)
  );
  if (crossesPlayer) {
    state.eventQueue.push({ type: 'hurlPath', cells: lane });
  }
}

function projectLane(state, mover) {
  const cells = [];
  let cur = { col: mover.pos.col, row: mover.pos.row };
  const max = state.level.dims.cols + state.level.dims.rows;
  for (let i = 0; i < max; i++) {
    cur = stepCell(cur, mover.dir);
    if (!inBounds(state.grid, cur.col, cur.row)) break;
    if (state.grid[cur.row][cur.col].object) break;
    cells.push({ col: cur.col, row: cur.row });
  }
  return cells;
}

export function tickMovingObjects(state, dtMs) {
  if (!state.movingObjects || state.movingObjects.length === 0) return;
  const baseDelta = BALANCE.HURL_OBJECT_SPEED * dtMs / 1000;
  for (const m of state.movingObjects) {
    // Per-mover speed multiplier (e.g., Pig's Power Push for rocks).
    const mul = typeof m.speedMul === 'number' && m.speedMul > 0 ? m.speedMul : 1;
    m.progress += baseDelta * mul;
  }
  const dims = state.level.dims;
  const stopped = new Set();
  const guardLimit = (dims.cols + dims.rows) * (state.movingObjects.length + 1) + 16;
  let guard = 0;
  while (guard++ < guardLimit) {
    const ready = state.movingObjects.filter((m) => !stopped.has(m.id) && m.progress >= 1);
    if (ready.length === 0) break;
    if (handleBouncePairs(state, ready, stopped)) continue;
    const m = ready[0];
    const target = stepCell(m.pos, m.dir);
    const result = resolveSlideCollision(state, m, target);
    if (result.stopped) {
      stopped.add(m.id);
      stopMover(state, m);
    } else if (result.reverse) {
      m.dir = REVERSE_DIR[m.dir];
      m.bouncesUsed += 1;
      m.progress = Math.max(0, m.progress - 1);
    } else {
      m.pos = { col: target.col, row: target.row };
      m.progress -= 1;
    }
  }
  state.movingObjects = state.movingObjects.filter((m) => !stopped.has(m.id));
}

function handleBouncePairs(state, ready, stopped) {
  for (let i = 0; i < ready.length; i++) {
    for (let j = i + 1; j < ready.length; j++) {
      const a = ready[i];
      const b = ready[j];
      if (stopped.has(a.id) || stopped.has(b.id)) continue;
      const aTarget = stepCell(a.pos, a.dir);
      const bTarget = stepCell(b.pos, b.dir);
      const sameTarget = aTarget.col === bTarget.col && aTarget.row === bTarget.row;
      const headOn =
        aTarget.col === b.pos.col && aTarget.row === b.pos.row &&
        bTarget.col === a.pos.col && bTarget.row === a.pos.row;
      if (sameTarget || headOn) {
        for (const m of [a, b]) {
          const cap = typeof m.maxBouncesOverride === 'number' ? m.maxBouncesOverride : BALANCE.DONUT_MAX_BOUNCES;
          if (m.type === 'donut' && m.bouncesUsed >= cap) {
            stopped.add(m.id);
            stopMover(state, m);
          } else {
            m.dir = REVERSE_DIR[m.dir];
            m.bouncesUsed += 1;
            m.progress = Math.max(0, m.progress - 1);
          }
        }
        return true;
      }
    }
  }
  return false;
}

export function resolveSlideCollision(state, mover, cell) {
  const offGrid = !inBounds(state.grid, cell.col, cell.row);
  const blocked = !offGrid && state.grid[cell.row][cell.col].object != null;
  if (offGrid || blocked) {
    const cap = typeof mover.maxBouncesOverride === 'number' ? mover.maxBouncesOverride : BALANCE.DONUT_MAX_BOUNCES;
    if (mover.type === 'donut' && mover.bouncesUsed < cap) {
      // Bouncing donuts still kill actors at the cell they're bouncing AT
      // (their current pos), not just on the slide path. This catches a player
      // or enemy who walked next to the wall mid-flight.
      killActorsAtCell(state, mover, mover.pos);
      return { stopped: false, reverse: true };
    }
    return { stopped: true, reverse: false };
  }
  const entered = state.grid[cell.row][cell.col];
  if (entered.hazard) {
    entered.hazard = null;
  }
  killActorsAtCell(state, mover, cell);
  return { stopped: false, reverse: false };
}

function killActorsAtCell(state, mover, cell) {
  for (const p of state.players) {
    if (p.alive === false) continue;
    if (!actorOccupiesCell(p, cell)) continue;
    // Pig's "Trampoline" — own bounced donut intercepts grant a temporary
    // speed boost. Check FIRST so we can intercept before the partner-skip.
    if (mover && mover.type === 'donut' && mover.bouncesUsed > 0
        && p.upgrades && p.upgrades.trampoline && p.upgrades.bounceImmunity
        && mover.hurlerId === p.id && !mover.trampolineUsed) {
      mover.trampolineUsed = true;
      // Super Trampoline: +2 stacks for 8s instead of +1 for 5s.
      const isSuper = !!p.upgrades.superTrampoline;
      const stackGain = isSuper ? 2 : 1;
      const durationMs = isSuper ? 8000 : 5000;
      // No explicit clamp here — effectiveSpeed() in move.js applies the
      // global FRIED_EGG_SPEED_CAP at speed-computation time.
      p.speedStacks = (p.speedStacks || 0) + stackGain;
      p.trampolineExpiresMs = (state.timeMs || 0) + durationMs;
      state.eventQueue = state.eventQueue || [];
      state.eventQueue.push({
        type: 'abilityFire',
        label: isSuper ? 'SUPER TRAMPOLINE!' : 'TRAMPOLINE!',
        cell: { col: p.pos.col, row: p.pos.row },
      });
      continue;
    }
    if (isPartner(mover, p)) continue;
    // Pig's "Bounce Immunity" upgrade: donuts that have already bounced cannot
    // kill this player. Original first-pass hit is still lethal.
    if (mover && mover.type === 'donut' && mover.bouncesUsed > 0
        && p.upgrades && p.upgrades.bounceImmunity) {
      continue;
    }
    killPlayer(state, p, cell);
  }
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const e = state.enemies[i];
    if (actorOccupiesCell(e, cell)) {
      defeatEnemyInline(state, e, i, cell, mover);
    }
  }
}

function actorOccupiesCell(actor, cell) {
  if (!actor || !actor.pos) return false;
  if (actor.pos.col === cell.col && actor.pos.row === cell.row) return true;
  if (actor.move && actor.move.to
      && actor.move.to.col === cell.col && actor.move.to.row === cell.row) {
    return true;
  }
  return false;
}

function isPartner(mover, player) {
  // Self-hurl is skipped so a thrown rock doesn't immediately kill its
  // thrower on spawn. Exception: a bounced donut coming back at the thrower
  // CAN kill them — that's the inherent risk of the bounce mechanic. The
  // Bounce Immunity upgrade protects the thrower (handled by the caller).
  if (!mover || !player) return false;
  if (mover.hurlerId !== player.id) return false;
  if (mover.type === 'donut' && mover.bouncesUsed > 0) return false;
  return true;
}

function killPlayer(state, player, cell) {
  const invulnUntil = player.status && player.status.invulnUntilMs;
  if (typeof invulnUntil === 'number' && invulnUntil > state.timeMs) return;
  // Shield Talisman absorbs the first hit. Sage Sword doesn't apply for hurl
  // damage (no enemy contact), but shield still saves you from a stray rock.
  const absorb = tryAbsorbItemHit(state, player, { cause: 'hurl' });
  if (absorb && absorb.absorbed) return;
  player.alive = false;
  player.deathTimeMs = state.timeMs;
  if (typeof player.lives === 'number') player.lives -= 1;
  clearPowerupsOnDeath(state, player);
  state.eventQueue.push({
    type: 'playerDeath',
    playerId: player.id,
    cell: { col: cell.col, row: cell.row },
  });
}

const ENEMY_KILL_SCORE_KEY = {
  enemy1: 'SCORE_E1_KILL',
  enemy2: 'SCORE_E2_KILL',
  enemy3: 'SCORE_E3_KILL',
  enemy4: 'SCORE_E4_KILL',
  enemy5: 'SCORE_E5_KILL',
  enemy6: 'SCORE_E6_KILL',
  enemy7: 'SCORE_E7_KILL',
};

function defeatEnemyInline(state, enemy, index, cell, mover) {
  const at = { col: cell.col, row: cell.row };
  // Tank check: enemy6 spawns with HP 2. First hit just wounds it and emits
  // an enemyHit event; chain bonus does NOT progress on a non-lethal hit.
  enemy.hp = (typeof enemy.hp === 'number' ? enemy.hp : 1) - 1;
  if (enemy.hp > 0) {
    state.eventQueue.push({
      type: 'enemyHit',
      enemyType: enemy.type,
      cell: at,
      hpRemaining: enemy.hp,
    });
    return;
  }
  state.enemies.splice(index, 1);
  state.eventQueue.push({
    type: 'enemyDefeated',
    enemyType: enemy.type,
    cell: at,
  });
  const scoreKey = ENEMY_KILL_SCORE_KEY[enemy.type];
  const basePoints = scoreKey ? BALANCE[scoreKey] : 0;
  if (basePoints <= 0) return;
  const chainIdx = (mover && typeof mover.killChainCount === 'number') ? mover.killChainCount : 0;
  const multiplier = 1 << Math.min(chainIdx, 5); // cap at 32x (chain of 6+)
  const points = basePoints * multiplier;
  if (mover) mover.killChainCount = chainIdx + 1;
  const hurlerId = mover && mover.hurlerId;
  const playerId =
    (typeof hurlerId === 'string' && (hurlerId === 'p1' || hurlerId === 'p2'))
      ? hurlerId
      : (state.players[0] && state.players[0].id) || 'p1';
  awardScore(state, playerId, points, 'enemyKill', at);
  // Visual chain feedback: emit a dedicated popup at 2x+ multipliers so the
  // player sees the chain building in real time.
  if (multiplier > 1) {
    state.eventQueue.push({
      type: 'scorePopup',
      cell: { col: at.col, row: Math.max(0, at.row - 1) },
      label: `CHAIN x${multiplier}`,
      points: 0,
      kind: 'chain',
      playerId,
    });
  }
}

function stopMover(state, mover) {
  const at = { col: mover.pos.col, row: mover.pos.row };
  if (mover.type === 'fireball') {
    applyExplosion(state, at, {
      hurlerId: mover.hurlerId,
      chainCount: mover.killChainCount || 0,
    });
    return;
  }
  state.grid[at.row][at.col].object = { type: mover.type, id: mover.id };
  state.eventQueue.push({
    type: 'objectStop',
    cell: at,
    objectType: mover.type,
  });
}

function isStopBoundary(state, cell) {
  if (!inBounds(state.grid, cell.col, cell.row)) return true;
  return state.grid[cell.row][cell.col].object != null;
}

function findPlayer(state, playerId) {
  for (const p of state.players) {
    if (p.id === playerId) return p;
  }
  return null;
}

function stepCell(pos, dir) {
  const d = DIR_DELTA[dir];
  return { col: pos.col + d.col, row: pos.row + d.row };
}

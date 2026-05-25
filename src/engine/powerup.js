import { BALANCE } from './constants.js';
import { awardScore } from './score.js';

export function tickBalloons(state, dtMs) {
  state.balloons ??= [];
  state.balloonScheduleIdx ??= 0;
  const schedule = (state.level && state.level.balloonSchedule) || [];
  while (
    state.balloonScheduleIdx < schedule.length &&
    schedule[state.balloonScheduleIdx].atTimeMs <= state.levelTimeMs
  ) {
    const entry = schedule[state.balloonScheduleIdx];
    state.balloons.push({
      id: state.nextBalloonId++,
      type: entry.type,
      col: entry.col,
      colFloat: entry.col,
      rowFloat: BALANCE.GRID_ROWS,
      ageMs: 0,
      // Random phase offset so multiple balloons don't sway in lockstep.
      phaseOffset: (state.rng ? state.rng() : Math.random()) * BALANCE.BALLOON_SWAY_PERIOD_MS,
    });
    // Monkey's "Lifeplus Drops" upgrade: when any live player owns it, every
    // lifePlus schedule entry has a 50% chance to spawn an additional clone
    // at an offset column.
    if (entry.type === 'lifePlus' && anyPlayerHasUpgrade(state, 'lifePlusDrops')) {
      const roll = state.rng ? state.rng() : Math.random();
      if (roll < 0.5) {
        const cols = (state.grid && state.grid[0] && state.grid[0].length) || BALANCE.GRID_COLS;
        const altCol = (entry.col + Math.floor(cols / 3)) % cols;
        state.balloons.push({
          id: state.nextBalloonId++,
          type: 'lifePlus',
          col: altCol,
          colFloat: altCol,
          rowFloat: BALANCE.GRID_ROWS,
          ageMs: 0,
          phaseOffset: (state.rng ? state.rng() : Math.random()) * BALANCE.BALLOON_SWAY_PERIOD_MS,
        });
      }
    }
    state.balloonScheduleIdx += 1;
  }
  if (state.balloons.length === 0) return;
  const riseDelta = BALANCE.BALLOON_RISE_SPEED * dtMs / 1000;
  const cols = (state.grid && state.grid[0] && state.grid[0].length) || BALANCE.GRID_COLS;
  const survivors = [];
  for (const balloon of state.balloons) {
    balloon.ageMs = (balloon.ageMs || 0) + dtMs;
    balloon.rowFloat -= riseDelta;
    // Horizontal sine sway: ±amplitude cells around the spawn column, clamped to grid.
    const t = (balloon.ageMs + (balloon.phaseOffset || 0)) / BALANCE.BALLOON_SWAY_PERIOD_MS;
    let sway = Math.sin(t * 2 * Math.PI) * BALANCE.BALLOON_SWAY_AMPLITUDE;
    const desired = balloon.col + sway;
    balloon.colFloat = Math.max(0, Math.min(cols - 1, desired));
    if (balloon.rowFloat > 0) survivors.push(balloon);
  }
  state.balloons = survivors;
  // Two collection paths, both supported simultaneously: walk into a balloon
  // OR hit it with a player-thrown projectile. Projectiles cast by enemies do
  // not collect. Run player-touch first so a balloon a player is already
  // standing on doesn't survive long enough for a passing rock to "steal" it.
  collectBalloonsAtPlayers(state);
  collectBalloonsWithProjectiles(state);
}

function collectBalloonsAtPlayers(state) {
  if (!state.balloons || state.balloons.length === 0) return;
  if (!Array.isArray(state.players) || state.players.length === 0) return;
  const remaining = [];
  for (const balloon of state.balloons) {
    const bCol = Math.round(typeof balloon.colFloat === 'number' ? balloon.colFloat : balloon.col);
    const bRow = Math.round(balloon.rowFloat);
    let collected = false;
    for (const p of state.players) {
      if (!p || p.alive === false) continue;
      const matchesPos = p.pos.col === bCol && p.pos.row === bRow;
      const matchesMoveTo = p.move && p.move.to
        && p.move.to.col === bCol && p.move.to.row === bRow;
      if (matchesPos || matchesMoveTo) {
        applyPowerup(state, p.id, balloon.type);
        state.eventQueue ??= [];
        // Pop FX at the balloon's actual position so the player sees what
        // they grabbed, even when player & balloon cell coincide.
        state.eventQueue.push({
          type: 'balloonPop',
          powerupType: balloon.type,
          cell: { col: bCol, row: bRow },
        });
        state.eventQueue.push({
          type: 'powerup',
          powerupType: balloon.type,
          playerId: p.id,
          cell: { col: p.pos.col, row: p.pos.row },
        });
        collected = true;
        break;
      }
    }
    if (!collected) remaining.push(balloon);
  }
  state.balloons = remaining;
}

// Balloons are collected exclusively by player-thrown projectiles. Enemy-cast
// movers (fireballs without a player hurlerId) pass through harmlessly.
// The mover continues on its path — only the balloon is consumed — and the
// powerup is awarded to the hurler.
function collectBalloonsWithProjectiles(state) {
  if (!state.balloons || state.balloons.length === 0) return;
  const movers = Array.isArray(state.movingObjects) ? state.movingObjects : [];
  if (movers.length === 0) return;
  const remaining = [];
  for (const balloon of state.balloons) {
    const bCol = Math.round(typeof balloon.colFloat === 'number' ? balloon.colFloat : balloon.col);
    const bRow = Math.round(balloon.rowFloat);
    let collectorId = null;
    for (const m of movers) {
      if (!m || !m.pos) continue;
      if (m.hurlerId !== 'p1' && m.hurlerId !== 'p2') continue;
      // Mover occupies its current cell; check that AND the next cell along
      // its direction so a fast projectile can't tunnel past a balloon in one
      // tick. Direction is one of 'left'/'right'/'up'/'down'.
      if (m.pos.col === bCol && m.pos.row === bRow) { collectorId = m.hurlerId; break; }
      const next = stepCellByDir(m.pos, m.dir);
      if (next && next.col === bCol && next.row === bRow) { collectorId = m.hurlerId; break; }
    }
    if (collectorId) {
      const player = findPlayer(state, collectorId);
      applyPowerup(state, collectorId, balloon.type);
      state.eventQueue ??= [];
      // Pop FX at the balloon's position (projectile hit point), so the
      // player sees the balloon shred mid-air even if they're far away.
      state.eventQueue.push({
        type: 'balloonPop',
        powerupType: balloon.type,
        cell: { col: bCol, row: bRow },
      });
      state.eventQueue.push({
        type: 'powerup',
        powerupType: balloon.type,
        playerId: collectorId,
        cell: player ? { col: player.pos.col, row: player.pos.row } : { col: bCol, row: bRow },
      });
    } else {
      remaining.push(balloon);
    }
  }
  state.balloons = remaining;
}

export function collectBalloon(state, playerId, balloonId) {
  if (!state.balloons || state.balloons.length === 0) return;
  const idx = state.balloons.findIndex((b) => b.id === balloonId);
  if (idx < 0) return;
  const balloon = state.balloons[idx];
  state.balloons.splice(idx, 1);
  applyPowerup(state, playerId, balloon.type);
  const player = findPlayer(state, playerId);
  state.eventQueue ??= [];
  state.eventQueue.push({
    type: 'powerup',
    powerupType: balloon.type,
    playerId,
    cell: player ? { col: player.pos.col, row: player.pos.row } : { col: balloon.col, row: 0 },
  });
}

export function tickPowerupTimers(state, dtMs) {
  const now = state.timeMs;
  if (Array.isArray(state.players)) {
    for (const player of state.players) {
      if (!player || !player.status) continue;
      const status = player.status;
      if (status.berserkUntilMs && now > status.berserkUntilMs) {
        delete status.berserkUntilMs;
      }
      if (status.invisibleUntilMs && now > status.invisibleUntilMs) {
        delete status.invisibleUntilMs;
      }
      if (status.invulnUntilMs && now > status.invulnUntilMs) {
        delete status.invulnUntilMs;
      }
      if (status.slowedUntilMs && now > status.slowedUntilMs) {
        delete status.slowedUntilMs;
      }
    }
  }
  if (typeof state.timeFreezeUntilMs === 'number' && now > state.timeFreezeUntilMs) {
    state.timeFreezeUntilMs = null;
  }
  if (typeof state.timeAfterglowEndMs === 'number' && now > state.timeAfterglowEndMs) {
    state.timeAfterglowEndMs = null;
  }
  expireHazards(state, now);
}

// Pop one of the player's inventory items of the given type and apply its
// effect immediately. Returns true if something was activated. Caller is
// expected to bind this to an input key (e.g. Q for P1).
export function activateInventoryItem(state, playerId, type) {
  const player = findPlayer(state, playerId);
  if (!player) return false;
  if (player.alive === false) return false;
  const inv = player.inventory || {};
  const count = inv[type] || 0;
  if (count <= 0) return false;
  inv[type] = count - 1;
  player.status ??= {};
  const now = state && typeof state.timeMs === 'number' ? state.timeMs : 0;
  if (type === 'berserk') {
    activateBerserk(state, player, now);
  } else if (type === 'invisibility') {
    applyInvisibility(state, player, now);
  } else if (type === 'timeFreeze') {
    applyTimeFreezeForPlayer(state, player, now);
  } else if (type === 'lifePlus') {
    player.lives = (player.lives || 0) + 1;
  } else {
    // Refund the count so unknown types don't silently lose inventory.
    inv[type] = count;
    return false;
  }
  state.eventQueue ??= [];
  state.eventQueue.push({
    type: 'powerup',
    powerupType: type,
    playerId: player.id,
    fromInventory: true,
    cell: { col: player.pos.col, row: player.pos.row },
  });
  return true;
}

export function applyPowerup(state, playerId, type) {
  const player = findPlayer(state, playerId);
  if (!player) return;
  player.status ??= {};
  const now = state.timeMs;
  switch (type) {
    case 'berserk': {
      // Wolf's "Inventory: Berserk" upgrade redirects collected Berserk
      // balloons into a stored slot instead of activating immediately. The
      // player taps Q (P1) to activate later. Without the upgrade, the
      // collection still activates immediately (vanilla behaviour).
      if (player.upgrades && player.upgrades.invBerserk) {
        player.inventory ??= {};
        player.inventory.berserk = (player.inventory.berserk || 0) + 1;
        state.eventQueue ??= [];
        state.eventQueue.push({
          type: 'inventoryStored',
          powerupType: 'berserk',
          playerId: player.id,
        });
        return;
      }
      activateBerserk(state, player, now);
      return;
    }
    case 'invisibility': {
      // Fox's "Inventory: Invisibility" upgrade banks pickups instead of
      // firing them. Without the upgrade, the pickup fires immediately.
      if (player.upgrades && player.upgrades.invInvisibility) {
        player.inventory ??= {};
        player.inventory.invisibility = (player.inventory.invisibility || 0) + 1;
        state.eventQueue ??= [];
        state.eventQueue.push({
          type: 'inventoryStored',
          powerupType: 'invisibility',
          playerId: player.id,
        });
        return;
      }
      applyInvisibility(state, player, now);
      return;
    }
    case 'timeFreeze': {
      // Owl's "Inventory: Time Freeze" upgrade banks pickups instead of
      // firing them. Without the upgrade, the pickup fires immediately
      // (affecting all enemies as before).
      if (player.upgrades && player.upgrades.invTimeFreeze) {
        player.inventory ??= {};
        player.inventory.timeFreeze = (player.inventory.timeFreeze || 0) + 1;
        state.eventQueue ??= [];
        state.eventQueue.push({
          type: 'inventoryStored',
          powerupType: 'timeFreeze',
          playerId: player.id,
        });
        return;
      }
      applyTimeFreezeForPlayer(state, player, now);
      return;
    }
    case 'lifePlus':
      player.lives = (player.lives || 0) + 1;
      return;
    case 'scorePlus500':
      awardScore(state, playerId, 500, 'scorePlus', { col: player.pos.col, row: player.pos.row });
      return;
    case 'scorePlus1000':
      awardScore(state, playerId, 1000, 'scorePlus', { col: player.pos.col, row: player.pos.row });
      return;
    case 'scorePlus2500':
      awardScore(state, playerId, 2500, 'scorePlus', { col: player.pos.col, row: player.pos.row });
      return;
    case 'multiplier2':
    case 'scoreMultiplier':
    case 'scoreMultiplier2':
      player.status.scoreMultiplier = 2;
      return;
    case 'multiplier3':
    case 'scoreMultiplier3':
      player.status.scoreMultiplier = 3;
      return;
    default:
      return;
  }
}

export function clearPowerupsOnDeath(state, player) {
  if (!player) return;
  const status = player.status || {};
  const preservedInvuln = status.invulnUntilMs;
  player.status = {};
  if (typeof preservedInvuln === 'number') {
    player.status.invulnUntilMs = preservedInvuln;
  }
  // Bear: persistentSpeed{N} sets a retention cap (0, 1, 2, or 3). After
  // death, speedStacks is min(current, cap). fastStart{N} also acts as a
  // floor — if you owned Fast Start II you spawn at +2 even if no fried-egg.
  const upgrades = player.upgrades || {};
  let retentionCap = 0;
  if (upgrades.persistentSpeed3) retentionCap = 3;
  else if (upgrades.persistentSpeed2) retentionCap = 2;
  else if (upgrades.persistentSpeed1) retentionCap = 1;
  let fastFloor = 0;
  if (upgrades.fastStart3) fastFloor = 3;
  else if (upgrades.fastStart2) fastFloor = 2;
  else if (upgrades.fastStart1) fastFloor = 1;
  const currentStacks = player.speedStacks || 0;
  player.speedStacks = Math.max(fastFloor, Math.min(currentStacks, retentionCap));
  // Reset per-level kill counter so speedOnKill stacks restart each spawn.
  player.killsThisLevel = 0;
}

export function clearPowerupsOnLevelClear(state) {
  state.timeFreezeUntilMs = null;
  if (!Array.isArray(state.players)) return;
  for (const player of state.players) {
    if (!player) continue;
    const status = player.status || {};
    const preservedInvuln = status.invulnUntilMs;
    player.status = {};
    if (typeof preservedInvuln === 'number') {
      player.status.invulnUntilMs = preservedInvuln;
    }
    player.speedStacks = 0;
  }
}

export function isTimeFrozen(state) {
  return typeof state.timeFreezeUntilMs === 'number' && state.timeFreezeUntilMs > state.timeMs;
}

// Shared berserk activation: applies the status timer and fires Wolf's
// "Howl Stun" upgrade if owned, regardless of whether the trigger was a
// direct balloon pickup or an inventory activation.
function activateBerserk(state, player, now) {
  let dur = BALANCE.BERSERK_DURATION_MS;
  if (player.upgrades) {
    // Tier 2 (+4s total) wins over tier 1 (+2s).
    if (player.upgrades.berserkPlus4) dur += 4000;
    else if (player.upgrades.berserkPlus2) dur += 2000;
  }
  player.status.berserkUntilMs = now + dur;
  if (player.upgrades && player.upgrades.howlStun && Array.isArray(state.enemies)) {
    const range = player.upgrades.howlStun2 ? 2 : 1; // 5×5 vs 3×3
    let stunned = 0;
    for (const e of state.enemies) {
      if (!e || !e.pos) continue;
      const dx = Math.abs(e.pos.col - player.pos.col);
      const dy = Math.abs(e.pos.row - player.pos.row);
      if (Math.max(dx, dy) <= range) {
        e.frozenUntilMs = Math.max(e.frozenUntilMs || 0, now + 2000);
        stunned += 1;
      }
    }
    if (stunned > 0) {
      state.eventQueue = state.eventQueue || [];
      state.eventQueue.push({
        type: 'abilityFire',
        label: 'HOWL!',
        cell: { col: player.pos.col, row: player.pos.row },
      });
    }
  }
}

function anyPlayerHasUpgrade(state, upgradeId) {
  const players = state && Array.isArray(state.players) ? state.players : [];
  for (const p of players) {
    if (p && p.alive !== false && p.upgrades && p.upgrades[upgradeId]) return true;
  }
  return false;
}

// Player-scoped wrapper: lets Owl's timePlus2/timePlus4 extend duration and
// timeAfterglow schedule a post-freeze slow window for all enemies.
function applyTimeFreezeForPlayer(state, player, now) {
  let duration = BALANCE.TIME_FREEZE_DURATION_MS;
  if (player && player.upgrades) {
    if (player.upgrades.timePlus4) duration += 4000;
    else if (player.upgrades.timePlus2) duration += 2000;
  }
  const until = now + duration;
  state.timeFreezeUntilMs = until;
  // Owl's "Afterglow": queue a slow window that activates as freeze expires.
  if (player && player.upgrades && (player.upgrades.timeAfterglow2 || player.upgrades.timeAfterglow)) {
    state.timeAfterglowEndMs = until + (player.upgrades.timeAfterglow2 ? 4000 : 2000);
  }
  freezeAllExistingEnemies(state, until, now);
}

// Back-compat helper for any path that doesn't know the activating player
// (e.g., the timeFreeze balloon firing on pickup before an Owl banks it).
function applyTimeFreeze(state, now) {
  const until = now + BALANCE.TIME_FREEZE_DURATION_MS;
  state.timeFreezeUntilMs = until;
  freezeAllExistingEnemies(state, until, now);
}

function freezeAllExistingEnemies(state, until, now) {
  if (!Array.isArray(state.enemies)) return;
  for (const enemy of state.enemies) {
    if (!enemy) continue;
    enemy.frozenUntilMs = until;
    if (!enemy.cast) continue;
    if (enemy.cast.kind === 'trap') {
      const grid = state.grid;
      if (Array.isArray(grid) && grid[enemy.pos.row] && grid[enemy.pos.row][enemy.pos.col]) {
        grid[enemy.pos.row][enemy.pos.col].hazard = {
          type: 'slow-trap',
          sourceEnemyId: enemy.id,
          expiresMs: now + BALANCE.E3_TRAP_DURATION_MS,
        };
      }
      enemy.cast = null;
      enemy.abilityCooldownUntilMs = now + BALANCE.E3_TRAP_COOLDOWN_MS;
    } else if (enemy.cast.kind === 'fireball') {
      enemy.cast = null;
      enemy.abilityCooldownUntilMs = now + BALANCE.E4_FIREBALL_COOLDOWN_MS;
    }
  }
}

// Invisibility now equals damage immunity (author intent 2026-05-23).
// Set invisibleUntilMs AND invulnUntilMs to the same expiry. Duration extends
// per Fox's stealthPlus2/stealthPlus4 upgrades. Resets the per-window kill
// counter that ambushStrike/ambushStrike2 read from.
function applyInvisibility(state, player, now) {
  let duration = BALANCE.INVISIBILITY_DURATION_MS;
  if (player && player.upgrades) {
    if (player.upgrades.stealthPlus4) duration += 4000;
    else if (player.upgrades.stealthPlus2) duration += 2000;
  }
  const until = now + duration;
  player.status ??= {};
  player.status.invisibleUntilMs = until;
  // Don't downgrade a stronger existing invuln (e.g., level-start invuln).
  player.status.invulnUntilMs = Math.max(player.status.invulnUntilMs || 0, until);
  player.invisibleKillsThisWindow = 0;
}

function stepCellByDir(pos, dir) {
  if (!pos) return null;
  if (dir === 'left')  return { col: pos.col - 1, row: pos.row };
  if (dir === 'right') return { col: pos.col + 1, row: pos.row };
  if (dir === 'up')    return { col: pos.col, row: pos.row - 1 };
  if (dir === 'down')  return { col: pos.col, row: pos.row + 1 };
  return null;
}

function findPlayer(state, playerId) {
  if (!Array.isArray(state.players)) return null;
  return state.players.find((p) => p && p.id === playerId) || null;
}

function expireHazards(state, now) {
  const grid = state.grid;
  if (!Array.isArray(grid)) return;
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (cell && cell.hazard && now > cell.hazard.expiresMs) {
        cell.hazard = null;
      }
    }
  }
}

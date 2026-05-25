import { BALANCE } from './constants.js';
import { findRockCells, cellAt } from './grid.js';

const DEFAULT_PATTERN = ['enemy1', 'enemy2', 'enemy3', 'enemy4', 'enemy5'];

export function effectiveCap(state) {
  const cap = state.level.enemyCap;
  const seconds = state.levelTimeMs / 1000;
  const past = seconds - BALANCE.ENEMY_SPAWN_RAMP_FLOOR_S;
  const steps = Math.max(0, Math.floor(past / BALANCE.ENEMY_SPAWN_RAMP_STEP_S) + 1);
  return Math.min(cap, BALANCE.ENEMY_SPAWN_CAP_INITIAL + steps);
}

export function tickSpawns(state, dtMs) {
  if (state.pendingSpawns.length > 0) {
    const remaining = [];
    for (const spawn of state.pendingSpawns) {
      const cell = cellAt(state.grid, spawn.cell.col, spawn.cell.row);
      if (!cell || cell.windup == null) {
        continue;
      }
      if (state.timeMs >= spawn.emergesMs) {
        emergeEnemy(state, spawn);
      } else {
        remaining.push(spawn);
      }
    }
    state.pendingSpawns = remaining;
  }
  tryScheduleSpawn(state);
}

export function tryScheduleSpawn(state) {
  const cap = effectiveCap(state);
  const active = state.enemies.length + state.pendingSpawns.length;
  if (active >= cap) return false;

  const candidates = findCandidateRocks(state);
  if (candidates.length === 0) return false;

  const type = pickNextType(state);
  if (type === null) return false;

  const idx = Math.min(Math.floor(state.rng() * candidates.length), candidates.length - 1);
  const pick = candidates[idx];
  const cell = cellAt(state.grid, pick.col, pick.row);
  if (!cell) {
    refundType(state, type);
    return false;
  }

  const startedMs = state.timeMs;
  const emergesMs = startedMs + BALANCE.ENEMY_SPAWN_WINDUP_MS;
  cell.windup = { enemyType: type, startedMs, emergesMs };
  state.pendingSpawns.push({
    cell: { col: pick.col, row: pick.row },
    type,
    startedMs,
    emergesMs,
  });
  state.eventQueue ??= [];
  state.eventQueue.push({
    type: 'enemyWindup',
    cell: { col: pick.col, row: pick.row },
    enemyType: type,
  });
  return true;
}

function emergeEnemy(state, spawn) {
  const cell = cellAt(state.grid, spawn.cell.col, spawn.cell.row);
  if (!cell) return;
  cell.windup = null;
  cell.object = null;
  // Enemy 6 "Titan" is a tank with HP 3 (takes three hits). Enemy 7 "Phantom"
  // is a trickster that teleports periodically — its first teleport fires
  // 5s after spawning. All other types stay at HP 1 with no special timers.
  const initialHp = spawn.type === 'enemy6' ? 3 : 1;
  const teleportUntilMs = spawn.type === 'enemy7' ? state.timeMs + 5000 : 0;
  const enemy = {
    id: state.nextEnemyId++,
    type: spawn.type,
    pos: { col: spawn.cell.col, row: spawn.cell.row },
    dir: 'down',
    move: null,
    enteredFromDir: null,
    abilityCooldownUntilMs: 0,
    cast: null,
    hp: initialHp,
    maxHp: initialHp,
    teleportNextMs: teleportUntilMs,
    // Post-spawn grace: for 500ms the enemy doesn't move, attack, throw,
    // break, or trap-cast. Touching it still kills the player — it's just
    // inert, not invuln. Lets the player react to a fresh spawn.
    inertUntilMs: state.timeMs + 500,
  };
  state.enemies.push(enemy);
  state.eventQueue ??= [];
  state.eventQueue.push({
    type: 'enemySpawn',
    cell: { col: enemy.pos.col, row: enemy.pos.row },
    enemyType: enemy.type,
  });
}

function pickNextType(state) {
  const pattern = state.level.enemySpawnPattern || DEFAULT_PATTERN;
  if (state.spawnCycleIndex === undefined) state.spawnCycleIndex = 0;
  const budget = state.level.enemyBudget || {};
  for (let i = 0; i < pattern.length; i++) {
    const idx = state.spawnCycleIndex % pattern.length;
    const type = pattern[idx];
    state.spawnCycleIndex = idx + 1;
    if ((budget[type] || 0) > 0) {
      budget[type] -= 1;
      return type;
    }
  }
  return null;
}

function refundType(state, type) {
  if (!state.level.enemyBudget) state.level.enemyBudget = {};
  state.level.enemyBudget[type] = (state.level.enemyBudget[type] || 0) + 1;
}

function findCandidateRocks(state) {
  const rocks = findRockCells(state.grid);
  const candidates = [];
  for (const r of rocks) {
    const cell = cellAt(state.grid, r.col, r.row);
    if (!cell || cell.windup) continue;
    if (isClobbered(state, r.col, r.row)) continue;
    candidates.push(r);
  }
  return candidates;
}

function isClobbered(state, col, row) {
  const radius = BALANCE.ENEMY_SPAWN_NO_CLOBBER_RADIUS;
  const players = state.players || [];
  for (const p of players) {
    if (!p || !p.pos) continue;
    if (chebyshev(p.pos.col, p.pos.row, col, row) <= radius) return true;
  }
  const enemies = state.enemies || [];
  for (const e of enemies) {
    if (!e || !e.pos) continue;
    if (chebyshev(e.pos.col, e.pos.row, col, row) <= radius) return true;
  }
  return false;
}

function chebyshev(c1, r1, c2, r2) {
  return Math.max(Math.abs(c1 - c2), Math.abs(r1 - r2));
}

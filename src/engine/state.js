import { mulberry32 } from './rng.js';
import { createGrid } from './grid.js';
import { applyMoveCommand, tickPlayerMovement } from './move.js';
import { applyDestroyCommand } from './destroy.js';
import { tickExplosions } from './explode.js';
import { tickMovingObjects, applyHurlCommand } from './hurl.js';
import { tickEnemies, resolveEnemyContactKills } from './enemies.js';
import { tickSpawns } from './spawn.js';
import { tickBalloons, tickPowerupTimers } from './powerup.js';
import { checkWinLoss } from './winloss.js';
import { loadLevel, hashLevelId } from './level-loader.js';
import { BALANCE } from './constants.js';
import { tickClones } from './clones.js';

export function createState(level, runSeed) {
  if (level && Array.isArray(level.playerSpawns)) {
    return loadLevel(level, runSeed);
  }
  const seed0 = (runSeed === undefined ? 0 : runSeed) >>> 0;
  const seed = (hashLevelId(level.id) ^ seed0) >>> 0;
  const rng = mulberry32(seed);
  const levelWithSeed = Object.assign({}, level, { runSeed: seed0 });
  const grid = createGrid(level.dims);
  return {
    level: levelWithSeed,
    grid,
    players: [],
    enemies: [],
    pendingSpawns: [],
    movingObjects: [],
    balloons: [],
    explosions: [],
    commandQueue: [],
    eventQueue: [],
    timeMs: 0,
    levelTimeMs: 0,
    timeFreezeUntilMs: null,
    rng,
    status: 'playing',
    pauseState: 'running',
    nextEnemyId: 1,
    nextObjectId: 1,
    nextBalloonId: 1,
    nextExplosionId: 1,
    scoreMilestoneCrossed: 0,
    spawnCycleIndex: 0,
    balloonScheduleIdx: 0,
  };
}

export function tick(state, dtMs) {
  // Pause/mute drains every tick (even during countdown) so the player can
  // always pause; the rest of the queue is filtered by the gate below.
  drainSystemCommands(state);
  if (state.pauseState === 'paused' || state.pauseState === 'blurred') {
    return;
  }

  // Pre-level countdown — freezes entity logic and discards player input.
  // Time itself advances so the countdown can elapse and visuals (level intro,
  // sprite breathing, music) can still tick.
  const countdownMs = BALANCE.LEVEL_COUNTDOWN_MS || 0;
  if (countdownMs > 0 && (state.levelTimeMs || 0) < countdownMs) {
    if (Array.isArray(state.commandQueue)) state.commandQueue.length = 0;
    state.timeMs += dtMs;
    state.levelTimeMs += dtMs;
    state.levelIntroAgeMs = (state.levelIntroAgeMs || 0) + dtMs;
    return;
  }

  drainCommands(state);
  tickPlayerMovement(state, dtMs);
  tickEnemies(state, dtMs);
  resolveEnemyContactKills(state);
  tickClones(state);
  tickProximityBombs(state);
  tickBalloons(state, dtMs);
  tickMovingObjects(state, dtMs);
  tickExplosions(state, dtMs);
  tickSpawns(state, dtMs);
  tickPowerupTimers(state, dtMs);
  tickPlayerRespawn(state);
  state.timeMs += dtMs;
  state.levelTimeMs += dtMs;
  state.levelIntroAgeMs = (state.levelIntroAgeMs || 0) + dtMs;
  checkWinLoss(state);
}

// Rabbit's bombCarrying: dropped eggBombs sit as fireballs with a
// `proximityBomb` flag. When any enemy ends up adjacent (including
// orthogonal-cell neighbours), the bomb detonates and explodes.
function tickProximityBombs(state) {
  if (!state.grid) return;
  const enemies = state.enemies || [];
  if (enemies.length === 0) return;
  const rows = state.grid.length;
  // If any player owns Chain Reaction, bombs reach 2 cells. Per-bomb owner
  // tracking would be cleaner, but proximity bombs aren't tagged with hurlerId.
  // Mega Chain → radius 3; Chain Reaction → 2; baseline → 1.
  const players = state.players || [];
  let detectRadius = 1;
  if (players.some((p) => p && p.upgrades && p.upgrades.megaChain)) detectRadius = 3;
  else if (players.some((p) => p && p.upgrades && p.upgrades.chainReaction)) detectRadius = 2;
  for (let r = 0; r < rows; r++) {
    const row = state.grid[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (!cell || !cell.proximityBomb) continue;
      let triggered = false;
      for (const e of enemies) {
        if (!e || !e.pos) continue;
        const dx = Math.abs(e.pos.col - c);
        const dy = Math.abs(e.pos.row - r);
        if (Math.max(dx, dy) <= detectRadius) { triggered = true; break; }
      }
      if (triggered) {
        cell.proximityBomb = false;
        cell.object = null;
        // Re-use the in-engine applyExplosion via state.explosions push.
        state.explosions = state.explosions || [];
        state.explosions.push({
          id: state.nextExplosionId++,
          centerCell: { col: c, row: r },
          startedMs: state.timeMs,
          resolved: false,
          hurlerId: null,
          chainCount: 0,
        });
        state.eventQueue = state.eventQueue || [];
        state.eventQueue.push({ type: 'explode', cell: { col: c, row: r } });
      }
    }
  }
}

function tickPlayerRespawn(state) {
  const players = state.players || [];
  for (const p of players) {
    if (!p || p.alive !== false) continue;
    if (typeof p.lives !== 'number' || p.lives <= 0) continue;
    if (typeof p.deathTimeMs !== 'number') continue;
    // Elephant's "Rebirth" upgrade: free deaths per level. Skip the death-
    // animation wait and refund the deducted life. Rebirth ×2 allows two free
    // deaths per level (counter is per-level; level-loader resets it).
    const upgrades = p.upgrades || {};
    const rebirthCap = upgrades.rebirth2 ? 2 : (upgrades.rebirth ? 1 : 0);
    const rebirthsUsed = p.rebirthsUsedThisLevel || 0;
    if (rebirthCap > 0 && rebirthsUsed < rebirthCap) {
      p.rebirthsUsedThisLevel = rebirthsUsed + 1;
      p.lives += 1; // refund the deducted life
      state.eventQueue.push({
        type: 'abilityFire',
        label: 'REBIRTH!',
        cell: { col: p.pos.col, row: p.pos.row },
      });
      // fall through with deathTimeMs treated as "now-now" to spawn immediately
    } else if (state.timeMs - p.deathTimeMs < BALANCE.DEATH_ANIM_MS) continue;
    // Respawn at the cell where the player died (not the original spawn point).
    // findRespawnCell BFS-searches outward if the death cell is occupied.
    const target = findRespawnCell(state, { col: p.pos.col, row: p.pos.row });
    if (!target) continue;
    p.pos = { col: target.col, row: target.row };
    // Keep facing direction; default down if missing.
    if (!p.dir) p.dir = 'down';
    p.move = null;
    p.alive = true;
    p.deathTimeMs = null;
    p.status = p.status || {};
    p.status.invulnUntilMs = state.timeMs + BALANCE.RESPAWN_INVULN_MS;
    state.eventQueue.push({
      type: 'playerRespawn',
      playerId: p.id,
      cell: { col: target.col, row: target.row },
    });
  }
}

function findRespawnCell(state, preferred) {
  if (cellIsRespawnable(state, preferred.col, preferred.row)) {
    return { col: preferred.col, row: preferred.row };
  }
  const grid = state.grid;
  if (!grid) return null;
  const rows = grid.length;
  const cols = grid[0] ? grid[0].length : 0;
  const visited = new Set();
  const key = (c, r) => `${c},${r}`;
  visited.add(key(preferred.col, preferred.row));
  const queue = [{ col: preferred.col, row: preferred.row }];
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nc = cur.col + dc;
      const nr = cur.row + dr;
      const k = key(nc, nr);
      if (visited.has(k)) continue;
      visited.add(k);
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      if (cellIsRespawnable(state, nc, nr)) return { col: nc, row: nr };
      queue.push({ col: nc, row: nr });
    }
  }
  return null;
}

function cellIsRespawnable(state, col, row) {
  // Only blockers (rocks/eggs/fireballs/donuts) disqualify a cell.
  // Enemies and other live players are fine — respawn invulnerability lets the
  // player pass through enemies harmlessly, so the spot of death is preferred.
  const grid = state.grid;
  if (!grid || row < 0 || row >= grid.length) return false;
  const r = grid[row];
  if (col < 0 || col >= r.length) return false;
  if (r[col].object) return false;
  return true;
}

function drainCommands(state) {
  while (state.commandQueue.length > 0) {
    const cmd = state.commandQueue.shift();
    if (cmd == null) continue;
    if (cmd.type === 'move') {
      applyMoveCommand(state, cmd.playerId, cmd.dir);
    } else if (cmd.type === 'destroy') {
      applyDestroyCommand(state, cmd.playerId);
    } else if (cmd.type === 'hurl') {
      applyHurlCommand(state, cmd.playerId);
    } else if (cmd.type === 'pause') {
      state.pauseState = state.pauseState === 'running' ? 'paused' : 'running';
    } else if (cmd.type === 'mute') {
      // Mute is handled by input/audio layers; engine acknowledges silently.
    }
  }
}

// Pass that only handles system commands (pause/mute). Runs every tick so the
// player can pause/mute during the pre-level countdown without their action
// being thrown away when the queue is later flushed.
function drainSystemCommands(state) {
  if (!Array.isArray(state.commandQueue)) return;
  for (let i = 0; i < state.commandQueue.length; i++) {
    const cmd = state.commandQueue[i];
    if (!cmd) continue;
    if (cmd.type === 'pause') {
      state.pauseState = state.pauseState === 'running' ? 'paused' : 'running';
      state.commandQueue.splice(i, 1);
      i -= 1;
    } else if (cmd.type === 'mute') {
      state.commandQueue.splice(i, 1);
      i -= 1;
    }
  }
}

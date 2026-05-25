import { BALANCE } from './constants.js';
import { cellAt } from './grid.js';

const DIR_DELTAS = {
  up: { col: 0, row: -1 },
  down: { col: 0, row: 1 },
  left: { col: -1, row: 0 },
  right: { col: 1, row: 0 },
};

export function applyMoveCommand(state, playerId, dir) {
  const player = findPlayer(state, playerId);
  if (player == null) return;
  if (player.alive === false) return;
  if (DIR_DELTAS[dir] == null) return;

  player.dir = dir;

  if (player.move != null) {
    bufferCommand(player, dir);
    return;
  }

  startTraversalIfFree(state, player, dir);
}

export function tickPlayerMovement(state, dtMs) {
  for (const player of state.players) {
    if (player.alive === false) continue;
    if (player.move == null) continue;

    // Trap interaction: stepping onto a slow-trap cell applies a sticky status
    // (slowedUntilMs) and consumes the trap. The slow is then applied via
    // effectiveSpeed below for the duration of the status, regardless of cell.
    applyTrapInteraction(state, player);
    const speed = effectiveSpeed(player, state);
    player.move.t += (speed * dtMs) / 1000;

    if (player.move.t >= 1) {
      snapAndFireBuffered(state, player);
    }
  }
}

function startTraversalIfFree(state, player, dir) {
  const delta = DIR_DELTAS[dir];
  const targetCol = player.pos.col + delta.col;
  const targetRow = player.pos.row + delta.row;
  if (!targetCellFree(state, targetCol, targetRow)) return;

  player.move = {
    from: { col: player.pos.col, row: player.pos.row },
    to: { col: targetCol, row: targetRow },
    t: 0,
  };
}

function snapAndFireBuffered(state, player) {
  const target = player.move.to;
  // If the destination became blocked mid-move (e.g., a hurled rock landed
  // there), cancel the move and stay on the origin cell.
  const cell = cellAt(state.grid, target.col, target.row);
  if (cell && cell.object && cell.object.type !== 'fried-egg') {
    player.move = null;
    return;
  }
  player.pos = { col: target.col, row: target.row };
  player.move = null;
  applyTrapInteraction(state, player);
  pickUpFriedEggAt(state, player);

  if (player.commandQueue.length === 0) return;
  const cmd = player.commandQueue.shift();
  if (cmd == null || cmd.type !== 'move') return;
  applyMoveCommand(state, player.id, cmd.dir);
}

function pickUpFriedEggAt(state, player) {
  const cell = cellAt(state.grid, player.pos.col, player.pos.row);
  if (!cell || !cell.object || cell.object.type !== 'fried-egg') return;
  cell.object = null;
  player.speedStacks = (player.speedStacks || 0) + 1;
  state.eventQueue.push({
    type: 'powerup',
    powerupType: 'friedEgg',
    playerId: player.id,
    cell: { col: player.pos.col, row: player.pos.row },
  });
}

function bufferCommand(player, dir) {
  if (player.commandQueue.length >= BALANCE.COMMAND_QUEUE_DEPTH) return;
  player.commandQueue.push({ type: 'move', playerId: player.id, dir });
}

function effectiveSpeed(player, state) {
  const base = BALANCE.PLAYER_BASE_SPEED;
  const inc = BALANCE.FRIED_EGG_SPEED_INCREMENT;
  const cap = BALANCE.FRIED_EGG_SPEED_CAP;
  const raw = base + player.speedStacks * inc;
  let speed = Math.min(raw, cap);
  const status = player.status;
  const now = state && typeof state.timeMs === 'number' ? state.timeMs : 0;
  if (status && typeof status.slowedUntilMs === 'number' && status.slowedUntilMs > now) {
    speed *= BALANCE.TRAP_SLOW_MULTIPLIER;
  }
  return speed;
}

function applyTrapInteraction(state, player) {
  const cell = cellAt(state.grid, player.pos.col, player.pos.row);
  if (!cell || !cell.hazard || cell.hazard.type !== 'slow-trap') return;
  player.status ??= {};
  const status = player.status;
  const invisible = typeof status.invisibleUntilMs === 'number'
    && status.invisibleUntilMs > state.timeMs;
  if (invisible) return;
  // Mole's "Counter-Trap" upgrade: walking onto a trap dispels it without
  // applying the slow effect (still consumed; still emits the SFX event).
  if (player.upgrades && player.upgrades.counterTrap) {
    // Mole's "Reflective Trap" upgrade: stun the enemy that cast this trap
    // for 3s. The hazard records its source via sourceEnemyId.
    if (player.upgrades.reflectiveTrap && cell.hazard.sourceEnemyId != null
        && Array.isArray(state.enemies)) {
      const caster = state.enemies.find((e) => e && e.id === cell.hazard.sourceEnemyId);
      if (caster) {
        caster.frozenUntilMs = Math.max(caster.frozenUntilMs || 0, state.timeMs + 3000);
      }
    }
    cell.hazard = null;
    state.eventQueue ??= [];
    state.eventQueue.push({
      type: 'trapTriggered',
      playerId: player.id,
      cell: { col: player.pos.col, row: player.pos.row },
      countered: true,
    });
    return;
  }
  // Consume the trap, apply slow, and cancel both berserk and fried-egg
  // speed stacks. Campaign upgrades (fastStart{N}) act as a floor so the
  // player drops to their permanent spawn speed, not all the way to 0.
  cell.hazard = null;
  status.slowedUntilMs = state.timeMs + BALANCE.E3_TRAP_DURATION_MS;
  if (typeof status.berserkUntilMs === 'number'
      && status.berserkUntilMs > state.timeMs) {
    status.berserkUntilMs = 0;
  }
  const upgrades = player.upgrades || {};
  let fastFloor = 0;
  if (upgrades.fastStart3) fastFloor = 3;
  else if (upgrades.fastStart2) fastFloor = 2;
  else if (upgrades.fastStart1) fastFloor = 1;
  player.speedStacks = Math.min(player.speedStacks || 0, fastFloor);
  state.eventQueue ??= [];
  state.eventQueue.push({
    type: 'trapTriggered',
    playerId: player.id,
    cell: { col: player.pos.col, row: player.pos.row },
  });
}

function targetCellFree(state, col, row) {
  const cell = cellAt(state.grid, col, row);
  if (cell == null) return false;
  if (cell.object != null && cell.object.type !== 'fried-egg') return false;
  return true;
}

function findPlayer(state, playerId) {
  for (const p of state.players) {
    if (p.id === playerId) return p;
  }
  return null;
}

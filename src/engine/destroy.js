import { BALANCE } from './constants.js';
import { cellAt, inBounds } from './grid.js';
import { awardScore } from './score.js';
import { applyExplosion } from './explode.js';

const DIR_OFFSETS = {
  up: { dc: 0, dr: -1 },
  down: { dc: 0, dr: 1 },
  left: { dc: -1, dr: 0 },
  right: { dc: 1, dr: 0 },
};

const ENEMY_KILL_SCORE_KEY = {
  enemy1: 'SCORE_E1_KILL',
  enemy2: 'SCORE_E2_KILL',
  enemy3: 'SCORE_E3_KILL',
  enemy4: 'SCORE_E4_KILL',
  enemy5: 'SCORE_E5_KILL',
  enemy6: 'SCORE_E6_KILL',
  enemy7: 'SCORE_E7_KILL',
};

export function applyDestroyCommand(state, playerId) {
  const player = findPlayer(state, playerId);
  if (!player) return;
  if (player.alive === false) return;

  const front = frontCell(player);
  if (!inBounds(state.grid, front.col, front.row)) return;

  const cell = cellAt(state.grid, front.col, front.row);
  if (!cell) return;

  if (cell.windup && cell.object && cell.object.type === 'rock') {
    cancelSpawnAt(state, player, front, cell);
    return;
  }

  if (!cell.object) return;

  const type = cell.object.type;
  if (type === 'fried-egg') return;
  if (type === 'egg') {
    destroyEggAt(state, player, front, cell);
    return;
  }
  if (type === 'fireball') {
    destroyFireballAt(state, front, cell);
    return;
  }
  if (type === 'rock' || type === 'donut') {
    destroyPlainAt(state, player, front, cell, type);
    return;
  }
}

function findPlayer(state, playerId) {
  if (!Array.isArray(state.players)) return null;
  for (let i = 0; i < state.players.length; i++) {
    if (state.players[i].id === playerId) return state.players[i];
  }
  return null;
}

function frontCell(player) {
  const off = DIR_OFFSETS[player.dir] || DIR_OFFSETS.down;
  return { col: player.pos.col + off.dc, row: player.pos.row + off.dr };
}

function destroyPlainAt(state, player, front, cell, objectType) {
  cell.object = null;
  state.eventQueue.push({
    type: 'objectDestroy',
    cell: { col: front.col, row: front.row },
    objectType,
  });
  // +1 silent score per rock broken — no popup, but still counts toward
  // milestone-life thresholds. Donuts deliberately give nothing.
  if (objectType === 'rock' && player) {
    awardScore(state, player.id, 1, 'rockBreak', null, { silent: true });
  }
}

function destroyEggAt(state, player, front, cell) {
  cell.object = null;
  state.eventQueue.push({
    type: 'objectDestroy',
    cell: { col: front.col, row: front.row },
    objectType: 'egg',
  });
  // Rabbit's "Bomb Carrying" upgrade banks the egg into inventory (max 3)
  // instead of awarding the regular crack-score. Player can later press B
  // to drop the egg as a fireball-style bomb.
  if (player.upgrades && player.upgrades.bombCarrying && player.upgrades.easterEgg) {
    player.inventory = player.inventory || {};
    const next = Math.min(3, (player.inventory.eggBomb || 0) + 1);
    player.inventory.eggBomb = next;
    state.eventQueue.push({
      type: 'inventoryStored',
      powerupType: 'eggBomb',
      playerId: player.id,
    });
    return;
  }
  awardScore(
    state,
    player.id,
    BALANCE.SCORE_EGG_CRACK,
    'eggCrack',
    { col: front.col, row: front.row },
  );
}

function destroyFireballAt(state, front, cell) {
  cell.object = null;
  applyExplosion(state, { col: front.col, row: front.row });
}

export function cancelSpawnAt(state, player, front, cell) {
  const enemyType = cell.windup.enemyType;
  const at = { col: front.col, row: front.row };
  cell.object = null;
  cell.windup = null;
  prunePendingSpawnAt(state, front);
  state.eventQueue.push({
    type: 'objectDestroy',
    cell: at,
    objectType: 'rock',
  });
  state.eventQueue.push({
    type: 'enemyDefeated',
    enemyType,
    cell: at,
    cause: 'spawnKill',
  });
  const scoreKey = ENEMY_KILL_SCORE_KEY[enemyType];
  const points = scoreKey && BALANCE[scoreKey] ? BALANCE[scoreKey] : 0;
  if (points > 0) {
    awardScore(state, player.id, points, 'enemyKill', at);
  }
}

function prunePendingSpawnAt(state, front) {
  if (!Array.isArray(state.pendingSpawns)) return;
  state.pendingSpawns = state.pendingSpawns.filter((s) => {
    if (!s || !s.cell) return true;
    return !(s.cell.col === front.col && s.cell.row === front.row);
  });
}

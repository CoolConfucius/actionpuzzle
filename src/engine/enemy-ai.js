import {cellAt, inBounds} from './grid.js';
import {pickWeighted} from './rng.js';

const DIRECTIONS = ['up', 'down', 'left', 'right'];

const DELTAS = {
  up: {dc: 0, dr: -1},
  down: {dc: 0, dr: 1},
  left: {dc: -1, dr: 0},
  right: {dc: 1, dr: 0},
};

const BASE_WEIGHT = 25;
const TARGET_BIAS = 10;
const REVERSE_PENALTY = 0.5;
const MAX_REROLLS = 3;

function findNearestPlayer(state, enemy) {
  if (!Array.isArray(state.players) || state.players.length === 0) return null;
  let best = null;
  let bestDist = Infinity;
  for (const p of state.players) {
    if (!p || p.alive === false) continue;
    const dist = Math.abs(p.pos.col - enemy.pos.col) + Math.abs(p.pos.row - enemy.pos.row);
    if (dist < bestDist) {
      best = p;
      bestDist = dist;
    }
  }
  return best;
}

export function computeEnemyWeights(state, enemy) {
  const w = {up: BASE_WEIGHT, down: BASE_WEIGHT, left: BASE_WEIGHT, right: BASE_WEIGHT};
  const target = findNearestPlayer(state, enemy);
  if (target) {
    const dc = target.pos.col - enemy.pos.col;
    const dr = target.pos.row - enemy.pos.row;
    if (dc > 0) {
      w.right -= TARGET_BIAS;
      w.left += TARGET_BIAS;
    } else if (dc < 0) {
      w.left -= TARGET_BIAS;
      w.right += TARGET_BIAS;
    }
    if (dr > 0) {
      w.down -= TARGET_BIAS;
      w.up += TARGET_BIAS;
    } else if (dr < 0) {
      w.up -= TARGET_BIAS;
      w.down += TARGET_BIAS;
    }
  }
  if (enemy.enteredFromDir && w[enemy.enteredFromDir] != null) {
    w[enemy.enteredFromDir] *= REVERSE_PENALTY;
  }
  for (const d of DIRECTIONS) {
    if (w[d] < 0) w[d] = 0;
  }
  return w;
}

function targetPos(enemy, dir) {
  const d = DELTAS[dir];
  return {col: enemy.pos.col + d.dc, row: enemy.pos.row + d.dr};
}

function isOtherEnemyAt(state, enemy, col, row) {
  if (!Array.isArray(state.enemies)) return false;
  for (const e of state.enemies) {
    if (e === enemy) continue;
    if (e.pos.col === col && e.pos.row === row) return true;
  }
  return false;
}

function isMovementBlocked(state, enemy, dir) {
  const {col, row} = targetPos(enemy, dir);
  if (!inBounds(state.grid, col, row)) return true;
  const cell = cellAt(state.grid, col, row);
  if (!cell) return true;
  if (cell.object) return true;
  if (cell.hazard && cell.hazard.type === 'slow-trap') return true;
  if (isOtherEnemyAt(state, enemy, col, row)) return true;
  return false;
}

function pickWeightedDirection(rng, weights) {
  const arr = DIRECTIONS.map((d) => weights[d]);
  const idx = pickWeighted(rng, arr);
  if (idx == null || idx < 0 || idx >= DIRECTIONS.length) return null;
  return DIRECTIONS[idx];
}

function requireRng(state) {
  if (typeof state.rng !== 'function') {
    throw new Error('enemy-ai: state.rng must be a function');
  }
}

export function pickEnemyDirection(state, enemy) {
  requireRng(state);
  const weights = computeEnemyWeights(state, enemy);
  for (let attempt = 0; attempt <= MAX_REROLLS; attempt++) {
    const dir = pickWeightedDirection(state.rng, weights);
    if (dir == null) return null;
    if (!isMovementBlocked(state, enemy, dir)) return dir;
    weights[dir] = 0;
  }
  return null;
}

function startTraversal(enemy, dir) {
  enemy.dir = dir;
  enemy.move = {
    from: {col: enemy.pos.col, row: enemy.pos.row},
    to: targetPos(enemy, dir),
    t: 0,
  };
}

export function enemyAttemptStep(state, enemy) {
  requireRng(state);
  const weights = computeEnemyWeights(state, enemy);
  const initialDir = pickWeightedDirection(state.rng, {...weights});
  if (initialDir == null) return {action: 'stay', dir: null};

  const front = targetPos(enemy, initialDir);
  if (inBounds(state.grid, front.col, front.row)) {
    const frontCell = cellAt(state.grid, front.col, front.row);
    if (frontCell && frontCell.object) {
      enemy.dir = initialDir;
      if (enemy.type === 'enemy1') return {action: 'destroy', dir: initialDir};
      return {action: 'hurl', dir: initialDir};
    }
  }

  if (!isMovementBlocked(state, enemy, initialDir)) {
    startTraversal(enemy, initialDir);
    return {action: 'move', dir: initialDir};
  }

  const w = {...weights};
  w[initialDir] = 0;
  for (let i = 0; i < MAX_REROLLS; i++) {
    const dir = pickWeightedDirection(state.rng, w);
    if (dir == null) return {action: 'stay', dir: null};
    if (!isMovementBlocked(state, enemy, dir)) {
      startTraversal(enemy, dir);
      return {action: 'move', dir};
    }
    w[dir] = 0;
  }
  return {action: 'stay', dir: null};
}

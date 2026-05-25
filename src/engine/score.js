import { BALANCE } from './constants.js';

export function awardScore(state, playerId, points, kind, cell, options) {
  if (points < 0) {
    throw new Error(`awardScore: negative points not allowed (got ${points})`);
  }
  if (points === 0) {
    return 0;
  }
  const player = findPlayer(state, playerId);
  const baseMult = (player.status && player.status.scoreMultiplier) || 1;
  const ambushMult = computeAmbushMultiplier(state, player, kind);
  const multiplier = baseMult * ambushMult;
  const credited = points * multiplier;
  player.score += credited;
  // Silent awards (e.g., +1 per rock destroyed) update the score and still
  // count toward milestone-life thresholds, but emit no popup.
  if (!(options && options.silent)) {
    const label = multiplier > 1 ? `+${credited} ×${multiplier}` : `+${credited}`;
    state.eventQueue.push({
      type: 'scorePopup',
      cell: cell || null,
      label,
      points: credited,
      kind,
      playerId: player.id,
    });
  }
  checkMilestoneLife(state, player.id);
  return credited;
}

// Cooking eggs via explosion. Per-egg scoring doubles with each additional
// egg in the same chain:
//   1 egg  → 1000          (total 1000)
//   2 eggs → 1000 + 2000   (total 3000)
//   3 eggs → 1000 + 2000 + 4000   (total 7000)
//   N eggs → SCORE_EGG_COOK_BASE * 2^(N-1) for the Nth egg.
// The order is established by sortEggsForChain (origin-distance first).
export function applyChainBonus(state, eggCells, originCell) {
  if (!eggCells || eggCells.length === 0) {
    return 0;
  }
  const sorted = sortEggsForChain(eggCells, originCell);
  const playerId = (state.players[0] && state.players[0].id) || 'p1';
  const base = BALANCE.SCORE_EGG_COOK_BASE;
  let total = 0;
  for (let i = 0; i < sorted.length; i++) {
    const stepPoints = base * (1 << i);
    total += awardScore(state, playerId, stepPoints, 'eggChain', sorted[i]);
  }
  return total;
}

export function applyHurlTrainBonus(state, stackCells, hurlerId) {
  if (!stackCells || stackCells.length === 0) {
    return 0;
  }
  let rockIdx = 0;
  let total = 0;
  for (const cell of stackCells) {
    const at = { col: cell.col, row: cell.row };
    if (state.grid[at.row] && state.grid[at.row][at.col]) {
      state.grid[at.row][at.col].object = null;
    }
    state.eventQueue.push({
      type: 'objectDestroy',
      cell: at,
      objectType: cell.objectType,
    });
    if (cell.objectType === 'rock') {
      const schedule = BALANCE.HURL_TRAIN_POINTS;
      const pts = rockIdx < schedule.length ? schedule[rockIdx] : schedule[schedule.length - 1];
      rockIdx += 1;
      total += awardScore(state, hurlerId, pts, 'hurlTrain', at);
    } else if (cell.objectType === 'egg') {
      total += awardScore(state, hurlerId, BALANCE.SCORE_EGG_CRACK, 'eggCrack', at);
    }
  }
  return total;
}

export function checkMilestoneLife(state, playerId) {
  const player = findPlayer(state, playerId);
  const step = BALANCE.SCORE_MILESTONE_LIFE;
  let crossed = state.scoreMilestoneCrossed || 0;
  let granted = 0;
  while (player.score >= crossed + step) {
    crossed += step;
    player.lives += 1;
    granted += 1;
    state.eventQueue.push({
      type: 'milestoneLife',
      playerId: player.id,
      newLives: player.lives,
    });
  }
  state.scoreMilestoneCrossed = crossed;
  return granted;
}

// Fox: enemyKill scoring is doubled while invisible.
//   ambushStrike2 (Phantom Killer) → 2× on every kill during invisibility.
//   ambushStrike (Ambush Strike)   → 2× on the FIRST kill of each invis window.
// Other kinds (eggCrack, hurlTrain, scorePlus, etc.) are unaffected.
function computeAmbushMultiplier(state, player, kind) {
  if (kind !== 'enemyKill') return 1;
  if (!player || !player.upgrades) return 1;
  const now = state && typeof state.timeMs === 'number' ? state.timeMs : 0;
  const invisUntil = player.status && player.status.invisibleUntilMs;
  if (!(typeof invisUntil === 'number' && invisUntil > now)) return 1;
  if (player.upgrades.ambushStrike2) return 2;
  if (player.upgrades.ambushStrike) {
    const used = player.invisibleKillsThisWindow || 0;
    if (used === 0) {
      player.invisibleKillsThisWindow = used + 1;
      return 2;
    }
  }
  return 1;
}

function findPlayer(state, playerId) {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) {
    throw new Error(`score: player not found: ${playerId}`);
  }
  return player;
}

function sortEggsForChain(eggCells, originCell) {
  const arr = eggCells.slice();
  arr.sort((a, b) => {
    const da = chebyshev(a, originCell);
    const db = chebyshev(b, originCell);
    if (da !== db) return da - db;
    if (a.row !== b.row) return a.row - b.row;
    return a.col - b.col;
  });
  return arr;
}

function chebyshev(a, b) {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

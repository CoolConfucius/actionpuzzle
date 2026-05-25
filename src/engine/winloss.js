const DEFAULT_WIN_CONDITIONS = ['allEnemiesDefeated', 'allObjectsDestroyed'];

export function checkWinLoss(state) {
  if (state.status !== 'playing') return;

  if (isLost(state)) {
    state.status = 'lost';
    state.eventQueue.push({ type: 'gameOver' });
    return;
  }

  if (isWon(state)) {
    state.status = 'won';
    state.eventQueue.push({ type: 'levelWon' });
  }
}

function isLost(state) {
  const players = state.players || [];
  if (players.length === 0) return false;
  for (const p of players) {
    if (!isPlayerOut(p)) return false;
  }
  return true;
}

function isPlayerOut(player) {
  if (player == null) return true;
  if ((player.lives || 0) > 0) return false;
  return player.alive === false;
}

function isWon(state) {
  const conditions = (state.level && state.level.winConditions) || DEFAULT_WIN_CONDITIONS;
  if (conditions.length === 0) return false;
  for (const cond of conditions) {
    if (cond === 'allEnemiesDefeated' && allEnemiesDefeated(state)) return true;
    if (cond === 'allObjectsDestroyed' && allObjectsDestroyed(state)) return true;
  }
  return false;
}

function allEnemiesDefeated(state) {
  const liveEnemies = (state.enemies || []).length;
  const pending = (state.pendingSpawns || []).length;
  if (liveEnemies + pending > 0) return false;
  return remainingBudget(state) === 0;
}

function remainingBudget(state) {
  const budget = state.level && state.level.enemyBudget;
  if (!budget) return 0;
  let total = 0;
  for (const k of Object.keys(budget)) {
    total += budget[k] || 0;
  }
  return total;
}

function allObjectsDestroyed(state) {
  if ((state.movingObjects || []).length > 0) return false;
  const grid = state.grid;
  if (!grid) return true;
  const rows = grid.length;
  for (let r = 0; r < rows; r++) {
    const row = grid[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (cell && cell.object != null) return false;
    }
  }
  return true;
}

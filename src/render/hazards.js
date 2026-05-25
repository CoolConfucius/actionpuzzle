import { drawHazard } from './sprites.js';

export function drawHazards(ctx, state) {
  const grid = state.grid;
  if (!grid) return;
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (cell && cell.hazard) {
        drawHazard(ctx, cell.hazard.type, c, r);
      }
    }
  }
}

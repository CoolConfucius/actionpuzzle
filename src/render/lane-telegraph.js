import { BALANCE } from '../engine/constants.js';

const TELEGRAPH_DURATION_MS = 600;
const TINT_PEAK_ALPHA = 0.45;
const TINT_RGB = '255, 220, 80';

export function consumeHurlPathEvents(state, list) {
  const events = state.eventQueue;
  if (!events || events.length === 0) return;
  const leadThreshold = BALANCE.LONG_HURL_TELEGRAPH_LEAD_CELLS;
  for (let i = 0; i < events.length; i++) {
    const evt = events[i];
    if (!evt || evt.type !== 'hurlPath') continue;
    const cells = evt.cells;
    if (!Array.isArray(cells) || cells.length < leadThreshold) continue;
    if (!pathQualifies(cells, state.players, leadThreshold)) continue;
    list.push({
      cells: cells.map((c) => ({ col: c.col, row: c.row })),
      elapsedMs: 0,
      durationMs: TELEGRAPH_DURATION_MS,
    });
  }
}

export function tickLaneTelegraph(list, dtMs) {
  if (!list || list.length === 0) return;
  for (let i = list.length - 1; i >= 0; i--) {
    list[i].elapsedMs += dtMs;
    if (list[i].elapsedMs >= list[i].durationMs) {
      list.splice(i, 1);
    }
  }
}

export function drawLaneTelegraph(ctx, list) {
  if (!list || list.length === 0) return;
  const tile = BALANCE.TILE_PX;
  const hudH = BALANCE.HUD_HEIGHT_PX;
  ctx.save();
  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    const remaining = 1 - entry.elapsedMs / entry.durationMs;
    const alpha = Math.max(0, TINT_PEAK_ALPHA * remaining);
    if (alpha <= 0) continue;
    ctx.fillStyle = `rgba(${TINT_RGB}, ${alpha.toFixed(3)})`;
    for (let j = 0; j < entry.cells.length; j++) {
      const cell = entry.cells[j];
      const x = cell.col * tile;
      const y = hudH + cell.row * tile;
      ctx.fillRect(x, y, tile, tile);
    }
  }
  ctx.restore();
}

function pathQualifies(cells, players, leadThreshold) {
  if (!Array.isArray(players) || players.length === 0) return false;
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (!p || !p.pos) continue;
    const idx = findCellIndex(cells, p.pos.col, p.pos.row);
    if (idx >= leadThreshold) return true;
  }
  return false;
}

function findCellIndex(cells, col, row) {
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c && c.col === col && c.row === row) return i;
  }
  return -1;
}

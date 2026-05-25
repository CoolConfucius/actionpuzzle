// Campaign-mode level select. Shows all 48 levels in an 8x6 grid (world by
// level). Player navigates with arrows + selects with Enter to replay a
// cleared level. Locked levels (above bestLevel + 1) can't be selected.
// Esc returns to title.
import { readPbTimes, formatPbTime } from '../engine/pb-times.js';

const BG_COLOR = '#0A0F1A';
const TITLE_COLOR = '#FFCC66';
const CLEARED_COLOR = '#66FFAA';
const CURRENT_COLOR = '#FFCC44';
const LOCKED_COLOR = '#444455';
const DIM_COLOR = '#AABBCC';
const HIGHLIGHT_COLOR = '#FF88AA';

export function createLevelSelectState() {
  return { open: false, row: 0, col: 0 };
}

export function openLevelSelect(sel) {
  if (!sel) return;
  sel.open = true;
  sel.row = 0;
  sel.col = 0;
}

export function closeLevelSelect(sel) {
  if (!sel) return;
  sel.open = false;
}

export function isLevelSelectOpen(sel) {
  return !!(sel && sel.open);
}

// World on Y (0-7), Level on X (0-5). 48 cells.
export function navigateLevelSelect(sel, dx, dy) {
  if (!sel || !sel.open) return;
  sel.col = Math.max(0, Math.min(5, sel.col + dx));
  sel.row = Math.max(0, Math.min(7, sel.row + dy));
}

export function selectedLevelId(sel) {
  if (!sel) return null;
  const n = sel.row * 6 + sel.col + 1;
  return String(n).padStart(2, '0');
}

export function drawLevelSelect(ctx, sel, bestLevelId, widthPx, heightPx) {
  const W = widthPx || 912;
  const H = heightPx || 756;
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = TITLE_COLOR;
  ctx.font = 'bold 22px monospace';
  ctx.fillText('CAMPAIGN — LEVEL SELECT', W / 2, 36);

  ctx.fillStyle = DIM_COLOR;
  ctx.font = '12px monospace';
  ctx.fillText('Arrows to navigate · Enter to replay (50% coins) · S for shop · Esc to return',
    W / 2, 56);

  const bestN = parseInt(bestLevelId || '01', 10);
  const pbs = readPbTimes();
  const padX = 40;
  const padY = 86;
  const cellW = (W - padX * 2) / 6;
  const cellH = 48;

  // Header row: L1..L6
  ctx.font = 'bold 12px monospace';
  ctx.fillStyle = DIM_COLOR;
  for (let c = 0; c < 6; c++) {
    ctx.fillText(`L${c + 1}`, padX + c * cellW + cellW / 2, padY - 8);
  }

  for (let row = 0; row < 8; row++) {
    const world = row + 1;
    const yTop = padY + row * cellH;
    ctx.textAlign = 'left';
    ctx.fillStyle = DIM_COLOR;
    ctx.font = 'bold 11px monospace';
    ctx.fillText(`W${world}`, 8, yTop + cellH / 2 + 4);

    for (let col = 0; col < 6; col++) {
      const n = row * 6 + col + 1;
      const isSelected = sel.row === row && sel.col === col;
      const xLeft = padX + col * cellW;
      const cleared = n <= bestN;
      const playable = cleared || n === bestN + 1;

      // Cell background
      ctx.save();
      let bgColor = '#111122';
      if (isSelected) bgColor = '#22335A';
      ctx.fillStyle = bgColor;
      ctx.fillRect(xLeft + 2, yTop + 2, cellW - 4, cellH - 8);

      // Border
      ctx.strokeStyle = isSelected ? HIGHLIGHT_COLOR : '#222233';
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeRect(xLeft + 2, yTop + 2, cellW - 4, cellH - 8);

      // Label
      let color = LOCKED_COLOR;
      if (cleared) color = CLEARED_COLOR;
      else if (n === bestN + 1) color = CURRENT_COLOR;
      ctx.fillStyle = color;
      ctx.font = isSelected ? 'bold 13px monospace' : '13px monospace';
      ctx.textAlign = 'center';
      const label = playable
        ? `LV-${String(n).padStart(2, '0')}`
        : '🔒';
      ctx.fillText(label, xLeft + cellW / 2, yTop + 20);
      if (cleared) {
        ctx.fillStyle = CLEARED_COLOR;
        ctx.font = '9px monospace';
        const idStr = String(n).padStart(2, '0');
        const pb = pbs[idStr];
        const label = (typeof pb === 'number' && pb > 0)
          ? `★ ${formatPbTime(pb)}`
          : '★ cleared';
        ctx.fillText(label, xLeft + cellW / 2, yTop + 34);
      } else if (n === bestN + 1) {
        ctx.fillStyle = CURRENT_COLOR;
        ctx.font = '9px monospace';
        ctx.fillText('NEXT', xLeft + cellW / 2, yTop + 34);
      }
      ctx.restore();
    }
  }
}

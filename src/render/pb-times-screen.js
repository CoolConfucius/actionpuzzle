// All-levels PB Times viewer. Shows a compact grid of every level (1..48)
// with the best clear time tracked in localStorage. Useful for speedrunners
// to see at a glance which levels still need a faster run.
import { readPbTimes, formatPbTime } from '../engine/pb-times.js';

const BG_COLOR = '#0A0F1A';
const TITLE_COLOR = '#FFCC66';
const HEADER_COLOR = '#66FFAA';
const TIME_COLOR = '#FFFFFF';
const EMPTY_COLOR = '#555566';
const ACCENT = '#FF88AA';
const DIM_COLOR = '#AABBCC';

export function drawPbTimesScreen(ctx, widthPx, heightPx) {
  const W = widthPx || 680;
  const H = heightPx || 552;
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = TITLE_COLOR;
  ctx.font = 'bold 22px monospace';
  ctx.fillText('PERSONAL BEST TIMES', W / 2, 32);

  const pbs = readPbTimes();
  const cleared = countCleared(pbs);
  const fastestId = findFastestId(pbs);
  const totalMs = sumAllPbs(pbs);
  ctx.fillStyle = HEADER_COLOR;
  ctx.font = '12px monospace';
  const totalLine = totalMs > 0
    ? `${cleared} / 48 cleared   ·   total: ${formatTotal(totalMs)}`
    : `${cleared} / 48 cleared`;
  ctx.fillText(totalLine, W / 2, 52);

  // 8 worlds × 6 levels grid. World per row.
  const padX = 24;
  const startY = 80;
  const rowH = 56;
  const colW = (W - padX * 2) / 6;
  for (let world = 1; world <= 8; world++) {
    const y = startY + (world - 1) * rowH;
    ctx.fillStyle = HEADER_COLOR;
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`World ${world}`, padX, y + 12);
    for (let lvl = 1; lvl <= 6; lvl++) {
      const id = String((world - 1) * 6 + lvl).padStart(2, '0');
      const ms = pbs[id];
      const cellX = padX + (lvl - 1) * colW;
      const cellY = y + 18;
      ctx.fillStyle = ms != null ? TIME_COLOR : EMPTY_COLOR;
      ctx.font = ms != null ? '12px monospace' : '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`L${lvl}`, cellX + colW / 2, cellY);
      const isFast = id === fastestId;
      ctx.fillStyle = isFast ? ACCENT : (ms != null ? TIME_COLOR : EMPTY_COLOR);
      ctx.font = isFast ? 'bold 12px monospace' : '12px monospace';
      ctx.fillText(ms != null ? formatPbTime(ms) : '—', cellX + colW / 2, cellY + 16);
    }
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = DIM_COLOR;
  ctx.font = '11px monospace';
  ctx.fillText('Esc or Enter to return', W / 2, H - 18);
}

function countCleared(pbs) {
  let n = 0;
  for (const k of Object.keys(pbs)) {
    if (typeof pbs[k] === 'number' && pbs[k] > 0) n++;
  }
  return n;
}

function findFastestId(pbs) {
  let bestId = null;
  let bestMs = Infinity;
  for (const k of Object.keys(pbs)) {
    const v = pbs[k];
    if (typeof v === 'number' && v > 0 && v < bestMs) {
      bestMs = v;
      bestId = k;
    }
  }
  return bestId;
}

function sumAllPbs(pbs) {
  let total = 0;
  for (const k of Object.keys(pbs)) {
    const v = pbs[k];
    if (typeof v === 'number' && v > 0) total += v;
  }
  return total;
}

function formatTotal(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

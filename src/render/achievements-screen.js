// Full-screen list of achievements. Unlocked entries show timestamp; locked
// entries show description with a lock icon. Accessed via title screen.
import { ACHIEVEMENTS, readUnlocks, countUnlocked } from '../engine/achievements.js';

const BG_COLOR = '#0A0F1A';
const TITLE_COLOR = '#FFCC66';
const UNLOCKED_LABEL = '#66FFAA';
const LOCKED_LABEL = '#888899';
const TEXT_COLOR = '#FFFFFF';
const DIM_COLOR = '#AABBCC';

const TITLE_FONT = 'bold 22px monospace';
const ROW_LABEL_FONT = 'bold 14px monospace';
const ROW_DESC_FONT = '11px monospace';
const FOOT_FONT = '11px monospace';

function formatDate(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function drawAchievementsScreen(ctx, widthPx, heightPx) {
  const W = widthPx || 680;
  const H = heightPx || 552;
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, W, H);

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  ctx.fillStyle = TITLE_COLOR;
  ctx.font = TITLE_FONT;
  ctx.fillText('ACHIEVEMENTS', W / 2, 36);

  const unlocks = readUnlocks();
  ctx.fillStyle = DIM_COLOR;
  ctx.font = '12px monospace';
  ctx.fillText(`${countUnlocked(unlocks)} / ${ACHIEVEMENTS.length} unlocked`, W / 2, 56);

  ctx.textAlign = 'left';
  // Two-column layout so the now-many achievements still fit on screen.
  const colCount = 2;
  const perCol = Math.ceil(ACHIEVEMENTS.length / colCount);
  const baseY = 80;
  const rowH = 32;
  const colWidth = (W - 24) / colCount;
  for (let i = 0; i < ACHIEVEMENTS.length; i++) {
    const a = ACHIEVEMENTS[i];
    const ts = unlocks[a.id];
    const col = Math.floor(i / perCol);
    const rowI = i % perCol;
    const x0 = 12 + col * colWidth;
    const y = baseY + rowI * rowH;
    const unlocked = typeof ts === 'number' && ts > 0;
    ctx.fillStyle = unlocked ? UNLOCKED_LABEL : LOCKED_LABEL;
    ctx.font = ROW_LABEL_FONT;
    const icon = unlocked ? '★' : '🔒';
    ctx.fillText(`${icon}  ${a.label}`, x0, y);
    ctx.fillStyle = unlocked ? TEXT_COLOR : DIM_COLOR;
    ctx.font = ROW_DESC_FONT;
    ctx.fillText(a.description, x0 + 20, y + 14);
    if (unlocked) {
      const fmt = formatDate(ts);
      ctx.textAlign = 'right';
      ctx.fillStyle = UNLOCKED_LABEL;
      ctx.fillText(fmt, x0 + colWidth - 12, y);
      ctx.textAlign = 'left';
    }
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = DIM_COLOR;
  ctx.font = FOOT_FONT;
  ctx.fillText('Esc or Enter to return', W / 2, H - 18);
}

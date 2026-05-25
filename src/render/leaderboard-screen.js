// Standalone leaderboard viewer (top-20). Accessible from title via L key.
// Reuses readLeaderboard from run-state.
import { readLeaderboard } from '../engine/run-state.js';

const BG_COLOR = '#0A0F1A';
const TITLE_COLOR = '#FFCC66';
const TEXT_COLOR = '#FFFFFF';
const DIM_COLOR = '#AABBCC';

export function drawLeaderboardScreen(ctx, widthPx, heightPx) {
  const W = widthPx || 680;
  const H = heightPx || 552;
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = TITLE_COLOR;
  ctx.font = 'bold 22px monospace';
  ctx.fillText('LEADERBOARD', W / 2, 36);

  const entries = readLeaderboard() || [];
  if (entries.length === 0) {
    ctx.fillStyle = DIM_COLOR;
    ctx.font = '14px monospace';
    ctx.fillText('No scores yet — play an Arcade or Coop run to add yours.', W / 2, 100);
  } else {
    const baseY = 80;
    const lineH = 18;
    const leftX = 60;
    const midX = W / 2 + 40;
    const rightX = W - 60;
    // Header row
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = DIM_COLOR;
    ctx.textAlign = 'left';
    ctx.fillText('RANK · NAME', leftX, baseY - 10);
    ctx.textAlign = 'right';
    ctx.fillText('SCORE', midX, baseY - 10);
    ctx.fillText('DATE', rightX, baseY - 10);
    ctx.font = '13px monospace';
    for (let i = 0; i < Math.min(20, entries.length); i++) {
      const e = entries[i];
      const y = baseY + i * lineH;
      ctx.textAlign = 'left';
      ctx.fillStyle = i < 3 ? TITLE_COLOR : TEXT_COLOR;
      const rank = String(i + 1).padStart(2, ' ');
      ctx.fillText(`${rank}. ${e.name}`, leftX, y);
      ctx.textAlign = 'right';
      ctx.fillText(String(e.score), midX, y);
      ctx.fillStyle = DIM_COLOR;
      ctx.font = '11px monospace';
      ctx.fillText(formatLeaderboardDate(e.dateMs), rightX, y);
      ctx.font = '13px monospace';
    }
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = DIM_COLOR;
  ctx.font = '11px monospace';
  ctx.fillText('Esc or Enter to return', W / 2, H - 18);
}

function formatLeaderboardDate(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const d = new Date(ms);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}`;
}

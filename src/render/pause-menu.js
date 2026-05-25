const BG_COLOR = 'rgba(0,0,0,0.7)';
const PANEL_COLOR = '#1A1A2E';
const PANEL_BORDER = '#66FFAA';
const TEXT_COLOR = '#FFFFFF';
const HIGHLIGHT_COLOR = '#66FFAA';
const DIM_COLOR = '#888899';
const PANEL_W = 320;
const PANEL_H = 240;

export const PAUSE_MENU_OPTIONS = ['resume', 'toggleSound', 'toggleMusic', 'settings', 'returnHome'];

export function createPauseMenu() {
  return {
    open: false,
    cursor: 0,
  };
}

export function openPauseMenu(menu) {
  if (!menu) return;
  menu.open = true;
  menu.cursor = 0;
}

export function closePauseMenu(menu) {
  if (!menu) return;
  menu.open = false;
}

export function isPauseMenuOpen(menu) {
  return !!(menu && menu.open);
}

export function navigatePauseMenu(menu, delta) {
  if (!menu || !menu.open) return;
  const n = PAUSE_MENU_OPTIONS.length;
  menu.cursor = (menu.cursor + delta + n) % n;
}

export function selectedPauseMenuAction(menu) {
  if (!menu || !menu.open) return null;
  return PAUSE_MENU_OPTIONS[menu.cursor] || null;
}

export function drawPauseMenu(ctx, menu, widthPx, heightPx, status) {
  if (!menu || !menu.open) return;
  const W = widthPx || 680;
  const H = heightPx || 552;

  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, W, H);

  const px = Math.floor((W - PANEL_W) / 2);
  const py = Math.floor((H - PANEL_H) / 2);

  ctx.fillStyle = PANEL_COLOR;
  ctx.fillRect(px, py, PANEL_W, PANEL_H);
  ctx.strokeStyle = PANEL_BORDER;
  ctx.lineWidth = 2;
  ctx.strokeRect(px + 1, py + 1, PANEL_W - 2, PANEL_H - 2);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = HIGHLIGHT_COLOR;
  ctx.font = 'bold 22px monospace';
  ctx.fillText('PAUSED', px + PANEL_W / 2, py + 36);

  // Per-run snapshot (optional — caller supplies `status.runInfo`).
  if (status && status.runInfo) {
    const ri = status.runInfo;
    ctx.fillStyle = '#88AACC';
    ctx.font = '11px monospace';
    const elapsed = formatElapsed(ri.levelTimeMs);
    const line = `${ri.label || ''}   Time: ${elapsed}   Score: ${ri.score || 0}`;
    ctx.fillText(line, px + PANEL_W / 2, py + 56);
    if (ri.mode || ri.streak != null) {
      const parts = [];
      if (ri.mode) parts.push(`Mode: ${String(ri.mode).toUpperCase()}`);
      if (typeof ri.streak === 'number' && ri.streak > 0) parts.push(`Streak: ${ri.streak}`);
      if (parts.length > 0) {
        ctx.fillStyle = '#668899';
        ctx.font = '10px monospace';
        ctx.fillText(parts.join('  ·  '), px + PANEL_W / 2, py + 70);
      }
    }
  }

  const labels = {
    resume: 'RESUME',
    toggleSound: 'SOUND',
    toggleMusic: 'MUSIC',
    settings: 'SETTINGS',
    returnHome: 'RETURN TO HOME',
  };

  const baseY = py + 80;
  const rowGap = 32;

  PAUSE_MENU_OPTIONS.forEach((opt, i) => {
    const y = baseY + i * rowGap;
    const selected = menu.cursor === i;
    ctx.fillStyle = selected ? HIGHLIGHT_COLOR : TEXT_COLOR;
    ctx.font = selected ? 'bold 18px monospace' : '18px monospace';
    let label = labels[opt];
    if (opt === 'toggleSound' && status) {
      label += status.sfxMuted ? ': OFF' : ': ON';
    } else if (opt === 'toggleMusic' && status) {
      label += status.musicMuted ? ': OFF' : ': ON';
    }
    const prefix = selected ? '> ' : '  ';
    ctx.fillText(prefix + label, px + PANEL_W / 2, y);
  });

  ctx.fillStyle = DIM_COLOR;
  ctx.font = '11px monospace';
  ctx.fillText('Up/Down · Enter · Esc to resume', px + PANEL_W / 2, py + PANEL_H - 16);
}

function formatElapsed(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

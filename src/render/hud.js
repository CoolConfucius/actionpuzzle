import { BALANCE } from '../engine/constants.js';
import { formatPbTime, getPb } from '../engine/pb-times.js';
import { readCampaign, getCoins } from '../engine/campaign.js';
import { getMode } from '../engine/run-state.js';

const HUD_TEXT_COLOR = '#FFFFFF';
const HUD_FONT = '14px system-ui, -apple-system, "Segoe UI", sans-serif';
const BANNER_FONT = 'bold 28px system-ui, -apple-system, "Segoe UI", sans-serif';
const HUD_PADDING_PX = 8;

export function drawHud(ctx, state) {
  const canvasWidthPx = BALANCE.GRID_COLS * BALANCE.TILE_PX;
  const hudHeightPx = BALANCE.HUD_HEIGHT_PX;
  const centerY = hudHeightPx / 2;

  ctx.save();
  ctx.font = HUD_FONT;
  ctx.fillStyle = HUD_TEXT_COLOR;
  ctx.textBaseline = 'middle';

  const p1 = state.players && state.players[0];
  if (p1) {
    ctx.textAlign = 'left';
    let leftLabel = formatPlayerSegment(p1);
    const mode = getMode();
    // Coins / upgrade badges remain campaign-only (skills don't apply outside
    // campaign). Item badges (shield, sword, potion) show in every mode that
    // earned them, since items work universally.
    if (mode === 'campaign' || mode === 'campaign-coop') {
      leftLabel += `  ¢${getCoins(readCampaign())}`;
      const upgradeBadge = formatActiveUpgradeBadge(p1);
      if (upgradeBadge) leftLabel += `  ${upgradeBadge}`;
    }
    const inv = formatInventoryBadge(p1);
    if (inv) leftLabel += `  ${inv}`;
    const statusBadge = formatStatusBadge(p1, state);
    if (statusBadge) leftLabel += `  ${statusBadge}`;
    ctx.fillText(leftLabel, HUD_PADDING_PX, centerY);
  }

  ctx.textAlign = 'center';
  ctx.fillText(formatCenterSegment(state), canvasWidthPx / 2, centerY);

  const p2 = state.players && state.players[1];
  if (p2 && p2.alive) {
    ctx.textAlign = 'right';
    ctx.fillText(formatPlayerSegment(p2), canvasWidthPx - HUD_PADDING_PX, centerY);
  }

  ctx.restore();

  if (state.transition) {
    drawTransitionBanner(ctx, state);
  }
}

function drawTransitionBanner(ctx, state) {
  const canvasWidthPx = BALANCE.GRID_COLS * BALANCE.TILE_PX;
  const playAreaHeightPx = BALANCE.GRID_ROWS * BALANCE.TILE_PX;
  const bannerY = BALANCE.HUD_HEIGHT_PX + playAreaHeightPx / 2;
  const text = state.transition.bannerText || 'LEVEL CLEAR';

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, bannerY - 48, canvasWidthPx, 96);
  ctx.font = BANNER_FONT;
  ctx.fillStyle = '#FFEE66';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvasWidthPx / 2, bannerY - 12);

  const pbInfo = state.lastClearPb;
  if (pbInfo) {
    ctx.font = '14px system-ui, -apple-system, "Segoe UI", sans-serif';
    if (pbInfo.isNewPb) {
      ctx.fillStyle = '#66FFAA';
      const prevPart = pbInfo.previous != null ? ` (was ${formatPbTime(pbInfo.previous)})` : '';
      ctx.fillText(`NEW PB! ${formatPbTime(pbInfo.clearMs)}${prevPart}`, canvasWidthPx / 2, bannerY + 18);
    } else {
      ctx.fillStyle = '#CCCCCC';
      ctx.fillText(`Time: ${formatPbTime(pbInfo.clearMs)}   PB: ${formatPbTime(pbInfo.recorded)}`, canvasWidthPx / 2, bannerY + 18);
    }
  }
  if (state.lastCampaignClearCoins && state.lastCampaignClearCoins > 0) {
    // Count-up animation: number rises from 0 to final over ~600ms, with a
    // soft pulse halo. Reads as "ka-ching!" feedback when the post-level
    // banner first appears.
    const awardedAt = state.lastCoinAwardAtMs || 0;
    const elapsed = (state.timeMs || 0) - awardedAt;
    const COUNT_MS = 600;
    const t = Math.max(0, Math.min(1, elapsed / COUNT_MS));
    const shown = Math.floor(state.lastCampaignClearCoins * t);
    const pulse = elapsed < COUNT_MS ? 1 + 0.18 * (1 - t) : 1;
    ctx.save();
    ctx.font = `bold ${Math.round(15 * pulse)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.fillStyle = '#FFCC44';
    ctx.fillText(`+¢${shown}`, canvasWidthPx / 2, bannerY + 36);
    ctx.restore();
  }
  ctx.restore();
}

function formatPlayerSegment(player) {
  const lives = Number.isFinite(player.lives) ? player.lives : 0;
  const score = Number.isFinite(player.score) ? player.score : 0;
  return `Lives: ${lives}  Score: ${score}`;
}

// Shows active temporary statuses (berserk/invis/freeze/slow/multiplier)
// with rough seconds-remaining so the player sees the timer ticking.
function formatStatusBadge(player, state) {
  if (!player || !player.status) return '';
  const now = (state && typeof state.timeMs === 'number') ? state.timeMs : 0;
  const tokens = [];
  const s = player.status;
  const remaining = (untilMs) => Math.max(0, Math.ceil((untilMs - now) / 1000));
  if (s.berserkUntilMs && s.berserkUntilMs > now) tokens.push(`B${remaining(s.berserkUntilMs)}s`);
  if (s.invisibleUntilMs && s.invisibleUntilMs > now) tokens.push(`I${remaining(s.invisibleUntilMs)}s`);
  if (s.slowedUntilMs && s.slowedUntilMs > now) tokens.push(`SLOW${remaining(s.slowedUntilMs)}s`);
  // Score multiplier persists until death or level end (no timer field).
  if (s.scoreMultiplier && s.scoreMultiplier > 1) {
    tokens.push(`x${s.scoreMultiplier}`);
  }
  if (state && state.timeFreezeUntilMs && state.timeFreezeUntilMs > now) {
    tokens.push(`FREEZE${remaining(state.timeFreezeUntilMs)}s`);
  }
  return tokens.length ? `[${tokens.join(' ')}]` : '';
}

// Returns "Q:Bx2" style hint when player has stored inventory items.
// First letter = activation key (Q for P1). Empty when inventory empty.
function formatInventoryBadge(player) {
  if (!player) return '';
  const inv = player.inventory || {};
  const tokens = [];
  if (inv.berserk > 0) tokens.push(`B×${inv.berserk}`);
  if (inv.invisibility > 0) tokens.push(`I×${inv.invisibility}`);
  if (inv.timeFreeze > 0) tokens.push(`T×${inv.timeFreeze}`);
  if (inv.eggBomb > 0) tokens.push(`Egg×${inv.eggBomb}`);
  // Item Shop budgets — what's left this level.
  if ((player.shieldBudget || 0) > 0) tokens.push(`🛡×${player.shieldBudget}`);
  if ((player.swordCharges || 0) > 0) tokens.push(`⚔×${player.swordCharges}`);
  if ((player.reviveBudget || 0) > 0) tokens.push(`🍷×${player.reviveBudget}`);
  if (tokens.length === 0) return '';
  return tokens.join(' ');
}

// Returns a compact glyph cluster indicating which campaign upgrades the
// current player has equipped. Empty string when no upgrades. Lives outside
// the player segment in the HUD line.
function formatActiveUpgradeBadge(player) {
  if (!player || !player.upgrades) return '';
  const u = player.upgrades;
  const tokens = [];
  if (u.fastStart || u.retainSpeed || u.speedCapPlus1 || u.speedOnKill) tokens.push('⚡');
  if (u.berserkPlus2 || u.berserkStart) tokens.push('🔥');
  if (u.donutMastery || u.bounceImmunity || u.trampoline) tokens.push('⬭');
  if (u.counterTrap || u.trapCancel || u.moleBurrow) tokens.push('〜');
  if (u.biggerBlast || u.rockToExplosive || u.quickCharge) tokens.push('💥');
  if (u.rebirth || u.lifePlusDrops || u.luckyDrop || u.bigHeart) tokens.push('❤');
  if (u.easterEgg || u.bombCarrying || u.chainReaction) tokens.push('🥚');
  if (u.stunClone || u.echoBlast || u.twinClone || u.echoWave) tokens.push('🐵');
  return tokens.length > 0 ? tokens.join('') : '';
}

function formatCenterSegment(state) {
  const level = state.level || {};
  // Show only "World X · LV-NN" — no per-level title name.
  const wl = formatWorldLevelLabel(level.id);
  const timer = formatTimer(level.timeLimitMs, state.levelTimeMs);
  const wlOrId = wl || (level.id != null ? `LV-${level.id}` : '');
  let pbSuffix = '';
  if (level.id) {
    const pb = getPb(level.id);
    if (pb != null) pbSuffix = `  PB ${formatPbTime(pb)}`;
  }
  const loopSuffix = (state.endlessLoopCount && state.endlessLoopCount > 0)
    ? `  Loop ${state.endlessLoopCount + 1}`
    : '';
  // Show streak suffix once it reaches 2+ to avoid noise on the very first level.
  const streakSuffix = (typeof state.runStreak === 'number' && state.runStreak >= 2)
    ? `  Streak ${state.runStreak}`
    : '';
  // Boss Rush: show "BOSS X/7" prominently so the player knows their progress.
  let bossPrefix = '';
  if (getMode() === 'boss-rush') {
    const seq = ['12', '18', '24', '30', '36', '42', '48'];
    const idx = seq.indexOf(level.id);
    if (idx >= 0) bossPrefix = `BOSS ${idx + 1}/${seq.length} · `;
  }
  return `${bossPrefix}${wlOrId}   ${timer}${pbSuffix}${loopSuffix}${streakSuffix}`;
}

function formatWorldLevelLabel(id) {
  if (typeof id !== 'string' || !/^\d{2}$/.test(id)) return '';
  const n = parseInt(id, 10);
  if (!Number.isFinite(n) || n < 1) return '';
  const world = Math.floor((n - 1) / 6) + 1;
  const level = ((n - 1) % 6) + 1;
  return `W${world}L${level}`;
}

function formatTimer(timeLimitMs, levelTimeMs) {
  const limit = Number.isFinite(timeLimitMs) ? timeLimitMs : 0;
  const elapsed = Number.isFinite(levelTimeMs) ? levelTimeMs : 0;
  const remainingMs = Math.max(0, limit - elapsed);
  const remainingSec = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(remainingSec / 60);
  const seconds = remainingSec % 60;
  const ss = seconds < 10 ? `0${seconds}` : `${seconds}`;
  return `${minutes}:${ss}`;
}

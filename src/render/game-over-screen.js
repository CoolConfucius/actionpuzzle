import { formatBestLevelLabel, readLeaderboard, isNameEntryActive, getMode } from '../engine/run-state.js';
import { playTrack, stop } from '../audio/music.js';
import { readStats, formatPlayTime } from '../engine/lifetime-stats.js';
import { readUnlocks, countUnlocked, ACHIEVEMENTS } from '../engine/achievements.js';

const DEFAULT_WIDTH_PX = 680;
const DEFAULT_HEIGHT_PX = 552;

let musicStarted = false;

export function resetGameOverMusic() {
  musicStarted = false;
}

export function stopGameOverMusic() {
  musicStarted = false;
  stop();
}

export function drawGameOverScreen(ctx, state, runState, widthPx, heightPx, opts) {
  const W = (typeof widthPx === 'number' && widthPx > 0) ? widthPx : DEFAULT_WIDTH_PX;
  const H = (typeof heightPx === 'number' && heightPx > 0) ? heightPx : DEFAULT_HEIGHT_PX;
  const options = opts || {};

  if (!musicStarted) {
    // Victorious clears trigger the fanfare; ordinary game-overs keep Für Elise.
    const victoriousFlag = !!(opts && opts.victorious);
    playTrack(victoriousFlag ? 'victory-fanfare' : 'fur-elise');
    musicStarted = true;
  }

  const rs = runState || (state && state.runState) || null;

  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  const tutorialDone = !!(state && state.tutorialCompleted);
  const dailyDone = !!(state && state.dailyCompleted);
  const victorious = !!(options && options.victorious);
  let header = 'GAME OVER';
  let headerColor = '#FF6666';
  if (victorious) { header = 'VICTORY!'; headerColor = '#FFCC44'; }
  else if (tutorialDone) { header = 'TUTORIAL COMPLETE'; headerColor = '#66FFAA'; }
  else if (dailyDone) { header = "TODAY'S RUN"; headerColor = '#FF88AA'; }
  ctx.fillStyle = headerColor;
  ctx.font = 'bold 24px monospace';
  ctx.fillText(header, W / 2, 50);
  if (victorious) {
    ctx.fillStyle = '#FFEE88';
    ctx.font = '13px monospace';
    ctx.fillText('You cleared World 8 — Apotheosis!', W / 2, 70);
  }
  if (dailyDone && state && state.lastDailyResult) {
    const r = state.lastDailyResult;
    ctx.fillStyle = r.isNewBest ? '#66FFAA' : '#FFEE88';
    ctx.font = '13px monospace';
    const msg = r.isNewBest
      ? `NEW DAILY BEST: ${r.recorded}` + (r.previous ? ` (was ${r.previous})` : '')
      : `Today's best: ${r.recorded}`;
    ctx.fillText(msg, W / 2, 70);
  }

  // main.js sets rs.runScore = sum(player.score) on game-over, so use it
  // directly. Fall back to summing live players if rs.runScore is missing
  // (e.g., game-over reached through a path that skipped that hook).
  let totalScore = 0;
  if (rs && Number.isFinite(rs.runScore) && rs.runScore > 0) {
    totalScore = rs.runScore;
  } else if (state && Array.isArray(state.players)) {
    for (const p of state.players) totalScore += (p.score || 0);
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '14px monospace';
  ctx.fillText(`Score: ${totalScore}`, W / 2, 78);

  const bestLabel = formatBestLevelLabel(rs ? rs.bestLevel : '01');
  ctx.fillStyle = '#FFCC44';
  ctx.fillText(`Best: ${bestLabel}`, W / 2, 96);

  // Mode-specific run summary line.
  let summaryLine = '';
  const currentMode = getMode();
  if (currentMode === 'random' && state) {
    const cleared = state.randomRunIndex || 0;
    const total = state.randomRunLength || 8;
    summaryLine = `Random 8 — cleared ${cleared}/${total}`;
  } else if (currentMode === 'boss-rush' && state && state.level) {
    const seq = ['12', '18', '24', '30', '36', '42', '48'];
    const idx = seq.indexOf(state.level.id);
    if (idx >= 0) {
      summaryLine = victorious
        ? `Boss Rush — all ${seq.length} bosses defeated`
        : `Boss Rush — fell at boss ${idx + 1}/${seq.length} (${formatBestLevelLabel(state.level.id)})`;
    }
  }
  if (summaryLine) {
    ctx.fillStyle = '#AAEEFF';
    ctx.font = '12px monospace';
    ctx.fillText(summaryLine, W / 2, 114);
  }

  if (isNameEntryActive(rs)) {
    drawNameEntry(ctx, state, rs, W);
  } else {
    if (!options.suppressLeaderboard) {
      drawLeaderboard(ctx, rs, W);
    }
    drawLifetimeStats(ctx, W, H);
    ctx.fillStyle = '#AACCFF';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    const rs2 = runState || (state && state.runState) || null;
    const mode = rs2 && rs2.mode;
    const isCamp = mode === 'campaign' || mode === 'campaign-coop';
    if (isCamp && !options.victorious) {
      ctx.fillText('SPACE for menu  ·  R to retry this level', W / 2, H - 16);
    } else {
      ctx.fillText('Press SPACE for main menu', W / 2, H - 16);
    }
  }
}

function drawLifetimeStats(ctx, widthPx, heightPx) {
  const stats = readStats();
  // 6 rows now — bump the start up a hair so they all fit comfortably.
  const baseY = heightPx - 144;
  ctx.fillStyle = '#FFCC44';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('— LIFETIME —', widthPx / 2, baseY);

  const lineH = 14;
  const unlocked = countUnlocked(readUnlocks());
  const total = ACHIEVEMENTS.length;
  const fastestStr = stats.fastestClearMs > 0
    ? `${(stats.fastestClearMs / 1000).toFixed(1)}s`
    : '—';
  const rows = [
    [`Kills: ${stats.totalKills}`, `Deaths: ${stats.totalDeaths}`],
    [`Hurls: ${stats.totalHurls}`, `Levels: ${stats.totalLevelsCleared}`],
    [`Best score: ${stats.bestScore}`, `Streak: ${stats.longestStreak}`],
    [`Play time: ${formatPlayTime(stats.totalPlayTimeMs)}`, `Runs: ${stats.runsPlayed}`],
    [`Achievements: ${unlocked}/${total}`, `Explosions: ${stats.explosions || 0}`],
    [`Fastest clear: ${fastestStr}`, `Boss Rush: ${stats.bossRushClears || 0}`],
  ];
  const leftX = widthPx / 2 - 100;
  const rightX = widthPx / 2 + 100;
  ctx.font = '11px monospace';
  ctx.fillStyle = '#CCCCCC';
  for (let i = 0; i < rows.length; i++) {
    const y = baseY + 14 + i * lineH;
    ctx.textAlign = 'left';
    ctx.fillText(rows[i][0], leftX, y);
    ctx.textAlign = 'right';
    ctx.fillText(rows[i][1], rightX, y);
  }
  ctx.textAlign = 'center';
}

function drawNameEntry(ctx, state, runState, widthPx) {
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('Enter your name:', widthPx / 2, 150);

  const name = runState.nameEntry.name || '';
  const timeMs = (state && typeof state.timeMs === 'number') ? state.timeMs : 0;
  const cursorOn = Math.floor(timeMs / 400) % 2 === 0;
  const display = name + (cursorOn && name.length < 6 ? '_' : ' ');
  ctx.fillStyle = '#FFFF88';
  ctx.font = 'bold 28px monospace';
  ctx.fillText(display.padEnd(6, ' '), widthPx / 2, 190);

  ctx.fillStyle = '#AACCFF';
  ctx.font = '12px monospace';
  ctx.fillText('A-Z / 0-9 · Backspace · Enter to submit', widthPx / 2, 220);
}

function drawLeaderboard(ctx, runState, widthPx) {
  const entries = (runState && runState.leaderboard) ? runState.leaderboard : readLeaderboard();
  ctx.fillStyle = '#FFCC44';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('TOP 10', widthPx / 2, 130);

  ctx.font = '12px monospace';
  const startY = 152;
  const lineH = 16;
  const leftX = 80;
  const rightX = widthPx - 80;

  if (!entries || entries.length === 0) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#888888';
    ctx.fillText('(no scores yet)', widthPx / 2, startY);
    return;
  }

  for (let i = 0; i < entries.length && i < 10; i++) {
    const e = entries[i];
    const y = startY + i * lineH;
    ctx.fillStyle = '#FFFFFF';
    const rank = String(i + 1).padStart(2, ' ');
    ctx.textAlign = 'left';
    ctx.fillText(`${rank}. ${e.name}`, leftX, y);
    ctx.textAlign = 'right';
    ctx.fillText(String(e.score), rightX, y);
  }
  ctx.textAlign = 'center';
}

import { BALANCE, COLORS } from '../engine/constants.js';
import {
  drawObject,
  drawActor,
  drawBalloon,
  interpolatedActorPos,
} from './sprites.js';
import { drawHazards } from './hazards.js';
import { drawHud } from './hud.js';
import { drawPopups } from './popups.js';
import { drawExplosionFx } from './explosion-fx.js';
import { drawLaneTelegraph } from './lane-telegraph.js';
import { drawDeathPoofs } from './death-poof.js';
import { drawShatter } from './shatter.js';
import { drawBalloonPops } from './balloon-pop.js';
import { currentShakeOffset } from './screen-shake.js';

const DEFAULT_BG = '#C8E6C8';

// globalThis.DEBUG === true enables otherwise-suppressed diagnostics.
const warnedBgKeys = new Set();
function warnUnknownBg(key) {
  if (globalThis.DEBUG === true) {
    console.warn('render: unknown background key', key);
    return;
  }
  if (warnedBgKeys.has(key)) return;
  warnedBgKeys.add(key);
  console.warn('render: unknown background key', key);
}

export function render(ctx, state, fxLists) {
  const lists = fxLists || {};
  const popups = lists.popups || [];
  const explosionFx = lists.explosionFx || [];
  const laneTelegraph = lists.laneTelegraph || [];
  const deathPoofs = lists.deathPoofs || [];
  const shatter = lists.shatter || [];
  const balloonPops = lists.balloonPops || [];

  const cols = BALANCE.GRID_COLS;
  const rows = BALANCE.GRID_ROWS;
  const tile = BALANCE.TILE_PX;
  const hudH = BALANCE.HUD_HEIGHT_PX;
  const width = cols * tile;
  const height = rows * tile + hudH;

  // Body region (everything except HUD) gets the screen-shake offset so
  // explosions feel weighty without making the HUD digits unreadable.
  const { dx, dy } = currentShakeOffset();
  ctx.save();
  if (dx !== 0 || dy !== 0) ctx.translate(dx, dy);

  drawBackground(ctx, state, width, height);
  drawGridBase(ctx, cols, rows, tile, hudH);
  drawHazards(ctx, state);
  drawObjects(ctx, state);
  drawWindupIndicators(ctx, state, tile, hudH);
  drawMovingObjects(ctx, state);
  drawBalloons(ctx, state);
  drawClones(ctx, state, tile, hudH);
  drawActors(ctx, state);
  drawPlayerNumberTags(ctx, state, tile, hudH);
  drawAbilityReadyBadges(ctx, state, tile, hudH);
  drawEnemyCastIndicators(ctx, state, tile, hudH);
  drawExplosionFx(ctx, explosionFx);
  drawDeathPoofs(ctx, deathPoofs);
  drawShatter(ctx, shatter);
  drawBalloonPops(ctx, balloonPops);
  drawLaneTelegraph(ctx, laneTelegraph);
  drawPopups(ctx, popups);
  drawLowLifeIndicator(ctx, state);
  drawLevelIntroBanner(ctx, state, width, height);

  ctx.restore();
  // HUD stays still — score/lives never bounce.
  drawHud(ctx, state);
}

// Per-player "last life" indicator — draws a pulsing red ring around the
// player's cell instead of a full-screen vignette. Keeps the feedback in-world.
function drawLowLifeIndicator(ctx, state) {
  if (!state || !Array.isArray(state.players)) return;
  const tile = BALANCE.TILE_PX;
  const hudH = BALANCE.HUD_HEIGHT_PX;
  const tNow = state.timeMs || 0;
  const pulse = 0.5 + 0.5 * Math.sin(tNow / 250);
  for (const p of state.players) {
    if (!p || p.alive === false) continue;
    if (typeof p.lives !== 'number' || p.lives > 1) continue;
    const { col: vc, row: vr } = interpolatedActorPos(p);
    const cx = (vc + 0.5) * tile;
    const cy = hudH + (vr + 0.5) * tile;
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.4 * pulse;
    ctx.strokeStyle = '#FF3344';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, tile * 0.50, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawLevelIntroBanner(ctx, state, width, height) {
  if (!state || !state.level) return;
  const age = state.levelIntroAgeMs || 0;
  const HOLD_MS = 800;
  const FADE_MS = 400;
  const TOTAL = HOLD_MS + FADE_MS;
  if (age > TOTAL) return;
  let alpha;
  if (age <= HOLD_MS) alpha = Math.min(1, age / 120); // fade-in over 120ms
  else alpha = 1 - (age - HOLD_MS) / FADE_MS;
  if (alpha <= 0) return;
  const lvlId = state.level.id || '01';
  const n = parseInt(lvlId, 10);
  let label = '';
  if (Number.isFinite(n) && n >= 1) {
    const world = Math.floor((n - 1) / 6) + 1;
    const lev = ((n - 1) % 6) + 1;
    label = `W${world} · L${lev}`;
  }
  // Title removed by design — show only the world/level label.
  const cy = height / 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, cy - 36, width, 72);
  ctx.fillStyle = '#FFCC66';
  ctx.font = 'bold 28px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label || `LV-${lvlId}`, width / 2, cy);
  ctx.restore();
}

function drawEnemyCastIndicators(ctx, state, tile, hudH) {
  const enemies = state.enemies || [];
  if (enemies.length === 0) return;
  const pulseT = (state.timeMs || 0) / 120;
  const pulse = 0.5 + 0.5 * Math.sin(pulseT);
  for (const e of enemies) {
    if (!e || !e.cast) continue;
    const cx = e.pos.col * tile + tile / 2;
    const cy = hudH + e.pos.row * tile + tile / 2;
    if (e.cast.kind === 'trap') {
      const total = e.cast.completesMs - e.cast.startedMs;
      const elapsed = Math.max(0, Math.min(total, state.timeMs - e.cast.startedMs));
      const progress = total > 0 ? elapsed / total : 1;
      const baseR = tile * 0.2;
      const maxR = tile * 0.6;
      const r = baseR + (maxR - baseR) * progress;
      ctx.save();
      ctx.globalAlpha = 0.45 + 0.4 * pulse;
      ctx.strokeStyle = COLORS['slow-trap'] || '#7A3AB0';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (e.cast.kind === 'fireball') {
      // Optional: also show E4 fireball cast as a brief ring.
      const total = e.cast.completesMs - e.cast.startedMs;
      const elapsed = Math.max(0, Math.min(total, state.timeMs - e.cast.startedMs));
      const progress = total > 0 ? elapsed / total : 1;
      const r = tile * (0.25 + 0.3 * progress);
      ctx.save();
      ctx.globalAlpha = 0.4 + 0.35 * pulse;
      ctx.strokeStyle = COLORS.fireball || '#FF6633';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

function drawBackground(ctx, state, width, height) {
  const key = state && state.level && state.level.background;
  let color = DEFAULT_BG;
  if (key && COLORS && COLORS[key]) {
    color = COLORS[key];
  } else if (key) {
    warnUnknownBg(key);
  }
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  // Cosmic worlds get an animated starfield overlay. Deterministic positions
  // keyed on the level ID so each level has a stable star layout.
  if (key === 'world-7' || key === 'world-8') {
    drawStarfield(ctx, state, width, height, key === 'world-8');
  }
}

function drawStarfield(ctx, state, width, height, denseFlag) {
  const hudH = BALANCE.HUD_HEIGHT_PX;
  const t = (state.timeMs || 0) / 1000;
  // FNV-1a-style seed from the level id so the layout is stable per-level.
  const levelId = (state.level && state.level.id) || '00';
  let seed = 0x811c9dc5 >>> 0;
  for (let i = 0; i < levelId.length; i++) {
    seed ^= levelId.charCodeAt(i);
    seed = Math.imul(seed, 0x01000193) >>> 0;
  }
  const count = denseFlag ? 70 : 50;
  for (let i = 0; i < count; i++) {
    seed = Math.imul(seed + 1, 0x9e3779b1) >>> 0;
    const x = (seed >>> 16) % width;
    seed = Math.imul(seed + 1, 0x9e3779b1) >>> 0;
    const y = hudH + ((seed >>> 16) % (height - hudH));
    seed = Math.imul(seed + 1, 0x9e3779b1) >>> 0;
    const phase = (seed & 0xff) / 255;
    const twinkle = 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2 + phase * Math.PI * 2));
    ctx.globalAlpha = twinkle;
    ctx.fillStyle = i % 7 === 0 ? '#FFDDFF' : '#FFFFFF';
    const size = i % 11 === 0 ? 2 : 1;
    ctx.fillRect(x, y, size, size);
  }
  ctx.globalAlpha = 1;
}

function drawGridBase(ctx, cols, rows, tile, hudH) {
  ctx.save();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
  ctx.lineWidth = 1;
  for (let c = 0; c <= cols; c++) {
    const x = c * tile + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, hudH);
    ctx.lineTo(x, hudH + rows * tile);
    ctx.stroke();
  }
  for (let r = 0; r <= rows; r++) {
    const y = hudH + r * tile + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(cols * tile, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawObjects(ctx, state) {
  const grid = state.grid;
  if (!grid) return;
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (cell && cell.object) {
        drawObject(ctx, cell.object.type, c, r, state.timeMs);
      }
    }
  }
}

function drawWindupIndicators(ctx, state, tile, hudH) {
  const grid = state.grid;
  if (!grid) return;
  const tNow = state.timeMs || 0;
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (!cell || !cell.windup) continue;
      const tint = enemyTint(cell.windup.enemyType);
      // Boss tiers (enemy6 + enemy7) pulse 3x faster to signal "tough spawn
      // incoming". A bright border also outlines the cell for extra emphasis.
      const isBoss = cell.windup.enemyType === 'enemy6' || cell.windup.enemyType === 'enemy7';
      const speed = isBoss ? 80 : 200;
      const pulse = 0.5 + 0.5 * Math.sin(tNow / speed);
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.45 * pulse;
      ctx.fillStyle = tint;
      const inset = 2;
      ctx.fillRect(
        c * tile + inset,
        hudH + r * tile + inset,
        tile - inset * 2,
        tile - inset * 2,
      );
      if (isBoss) {
        ctx.globalAlpha = 0.8 + 0.2 * pulse;
        ctx.strokeStyle = tint;
        ctx.lineWidth = 2;
        ctx.strokeRect(
          c * tile + 1,
          hudH + r * tile + 1,
          tile - 2,
          tile - 2,
        );
      }
      ctx.restore();
    }
  }
}

function enemyTint(type) {
  if (COLORS && COLORS[type]) return COLORS[type];
  return '#FFFFFF';
}

const MOVING_OBJECT_DIR_DELTA = {
  up: { col: 0, row: -1 },
  down: { col: 0, row: 1 },
  left: { col: -1, row: 0 },
  right: { col: 1, row: 0 },
};

function drawMovingObjects(ctx, state) {
  const list = state.movingObjects || [];
  const grid = state.grid;
  const tile = BALANCE.TILE_PX;
  const hudH = BALANCE.HUD_HEIGHT_PX;
  for (let i = 0; i < list.length; i++) {
    const mo = list[i];
    const delta = MOVING_OBJECT_DIR_DELTA[mo.dir] || { col: 0, row: 0 };
    let progress = Math.max(0, Math.min(1, mo.progress || 0));
    if (nextCellBlocksVisually(grid, mo.pos, delta)) {
      progress = 0;
    }
    const col = mo.pos.col + delta.col * progress;
    const row = mo.pos.row + delta.row * progress;
    // Smoke trail: 4 fading dots behind the mover, opposite its direction.
    if (progress > 0.05) {
      const cx = col * tile + tile / 2;
      const cy = hudH + row * tile + tile / 2;
      ctx.save();
      ctx.fillStyle = mo.type === 'fireball' ? '#FFAA44' : '#888888';
      for (let k = 1; k <= 4; k++) {
        const back = k * 0.18;
        const tx = cx - delta.col * tile * back;
        const ty = cy - delta.row * tile * back;
        ctx.globalAlpha = Math.max(0, 0.5 - k * 0.10);
        const sz = Math.max(1, 4 - k);
        ctx.fillRect(tx - sz / 2, ty - sz / 2, sz, sz);
      }
      ctx.restore();
    }
    drawObject(ctx, mo.type, col, row, state.timeMs);
  }
}

function nextCellBlocksVisually(grid, pos, delta) {
  if (!grid) return false;
  const nc = pos.col + delta.col;
  const nr = pos.row + delta.row;
  if (nr < 0 || nr >= grid.length) return true;
  const row = grid[nr];
  if (!row || nc < 0 || nc >= row.length) return true;
  return !!(row[nc] && row[nc].object);
}

function drawBalloons(ctx, state) {
  const list = state.balloons || [];
  for (let i = 0; i < list.length; i++) {
    drawBalloon(ctx, list[i], state.timeMs);
  }
}

function drawPlayerNumberTags(ctx, state, tile, hudH) {
  if (!state || !Array.isArray(state.players) || state.players.length < 2) return;
  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];
    if (!p || p.alive === false) continue;
    const { col: vc, row: vr } = interpolatedActorPos(p);
    const cx = (vc + 0.5) * tile;
    const cy = hudH + vr * tile - 2;
    ctx.save();
    ctx.fillStyle = i === 0 ? '#66FFAA' : '#FFCC66';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const label = i === 0 ? 'P1' : 'P2';
    ctx.strokeText(label, cx, cy);
    ctx.fillText(label, cx, cy);
    ctx.restore();
  }
}

function drawAbilityReadyBadges(ctx, state, tile, hudH) {
  if (!state || !Array.isArray(state.players)) return;
  const now = state.timeMs || 0;
  const pulse = 0.5 + 0.5 * Math.sin(now / 200);
  for (const p of state.players) {
    if (!p || p.alive === false || !p.upgrades) continue;
    const badges = [];
    // Lion: fireball charge ready OR on cooldown (shows remaining seconds).
    if (p.upgrades.rockToExplosive) {
      const onCooldown = p.explosiveCooldownUntilMs && p.explosiveCooldownUntilMs > now;
      const queued = p.explosiveQueuedUntilMs && p.explosiveQueuedUntilMs > now;
      if (onCooldown) {
        const sec = Math.ceil((p.explosiveCooldownUntilMs - now) / 1000);
        badges.push({ glyph: String(sec), color: '#555566', dim: true });
      } else {
        badges.push({ glyph: queued ? '🔥' : '💥', color: queued ? '#FFAA22' : '#FF6644' });
      }
    }
    // Mole: burrow cooldown badge
    if (p.upgrades.moleBurrow && p.moleBurrowCooldownUntilMs && p.moleBurrowCooldownUntilMs > now) {
      const sec = Math.ceil((p.moleBurrowCooldownUntilMs - now) / 1000);
      badges.push({ glyph: String(sec), color: '#555566', dim: true });
    }
    // Monkey: clone slot available
    if (p.upgrades.stunClone) {
      let max = 1;
      if (p.upgrades.tripleClone) max = 3;
      else if (p.upgrades.twinClone) max = 2;
      const mine = (state.clones || []).filter((c) => c && c.ownerId === p.id).length;
      if (mine < max) badges.push({ glyph: '🐵', color: '#88CCFF' });
    }
    // Mole: trap-cancel applicable when an enemy is winding up a trap nearby
    if (p.upgrades.trapCancel && Array.isArray(state.enemies)) {
      for (const e of state.enemies) {
        if (!e || !e.cast || e.cast.kind !== 'trap') continue;
        const d = Math.abs(e.pos.col - p.pos.col) + Math.abs(e.pos.row - p.pos.row);
        if (d <= 5) { badges.push({ glyph: '✕', color: '#FFCC44' }); break; }
      }
    }
    // Rabbit: bomb in inventory
    if (p.inventory && p.inventory.eggBomb > 0) {
      badges.push({ glyph: '🥚', color: '#FFEEAA' });
    }
    // Wolf: berserk in inventory
    if (p.inventory && p.inventory.berserk > 0) {
      badges.push({ glyph: '⚡', color: '#FF66AA' });
    }
    if (badges.length === 0) continue;
    // Stack badges to the right of the player cell, slightly above center.
    // Use the interpolated visual position so badges track the sprite during
    // smooth movement instead of snapping cell-to-cell.
    const { col: vc, row: vr } = interpolatedActorPos(p);
    const cx = (vc + 0.5) * tile;
    const cy = hudH + (vr + 0.5) * tile;
    const radius = tile * 0.20;
    for (let i = 0; i < badges.length; i++) {
      const b = badges[i];
      const bx = cx + tile * 0.40;
      const by = cy - tile * 0.35 + i * (radius * 2 + 2);
      ctx.save();
      // Dim badges (cooldown timers) skip the pulse — readable, not distracting.
      ctx.globalAlpha = b.dim ? 0.7 : (0.6 + 0.4 * pulse);
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(bx, by, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = b.dim ? '#FFFFFF' : '#000';
      ctx.font = `bold ${Math.round(radius * 1.5)}px ${b.dim ? 'monospace' : 'sans-serif'}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.glyph, bx, by + 1);
      ctx.restore();
    }
  }
}

function drawClones(ctx, state, tile, hudH) {
  const list = state.clones || [];
  if (list.length === 0) return;
  const now = state.timeMs || 0;
  for (const clone of list) {
    if (!clone) continue;
    const cx = clone.pos.col * tile + tile / 2;
    const cy = hudH + clone.pos.row * tile + tile / 2;
    // Pulse + cyan tint to read as a "ghost" decoy. Brighter as it nears expiry.
    const remaining = Math.max(0, clone.expiresMs - now);
    const lifeFraction = Math.max(0, Math.min(1, remaining / 5000));
    const pulse = 0.5 + 0.5 * Math.sin(now / 120);
    ctx.save();
    ctx.globalAlpha = 0.30 + 0.20 * pulse;
    ctx.fillStyle = clone.echoBlast ? '#FFAA66' : '#88CCFF';
    ctx.beginPath();
    ctx.arc(cx, cy, tile * 0.30, 0, Math.PI * 2);
    ctx.fill();
    // Inner ring shrinks as clone ages
    ctx.globalAlpha = 0.65 * lifeFraction;
    ctx.strokeStyle = clone.echoBlast ? '#FF8844' : '#CCEEFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, tile * 0.38, 0, Math.PI * 2);
    ctx.stroke();
    // "Clone" glyph (mirror character)
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🐵', cx, cy);
    ctx.restore();
  }
}

function drawActors(ctx, state) {
  const enemies = state.enemies || [];
  for (let i = 0; i < enemies.length; i++) {
    // state must be passed — sprites.js gates computeActorFx on its presence,
    // and without it the frozen-pulse / wounded indicator never fires.
    drawActor(ctx, enemies[i], 'enemy', state);
  }
  const players = state.players || [];
  const now = state.timeMs || 0;
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (p.alive === false) {
      // Death animation: the player asset itself spins, shrinks, and swaps to
      // a "knocked out" glyph (💫). No full-screen overlay — the player sprite
      // carries the entire death feedback. Only runs when a life remains; a
      // truly-out player is drawn as nothing.
      if (typeof p.deathTimeMs === 'number' && p.lives > 0) {
        const elapsed = now - p.deathTimeMs;
        if (elapsed >= 0 && elapsed < BALANCE.DEATH_ANIM_MS) {
          drawPlayerDeathSprite(ctx, p, elapsed / BALANCE.DEATH_ANIM_MS);
        }
      }
      continue;
    }
    drawActor(ctx, p, 'player', state);
  }
}

function drawPlayerDeathSprite(ctx, p, t) {
  // t in [0,1] — 0 = moment of death, 1 = animation done.
  const tile = BALANCE.TILE_PX;
  const hudH = BALANCE.HUD_HEIGHT_PX;
  const cx = (p.pos.col + 0.5) * tile;
  const cy = hudH + (p.pos.row + 0.5) * tile;
  // Eased curves: snappy spin at start, gradual shrink, gradual fade.
  const rotation = t * Math.PI * 1.5;          // 270° spin
  const scale = 1 - t * 0.6;                   // shrink 1.0 → 0.4
  const alpha = Math.max(0, 1 - t);            // fade 1.0 → 0
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  ctx.scale(scale, scale);
  // First half of the animation shows the character glyph slumping; the second
  // half swaps to a "stars / knocked out" glyph so the asset itself tells the
  // story — no screen-wide effect needed.
  const glyph = t < 0.5 ? glyphForSkin(p.skinId || p.character) : '💫';
  ctx.font = `${Math.round(tile * 0.7)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(glyph, 0, 0);
  ctx.restore();
}

function glyphForSkin(skinId) {
  const GLYPH = {
    bear: '🐻', wolf: '🐺', lion: '🦁', rabbit: '🐰', pig: '🐷',
    mole: '🐹', monkey: '🐵', elephant: '🐘', owl: '🦉', fox: '🦊',
  };
  return GLYPH[skinId] || '😵';
}

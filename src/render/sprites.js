import { BALANCE, COLORS, GLYPHS } from '../engine/constants.js';
import characters from '../data/characters.json' with { type: 'json' };

const CELL_RADIUS_PX = 4;
const CELL_INSET_PX = 2;
const GLYPH_FONT = '18px sans-serif';
const FALLBACK_COLOR = '#FF00FF';
const FALLBACK_GLYPH = '?';
const BALLOON_ALPHA = 0.85;
const HAZARD_ALPHA = 0.5;
const BERSERK_WARN_COLOR = '#FF3333';
const INVIS_BASE_ALPHA = 0.5;
const INVIS_WARN_MIN_ALPHA = 0.2;
const FROZEN_PULSE_MIN_ALPHA = 0.5;

const DEFAULT_PLAYER_SKIN = 'bear';

const FRIED_EGG_SPARKLE_GLYPH = '✦';
const FRIED_EGG_SPARKLE_FONT = '10px sans-serif';
const FRIED_EGG_SPARKLE_COLOR = '#FFFFFF';
const FRIED_EGG_FRAME_MS = 200;
const FRIED_EGG_FRAME_COUNT = 4;
const FRIED_EGG_ROTATIONS_RAD = [
  0,
  Math.PI / 8,
  Math.PI / 4,
  (3 * Math.PI) / 8,
];
const FRIED_EGG_ALPHA_BY_FRAME = [0.95, 0.75, 0.55, 0.75];
const FRIED_EGG_SPARKLE_OFFSET_PX = 8;

const SPRITE_KEYS = [
  'bear',
  'enemy1', 'enemy2', 'enemy3', 'enemy4', 'enemy5', 'enemy6', 'enemy7', 'enemy8',
  'rock', 'fireball', 'donut', 'egg', 'fried-egg', 'slow-trap',
  'balloon-berserk', 'balloon-invisibility', 'balloon-timeFreeze',
  'balloon-lifePlus', 'balloon-scorePlus500', 'balloon-scorePlus1000',
  'balloon-scorePlus2500', 'balloon-multiplier2', 'balloon-multiplier3',
];

const spriteRegistry = {};
let preloadStarted = false;

// globalThis.DEBUG === true enables otherwise-suppressed diagnostics. Matches placeEggs precedent.
const warnedKeys = new Set();
function warnOnce(key, ...args) {
  if (globalThis.DEBUG === true) {
    console.warn(...args);
    return;
  }
  if (warnedKeys.has(key)) return;
  warnedKeys.add(key);
  console.warn(...args);
}

for (const key of SPRITE_KEYS) {
  spriteRegistry[key] = {
    url: `./assets/sprites/${key}.svg`,
    image: null,
    loaded: false,
    failed: false,
  };
}

export function preloadSprites() {
  if (preloadStarted) return Promise.resolve();
  preloadStarted = true;
  if (typeof Image === 'undefined') return Promise.resolve();
  const promises = SPRITE_KEYS.map((key) => loadOne(key));
  return Promise.all(promises).then(() => undefined);
}

function loadOne(key) {
  return new Promise((resolveLoad) => {
    const entry = spriteRegistry[key];
    const img = new Image();
    entry.image = img;
    img.onload = () => {
      entry.loaded = true;
      resolveLoad();
    };
    img.onerror = () => {
      entry.failed = true;
      entry.image = null;
      resolveLoad();
    };
    img.src = entry.url;
  });
}

export function hasSprite(key) {
  const entry = spriteRegistry[key];
  return !!(entry && entry.loaded && entry.image);
}

export function drawSpriteOrFallback(ctx, key, c, r, fallbackFn) {
  if (hasSprite(key)) {
    const { x, y } = gridToPx({ col: c, row: r });
    ctx.drawImage(spriteRegistry[key].image, x, y, BALANCE.TILE_PX, BALANCE.TILE_PX);
    return;
  }
  fallbackFn();
}

if (typeof Image !== 'undefined') {
  preloadSprites();
}

export function gridToPx({ col, row }) {
  return {
    x: col * BALANCE.TILE_PX,
    y: BALANCE.HUD_HEIGHT_PX + row * BALANCE.TILE_PX,
  };
}

// Per-type corner radius override (in px). Defaults to CELL_RADIUS_PX.
// Larger values make small grid objects read as round shapes rather than
// barely-rounded squares.
const OBJECT_RADIUS_PX = {
  rock: 14,
  egg: 16,
  donut: 18,
  fireball: 14,
  'fried-egg': 14,
};

export function drawObject(ctx, type, c, r, timeMs = 0) {
  const color = lookupColor(type, 'object');
  const glyph = lookupGlyph(type, 'object');
  const radius = OBJECT_RADIUS_PX[type];
  drawSpriteOrFallback(ctx, type, c, r, () => drawCell(ctx, c, r, color, glyph, radius));
  if (type === 'fried-egg') {
    drawFriedEggSparkle(ctx, c, r, timeMs);
  }
}

export function interpolatedActorPos(actor) {
  if (actor && actor.move && actor.move.from && actor.move.to) {
    const t = Math.max(0, Math.min(1, actor.move.t || 0));
    const col = actor.move.from.col + (actor.move.to.col - actor.move.from.col) * t;
    const row = actor.move.from.row + (actor.move.to.row - actor.move.from.row) * t;
    return { col, row };
  }
  return { col: actor.pos.col, row: actor.pos.row };
}

export function drawActor(ctx, actor, kind, state) {
  const key = resolveActorKey(actor, kind);
  const { col: drawCol, row: drawRow } = interpolatedActorPos(actor);
  if (!key) {
    if (globalThis.DEBUG === true) {
      console.warn(`drawActor: missing key for kind=${kind}`, actor);
    }
    drawCell(ctx, drawCol, drawRow, FALLBACK_COLOR, FALLBACK_GLYPH);
    return;
  }
  const { color, glyph } = resolveActorAppearance(key, kind);

  const fx = state ? computeActorFx(actor, kind, state) : null;
  // Idle "breathing" scale: gentle ±3% pulse on stationary actors. Skipped
  // while moving so it doesn't fight the position interpolation.
  const isMoving = !!(actor && actor.move);
  const idleBreath = (!isMoving && state)
    ? 1 + 0.025 * Math.sin((state.timeMs || 0) / 600 + (actor.id || 0) * 0.7)
    : 1;
  const needsTransform = idleBreath !== 1;
  const paint = () => {
    const fallback = kind === 'player'
      ? () => drawGlyphOnly(ctx, drawCol, drawRow, color, glyph)
      : () => drawCell(ctx, drawCol, drawRow, color, glyph);
    if (needsTransform) {
      const tile = BALANCE.TILE_PX;
      const hud = BALANCE.HUD_HEIGHT_PX;
      const cx = drawCol * tile + tile / 2;
      const cy = hud + drawRow * tile + tile / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(idleBreath, idleBreath);
      ctx.translate(-cx, -cy);
      drawSpriteOrFallback(ctx, key, drawCol, drawRow, fallback);
      ctx.restore();
    } else {
      drawSpriteOrFallback(ctx, key, drawCol, drawRow, fallback);
    }
  };

  if (fx && fx.alpha < 1) {
    ctx.save();
    ctx.globalAlpha = fx.alpha;
    paint();
    ctx.restore();
  } else {
    paint();
  }

  if (fx && fx.berserkWarn) {
    ctx.save();
    ctx.globalAlpha = fx.berserkWarnAlpha;
    drawCell(ctx, drawCol, drawRow, BERSERK_WARN_COLOR, glyph);
    ctx.restore();
  }

  if (kind === 'enemy' && fx && fx.frozen) {
    drawFrozenOverlay(ctx, drawCol, drawRow, fx.frozen);
  }

  // Player buff-expiry rings: one concentric ring per about-to-end buff so
  // multiple stacked buffs each get their own visual countdown.
  if (kind === 'player' && fx && Array.isArray(fx.buffExpiryWarns)) {
    for (let i = 0; i < fx.buffExpiryWarns.length; i++) {
      drawBuffExpiryWarning(ctx, drawCol, drawRow, fx.buffExpiryWarns[i], i);
    }
  }

  if (fx && fx.pickupFlash > 0) {
    drawPickupBurst(ctx, drawCol, drawRow, fx.pickupFlash, fx.pickupFlashColor || '#88FFFF', glyph);
  }

  if (kind === 'player' && fx && fx.slowedOverlay) {
    drawSlowedWeb(ctx, drawCol, drawRow, state ? (state.timeMs || 0) : 0);
  }

  // Invuln halo: pulsing ring around a player still under post-respawn invuln.
  if (kind === 'player' && actor && actor.status && state
      && typeof actor.status.invulnUntilMs === 'number'
      && actor.status.invulnUntilMs > (state.timeMs || 0)
      && actor.status.invulnUntilMs !== Number.MAX_SAFE_INTEGER) {
    drawInvulnHalo(ctx, drawCol, drawRow, state.timeMs || 0);
  }

  drawActorDirection(ctx, actor, kind, drawCol, drawRow);

  // Wounded indicator for multi-HP enemies (Titan when first hit lands).
  if (kind === 'enemy' && typeof actor.hp === 'number'
      && typeof actor.maxHp === 'number' && actor.maxHp > 1 && actor.hp < actor.maxHp) {
    drawHpBar(ctx, drawCol, drawRow, actor.hp, actor.maxHp);
  }
}

// Pickup burst — expanding colored ring + rotating 4-point sparkle stars
// over the actor cell. `phase` is 1 at pickup, 0 at end-of-animation.
function drawPickupBurst(ctx, col, row, phase, color, glyph) {
  const tile = BALANCE.TILE_PX;
  const { x, y } = gridToPx({ col, row });
  const cx = x + tile / 2;
  const cy = y + tile / 2;
  const t = 1 - phase; // 0 → 1 over the animation
  ctx.save();

  // Brief tint on the actor itself for the first ~30% of the animation.
  if (t < 0.35) {
    const tintAlpha = (0.35 - t) / 0.35 * 0.55;
    ctx.globalAlpha = tintAlpha;
    drawCell(ctx, col, row, color, glyph);
  }

  // Expanding double ring.
  const baseR = tile * 0.45;
  const ringR1 = baseR + t * tile * 0.9;
  const ringR2 = baseR + t * tile * 1.4;
  ctx.globalAlpha = Math.max(0, 0.85 - t);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3 * (1 - t * 0.6);
  ctx.beginPath();
  ctx.arc(cx, cy, ringR1, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = Math.max(0, 0.55 - t * 0.7);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, ringR2, 0, Math.PI * 2);
  ctx.stroke();

  // Sparkle stars rotating outward.
  const sparkleCount = 6;
  const sparkleR = tile * (0.35 + t * 0.65);
  const rotate = t * Math.PI;
  ctx.globalAlpha = Math.max(0, 1 - t);
  ctx.fillStyle = color;
  for (let i = 0; i < sparkleCount; i++) {
    const a = (i / sparkleCount) * Math.PI * 2 + rotate;
    const sx = cx + Math.cos(a) * sparkleR;
    const sy = cy + Math.sin(a) * sparkleR;
    drawSparkle(ctx, sx, sy, 3 * (1 - t * 0.8));
  }
  ctx.restore();
}

function drawSparkle(ctx, x, y, size) {
  if (size <= 0.2) return;
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x + size * 0.4, y - size * 0.4);
  ctx.lineTo(x + size, y);
  ctx.lineTo(x + size * 0.4, y + size * 0.4);
  ctx.lineTo(x, y + size);
  ctx.lineTo(x - size * 0.4, y + size * 0.4);
  ctx.lineTo(x - size, y);
  ctx.lineTo(x - size * 0.4, y - size * 0.4);
  ctx.closePath();
  ctx.fill();
}

// Cyan ice tint + snowflake corner + border. Border thickens and color
// shifts toward warning red as intensity (proximity to expiry) approaches 1.
// Compute warning shape for a buff that's about to expire. Intensity ramps
// 0 → 1 as remaining ms approaches 0; pulse period shortens accordingly.
function makeExpiryWarn(color, remainingMs, warnMs, now) {
  const t = Math.max(0, Math.min(1, remainingMs / warnMs));
  const intensity = 1 - t; // 0 fresh-warn → 1 about-to-expire
  // 480ms period when warning starts → ~110ms in the last instant.
  const period = 12 + (1 - intensity) * 70;
  const pulse = 0.5 + 0.5 * Math.sin(now / period);
  return { color, intensity, pulse };
}

// Pulsing dashed ring around the player cell, color-coded to the buff that's
// about to expire. Multiple buffs stack with concentric rings.
function drawBuffExpiryWarning(ctx, col, row, warn, ringIndex) {
  const tile = BALANCE.TILE_PX;
  const { x, y } = gridToPx({ col, row });
  const cx = x + tile / 2;
  const cy = y + tile / 2;
  const baseR = tile * 0.48 + ringIndex * 5; // offset concentric rings outward
  const wobble = Math.sin(((typeof performance !== 'undefined' && performance.now)
    ? performance.now() : Date.now()) / 220) * 1.5;
  const radius = baseR + wobble * (0.5 + 0.5 * warn.intensity);

  ctx.save();
  ctx.lineWidth = 2 + 1.5 * warn.intensity;
  ctx.strokeStyle = warn.color;
  ctx.globalAlpha = 0.55 + 0.4 * warn.pulse;
  ctx.setLineDash([6, 4]);
  ctx.lineDashOffset = -warn.pulse * 12;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Crescendo in the final stretch: solid bright flash overlaying the dashed ring.
  if (warn.intensity > 0.65) {
    ctx.setLineDash([]);
    ctx.globalAlpha = (warn.intensity - 0.65) * warn.pulse;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

// Frozen overlay: a thin cyan ring + corner snowflake to anchor the
// "frozen / touch-to-kill" state even when the sprite's own alpha-pulse is
// in its transparent half. No big tile-fill — the sprite's pulse IS the
// primary signal.
function drawFrozenOverlay(ctx, col, row, frozen) {
  const tile = BALANCE.TILE_PX;
  const { x, y } = gridToPx({ col, row });
  const intensity = Math.max(0, Math.min(1, frozen.intensity || 0));
  ctx.save();
  // Thin cyan border; gets a warning red tinge in the last stretch.
  ctx.globalAlpha = 0.65;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = intensity > 0.6 ? '#FF8888' : '#AAEEFF';
  ctx.strokeRect(x + 1.5, y + 1.5, tile - 3, tile - 3);
  // Snowflake corner glyph — always visible, doesn't pulse with the sprite.
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = intensity > 0.6 ? '#FFCC66' : '#FFFFFF';
  ctx.font = `${Math.floor(tile * 0.32)}px sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText('❄', x + tile - 2, y + 1);
  ctx.restore();
}

function drawInvulnHalo(ctx, col, row, timeMs) {
  const tile = BALANCE.TILE_PX;
  const hud = BALANCE.HUD_HEIGHT_PX;
  const cx = col * tile + tile / 2;
  const cy = hud + row * tile + tile / 2;
  const t = timeMs / 200;
  const pulse = 0.5 + 0.5 * Math.sin(t);
  ctx.save();
  ctx.globalAlpha = 0.35 + 0.35 * pulse;
  ctx.strokeStyle = '#66CCFF';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, tile * 0.45 + pulse * 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawHpBar(ctx, col, row, hp, maxHp) {
  const tile = BALANCE.TILE_PX;
  const hud = BALANCE.HUD_HEIGHT_PX;
  const x = col * tile + 4;
  const y = hud + row * tile + tile - 6;
  const w = tile - 8;
  const h = 4;
  ctx.save();
  ctx.fillStyle = '#220000';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = '#330000';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#FF3344';
  ctx.fillRect(x, y, Math.max(0, Math.floor(w * (hp / maxHp))), h);
  // Segment dividers — one notch per HP point
  if (maxHp > 1) {
    ctx.fillStyle = '#220000';
    for (let i = 1; i < maxHp; i++) {
      const sx = x + Math.floor(w * (i / maxHp));
      ctx.fillRect(sx, y, 1, h);
    }
  }
  ctx.restore();
}

const SLOWED_WEB_GLYPH = '🕸';
const SLOWED_WEB_FONT = '20px sans-serif';
const SLOWED_WEB_COLOR = '#7A3AB0';

function drawSlowedWeb(ctx, col, row, timeMs) {
  const pulse = 0.5 + 0.5 * Math.sin(timeMs / 180);
  const tile = BALANCE.TILE_PX;
  const x = col * tile + tile / 2;
  const y = BALANCE.HUD_HEIGHT_PX + row * tile + tile / 2;
  ctx.save();
  ctx.globalAlpha = 0.55 + 0.3 * pulse;
  ctx.font = SLOWED_WEB_FONT;
  ctx.fillStyle = SLOWED_WEB_COLOR;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(SLOWED_WEB_GLYPH, x, y);
  ctx.restore();
}

const DIR_ARROW = { up: '▲', down: '▼', left: '◀', right: '▶' };
const DIR_ARROW_FONT = '10px sans-serif';
const DIR_ARROW_COLOR_PLAYER = '#FFFFFF';
const DIR_ARROW_COLOR_ENEMY = '#FFEE88';
const DIR_ARROW_STROKE = '#202020';

function drawActorDirection(ctx, actor, kind, col, row) {
  const dir = actor && actor.dir;
  const glyph = DIR_ARROW[dir];
  if (!glyph) return;
  const tile = BALANCE.TILE_PX;
  const x = col * tile + tile / 2;
  const y = BALANCE.HUD_HEIGHT_PX + row * tile + tile / 2;
  const off = tile * 0.36;
  let ax = x;
  let ay = y;
  if (dir === 'up') ay = y - off;
  else if (dir === 'down') ay = y + off;
  else if (dir === 'left') ax = x - off;
  else if (dir === 'right') ax = x + off;
  ctx.save();
  ctx.font = DIR_ARROW_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = DIR_ARROW_STROKE;
  // Berserk players get a bright red arrow with a glow ring as a danger cue.
  const isBerserk = kind === 'player' && actor && actor.status
    && typeof actor.status.berserkUntilMs === 'number';
  if (isBerserk) {
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#FF3333';
    ctx.fillStyle = '#FF3344';
  } else {
    ctx.fillStyle = kind === 'player' ? DIR_ARROW_COLOR_PLAYER : DIR_ARROW_COLOR_ENEMY;
  }
  ctx.strokeText(glyph, ax, ay);
  ctx.fillText(glyph, ax, ay);
  ctx.restore();
}

export function drawHazard(ctx, kind, c, r) {
  const color = lookupColor(kind, 'hazard');
  const glyph = lookupGlyph(kind, 'hazard');
  ctx.save();
  ctx.globalAlpha = HAZARD_ALPHA;
  drawSpriteOrFallback(ctx, kind, c, r, () => drawCell(ctx, c, r, color, glyph));
  ctx.restore();
}

export function drawBalloon(ctx, balloon, timeMs) {
  const color = lookupColor(balloon.type, 'balloon');
  const glyph = lookupGlyph(balloon.type, 'balloon');
  const tile = BALANCE.TILE_PX;
  const colF = typeof balloon.colFloat === 'number' ? balloon.colFloat : balloon.col;
  const cx = colF * tile + tile / 2;
  const cy = BALANCE.HUD_HEIGHT_PX + balloon.rowFloat * tile + tile / 2;
  // Spawn pop-in: scale from 0.3 to 1.0 over the first 250ms of the balloon's
  // life. Reads as "balloon inflates as it rises into view" — quick, additive.
  const ageMs = Number.isFinite(balloon.ageMs) ? balloon.ageMs : 1000;
  const POP_MS = 250;
  const spawnScale = ageMs < POP_MS ? 0.3 + 0.7 * (ageMs / POP_MS) : 1;
  const radius = tile * 0.42 * spawnScale;
  ctx.save();
  // Soft glow halo: pulses with time so balloons "breathe" and read clearly
  // against any background.
  const t = (typeof timeMs === 'number' ? timeMs : 0) / 350;
  const pulse = 0.5 + 0.5 * Math.sin(t + (balloon.id || 0));
  ctx.globalAlpha = 0.18 + 0.22 * pulse;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = BALLOON_ALPHA;
  // Circle backdrop with glyph centered. Sprites (if present) are drawn inside
  // the circle's bounding box, but the circle shape is the primary indicator
  // so balloons clearly don't follow grid rules.
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  const key = `balloon-${balloon.type}`;
  if (hasSprite(key)) {
    ctx.drawImage(spriteRegistry[key].image, cx - radius, cy - radius, radius * 2, radius * 2);
  } else {
    ctx.fillStyle = pickGlyphColor(color);
    ctx.font = GLYPH_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, cx, cy);
  }
  // Subtle outline so the circle reads on busy backgrounds.
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawFriedEggSparkle(ctx, c, r, timeMs) {
  const safeTime = Number.isFinite(timeMs) && timeMs >= 0 ? timeMs : 0;
  const frame = Math.floor(safeTime / FRIED_EGG_FRAME_MS) % FRIED_EGG_FRAME_COUNT;
  const rotation = FRIED_EGG_ROTATIONS_RAD[frame];
  const alpha = FRIED_EGG_ALPHA_BY_FRAME[frame];
  const { x, y } = gridToPx({ col: c, row: r });
  const cx = x + BALANCE.TILE_PX / 2 + FRIED_EGG_SPARKLE_OFFSET_PX;
  const cy = y + BALANCE.TILE_PX / 2 - FRIED_EGG_SPARKLE_OFFSET_PX;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  ctx.fillStyle = FRIED_EGG_SPARKLE_COLOR;
  ctx.font = FRIED_EGG_SPARKLE_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(FRIED_EGG_SPARKLE_GLYPH, 0, 0);
  ctx.restore();
}

function computeActorFx(actor, kind, state) {
  const now = state.timeMs || 0;
  const warnMs = BALANCE.POWERUP_WARNING_MS;
  const fx = {
    alpha: 1, berserkWarn: false, berserkWarnAlpha: 0, slowedOverlay: false,
    pickupFlash: 0, pickupFlashColor: null,
  };
  if (kind === 'player' && actor.status) {
    // Pickup burst: expanding ring + sparkle stars over ~600ms. Stored as
    // 0..1 (1 = just collected, 0 = animation finished).
    const flashUntil = actor.pickupFlashUntilMs;
    const flashStarted = actor.pickupFlashStartedMs;
    if (typeof flashUntil === 'number' && flashUntil > now) {
      const total = typeof flashStarted === 'number' ? (flashUntil - flashStarted) : 600;
      fx.pickupFlash = Math.max(0, Math.min(1, (flashUntil - now) / total));
      fx.pickupFlashColor = actor.pickupFlashColor || '#88FFFF';
    }
    if (typeof actor.status.slowedUntilMs === 'number' && actor.status.slowedUntilMs > now) {
      fx.slowedOverlay = true;
    }
    fx.buffExpiryWarns = [];
    const inv = actor.status.invisibleUntilMs;
    if (typeof inv === 'number' && inv > now) {
      const remaining = inv - now;
      if (remaining < warnMs) {
        const t = remaining / warnMs;
        const pulse = 0.5 + 0.5 * Math.sin(now / 80);
        fx.alpha = INVIS_WARN_MIN_ALPHA + (1 - INVIS_WARN_MIN_ALPHA) * pulse * t;
        // Cyan ring around the player as invisibility runs down.
        fx.buffExpiryWarns.push(makeExpiryWarn('#88CCFF', remaining, warnMs, now));
      } else {
        fx.alpha = INVIS_BASE_ALPHA;
      }
    }
    const ber = actor.status.berserkUntilMs;
    if (typeof ber === 'number' && ber > now && (ber - now) < warnMs) {
      const remaining = ber - now;
      fx.berserkWarn = true;
      fx.berserkWarnAlpha = 0.3 + 0.4 * (0.5 + 0.5 * Math.sin(now / 70));
      // Red ring around the player as berserk runs down.
      fx.buffExpiryWarns.push(makeExpiryWarn('#FF4466', remaining, warnMs, now));
    }
    const invuln = actor.status.invulnUntilMs;
    if (typeof invuln === 'number' && invuln > now) {
      fx.alpha = Math.min(fx.alpha, 0.4 + 0.4 * (0.5 + 0.5 * Math.sin(now / 60)));
    }
  } else if (kind === 'enemy') {
    // Frozen enemies pulse-flash their own alpha between transparent and
    // opaque to signal "currently frozen, waking soon". The pulse period
    // accelerates as expiry approaches: ~1000ms at fresh-freeze, ~100ms at
    // the very end. The snowflake border (drawFrozenOverlay) is a quiet
    // secondary cue confirming the "touch to kill" state.
    const enemyFrozenUntil = actor && actor.frozenUntilMs;
    if (typeof enemyFrozenUntil === 'number' && enemyFrozenUntil > now) {
      const remaining = enemyFrozenUntil - now;
      const warnMs = BALANCE.POWERUP_WARNING_MS;
      // intensity climbs 0 → 1 across the warning window; before then it
      // ramps slowly so the player still gets a hint that something's pulsing.
      let intensity = 0;
      if (remaining < warnMs) intensity = 1 - remaining / warnMs;
      // Period: 1000ms when fresh → 100ms when about to wake.
      const periodSinDivisor = 16 + (1 - intensity) * 144;
      const pulse = 0.5 + 0.5 * Math.sin(now / periodSinDivisor);
      // Alpha sweeps between transparent (0.20) and opaque (0.90). The whole
      // sprite throbs, so the flashing is unmistakable.
      fx.alpha = 0.20 + 0.70 * pulse;
      fx.frozen = { intensity, pulse };
    }
  }
  return fx;
}

function resolveActorKey(actor, kind) {
  if (kind === 'player') {
    if (!actor.character && actor.type) {
      if (globalThis.DEBUG === true) {
        console.warn('drawActor: player actor missing character; using type', actor);
      }
      return actor.type;
    }
    return actor.character || null;
  }
  if (kind === 'enemy') {
    if (!actor.type && actor.character) {
      if (globalThis.DEBUG === true) {
        console.warn('drawActor: enemy actor missing type; using character', actor);
      }
      return actor.character;
    }
    return actor.type || null;
  }
  if (globalThis.DEBUG === true) {
    console.warn(`drawActor: unknown kind=${kind}`);
  }
  return null;
}

function resolveActorAppearance(key, kind) {
  if (kind === 'player') {
    const entry = (characters && characters[key]) || null;
    if (entry && entry.color && entry.glyph) {
      return { color: entry.color, glyph: entry.glyph };
    }
    const fallback = (characters && characters[DEFAULT_PLAYER_SKIN]) || null;
    if (fallback && fallback.color && fallback.glyph) {
      return { color: fallback.color, glyph: fallback.glyph };
    }
    return { color: '#7B4F2A', glyph: '🐻' };
  }
  return { color: lookupColor(key, kind), glyph: lookupGlyph(key, kind) };
}

function lookupColor(key, category) {
  const color = COLORS && COLORS[key];
  if (!color) {
    warnOnce(`color:${category}:${key}`, `sprites: missing color for ${category} '${key}'`);
    return FALLBACK_COLOR;
  }
  return color;
}

function lookupGlyph(key, category) {
  const glyph = GLYPHS && GLYPHS[key];
  if (!glyph) {
    warnOnce(`glyph:${category}:${key}`, `sprites: missing glyph for ${category} '${key}'`);
    return FALLBACK_GLYPH;
  }
  return glyph;
}

function drawCell(ctx, c, r, color, glyph, radius) {
  const { x, y } = gridToPx({ col: c, row: r });
  paintCellAt(ctx, x, y, color, glyph, radius);
}

function drawGlyphOnly(ctx, c, r, color, glyph) {
  const { x, y } = gridToPx({ col: c, row: r });
  const tile = BALANCE.TILE_PX;
  ctx.save();
  ctx.font = '24px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#202020';
  ctx.strokeText(glyph, x + tile / 2, y + tile / 2);
  ctx.fillStyle = color;
  ctx.fillText(glyph, x + tile / 2, y + tile / 2);
  ctx.restore();
}

function paintCellAt(ctx, x, y, color, glyph, radius) {
  const tile = BALANCE.TILE_PX;
  const inset = CELL_INSET_PX;
  const w = tile - inset * 2;
  const h = tile - inset * 2;
  const r = typeof radius === 'number' ? radius : CELL_RADIUS_PX;
  ctx.fillStyle = color;
  drawRoundedRect(ctx, x + inset, y + inset, w, h, r);
  ctx.fill();
  ctx.fillStyle = pickGlyphColor(color);
  ctx.font = GLYPH_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(glyph, x + tile / 2, y + tile / 2);
}

function drawRoundedRect(ctx, x, y, w, h, radius) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, radius);
    return;
  }
  const r = Math.min(radius, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function pickGlyphColor(bgHex) {
  const hex = (bgHex || '').replace('#', '');
  if (hex.length !== 6) return '#000000';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#202020' : '#FFFFFF';
}

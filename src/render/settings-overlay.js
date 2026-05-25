import {
  setBinding,
  setVolume,
  setMuted,
  isMuted,
  getVolume,
  getBinding,
} from '../engine/run-state.js';

const PANEL_W = 380;
const PANEL_H = 340;
const ROW_H = 22;
const SLIDER_W = 140;

// Escape is intentionally NOT in this set; it is handled above as cancel/close.
const RESERVED_KEYS = new Set([
  'Tab', 'MetaLeft', 'MetaRight',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
]);

const VOLUME_CHANNELS = ['master', 'music', 'sfx'];
const BINDING_ROWS = [
  { slot: 'p1', action: 'up', label: 'P1 Up' },
  { slot: 'p1', action: 'down', label: 'P1 Down' },
  { slot: 'p1', action: 'left', label: 'P1 Left' },
  { slot: 'p1', action: 'right', label: 'P1 Right' },
  { slot: 'p1', action: 'hurl', label: 'P1 Hurl' },
  { slot: 'p1', action: 'destroy', label: 'P1 Destroy' },
  { slot: 'p2', action: 'up', label: 'P2 Up' },
  { slot: 'p2', action: 'down', label: 'P2 Down' },
  { slot: 'p2', action: 'left', label: 'P2 Left' },
  { slot: 'p2', action: 'right', label: 'P2 Right' },
  { slot: 'p2', action: 'hurl', label: 'P2 Hurl' },
  { slot: 'p2', action: 'destroy', label: 'P2 Destroy' },
  { slot: 'shared', action: 'pause', label: 'Pause' },
  { slot: 'shared', action: 'mute', label: 'Mute' },
];

function panelOrigin(ctx) {
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  const cw = ctx.canvas.width / dpr;
  const ch = ctx.canvas.height / dpr;
  return {
    cw, ch,
    px: Math.floor((cw - PANEL_W) / 2),
    py: Math.floor((ch - PANEL_H) / 2),
  };
}

function layoutRows(overlay, panelX, panelY) {
  overlay.rows = [];
  let y = panelY + 36;
  for (const ch of VOLUME_CHANNELS) {
    overlay.rows.push({
      kind: 'slider',
      label: `${ch} volume`,
      rect: { x: panelX + 140, y: y + 4, w: SLIDER_W, h: 12 },
      ref: ch,
    });
    y += ROW_H;
  }
  overlay.rows.push({
    kind: 'toggle',
    label: 'mute',
    rect: { x: panelX + 140, y: y + 2, w: 60, h: 16 },
    ref: 'mute',
  });
  y += ROW_H + 4;
  for (const br of BINDING_ROWS) {
    overlay.rows.push({
      kind: 'binding',
      label: br.label,
      rect: { x: panelX + 140, y: y + 2, w: 90, h: 16 },
      ref: { slot: br.slot, action: br.action },
    });
    y += 16;
  }
  overlay.rows.push({
    kind: 'button',
    label: 'close',
    rect: { x: panelX + PANEL_W - 80, y: panelY + PANEL_H - 30, w: 60, h: 22 },
    ref: 'close',
  });
}

export function createSettingsOverlay(runState, audio) {
  return {
    open: false,
    returnTo: null,
    rebinding: null,
    rows: [],
    warning: null,
    warningUntilMs: 0,
    timeMs: 0,
    panelX: 0,
    panelY: 0,
    runState,
    audio,
  };
}

export function openSettings(overlay, returnTo) {
  overlay.open = true;
  overlay.returnTo = returnTo || 'title';
  overlay.rebinding = null;
  overlay.warning = null;
  // Best-effort initial layout using a reasonable default canvas size;
  // drawSettings re-lays-out using true canvas dimensions on first paint.
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  const cw = (overlay.audio && overlay.audio.canvasW) || 416;
  const ch = (overlay.audio && overlay.audio.canvasH) || 384;
  overlay.panelX = Math.floor((cw - PANEL_W) / 2);
  overlay.panelY = Math.floor((ch - PANEL_H) / 2);
  layoutRows(overlay, overlay.panelX, overlay.panelY);
  void dpr;
}

export function closeSettings(overlay) {
  overlay.open = false;
  overlay.rebinding = null;
  overlay.warning = null;
}

export function isSettingsOpen(overlay) {
  return !!(overlay && overlay.open);
}

function applyVolumeToAudio(overlay) {
  // Pass the actual master volume independently of mute. Mute is signaled
  // through setMuted only — never overwrite the stored volume to 0, because
  // synth.js persists the volume to localStorage and a zero would survive
  // across mute toggles, silencing SFX permanently.
  const audio = overlay.audio;
  if (!audio) return;
  const muted = isMuted(overlay.runState);
  const master = getVolume(overlay.runState, 'master');
  try {
    if (typeof audio.setVolume === 'function') audio.setVolume(master);
    if (typeof audio.setMuted === 'function') audio.setMuted(muted);
  } catch (e) {
    // ignore
  }
}

function setWarning(overlay, msg) {
  overlay.warning = msg;
  overlay.warningUntilMs = overlay.timeMs + 2000;
}

export function handleSettingsKey(overlay, e) {
  if (!overlay.open) return false;
  if (overlay.rebinding) {
    if (e.code === 'Escape' || e.key === 'Escape') {
      overlay.rebinding = null;
      return true;
    }
    if (RESERVED_KEYS.has(e.code)) {
      setWarning(overlay, `Key ${e.code} is reserved`);
      return true;
    }
    setBinding(overlay.runState, overlay.rebinding.action, overlay.rebinding.playerId, e.code);
    overlay.rebinding = null;
    return true;
  }
  if (e.code === 'Escape' || e.key === 'Escape') {
    closeSettings(overlay);
    return true;
  }
  return true;
}

export function handleSettingsClick(overlay, x, y) {
  if (!overlay.open) return;
  for (const row of overlay.rows) {
    const r = row.rect;
    if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) continue;
    if (row.kind === 'slider') {
      const t = Math.max(0, Math.min(1, (x - r.x) / r.w));
      setVolume(overlay.runState, row.ref, t);
      applyVolumeToAudio(overlay);
      return;
    }
    if (row.kind === 'toggle') {
      setMuted(overlay.runState, !isMuted(overlay.runState));
      applyVolumeToAudio(overlay);
      return;
    }
    if (row.kind === 'binding') {
      overlay.rebinding = { action: row.ref.action, playerId: row.ref.slot };
      return;
    }
    if (row.kind === 'button' && row.ref === 'close') {
      closeSettings(overlay);
      return;
    }
  }
}

export function tickSettings(overlay, dtMs) {
  overlay.timeMs += dtMs;
  if (overlay.warning && overlay.timeMs > overlay.warningUntilMs) {
    overlay.warning = null;
  }
}

export function drawSettings(ctx, overlay) {
  if (!overlay.open) return;
  const { cw, ch, px, py } = panelOrigin(ctx);
  overlay.panelX = px;
  overlay.panelY = py;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, cw, ch);
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(px, py, PANEL_W, PANEL_H);
  ctx.strokeStyle = '#888';
  ctx.strokeRect(px + 0.5, py + 0.5, PANEL_W - 1, PANEL_H - 1);
  ctx.fillStyle = '#fff';
  ctx.font = '14px monospace';
  ctx.textBaseline = 'top';
  ctx.fillText('Settings', px + 12, py + 10);

  layoutRows(overlay, px, py);

  ctx.font = '10px monospace';
  for (const row of overlay.rows) {
    ctx.fillStyle = '#ccc';
    ctx.fillText(row.label, px + 14, row.rect.y);
    const r = row.rect;
    if (row.kind === 'slider') {
      const v = getVolume(overlay.runState, row.ref);
      ctx.fillStyle = '#333';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = '#5a9';
      ctx.fillRect(r.x, r.y, r.w * v, r.h);
      ctx.fillStyle = '#fff';
      ctx.fillText(`${Math.round(v * 100)}%`, r.x + r.w + 6, r.y);
    } else if (row.kind === 'toggle') {
      const muted = isMuted(overlay.runState);
      ctx.fillStyle = muted ? '#a33' : '#3a3';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = '#fff';
      ctx.fillText(muted ? 'MUTED' : 'ON', r.x + 6, r.y + 2);
    } else if (row.kind === 'binding') {
      const isRebind = overlay.rebinding
        && overlay.rebinding.action === row.ref.action
        && overlay.rebinding.playerId === row.ref.slot;
      ctx.fillStyle = isRebind ? '#aa3' : '#333';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = '#fff';
      const code = getBinding(overlay.runState, row.ref.action, row.ref.slot) || '?';
      ctx.fillText(isRebind ? 'press key…' : code, r.x + 4, r.y + 2);
    } else if (row.kind === 'button') {
      ctx.fillStyle = '#444';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = '#fff';
      ctx.fillText(row.label, r.x + 16, r.y + 6);
    }
  }

  if (overlay.warning) {
    ctx.fillStyle = '#fa6';
    ctx.fillText(overlay.warning, px + 14, py + PANEL_H - 50);
  }

  ctx.restore();
}

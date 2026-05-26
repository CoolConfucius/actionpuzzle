// Character-select screen. Mouse/keyboard. Card grid on the left, detail
// panel on the right. Inspired by PvZ / Bloons / Battle Cats / Cookie Run.
//
// External wiring (see main.js): set the screen open with createCharacterSelectState,
// drive hover/click events, and call consume* to read what the player decided.
import characters from '../data/characters.json' with { type: 'json' };
import { specialtyForCharacter, upgradesForCharacter, purchaseStatus } from '../engine/upgrade-defs.js';
import { readCampaign, getCoins, getXp } from '../engine/campaign.js';

const CHARACTERS = ['bear', 'wolf', 'monkey', 'lion', 'pig', 'mole', 'rabbit', 'elephant', 'owl', 'fox'];

const BG_COLOR = '#0F0F1F';
const PANEL_COLOR = '#1A1A2E';
const TITLE_COLOR = '#FFCC66';
const HIGHLIGHT_COLOR = '#66FFAA';
const TEXT_COLOR = '#FFFFFF';
const DIM_COLOR = '#888899';
const COIN_COLOR = '#FFCC44';
const XP_COLOR = '#66CCFF';

const SIGNATURE_KEY = {
  wolf: { key: 'Q / \\', ability: 'Activate banked Berserk' },
  lion: { key: 'F', ability: 'Charge Rock-to-Explosive' },
  monkey: { key: 'N', ability: 'Drop Stun Clone' },
  rabbit: { key: 'B', ability: 'Drop proximity bomb' },
  mole: { key: 'T', ability: 'Cancel trap or burrow' },
  owl: { key: 'Z', ability: 'Activate banked Time Freeze' },
  fox: { key: 'X', ability: 'Activate banked Invisibility' },
};

export function createCharacterSelectState(initialChar, opts) {
  const idx = Math.max(0, CHARACTERS.indexOf(initialChar || 'bear'));
  return {
    open: false,
    cursor: idx,
    _hoverIdx: -1,
    _hoverBtn: '',
    purpose: (opts && opts.purpose) || 'browse', // 'browse' | 'preplay'
    playRequested: false,
    skillTreeRequested: false,
    shopRequested: false,
    closeRequested: false,
    selectedCharacter: CHARACTERS[idx],
    _cardBounds: [],
    _btnBounds: {},
  };
}

export function openCharacterSelect(state, initialChar, purpose) {
  if (!state) return;
  const idx = Math.max(0, CHARACTERS.indexOf(initialChar || 'bear'));
  state.cursor = idx;
  state.open = true;
  state.purpose = purpose || 'browse';
  state.playRequested = false;
  state.skillTreeRequested = false;
  state.shopRequested = false;
  state.closeRequested = false;
  state._hoverIdx = -1;
  state._hoverBtn = '';
  state.selectedCharacter = CHARACTERS[idx];
}

export function closeCharacterSelect(state) {
  if (!state) return;
  state.open = false;
}

export function isCharacterSelectOpen(state) {
  return !!(state && state.open);
}

export function consumeCharacterSelectAction(state) {
  if (!state) return null;
  if (state.playRequested) { state.playRequested = false; return 'play'; }
  if (state.skillTreeRequested) { state.skillTreeRequested = false; return 'skillTree'; }
  if (state.shopRequested) { state.shopRequested = false; return 'itemShop'; }
  if (state.closeRequested) { state.closeRequested = false; return 'close'; }
  return null;
}

export function characterSelectId(state) {
  if (!state) return 'bear';
  return CHARACTERS[state.cursor] || 'bear';
}

function lookupCharacter(id) {
  const entry = characters && characters[id];
  if (entry && entry.color && entry.glyph) return entry;
  return { displayName: id, color: '#FFFFFF', glyph: '?' };
}

function countOwned(campaign, charId) {
  if (!campaign || !campaign.upgrades) return 0;
  const tree = campaign.upgrades[charId];
  if (!tree) return 0;
  let n = 0;
  for (const k of Object.keys(tree)) if (tree[k]) n += 1;
  return n;
}

export function drawCharacterSelect(ctx, state, widthPx, heightPx) {
  if (!state || !state.open) return;
  const W = widthPx || 1000;
  const H = heightPx || 552;

  // Animated background
  drawCharSelectBackground(ctx, W, H);

  // Header
  ctx.save();
  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const pulse = 0.5 + 0.5 * Math.sin(now / 600);
  ctx.shadowBlur = 12 + pulse * 8;
  ctx.shadowColor = TITLE_COLOR;
  ctx.fillStyle = TITLE_COLOR;
  ctx.font = 'bold 26px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('CHOOSE YOUR HERO', W / 2, 38);
  ctx.restore();

  // Coins (right) — visible because Item Shop is reachable from this screen
  const campaign = readCampaign();
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = COIN_COLOR;
  ctx.fillText(`¢${getCoins(campaign)}`, W - 20, 38);

  // Subtitle hint
  ctx.textAlign = 'center';
  ctx.fillStyle = DIM_COLOR;
  ctx.font = '11px monospace';
  const hint = state.purpose === 'preplay'
    ? 'Click PLAY when ready. Pick a different hero to switch.'
    : 'Click a hero to see their skills, XP, and signature ability.';
  ctx.fillText(hint, W / 2, 60);

  // Card grid (left): 5 columns × 2 rows of small character cards
  const GRID_X = 24;
  const GRID_Y = 90;
  const GRID_W = Math.floor(W * 0.55);
  const COLS = 5;
  const ROWS = 2;
  const CARD_GAP = 10;
  const CARD_W = Math.floor((GRID_W - (COLS + 1) * CARD_GAP) / COLS);
  const CARD_H = Math.floor((H - GRID_Y - 200) / ROWS) - CARD_GAP;

  state._cardBounds = [];
  for (let i = 0; i < CHARACTERS.length; i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const cx = GRID_X + CARD_GAP + col * (CARD_W + CARD_GAP);
    const cy = GRID_Y + row * (CARD_H + CARD_GAP);
    const charId = CHARACTERS[i];
    const selected = state.cursor === i;
    const hovered = state._hoverIdx === i;
    drawCharacterCard(ctx, cx, cy, CARD_W, CARD_H, charId, selected, hovered, campaign);
    state._cardBounds.push({ i, charId, bounds: { x: cx, y: cy, w: CARD_W, h: CARD_H } });
  }

  // Detail panel (right)
  const DETAIL_X = GRID_X + GRID_W + 16;
  const DETAIL_W = W - DETAIL_X - 24;
  const DETAIL_Y = GRID_Y;
  const DETAIL_H = H - GRID_Y - 90;
  drawDetailPanel(ctx, DETAIL_X, DETAIL_Y, DETAIL_W, DETAIL_H, CHARACTERS[state.cursor], campaign);

  // Bottom action buttons (full-width row)
  const BTN_Y = H - 70;
  const BTN_H = 44;
  const BTN_GAP = 12;

  const btns = [];
  if (state.purpose === 'preplay') {
    btns.push({ id: 'play', label: '▶  PLAY', color: '#66FFAA' });
    btns.push({ id: 'skillTree', label: '✦  SKILL TREE', color: '#66CCFF' });
    btns.push({ id: 'itemShop', label: '🛒  ITEM SHOP', color: '#FFCC44' });
    btns.push({ id: 'close', label: '← BACK', color: '#AAAAAA' });
  } else {
    btns.push({ id: 'skillTree', label: '✦  SKILL TREE', color: '#66CCFF' });
    btns.push({ id: 'itemShop', label: '🛒  ITEM SHOP', color: '#FFCC44' });
    btns.push({ id: 'play', label: '▶  PLAY', color: '#66FFAA' });
    btns.push({ id: 'close', label: '← BACK', color: '#AAAAAA' });
  }
  const TOTAL_BTN_W = W - 40;
  const BTN_W = Math.floor((TOTAL_BTN_W - (btns.length - 1) * BTN_GAP) / btns.length);
  state._btnBounds = {};
  for (let i = 0; i < btns.length; i++) {
    const bx = 20 + i * (BTN_W + BTN_GAP);
    const by = BTN_Y;
    const isHover = state._hoverBtn === btns[i].id;
    drawActionButton(ctx, bx, by, BTN_W, BTN_H, btns[i].label, btns[i].color, isHover);
    state._btnBounds[btns[i].id] = { x: bx, y: by, w: BTN_W, h: BTN_H };
  }

  // Footer help
  ctx.textAlign = 'center';
  ctx.fillStyle = DIM_COLOR;
  ctx.font = '10px monospace';
  ctx.fillText('←/→ choose · Enter = PLAY · S = Skill Tree · I = Item Shop · Esc = Back', W / 2, H - 14);
}

function drawCharSelectBackground(ctx, W, H) {
  // Soft radial gradient with drifting blobs to add visual life.
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, W, H);
  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  ctx.save();
  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 6; i++) {
    const phase = now / 4000 + i;
    const x = W * (0.15 + 0.7 * (0.5 + 0.5 * Math.sin(phase)));
    const y = H * (0.2 + 0.6 * (0.5 + 0.5 * Math.cos(phase * 0.7)));
    const r = 90 + 40 * Math.sin(phase * 1.3);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, ['#66CCFF', '#FF88AA', '#FFCC66', '#AAFFCC', '#CCAAFF', '#FFAA77'][i]);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawCharacterCard(ctx, x, y, w, h, charId, selected, hovered, campaign) {
  const c = lookupCharacter(charId);
  const xp = getXp(campaign, charId);
  const ownedSkills = countOwned(campaign, charId);
  const totalSkills = upgradesForCharacter(charId).length;

  ctx.save();
  // Hover scale
  if (selected || hovered) {
    const bump = selected ? 1.04 : 1.02;
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.translate(cx, cy);
    ctx.scale(bump, bump);
    ctx.translate(-cx, -cy);
  }
  // Background card
  ctx.fillStyle = PANEL_COLOR;
  roundRect(ctx, x, y, w, h, 12);
  ctx.fill();
  // Color stripe top
  ctx.fillStyle = c.color;
  roundRect(ctx, x, y, w, 28, 12);
  ctx.fill();
  // Border
  ctx.lineWidth = selected ? 3 : 1.5;
  ctx.strokeStyle = selected ? HIGHLIGHT_COLOR : (hovered ? '#FFFFFF66' : '#33334A');
  roundRect(ctx, x, y, w, h, 12);
  ctx.stroke();

  // Glyph (big emoji)
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `${Math.floor(h * 0.42)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(c.glyph, x + w / 2, y + h * 0.45);

  // Name
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = `bold ${Math.max(11, Math.floor(h * 0.10))}px monospace`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(c.displayName.toUpperCase(), x + w / 2, y + h - 28);

  // Skills owned / total
  ctx.fillStyle = ownedSkills > 0 ? '#FFEE66' : DIM_COLOR;
  ctx.font = `${Math.max(9, Math.floor(h * 0.08))}px monospace`;
  ctx.fillText(`✦ ${ownedSkills}/${totalSkills}`, x + w / 2, y + h - 14);

  // XP badge (top-right)
  ctx.fillStyle = XP_COLOR;
  ctx.font = `bold 10px monospace`;
  ctx.textAlign = 'right';
  ctx.fillText(`XP ${xp}`, x + w - 6, y + 20);
  ctx.restore();
}

function drawDetailPanel(ctx, x, y, w, h, charId, campaign) {
  const c = lookupCharacter(charId);
  ctx.save();
  ctx.fillStyle = PANEL_COLOR;
  roundRect(ctx, x, y, w, h, 14);
  ctx.fill();
  ctx.strokeStyle = c.color;
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 14);
  ctx.stroke();

  // Header band
  ctx.fillStyle = c.color;
  roundRect(ctx, x, y, w, 60, 14);
  ctx.fill();

  // Big glyph
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '48px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(c.glyph, x + 14, y + 30);

  // Title + specialty
  ctx.fillStyle = '#101010';
  ctx.font = 'bold 22px monospace';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(c.displayName.toUpperCase(), x + 74, y + 22);
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.font = '12px monospace';
  ctx.fillText(specialtyForCharacter(charId), x + 74, y + 42);

  // XP / Skills bar
  const xp = getXp(campaign, charId);
  const ownedSkills = countOwned(campaign, charId);
  const totalSkills = upgradesForCharacter(charId).length;
  ctx.fillStyle = XP_COLOR;
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`XP ${xp}`, x + w - 14, y + 24);
  ctx.fillStyle = '#FFEE66';
  ctx.font = '12px monospace';
  ctx.fillText(`✦ ${ownedSkills}/${totalSkills} skills`, x + w - 14, y + 44);

  // Signature ability box (if any)
  let cursorY = y + 78;
  const sig = SIGNATURE_KEY[charId];
  if (sig) {
    ctx.fillStyle = '#202032';
    roundRect(ctx, x + 14, cursorY, w - 28, 50, 8);
    ctx.fill();
    ctx.strokeStyle = '#33334A';
    ctx.lineWidth = 1;
    roundRect(ctx, x + 14, cursorY, w - 28, 50, 8);
    ctx.stroke();

    ctx.fillStyle = HIGHLIGHT_COLOR;
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('SIGNATURE KEY', x + 24, cursorY + 16);
    ctx.fillStyle = TITLE_COLOR;
    ctx.font = 'bold 18px monospace';
    ctx.fillText(sig.key, x + 24, cursorY + 38);
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = '11px monospace';
    ctx.fillText(sig.ability, x + 90, cursorY + 38);
    cursorY += 60;
  } else {
    ctx.fillStyle = DIM_COLOR;
    ctx.font = 'italic 11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Passive specialist — no activation key.', x + 14, cursorY + 12);
    cursorY += 24;
  }

  // Skills list (compact)
  const ups = upgradesForCharacter(charId);
  ctx.fillStyle = HIGHLIGHT_COLOR;
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('SKILLS', x + 14, cursorY + 14);

  cursorY += 24;
  const lineH = 16;
  const maxLines = Math.floor((y + h - cursorY - 18) / lineH);
  const shown = ups.slice(0, Math.max(0, maxLines));

  for (const u of shown) {
    const status = purchaseStatus(u, campaign);
    let glyph = '·';
    let color = DIM_COLOR;
    if (status.owned) { glyph = '★'; color = '#FFEE66'; }
    else if (!status.prereqMet) { glyph = '⊘'; color = '#665577'; }
    else if (status.affordable) { glyph = '◆'; color = HIGHLIGHT_COLOR; }
    else { glyph = '·'; color = '#7F8DA0'; }
    ctx.fillStyle = color;
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${glyph} ${u.label}`, x + 22, cursorY);
    ctx.textAlign = 'right';
    ctx.fillStyle = status.owned ? '#55AA55' : XP_COLOR;
    ctx.fillText(status.owned ? 'OWNED' : `${u.cost} XP`, x + w - 18, cursorY);
    cursorY += lineH;
  }
  if (ups.length > shown.length) {
    ctx.fillStyle = DIM_COLOR;
    ctx.font = 'italic 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`+${ups.length - shown.length} more (open Skill Tree)`, x + 22, cursorY);
  }
  ctx.restore();
}

function drawActionButton(ctx, x, y, w, h, label, color, hovered) {
  ctx.save();
  // Background
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, hovered ? color : darken(color, 0.35));
  grad.addColorStop(1, darken(color, 0.7));
  ctx.fillStyle = grad;
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = hovered ? color : darken(color, 0.5);
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 10);
  ctx.stroke();
  // Label
  ctx.fillStyle = hovered ? '#FFFFFF' : '#F5F5F5';
  ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
  ctx.restore();
}

function darken(hex, factor) {
  // Accept #RRGGBB; convert to rgba with alpha reduced for the darker stop.
  if (!hex || hex.length < 7) return 'rgba(0,0,0,0.35)';
  const r = parseInt(hex.substr(1, 2), 16);
  const g = parseInt(hex.substr(3, 2), 16);
  const b = parseInt(hex.substr(5, 2), 16);
  const f = Math.max(0, Math.min(1, 1 - factor));
  return `rgba(${Math.round(r * f)},${Math.round(g * f)},${Math.round(b * f)},1)`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') { ctx.roundRect(x, y, w, h, r); return; }
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

function hits(b, x, y) {
  return b && x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
}

export function characterSelectHover(state, x, y) {
  if (!state || !state.open) return false;
  state._hoverIdx = -1;
  state._hoverBtn = '';
  if (Array.isArray(state._cardBounds)) {
    for (const cb of state._cardBounds) {
      if (hits(cb.bounds, x, y)) { state._hoverIdx = cb.i; break; }
    }
  }
  for (const k of Object.keys(state._btnBounds || {})) {
    if (hits(state._btnBounds[k], x, y)) { state._hoverBtn = k; break; }
  }
  return state._hoverIdx >= 0 || !!state._hoverBtn;
}

export function characterSelectClick(state, x, y, selectCharCallback) {
  if (!state || !state.open) return false;
  if (Array.isArray(state._cardBounds)) {
    for (const cb of state._cardBounds) {
      if (hits(cb.bounds, x, y)) {
        state.cursor = cb.i;
        state.selectedCharacter = cb.charId;
        if (typeof selectCharCallback === 'function') selectCharCallback(cb.charId);
        return true;
      }
    }
  }
  for (const k of Object.keys(state._btnBounds || {})) {
    if (hits(state._btnBounds[k], x, y)) {
      if (k === 'play') state.playRequested = true;
      else if (k === 'skillTree') state.skillTreeRequested = true;
      else if (k === 'itemShop') state.shopRequested = true;
      else if (k === 'close') state.closeRequested = true;
      return true;
    }
  }
  return false;
}

export function characterSelectKey(state, key, selectCharCallback) {
  if (!state || !state.open) return;
  if (key === 'Escape') { state.closeRequested = true; return; }
  if (key === 'ArrowRight' || key === 'd' || key === 'D') {
    state.cursor = (state.cursor + 1) % CHARACTERS.length;
    state.selectedCharacter = CHARACTERS[state.cursor];
    if (typeof selectCharCallback === 'function') selectCharCallback(state.selectedCharacter);
    return;
  }
  if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
    state.cursor = (state.cursor - 1 + CHARACTERS.length) % CHARACTERS.length;
    state.selectedCharacter = CHARACTERS[state.cursor];
    if (typeof selectCharCallback === 'function') selectCharCallback(state.selectedCharacter);
    return;
  }
  if (key === 'ArrowDown' || key === 's') {
    // 5 per row → wrap by 5
    state.cursor = (state.cursor + 5) % CHARACTERS.length;
    state.selectedCharacter = CHARACTERS[state.cursor];
    if (typeof selectCharCallback === 'function') selectCharCallback(state.selectedCharacter);
    return;
  }
  if (key === 'ArrowUp' || key === 'w') {
    state.cursor = (state.cursor - 5 + CHARACTERS.length) % CHARACTERS.length;
    state.selectedCharacter = CHARACTERS[state.cursor];
    if (typeof selectCharCallback === 'function') selectCharCallback(state.selectedCharacter);
    return;
  }
  if (key === 'Enter' || key === ' ') { state.playRequested = true; return; }
  if (key === 'S') { state.skillTreeRequested = true; return; }
  if (key === 'I' || key === 'i') { state.shopRequested = true; return; }
}

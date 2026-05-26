// Per-character Skill Tree screen (formerly "shop"). Pay with per-character
// XP. No character cycling inside the tree — set the character via openShop().
// The render exposes the same module surface (createShopState/openShop/etc.)
// so older callers continue to work, but the screen is now skill-tree shaped.
import {
  upgradesForCharacter,
  purchaseStatus,
  lookupUpgrade,
  specialtyForCharacter,
} from '../engine/upgrade-defs.js';
import { getCoins, getXp } from '../engine/campaign.js';
import characters from '../data/characters.json' with { type: 'json' };

const BG_COLOR = 'rgba(8,8,18,0.95)';
const PANEL_COLOR = '#10122A';
const PANEL_BORDER = '#66CCFF';
const HIGHLIGHT_COLOR = '#66FFAA';
const TEXT_COLOR = '#FFFFFF';
const DIM_COLOR = '#8898AA';
const OWNED_COLOR = '#88EE88';
const LOCKED_COLOR = '#6F5A88';
const UNAFFORDABLE_COLOR = '#CC6666';
const XP_COLOR = '#66CCFF';
const COIN_COLOR = '#FFCC44';

export function createShopState() {
  return {
    open: false,
    cursor: 0,
    character: 'bear',
    nextLevelId: '',
    browseMode: false,
    _rowBounds: [],
    _btnBounds: {},
    _hoverRow: -1,
    _hoverBtn: '',
    closeRequested: false,
    backToSelectRequested: false,
    itemShopRequested: false,
  };
}

export function openShop(shop, character, nextLevelId, browseMode) {
  if (!shop) return;
  shop.open = true;
  shop.cursor = 0;
  if (character) shop.character = character;
  if (typeof nextLevelId === 'string') shop.nextLevelId = nextLevelId;
  shop.browseMode = !!browseMode;
  shop.closeRequested = false;
  shop.backToSelectRequested = false;
  shop.itemShopRequested = false;
  shop._hoverRow = -1;
  shop._hoverBtn = '';
}

export function closeShop(shop) {
  if (!shop) return;
  shop.open = false;
}

export function isShopOpen(shop) {
  return !!(shop && shop.open);
}

export function navigateShop(shop, delta) {
  if (!shop || !shop.open) return;
  const list = upgradesForCharacter(shop.character);
  if (list.length === 0) return;
  shop.cursor = (shop.cursor + delta + list.length) % list.length;
}

export function selectedShopUpgrade(shop) {
  if (!shop || !shop.open) return null;
  const list = upgradesForCharacter(shop.character);
  return list[shop.cursor] || null;
}

// Compatibility: older callers (admin overlay, etc.) cycle the character.
// Now this just sets the displayed character without UI controls in-screen.
export function cycleShopCharacter(shop, delta) {
  if (!shop) return;
  const order = ['bear', 'wolf', 'monkey', 'lion', 'pig', 'mole', 'rabbit', 'elephant', 'owl', 'fox'];
  const idx = order.indexOf(shop.character);
  const base = idx === -1 ? 0 : idx;
  shop.character = order[(base + delta + order.length) % order.length];
  shop.cursor = 0;
}

export function drawShopScreen(ctx, shop, campaign, widthPx, heightPx) {
  if (!shop || !shop.open) return;
  const W = widthPx || 1000;
  const H = heightPx || 552;

  // Dim full-screen overlay (so the title behind it still hints at the world).
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, W, H);

  const PW = Math.min(880, W - 40);
  const PH = Math.min(H - 60, 540);
  const px = Math.floor((W - PW) / 2);
  const py = Math.floor((H - PH) / 2);

  // Panel
  ctx.fillStyle = PANEL_COLOR;
  roundRect(ctx, px, py, PW, PH, 14);
  ctx.fill();
  ctx.strokeStyle = PANEL_BORDER;
  ctx.lineWidth = 2;
  roundRect(ctx, px, py, PW, PH, 14);
  ctx.stroke();

  const charEntry = (characters && characters[shop.character]) || { displayName: shop.character, color: '#FFFFFF', glyph: '?' };

  // Header band
  ctx.fillStyle = charEntry.color;
  roundRect(ctx, px, py, PW, 56, 14);
  ctx.fill();

  // Title text
  ctx.fillStyle = '#101010';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '32px sans-serif';
  ctx.fillText(charEntry.glyph, px + 16, py + 28);
  ctx.font = 'bold 18px monospace';
  ctx.fillText(`${charEntry.displayName.toUpperCase()} · SKILL TREE`, px + 60, py + 22);
  ctx.font = '12px monospace';
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillText(specialtyForCharacter(shop.character), px + 60, py + 42);

  // XP + coins (top-right of header)
  const xp = getXp(campaign, shop.character);
  ctx.fillStyle = '#101010';
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`XP ${xp}`, px + PW - 14, py + 22);
  ctx.font = 'bold 13px monospace';
  ctx.fillText(`¢${getCoins(campaign)}`, px + PW - 14, py + 42);

  // Upgrade list area
  const upgrades = upgradesForCharacter(shop.character);
  const listX = px + 16;
  const listY = py + 76;
  const listW = PW - 32;
  const ROW_H = 36;
  const visibleH = PH - 76 - 80; // leave room for header + footer buttons
  const maxRows = Math.max(1, Math.floor(visibleH / ROW_H));

  // Auto-scroll so the cursor stays visible.
  let scrollStart = 0;
  if (shop.cursor >= maxRows) scrollStart = shop.cursor - maxRows + 1;
  const endIdx = Math.min(upgrades.length, scrollStart + maxRows);

  shop._rowBounds = [];
  for (let i = scrollStart; i < endIdx; i++) {
    const u = upgrades[i];
    const status = purchaseStatus(u, campaign);
    const selected = i === shop.cursor;
    const hovered = shop._hoverRow === i;
    const rowY = listY + (i - scrollStart) * ROW_H;
    drawSkillRow(ctx, listX, rowY, listW, ROW_H - 4, u, status, selected, hovered);
    shop._rowBounds.push({ i, bounds: { x: listX, y: rowY, w: listW, h: ROW_H - 4 } });
  }

  // Pagination indicator
  if (upgrades.length > maxRows) {
    ctx.fillStyle = DIM_COLOR;
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${shop.cursor + 1}/${upgrades.length}`, px + PW - 16, py + PH - 64);
  }

  // Detail panel (below list area, above buttons)
  const selectedU = upgrades[shop.cursor];
  if (selectedU) {
    drawDetailPanel(ctx, selectedU, campaign, px + 16, py + PH - 60 - 70, PW - 32, 60);
  }

  // Footer action buttons
  const btnY = py + PH - 56;
  const btnH = 40;
  const btnGap = 10;
  const btns = [];
  btns.push({ id: 'buy', label: 'BUY  [Enter]', color: HIGHLIGHT_COLOR });
  btns.push({ id: 'itemShop', label: '🛒  ITEM SHOP', color: COIN_COLOR });
  btns.push({ id: 'backToSelect', label: 'CHANGE CHARACTER', color: '#88AACC' });
  btns.push({ id: 'close', label: shop.browseMode ? '← BACK' : 'CONTINUE  [Space]', color: '#AAAAAA' });
  const totalW = PW - 32;
  const btnW = Math.floor((totalW - (btns.length - 1) * btnGap) / btns.length);
  shop._btnBounds = {};
  for (let i = 0; i < btns.length; i++) {
    const bx = px + 16 + i * (btnW + btnGap);
    const hovered = shop._hoverBtn === btns[i].id;
    drawActionButton(ctx, bx, btnY, btnW, btnH, btns[i].label, btns[i].color, hovered);
    shop._btnBounds[btns[i].id] = { x: bx, y: btnY, w: btnW, h: btnH };
  }

  if (shop.nextLevelId) {
    ctx.fillStyle = DIM_COLOR;
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`Next: ${formatNextLevelLabel(shop.nextLevelId)}`, px + PW / 2, py + PH - 4);
  }
}

function drawSkillRow(ctx, x, y, w, h, u, status, selected, hovered) {
  ctx.save();
  // Pill background
  if (selected) {
    ctx.fillStyle = 'rgba(102,255,170,0.16)';
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = HIGHLIGHT_COLOR;
    roundRect(ctx, x, y, w, h, 8);
    ctx.stroke();
  } else if (hovered) {
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
  }

  // Tag column (left)
  let glyph = '◇';
  let glyphColor = DIM_COLOR;
  if (status.owned) { glyph = '★'; glyphColor = OWNED_COLOR; }
  else if (!status.prereqMet) { glyph = '⊘'; glyphColor = LOCKED_COLOR; }
  else if (status.affordable) { glyph = '◆'; glyphColor = HIGHLIGHT_COLOR; }
  else { glyph = '·'; glyphColor = UNAFFORDABLE_COLOR; }
  ctx.fillStyle = glyphColor;
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(glyph, x + 18, y + h / 2);

  // Label
  let labelColor = TEXT_COLOR;
  if (status.owned) labelColor = OWNED_COLOR;
  else if (!status.prereqMet) labelColor = LOCKED_COLOR;
  else if (!status.affordable) labelColor = UNAFFORDABLE_COLOR;
  if (selected) labelColor = HIGHLIGHT_COLOR;
  ctx.fillStyle = labelColor;
  ctx.font = selected ? 'bold 13px monospace' : '13px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(u.label, x + 38, y + 14);

  // Description (smaller, under label)
  ctx.fillStyle = DIM_COLOR;
  ctx.font = '10px monospace';
  ctx.fillText(truncate(u.description, 80), x + 38, y + 28);

  // Cost (right column)
  ctx.textAlign = 'right';
  ctx.font = '12px monospace';
  if (status.owned) {
    ctx.fillStyle = OWNED_COLOR;
    ctx.fillText('OWNED', x + w - 14, y + h / 2 + 4);
  } else {
    ctx.fillStyle = XP_COLOR;
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`${u.cost} XP`, x + w - 14, y + h / 2 + 4);
  }
  ctx.restore();
}

function drawDetailPanel(ctx, upgrade, campaign, x, y, w, h) {
  ctx.save();
  ctx.fillStyle = 'rgba(102,204,255,0.07)';
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(102,204,255,0.30)';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, 8);
  ctx.stroke();

  const status = purchaseStatus(upgrade, campaign);
  let statusLine = '';
  let statusColor = DIM_COLOR;
  if (status.owned) {
    statusLine = 'INSTALLED — applies every campaign level for this hero.';
    statusColor = OWNED_COLOR;
  } else if (!status.prereqMet && upgrade.prereq) {
    const pre = lookupUpgrade(upgrade.prereq);
    statusLine = `LOCKED — requires "${pre ? pre.label : upgrade.prereq}" first.`;
    statusColor = LOCKED_COLOR;
  } else if (!status.affordable) {
    const need = upgrade.cost - getXp(campaign, upgrade.character);
    statusLine = `Need ${need} more XP. Earn XP by scoring in any mode as ${upgrade.character}.`;
    statusColor = UNAFFORDABLE_COLOR;
  } else {
    statusLine = `Available — press Enter to spend ${upgrade.cost} XP.`;
    statusColor = HIGHLIGHT_COLOR;
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = HIGHLIGHT_COLOR;
  ctx.font = 'bold 12px monospace';
  ctx.fillText(upgrade.label.toUpperCase(), x + 10, y + 16);
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = '11px monospace';
  wrapText(ctx, upgrade.howto || upgrade.description || '', x + 10, y + 30, w - 20, 13);
  ctx.fillStyle = statusColor;
  ctx.font = 'bold 11px monospace';
  ctx.fillText(statusLine, x + 10, y + h - 8);
  ctx.restore();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  if (!text) return;
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = words[i];
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}

function truncate(s, maxLen) {
  if (!s) return '';
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + '…';
}

function darken(hex, factor) {
  if (!hex || hex.length < 7) return 'rgba(0,0,0,0.4)';
  const r = parseInt(hex.substr(1, 2), 16);
  const g = parseInt(hex.substr(3, 2), 16);
  const b = parseInt(hex.substr(5, 2), 16);
  const f = Math.max(0, Math.min(1, 1 - factor));
  return `rgba(${Math.round(r * f)},${Math.round(g * f)},${Math.round(b * f)},1)`;
}

function drawActionButton(ctx, x, y, w, h, label, color, hovered) {
  ctx.save();
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, hovered ? color : darken(color, 0.35));
  grad.addColorStop(1, darken(color, 0.7));
  ctx.fillStyle = grad;
  roundRect(ctx, x, y, w, h, 9);
  ctx.fill();
  ctx.strokeStyle = hovered ? color : darken(color, 0.5);
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 9);
  ctx.stroke();
  ctx.fillStyle = hovered ? '#FFFFFF' : '#F5F5F5';
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
  ctx.restore();
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

export function shopHover(shop, x, y) {
  if (!shop || !shop.open) return;
  shop._hoverRow = -1;
  shop._hoverChar = 0;
  shop._hoverBtn = '';
  if (Array.isArray(shop._rowBounds)) {
    for (const rb of shop._rowBounds) {
      if (hits(rb.bounds, x, y)) { shop._hoverRow = rb.i; break; }
    }
  }
  for (const k of Object.keys(shop._btnBounds || {})) {
    if (hits(shop._btnBounds[k], x, y)) { shop._hoverBtn = k; break; }
  }
}

// Returns a structured intent: { type } where type is 'buy' | 'close' |
// 'itemShop' | 'backToSelect' | 'cycleChar' (legacy noop). Caller routes it.
export function shopClick(shop, x, y) {
  if (!shop || !shop.open) return null;
  if (Array.isArray(shop._rowBounds)) {
    for (const rb of shop._rowBounds) {
      if (hits(rb.bounds, x, y)) {
        shop.cursor = rb.i;
        return { type: 'buy' };
      }
    }
  }
  for (const k of Object.keys(shop._btnBounds || {})) {
    if (hits(shop._btnBounds[k], x, y)) {
      if (k === 'buy') return { type: 'buy' };
      if (k === 'itemShop') { shop.itemShopRequested = true; return { type: 'itemShop' }; }
      if (k === 'backToSelect') { shop.backToSelectRequested = true; return { type: 'backToSelect' }; }
      if (k === 'close') { shop.closeRequested = true; return { type: 'close' }; }
    }
  }
  return null;
}

function formatNextLevelLabel(levelId) {
  if (typeof levelId !== 'string' || !/^\d{2}$/.test(levelId)) return levelId || '';
  const n = parseInt(levelId, 10);
  if (!Number.isFinite(n) || n < 1) return '';
  const world = Math.floor((n - 1) / 6) + 1;
  const level = ((n - 1) % 6) + 1;
  return `W${world}L${level}`;
}

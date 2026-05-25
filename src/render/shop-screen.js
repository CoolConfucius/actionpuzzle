// Campaign-mode between-level shop. Lists upgrades for the active character.
// Pure rendering + key handling — actual purchase persistence lives in
// `engine/campaign.js`; the controller decides when to open/close.
import { upgradesForCharacter, purchaseStatus, lookupUpgrade, specialtyForCharacter } from '../engine/upgrade-defs.js';
import { getCoins } from '../engine/campaign.js';

const BG_COLOR = 'rgba(5,5,15,0.92)';
const PANEL_COLOR = '#0F1020';
const PANEL_BORDER = '#FFCC44';
const HIGHLIGHT_COLOR = '#66FFAA';
const TEXT_COLOR = '#FFFFFF';
const DIM_COLOR = '#888899';
const OWNED_COLOR = '#55AA55';
const LOCKED_COLOR = '#664488';
const UNAFFORDABLE_COLOR = '#AA5555';
const COIN_COLOR = '#FFCC44';

export function createShopState() {
  return { open: false, cursor: 0, character: 'bear', nextLevelId: '', browseMode: false };
}

export function openShop(shop, character, nextLevelId, browseMode) {
  if (!shop) return;
  shop.open = true;
  shop.cursor = 0;
  if (character) shop.character = character;
  if (typeof nextLevelId === 'string') shop.nextLevelId = nextLevelId;
  shop.browseMode = !!browseMode;
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

export function drawShopScreen(ctx, shop, campaign, widthPx, heightPx) {
  if (!shop || !shop.open) return;
  const W = widthPx || 912;
  const H = heightPx || 756;

  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, W, H);

  const PW = 520;
  const PH = 420;
  const px = Math.floor((W - PW) / 2);
  const py = Math.floor((H - PH) / 2);

  ctx.fillStyle = PANEL_COLOR;
  ctx.fillRect(px, py, PW, PH);
  ctx.strokeStyle = PANEL_BORDER;
  ctx.lineWidth = 2;
  ctx.strokeRect(px + 1, py + 1, PW - 2, PH - 2);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = COIN_COLOR;
  ctx.font = 'bold 20px monospace';
  ctx.fillText('SHOP', px + PW / 2, py + 30);

  ctx.fillStyle = HIGHLIGHT_COLOR;
  ctx.font = 'bold 14px monospace';
  const characterTitle = shop.character.toUpperCase();
  const ownedHere = countCharacterOwned(shop.character, campaign);
  const totalHere = upgradesForCharacter(shop.character).length;
  const nextSuffix = shop.nextLevelId
    ? `   Next: ${formatNextLevelLabel(shop.nextLevelId)}`
    : '';
  ctx.fillText(
    `${characterTitle} [${ownedHere}/${totalHere}]   Coins: ¢${getCoins(campaign)}${nextSuffix}`,
    px + PW / 2,
    py + 52,
  );

  // Specialty line under the header — anchors the character's playstyle.
  ctx.fillStyle = DIM_COLOR;
  ctx.font = 'italic 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(specialtyForCharacter(shop.character), px + PW / 2, py + 68);
  ctx.textAlign = 'left';

  const upgrades = upgradesForCharacter(shop.character);
  const baseY = py + 90;
  const rowH = 32;
  ctx.textAlign = 'left';

  shop._rowBounds = [];
  const ROW_X = px + 12;
  const ROW_W = PW - 24;

  for (let i = 0; i < upgrades.length; i++) {
    const u = upgrades[i];
    const status = purchaseStatus(u, campaign);
    const selected = i === shop.cursor;
    const hovered = shop._hoverRow === i;
    const y = baseY + i * rowH;
    const rowY = y - 14;
    const rowH0 = 28;

    ctx.save();
    if (selected) {
      ctx.fillStyle = 'rgba(102,255,170,0.16)';
      roundRect(ctx, ROW_X, rowY, ROW_W, rowH0, 6);
      ctx.fill();
      ctx.strokeStyle = HIGHLIGHT_COLOR;
      ctx.lineWidth = 1.5;
      roundRect(ctx, ROW_X, rowY, ROW_W, rowH0, 6);
      ctx.stroke();
    } else if (hovered) {
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      roundRect(ctx, ROW_X, rowY, ROW_W, rowH0, 6);
      ctx.fill();
    }
    ctx.restore();

    let labelColor = TEXT_COLOR;
    let tagText = '';
    if (status.owned) {
      labelColor = OWNED_COLOR;
      tagText = 'OWNED';
    } else if (!status.prereqMet) {
      labelColor = LOCKED_COLOR;
      tagText = 'LOCKED';
    } else if (!status.affordable) {
      labelColor = UNAFFORDABLE_COLOR;
      tagText = 'too few coins';
    }
    if (selected) labelColor = HIGHLIGHT_COLOR;

    ctx.fillStyle = labelColor;
    ctx.font = selected ? 'bold 13px monospace' : '13px monospace';
    ctx.fillText(u.label, px + 24, y);

    ctx.textAlign = 'right';
    ctx.font = '12px monospace';
    ctx.fillStyle = status.owned ? OWNED_COLOR : COIN_COLOR;
    ctx.fillText(`¢${u.cost}`, px + PW - 24, y);
    ctx.textAlign = 'left';

    ctx.fillStyle = DIM_COLOR;
    ctx.font = '10px monospace';
    ctx.fillText(u.description, px + 32, y + 14);

    if (tagText) {
      ctx.textAlign = 'right';
      ctx.fillStyle = DIM_COLOR;
      ctx.font = '9px monospace';
      ctx.fillText(tagText, px + PW - 24, y + 14);
      ctx.textAlign = 'left';
    }

    shop._rowBounds.push({ i, bounds: { x: ROW_X, y: rowY, w: ROW_W, h: rowH0 } });
  }

  // Left/right character cycle buttons next to the character title.
  const arrowY = py + 38;
  const arrowSize = 22;
  const leftArrowX = px + 24;
  const rightArrowX = px + PW - 24 - arrowSize;
  drawArrowButton(ctx, leftArrowX, arrowY, arrowSize, arrowSize, '<', shop._hoverChar === -1);
  drawArrowButton(ctx, rightArrowX, arrowY, arrowSize, arrowSize, '>', shop._hoverChar === 1);
  shop._charBounds = {
    left: { x: leftArrowX, y: arrowY, w: arrowSize, h: arrowSize },
    right: { x: rightArrowX, y: arrowY, w: arrowSize, h: arrowSize },
  };

  // Ability detail panel — the "store-as-tutorial" view of the highlighted upgrade.
  const selected = upgrades[shop.cursor];
  if (selected) {
    const panelY = baseY + upgrades.length * rowH + 8;
    const panelH = (py + PH - 28) - panelY;
    drawDetailPanel(ctx, selected, campaign, px + 16, panelY, PW - 32, panelH);
  }

  ctx.textAlign = 'center';
  ctx.font = '11px monospace';
  ctx.fillStyle = DIM_COLOR;
  const continueLabel = shop.browseMode ? 'Space returns to title' : 'Space continues';
  ctx.fillText(`Up/Down · Enter to buy · Left/Right cycles character · ${continueLabel}`, px + PW / 2, py + PH - 14);
}

function drawDetailPanel(ctx, upgrade, campaign, x, y, w, h) {
  ctx.save();
  ctx.fillStyle = 'rgba(255,204,68,0.06)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(255,204,68,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  const status = purchaseStatus(upgrade, campaign);
  let statusLine = '';
  let statusColor = DIM_COLOR;
  if (status.owned) {
    statusLine = 'INSTALLED — active in every campaign level for this character';
    statusColor = OWNED_COLOR;
  } else if (!status.prereqMet && upgrade.prereq) {
    const pre = lookupUpgrade(upgrade.prereq);
    statusLine = `LOCKED — requires "${pre ? pre.label : upgrade.prereq}" first`;
    statusColor = LOCKED_COLOR;
  } else if (!status.affordable) {
    const need = upgrade.cost - getCoins(campaign);
    statusLine = `Need ¢${need} more to buy this upgrade`;
    statusColor = UNAFFORDABLE_COLOR;
  } else {
    statusLine = `Available — press Enter to purchase for ¢${upgrade.cost}`;
    statusColor = HIGHLIGHT_COLOR;
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  // Header
  ctx.fillStyle = HIGHLIGHT_COLOR;
  ctx.font = 'bold 13px monospace';
  ctx.fillText(upgrade.label.toUpperCase(), x + 8, y + 16);
  // "How it works"
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = '11px monospace';
  const howto = upgrade.howto || upgrade.description || '';
  wrapText(ctx, howto, x + 8, y + 34, w - 16, 14);
  // Status (bottom of panel)
  ctx.fillStyle = statusColor;
  ctx.font = 'bold 11px monospace';
  ctx.fillText(statusLine, x + 8, y + h - 8);
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

export function cycleShopCharacter(shop, delta) {
  if (!shop) return;
  const order = ['bear', 'wolf', 'monkey', 'lion', 'pig', 'mole', 'rabbit', 'elephant', 'owl', 'fox'];
  const idx = order.indexOf(shop.character);
  const base = idx === -1 ? 0 : idx;
  shop.character = order[(base + delta + order.length) % order.length];
  shop.cursor = 0;
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

function drawArrowButton(ctx, x, y, w, h, glyph, emphasized) {
  ctx.save();
  ctx.fillStyle = emphasized ? 'rgba(102,255,170,0.22)' : 'rgba(255,255,255,0.10)';
  roundRect(ctx, x, y, w, h, 5);
  ctx.fill();
  ctx.strokeStyle = emphasized ? '#66FFAA' : '#666677';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, 5);
  ctx.stroke();
  ctx.fillStyle = emphasized ? '#66FFAA' : '#CCCCCC';
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(glyph, x + w / 2, y + h / 2);
  ctx.restore();
}

function hits(b, x, y) {
  return b && x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
}

export function shopHover(shop, x, y) {
  if (!shop || !shop.open) return;
  shop._hoverRow = -1;
  shop._hoverChar = 0;
  if (shop._charBounds) {
    if (hits(shop._charBounds.left, x, y)) shop._hoverChar = -1;
    else if (hits(shop._charBounds.right, x, y)) shop._hoverChar = 1;
  }
  if (Array.isArray(shop._rowBounds)) {
    for (const rb of shop._rowBounds) {
      if (hits(rb.bounds, x, y)) { shop._hoverRow = rb.i; break; }
    }
  }
}

// Returns 'buy' if a row was clicked (sets cursor first), 'cycleChar:-1' / '+1'
// for character arrows, or null otherwise.
export function shopClick(shop, x, y) {
  if (!shop || !shop.open) return null;
  if (shop._charBounds) {
    if (hits(shop._charBounds.left, x, y)) return { type: 'cycleChar', delta: -1 };
    if (hits(shop._charBounds.right, x, y)) return { type: 'cycleChar', delta: 1 };
  }
  if (Array.isArray(shop._rowBounds)) {
    for (const rb of shop._rowBounds) {
      if (hits(rb.bounds, x, y)) {
        shop.cursor = rb.i;
        return { type: 'buy' };
      }
    }
  }
  return null;
}

function countCharacterOwned(charId, campaign) {
  if (!campaign || !campaign.upgrades) return 0;
  const tree = campaign.upgrades[charId];
  if (!tree) return 0;
  let n = 0;
  for (const k of Object.keys(tree)) if (tree[k]) n += 1;
  return n;
}

function formatNextLevelLabel(levelId) {
  if (typeof levelId !== 'string' || !/^\d{2}$/.test(levelId)) return levelId || '';
  const n = parseInt(levelId, 10);
  if (!Number.isFinite(n) || n < 1) return '';
  const world = Math.floor((n - 1) / 6) + 1;
  const level = ((n - 1) % 6) + 1;
  return `W${world}L${level}`;
}

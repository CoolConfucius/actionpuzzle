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

  for (let i = 0; i < upgrades.length; i++) {
    const u = upgrades[i];
    const status = purchaseStatus(u, campaign);
    const selected = i === shop.cursor;
    const y = baseY + i * rowH;

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

    const prefix = selected ? '> ' : '  ';
    ctx.fillStyle = labelColor;
    ctx.font = selected ? 'bold 13px monospace' : '13px monospace';
    ctx.fillText(`${prefix}${u.label}`, px + 24, y);

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
  }

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

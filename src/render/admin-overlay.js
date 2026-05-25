// Admin/tester overlay: backtick (`) toggles. Lets author jump to any level,
// toggle god mode, change speed, force milestone life, drop balloons.

const BG_COLOR = 'rgba(0,0,0,0.78)';
const PANEL_COLOR = '#0F0F1A';
const PANEL_BORDER = '#FF6688';
const TEXT_COLOR = '#FFFFFF';
const HIGHLIGHT_COLOR = '#FF6688';
const DIM_COLOR = '#888899';
const ACCENT = '#66FFAA';
const PANEL_W = 380;
const PANEL_H = 530;

export const ADMIN_ACTIONS = [
  'levelSelect',
  'godMode',
  'speed2x',
  'addScore',
  'dropPowerups',
  'clearLevel',
  'restartLevel',
  'unlockAllUpgrades',
  'soundTest',
  'addCoins',
  'resetCampaign',
  'resetStats',
  'resetPbs',
  'resetAchievements',
  'close',
];

// Catalog of all SFX functions exposed in synth.js. Each entry is
// { id, label, args } where args is passed verbatim to the synth fn.
export const SOUND_TEST_ENTRIES = [
  { id: 'move',            label: 'Move',              args: [] },
  { id: 'hurl',            label: 'Hurl',              args: [] },
  { id: 'hurlPath',        label: 'Hurl-path swoosh',  args: [] },
  { id: 'objectStop',      label: 'Object stop',       args: ['rock'] },
  { id: 'objectDestroy',   label: 'Object destroy',    args: ['rock'] },
  { id: 'explode',         label: 'Explode',           args: [] },
  { id: 'enemyDefeated1',  label: 'Enemy 1 defeated',  args: ['enemy1'] },
  { id: 'enemyDefeated2',  label: 'Enemy 2 defeated',  args: ['enemy2'] },
  { id: 'enemyDefeated3',  label: 'Enemy 3 defeated',  args: ['enemy3'] },
  { id: 'enemyDefeated4',  label: 'Enemy 4 defeated',  args: ['enemy4'] },
  { id: 'enemyDefeated5',  label: 'Enemy 5 defeated',  args: ['enemy5'] },
  { id: 'enemyDefeated6',  label: 'Enemy 6 defeated',  args: ['enemy6'] },
  { id: 'enemyDefeated7',  label: 'Enemy 7 defeated',  args: ['enemy7'] },
  { id: 'enemyHit',        label: 'Enemy hit (no death)', args: [] },
  { id: 'enemyTeleport',   label: 'Enemy teleport',    args: [] },
  { id: 'achievementUnlock', label: 'Achievement unlock', args: [] },
  { id: 'abilityFireStunClone',  label: 'Ability: Stun Clone',  args: ['STUN CLONE!'] },
  { id: 'abilityFireEchoWave',   label: 'Ability: Echo Wave',   args: ['ECHO WAVE!'] },
  { id: 'abilityFireFireball',   label: 'Ability: Fireball',    args: ['FIREBALL!'] },
  { id: 'abilityFireBomb',       label: 'Ability: Bomb',        args: ['BOMB!'] },
  { id: 'abilityFireCancel',     label: 'Ability: Cancel',      args: ['CANCEL!'] },
  { id: 'abilityFireHowl',       label: 'Ability: Howl',        args: ['HOWL!'] },
  { id: 'abilityFireRebirth',    label: 'Ability: Rebirth',     args: ['REBIRTH!'] },
  { id: 'abilityFireLucky',      label: 'Ability: Lucky',       args: ['LUCKY!'] },
  { id: 'abilityFireTrampoline', label: 'Ability: Trampoline',  args: ['TRAMPOLINE!'] },
  { id: 'abilityFireBurrow',     label: 'Ability: Burrow',      args: ['BURROW!'] },
  { id: 'shopPurchase',    label: 'Shop purchase',     args: [] },
  { id: 'shopReject',      label: 'Shop reject',       args: [] },
  { id: 'levelStart',      label: 'Level start gong',  args: [] },
  { id: 'shopOpen',        label: 'Shop open chime',   args: [] },
  { id: 'enemyWindup',     label: 'Enemy windup',      args: [] },
  { id: 'enemySpawn',      label: 'Enemy spawn',       args: [] },
  { id: 'enemy4CastStart', label: 'E4 fireball cast',  args: [] },
  { id: 'trapTriggered',   label: 'Trap triggered',    args: [] },
  { id: 'powerup',         label: 'Powerup pickup',    args: ['berserk'] },
  { id: 'playerDeath',     label: 'Player death',      args: [] },
  { id: 'playerRespawn',   label: 'Player respawn',    args: [] },
  { id: 'milestoneLife',   label: 'Milestone life',    args: [] },
  { id: 'chain2',          label: 'Chain x2',          args: [2] },
  { id: 'chain4',          label: 'Chain x4',          args: [4] },
  { id: 'chain8',          label: 'Chain x8',          args: [8] },
  { id: 'levelWon',        label: 'Level won',         args: [] },
  { id: 'gameOver',        label: 'Game over',         args: [] },
  { id: 'uiSelect',        label: 'UI select',         args: [] },
  { id: 'uiBack',          label: 'UI back',           args: [] },
];

export function createAdminOverlay() {
  return {
    open: false,
    cursor: 0,
    levelInputBuffer: '',
    inLevelInput: false,
    godMode: false,
    speed2x: false,
    inSoundTest: false,
    soundCursor: 0,
    pendingConfirm: null, // {kind, label} when waiting for Y/N on a destructive reset
  };
}

export function openAdminOverlay(overlay) {
  if (!overlay) return;
  overlay.open = true;
  overlay.cursor = 0;
  overlay.levelInputBuffer = '';
  overlay.inLevelInput = false;
  overlay.inSoundTest = false;
}

export function closeAdminOverlay(overlay) {
  if (!overlay) return;
  overlay.open = false;
  overlay.inLevelInput = false;
  overlay.levelInputBuffer = '';
  overlay.inSoundTest = false;
}

export function isAdminOverlayOpen(overlay) {
  return !!(overlay && overlay.open);
}

export function navigateAdminOverlay(overlay, delta) {
  if (!overlay || !overlay.open || overlay.inLevelInput) return;
  if (overlay.inSoundTest) {
    const n = SOUND_TEST_ENTRIES.length;
    overlay.soundCursor = (overlay.soundCursor + delta + n) % n;
    return;
  }
  const n = ADMIN_ACTIONS.length;
  overlay.cursor = (overlay.cursor + delta + n) % n;
}

export function selectedSoundTestEntry(overlay) {
  if (!overlay || !overlay.inSoundTest) return null;
  return SOUND_TEST_ENTRIES[overlay.soundCursor] || null;
}

export function selectedAdminAction(overlay) {
  if (!overlay || !overlay.open) return null;
  return ADMIN_ACTIONS[overlay.cursor] || null;
}

// Returns a pending action descriptor, or null if no immediate action.
// For levelSelect, returns { kind: 'beginInput' } first; on Enter from
// input, returns { kind: 'jumpLevel', levelId: 'NN' }.
export function activateAdminAction(overlay) {
  if (!overlay || !overlay.open) return null;
  const action = ADMIN_ACTIONS[overlay.cursor];
  if (action === 'levelSelect') {
    overlay.inLevelInput = true;
    overlay.levelInputBuffer = '';
    return { kind: 'beginInput' };
  }
  if (action === 'godMode') {
    overlay.godMode = !overlay.godMode;
    return { kind: 'godMode', value: overlay.godMode };
  }
  if (action === 'speed2x') {
    overlay.speed2x = !overlay.speed2x;
    return { kind: 'speed2x', value: overlay.speed2x };
  }
  if (action === 'addScore') return { kind: 'addScore', amount: 50000 };
  if (action === 'dropPowerups') return { kind: 'dropPowerups' };
  if (action === 'clearLevel') return { kind: 'clearLevel' };
  if (action === 'restartLevel') return { kind: 'restartLevel' };
  if (action === 'unlockAllUpgrades') return { kind: 'unlockAllUpgrades' };
  if (action === 'soundTest') {
    overlay.inSoundTest = true;
    overlay.soundCursor = 0;
    return { kind: 'beginSoundTest' };
  }
  if (action === 'addCoins') return { kind: 'addCoins', amount: 1000 };
  // Destructive resets: stage a confirmation before returning the action so
  // a stray Enter doesn't nuke saved progress.
  if (action === 'resetCampaign') { overlay.pendingConfirm = { kind: 'resetCampaign', label: 'campaign progress' }; return { kind: 'confirmPending' }; }
  if (action === 'resetStats') { overlay.pendingConfirm = { kind: 'resetStats', label: 'lifetime stats' }; return { kind: 'confirmPending' }; }
  if (action === 'resetPbs') { overlay.pendingConfirm = { kind: 'resetPbs', label: 'PB times' }; return { kind: 'confirmPending' }; }
  if (action === 'resetAchievements') { overlay.pendingConfirm = { kind: 'resetAchievements', label: 'achievements' }; return { kind: 'confirmPending' }; }
  if (action === 'close') {
    closeAdminOverlay(overlay);
    return { kind: 'close' };
  }
  return null;
}

export function exitSoundTest(overlay) {
  if (!overlay) return;
  overlay.inSoundTest = false;
}

// Y → return the queued destructive action so the caller can actually wipe
// the data. N or Esc → clear pendingConfirm without action. Returns the
// resolved action descriptor, or null if no confirmation was pending.
export function resolveAdminConfirm(overlay, accept) {
  if (!overlay || !overlay.pendingConfirm) return null;
  const pc = overlay.pendingConfirm;
  overlay.pendingConfirm = null;
  if (!accept) return null;
  return { kind: pc.kind };
}

export function activateSoundTestEntry(overlay) {
  const entry = selectedSoundTestEntry(overlay);
  if (!entry) return null;
  return { kind: 'playSound', id: entry.id, args: entry.args.slice() };
}

// Handle a key while level-input sub-mode is active. Returns:
// - null: not in input mode (caller should fall through to normal nav)
// - { kind: 'stillTyping' }: char buffered, no further action
// - { kind: 'cancelled' }: user backed out of input mode
// - { kind: 'jumpLevel', levelId: 'NN' }: enter committed a 1- or 2-digit level
export function handleAdminInputKey(overlay, key) {
  if (!overlay || !overlay.open || !overlay.inLevelInput) return null;
  if (key === 'Escape' || key === 'Backspace') {
    if (overlay.levelInputBuffer.length > 0) {
      overlay.levelInputBuffer = overlay.levelInputBuffer.slice(0, -1);
      return { kind: 'stillTyping' };
    }
    overlay.inLevelInput = false;
    overlay.levelInputBuffer = '';
    return { kind: 'cancelled' };
  }
  if (key === 'Enter' || key === ' ') {
    const buf = overlay.levelInputBuffer;
    if (buf.length === 0) return { kind: 'stillTyping' };
    const n = parseInt(buf, 10);
    if (!Number.isFinite(n) || n < 1 || n > 99) return { kind: 'stillTyping' };
    overlay.inLevelInput = false;
    const levelId = String(n).padStart(2, '0');
    overlay.levelInputBuffer = '';
    return { kind: 'jumpLevel', levelId };
  }
  if (/^[0-9]$/.test(key) && overlay.levelInputBuffer.length < 2) {
    overlay.levelInputBuffer += key;
    return { kind: 'stillTyping' };
  }
  return { kind: 'stillTyping' };
}

export function drawAdminOverlay(ctx, overlay, widthPx, heightPx) {
  if (!overlay || !overlay.open) return;
  const W = widthPx || 680;
  const H = heightPx || 552;

  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, W, H);

  if (overlay.inSoundTest) {
    drawSoundTestPanel(ctx, overlay, W, H);
    return;
  }

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
  ctx.fillText('ADMIN / TESTER', px + PANEL_W / 2, py + 36);

  const baseY = py + 70;
  const rowGap = 26;

  const labelFor = (action) => {
    if (action === 'levelSelect') {
      if (overlay.inLevelInput) {
        const buf = overlay.levelInputBuffer || '';
        return `JUMP LEVEL: [${buf}_]`;
      }
      return 'JUMP LEVEL (1-36)';
    }
    if (action === 'godMode') return `GOD MODE: ${overlay.godMode ? 'ON' : 'OFF'}`;
    if (action === 'speed2x') return `SPEED 2x: ${overlay.speed2x ? 'ON' : 'OFF'}`;
    if (action === 'addScore') return 'ADD 50,000 SCORE';
    if (action === 'dropPowerups') return 'DROP POWERUPS';
    if (action === 'clearLevel') return 'CLEAR LEVEL NOW';
    if (action === 'restartLevel') return 'RESTART THIS LEVEL';
    if (action === 'unlockAllUpgrades') return 'UNLOCK ALL UPGRADES';
    if (action === 'soundTest') return 'SOUND TEST';
    if (action === 'addCoins') return 'ADD 1000 COINS';
    if (action === 'resetCampaign') return 'RESET CAMPAIGN';
    if (action === 'resetStats') return 'RESET LIFETIME STATS';
    if (action === 'resetPbs') return 'RESET PB TIMES';
    if (action === 'resetAchievements') return 'RESET ACHIEVEMENTS';
    if (action === 'close') return 'CLOSE';
    return action;
  };

  ADMIN_ACTIONS.forEach((action, i) => {
    const y = baseY + i * rowGap;
    const selected = overlay.cursor === i && !overlay.inLevelInput;
    const inputting = action === 'levelSelect' && overlay.inLevelInput;
    let color;
    if (inputting) color = ACCENT;
    else if (selected) color = HIGHLIGHT_COLOR;
    else color = TEXT_COLOR;
    ctx.fillStyle = color;
    ctx.font = (selected || inputting) ? 'bold 16px monospace' : '16px monospace';
    const prefix = (selected || inputting) ? '> ' : '  ';
    ctx.fillText(prefix + labelFor(action), px + PANEL_W / 2, y);
  });

  if (overlay.pendingConfirm) {
    // Draw confirm prompt over the bottom of the panel.
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(px + 16, py + PANEL_H - 70, PANEL_W - 32, 50);
    ctx.fillStyle = '#FF8866';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`Reset ${overlay.pendingConfirm.label}?`, px + PANEL_W / 2, py + PANEL_H - 50);
    ctx.fillStyle = DIM_COLOR;
    ctx.font = '11px monospace';
    ctx.fillText('Y to confirm · N or Esc to cancel', px + PANEL_W / 2, py + PANEL_H - 32);
  }
  ctx.fillStyle = DIM_COLOR;
  ctx.font = '11px monospace';
  const hint = overlay.inLevelInput
    ? 'Type digits, Enter to jump, Esc to cancel'
    : 'Up/Down · Enter · Esc or ` to close';
  ctx.fillText(hint, px + PANEL_W / 2, py + PANEL_H - 16);
}

function drawSoundTestPanel(ctx, overlay, W, H) {
  const PW = 380;
  const PH = 460;
  const px = Math.floor((W - PW) / 2);
  const py = Math.floor((H - PH) / 2);

  ctx.fillStyle = PANEL_COLOR;
  ctx.fillRect(px, py, PW, PH);
  ctx.strokeStyle = PANEL_BORDER;
  ctx.lineWidth = 2;
  ctx.strokeRect(px + 1, py + 1, PW - 2, PH - 2);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = HIGHLIGHT_COLOR;
  ctx.font = 'bold 20px monospace';
  ctx.fillText('SOUND TEST', px + PW / 2, py + 32);

  ctx.font = '11px monospace';
  ctx.fillStyle = DIM_COLOR;
  ctx.fillText('Up/Down · Enter to play · Esc to return', px + PW / 2, py + 50);

  const rowH = 16;
  const baseY = py + 78;
  const visibleRows = Math.floor((PH - 110) / rowH);
  const cursor = overlay.soundCursor || 0;
  let firstRow = Math.max(0, cursor - Math.floor(visibleRows / 2));
  const maxFirst = Math.max(0, SOUND_TEST_ENTRIES.length - visibleRows);
  if (firstRow > maxFirst) firstRow = maxFirst;
  const lastRow = Math.min(SOUND_TEST_ENTRIES.length, firstRow + visibleRows);

  ctx.textAlign = 'left';
  for (let i = firstRow; i < lastRow; i++) {
    const entry = SOUND_TEST_ENTRIES[i];
    const y = baseY + (i - firstRow) * rowH;
    const selected = i === cursor;
    ctx.fillStyle = selected ? HIGHLIGHT_COLOR : TEXT_COLOR;
    ctx.font = selected ? 'bold 13px monospace' : '13px monospace';
    const prefix = selected ? '> ' : '  ';
    ctx.fillText(`${prefix}${entry.label}`, px + 24, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = DIM_COLOR;
    ctx.font = '10px monospace';
    ctx.fillText(entry.id, px + PW - 24, y);
    ctx.textAlign = 'left';
  }
}

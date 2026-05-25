import test from 'node:test';
import assert from 'node:assert';
import {
  createAdminOverlay,
  openAdminOverlay,
  closeAdminOverlay,
  isAdminOverlayOpen,
  navigateAdminOverlay,
  selectedAdminAction,
  activateAdminAction,
  activateSoundTestEntry,
  exitSoundTest,
  handleAdminInputKey,
  resolveAdminConfirm,
  ADMIN_ACTIONS,
  SOUND_TEST_ENTRIES,
} from '../render/admin-overlay.js';

test('admin: fresh overlay is closed and at cursor 0', () => {
  const o = createAdminOverlay();
  assert.equal(o.open, false);
  assert.equal(o.cursor, 0);
  assert.equal(isAdminOverlayOpen(o), false);
});

test('admin: open and close', () => {
  const o = createAdminOverlay();
  openAdminOverlay(o);
  assert.equal(isAdminOverlayOpen(o), true);
  closeAdminOverlay(o);
  assert.equal(isAdminOverlayOpen(o), false);
});

test('admin: navigation wraps both directions', () => {
  const o = createAdminOverlay();
  openAdminOverlay(o);
  navigateAdminOverlay(o, -1);
  assert.equal(o.cursor, ADMIN_ACTIONS.length - 1);
  navigateAdminOverlay(o, 1);
  assert.equal(o.cursor, 0);
  navigateAdminOverlay(o, ADMIN_ACTIONS.length);
  assert.equal(o.cursor, 0);
});

test('admin: nav is a no-op while in level-input sub-mode', () => {
  const o = createAdminOverlay();
  openAdminOverlay(o);
  activateAdminAction(o); // enter input sub-mode (cursor=0 = levelSelect)
  assert.equal(o.inLevelInput, true);
  navigateAdminOverlay(o, 1);
  assert.equal(o.cursor, 0, 'cursor must not move while in input mode');
});

test('admin: selectedAdminAction returns null when closed', () => {
  const o = createAdminOverlay();
  assert.equal(selectedAdminAction(o), null);
});

test('admin: godMode toggle round-trips', () => {
  const o = createAdminOverlay();
  openAdminOverlay(o);
  o.cursor = ADMIN_ACTIONS.indexOf('godMode');
  const r1 = activateAdminAction(o);
  assert.deepEqual(r1, { kind: 'godMode', value: true });
  assert.equal(o.godMode, true);
  const r2 = activateAdminAction(o);
  assert.deepEqual(r2, { kind: 'godMode', value: false });
  assert.equal(o.godMode, false);
});

test('admin: speed2x toggle', () => {
  const o = createAdminOverlay();
  openAdminOverlay(o);
  o.cursor = ADMIN_ACTIONS.indexOf('speed2x');
  const r = activateAdminAction(o);
  assert.deepEqual(r, { kind: 'speed2x', value: true });
});

test('admin: addScore returns 50000', () => {
  const o = createAdminOverlay();
  openAdminOverlay(o);
  o.cursor = ADMIN_ACTIONS.indexOf('addScore');
  const r = activateAdminAction(o);
  assert.deepEqual(r, { kind: 'addScore', amount: 50000 });
});

test('admin: close action closes the overlay', () => {
  const o = createAdminOverlay();
  openAdminOverlay(o);
  o.cursor = ADMIN_ACTIONS.indexOf('close');
  const r = activateAdminAction(o);
  assert.deepEqual(r, { kind: 'close' });
  assert.equal(isAdminOverlayOpen(o), false);
});

test('admin: level input accepts digits and produces zero-padded level on Enter', () => {
  const o = createAdminOverlay();
  openAdminOverlay(o);
  o.cursor = ADMIN_ACTIONS.indexOf('levelSelect');
  activateAdminAction(o);
  assert.equal(o.inLevelInput, true);
  let r;
  r = handleAdminInputKey(o, '7');
  assert.deepEqual(r, { kind: 'stillTyping' });
  assert.equal(o.levelInputBuffer, '7');
  r = handleAdminInputKey(o, 'Enter');
  assert.equal(r.kind, 'jumpLevel');
  assert.equal(r.levelId, '07');
  assert.equal(o.inLevelInput, false);
});

test('admin: level input handles two-digit levels (up to 36)', () => {
  const o = createAdminOverlay();
  openAdminOverlay(o);
  activateAdminAction(o);
  handleAdminInputKey(o, '3');
  handleAdminInputKey(o, '6');
  const r = handleAdminInputKey(o, 'Enter');
  assert.equal(r.levelId, '36');
});

test('admin: level input ignores extra digits past 2 chars', () => {
  const o = createAdminOverlay();
  openAdminOverlay(o);
  activateAdminAction(o);
  handleAdminInputKey(o, '1');
  handleAdminInputKey(o, '2');
  handleAdminInputKey(o, '3');
  assert.equal(o.levelInputBuffer, '12');
});

test('admin: backspace deletes last digit, second backspace exits input mode', () => {
  const o = createAdminOverlay();
  openAdminOverlay(o);
  activateAdminAction(o);
  handleAdminInputKey(o, '4');
  let r = handleAdminInputKey(o, 'Backspace');
  assert.deepEqual(r, { kind: 'stillTyping' });
  assert.equal(o.levelInputBuffer, '');
  r = handleAdminInputKey(o, 'Backspace');
  assert.deepEqual(r, { kind: 'cancelled' });
  assert.equal(o.inLevelInput, false);
});

test('admin: Enter on empty buffer stays in input mode', () => {
  const o = createAdminOverlay();
  openAdminOverlay(o);
  activateAdminAction(o);
  const r = handleAdminInputKey(o, 'Enter');
  assert.deepEqual(r, { kind: 'stillTyping' });
  assert.equal(o.inLevelInput, true);
});

test('admin: handleAdminInputKey returns null when not in input mode', () => {
  const o = createAdminOverlay();
  openAdminOverlay(o);
  // cursor is at levelSelect but we did not activate it
  const r = handleAdminInputKey(o, '5');
  assert.equal(r, null);
});

test('admin: handleAdminInputKey ignores letters during input', () => {
  const o = createAdminOverlay();
  openAdminOverlay(o);
  activateAdminAction(o);
  const r = handleAdminInputKey(o, 'a');
  assert.deepEqual(r, { kind: 'stillTyping' });
  assert.equal(o.levelInputBuffer, '');
});

test('admin: SOUND_TEST_ENTRIES catalog is non-empty and entries shaped', () => {
  assert.ok(SOUND_TEST_ENTRIES.length >= 10);
  for (const e of SOUND_TEST_ENTRIES) {
    assert.ok(typeof e.id === 'string' && e.id.length > 0);
    assert.ok(typeof e.label === 'string' && e.label.length > 0);
    assert.ok(Array.isArray(e.args));
  }
});

test('admin: activating soundTest enters sub-mode', () => {
  const o = createAdminOverlay();
  openAdminOverlay(o);
  o.cursor = ADMIN_ACTIONS.indexOf('soundTest');
  const r = activateAdminAction(o);
  assert.deepEqual(r, { kind: 'beginSoundTest' });
  assert.equal(o.inSoundTest, true);
  assert.equal(o.soundCursor, 0);
});

test('admin: navigateAdminOverlay in soundTest moves the sound cursor', () => {
  const o = createAdminOverlay();
  openAdminOverlay(o);
  o.cursor = ADMIN_ACTIONS.indexOf('soundTest');
  activateAdminAction(o);
  navigateAdminOverlay(o, 1);
  assert.equal(o.soundCursor, 1);
  assert.equal(o.cursor, ADMIN_ACTIONS.indexOf('soundTest'), 'main cursor unchanged');
});

test('admin: navigateAdminOverlay in soundTest wraps in both directions', () => {
  const o = createAdminOverlay();
  openAdminOverlay(o);
  o.cursor = ADMIN_ACTIONS.indexOf('soundTest');
  activateAdminAction(o);
  navigateAdminOverlay(o, -1);
  assert.equal(o.soundCursor, SOUND_TEST_ENTRIES.length - 1);
});

test('admin: activateSoundTestEntry returns playSound descriptor', () => {
  const o = createAdminOverlay();
  openAdminOverlay(o);
  o.cursor = ADMIN_ACTIONS.indexOf('soundTest');
  activateAdminAction(o);
  o.soundCursor = 0;
  const r = activateSoundTestEntry(o);
  assert.equal(r.kind, 'playSound');
  assert.equal(r.id, SOUND_TEST_ENTRIES[0].id);
  assert.deepEqual(r.args, SOUND_TEST_ENTRIES[0].args);
});

test('admin: activateSoundTestEntry returns null when not in sub-mode', () => {
  const o = createAdminOverlay();
  openAdminOverlay(o);
  assert.equal(activateSoundTestEntry(o), null);
});

test('admin: exitSoundTest returns to main admin menu', () => {
  const o = createAdminOverlay();
  openAdminOverlay(o);
  o.cursor = ADMIN_ACTIONS.indexOf('soundTest');
  activateAdminAction(o);
  assert.equal(o.inSoundTest, true);
  exitSoundTest(o);
  assert.equal(o.inSoundTest, false);
  assert.equal(o.open, true, 'still in admin overlay');
});

test('admin: openAdminOverlay clears soundTest sub-mode flag', () => {
  const o = createAdminOverlay();
  o.inSoundTest = true;
  openAdminOverlay(o);
  assert.equal(o.inSoundTest, false);
});

test('admin: destructive resets stage a confirm prompt instead of firing', () => {
  const o = createAdminOverlay();
  openAdminOverlay(o);
  o.cursor = ADMIN_ACTIONS.indexOf('resetCampaign');
  const r = activateAdminAction(o);
  assert.deepEqual(r, { kind: 'confirmPending' });
  assert.ok(o.pendingConfirm);
  assert.equal(o.pendingConfirm.kind, 'resetCampaign');
});

test('admin: resolveAdminConfirm(true) returns the staged action', () => {
  const o = createAdminOverlay();
  openAdminOverlay(o);
  o.cursor = ADMIN_ACTIONS.indexOf('resetStats');
  activateAdminAction(o);
  const r = resolveAdminConfirm(o, true);
  assert.deepEqual(r, { kind: 'resetStats' });
  assert.equal(o.pendingConfirm, null);
});

test('admin: resolveAdminConfirm(false) discards the staged action', () => {
  const o = createAdminOverlay();
  openAdminOverlay(o);
  o.cursor = ADMIN_ACTIONS.indexOf('resetPbs');
  activateAdminAction(o);
  const r = resolveAdminConfirm(o, false);
  assert.equal(r, null);
  assert.equal(o.pendingConfirm, null);
});

test('admin: addCoins (non-destructive) is NOT gated by confirm', () => {
  const o = createAdminOverlay();
  openAdminOverlay(o);
  o.cursor = ADMIN_ACTIONS.indexOf('addCoins');
  const r = activateAdminAction(o);
  assert.equal(r.kind, 'addCoins');
  assert.equal(o.pendingConfirm, null, 'no confirm needed');
});

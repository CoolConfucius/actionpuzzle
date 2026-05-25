import * as synth from '../audio/synth.js';
import { isNameEntryActive, nameEntryKey, submitScore, getMode } from '../engine/run-state.js';

// In any non-coop mode, P2-side keys retarget to P1 so the player can use
// whichever hand is comfortable. The second player slot is still constructed
// (alive=false) by the level loader, so we can't rely on player count alone.
function isSingleControllerMode() {
  const mode = getMode();
  return mode !== 'coop' && mode !== 'campaign-coop';
}

const FALLBACK_BINDINGS = {
  KeyW: { type: 'move', playerId: 'p1', dir: 'up' },
  KeyS: { type: 'move', playerId: 'p1', dir: 'down' },
  KeyA: { type: 'move', playerId: 'p1', dir: 'left' },
  KeyD: { type: 'move', playerId: 'p1', dir: 'right' },
  ArrowUp: { type: 'move', playerId: 'p2', dir: 'up' },
  ArrowDown: { type: 'move', playerId: 'p2', dir: 'down' },
  ArrowLeft: { type: 'move', playerId: 'p2', dir: 'left' },
  ArrowRight: { type: 'move', playerId: 'p2', dir: 'right' },
  Space: { type: 'hurl', playerId: 'p1' },
  Enter: { type: 'hurl', playerId: 'p2' },
  ShiftLeft: { type: 'destroy', playerId: 'p1' },
  ShiftRight: { type: 'destroy', playerId: 'p2' },
  KeyP: { type: 'pause' },
  KeyM: { type: 'mute' },
};

const MOVEMENT_TYPES = new Set(['move', 'hurl', 'destroy']);

function getBindings(state) {
  if (state && state.runState && state.runState.bindingMap) return state.runState.bindingMap;
  return FALLBACK_BINDINGS;
}

export function installKeyboard(state) {
  const heldKeys = new Set();
  let audioCtxCreated = false;
  let rafId = null;

  const ensureAudio = () => {
    if (audioCtxCreated) return;
    audioCtxCreated = true;
    try {
      if (typeof synth.ensureContext === 'function') {
        synth.ensureContext();
      }
    } catch (e) {
      console.warn('audio context init failed', e);
    }
  };

  const persistIfSubmitted = () => {
    const runState = state.runState;
    if (!runState || !runState.nameEntry) return;
    if (runState.nameEntry.submitted && !runState.nameEntry.persisted) {
      try {
        submitScore(runState, runState.nameEntry.name);
      } catch (e) {
        console.warn('submitScore failed', e);
      }
    }
  };

  const overlayConsumes = (e) => {
    const overlay = state.settingsOverlay;
    if (!overlay || !overlay.open) return false;
    if (state.settingsHandleKey) {
      return !!state.settingsHandleKey(e);
    }
    return false;
  };

  const handleNameEntryKey = (e) => {
    const runState = state.runState;
    if (!runState || !isNameEntryActive(runState)) return false;
    const bindings = getBindings(state);
    if (e.key === 'Backspace' || e.key === 'Enter') {
      e.preventDefault();
      ensureAudio();
      nameEntryKey(runState, e.key);
      persistIfSubmitted();
      return true;
    }
    if (typeof e.key === 'string' && e.key.length === 1 && /^[A-Za-z0-9]$/.test(e.key)) {
      e.preventDefault();
      ensureAudio();
      nameEntryKey(runState, e.key);
      return true;
    }
    if (bindings[e.code]) {
      e.preventDefault();
      return true;
    }
    return false;
  };

  const onKeyDown = (e) => {
    if (overlayConsumes(e)) {
      e.preventDefault();
      return;
    }
    if (handleNameEntryKey(e)) return;
    const code = e.code;
    const bindings = getBindings(state);
    const binding = bindings[code];
    if (!binding) return;
    e.preventDefault();
    ensureAudio();
    if (heldKeys.has(code)) return;
    heldKeys.add(code);
    dispatchBinding(binding);
  };

  const onKeyUp = (e) => {
    const code = e.code;
    const bindings = getBindings(state);
    if (!bindings[code]) return;
    e.preventDefault();
    heldKeys.delete(code);
  };

  const dispatchBinding = (binding) => {
    if (binding.type === 'mute') {
      try {
        if (typeof synth.toggleMute === 'function') synth.toggleMute();
      } catch (e) {
        console.warn('mute toggle failed', e);
      }
      return;
    }
    if (binding.type === 'pause') {
      state.commandQueue.push({ type: 'pause' });
      return;
    }
    if (state.pauseState !== 'running') return;
    if (MOVEMENT_TYPES.has(binding.type)) {
      const isSingle = isSingleControllerMode();
      const effective = isSingle ? { ...binding, playerId: 'p1' } : binding;
      state.commandQueue.push({ ...effective });
    }
  };

  const onBlur = () => {
    heldKeys.clear();
    if (state.pauseState === 'running') {
      state.pauseState = 'blurred';
    }
  };

  const onFocus = () => {
    if (state.pauseState === 'blurred') {
      state.pauseState = 'running';
    }
  };

  const tickHeld = () => {
    const overlayOpen = !!(state.settingsOverlay && state.settingsOverlay.open);
    if (!overlayOpen && state.pauseState === 'running' && !isNameEntryActive(state.runState)) {
      const bindings = getBindings(state);
      const isSingle = isSingleControllerMode();
      for (const code of heldKeys) {
        const binding = bindings[code];
        if (!binding || binding.type !== 'move') continue;
        // Single-player retargeting: hold-arrow drives P1 too.
        const playerId = isSingle ? 'p1' : binding.playerId;
        const player = (state.players || []).find((p) => p.id === playerId);
        if (!player) continue;
        if (player.move) continue;
        if (player.commandQueue && player.commandQueue.length > 0) continue;
        const alreadyQueued = state.commandQueue.some(
          (c) => c.type === 'move' && c.playerId === playerId,
        );
        if (alreadyQueued) continue;
        state.commandQueue.push({ ...binding, playerId });
      }
    }
    rafId = requestAnimationFrame(tickHeld);
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  window.addEventListener('focus', onFocus);
  rafId = requestAnimationFrame(tickHeld);

  return {
    uninstall() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      if (rafId !== null) cancelAnimationFrame(rafId);
      heldKeys.clear();
    },
  };
}

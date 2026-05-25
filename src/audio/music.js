import { parseMidi } from './midi-parser.js';

const MAX_VOICES = 16;
const SCHEDULE_LOOKAHEAD_SEC = 0.05;
const DEFAULT_NOTE_DUR_SEC = 0.25;
const MAX_NOTE_DUR_SEC = 2.0;
const MIN_NOTE_DUR_SEC = 0.05;

const stateRef = {
  ctx: null,
  masterGain: null,
  muted: false,
  parsed: null,
  pairedNotes: null,
  trackName: null,
  scheduledNodes: [],
  loopStartCtxTime: 0,
  loopTimerId: null,
  paused: false,
  pauseOffsetSec: 0,
  loading: false,
  pendingTrackName: null,
};

// globalThis.DEBUG === true enables otherwise-suppressed diagnostics.
const warnedFetches = new Set();
function warnFetchOnce(key, ...args) {
  if (globalThis.DEBUG === true) {
    console.warn(...args);
    return;
  }
  if (warnedFetches.has(key)) return;
  warnedFetches.add(key);
  console.warn(...args);
}

function ensureContext() {
  if (stateRef.ctx) {
    if (stateRef.ctx.state === 'suspended') {
      try { stateRef.ctx.resume(); } catch (e) { /* ignore */ }
    }
    return stateRef.ctx;
  }
  const Ctor = typeof window !== 'undefined'
    ? (window.AudioContext || window.webkitAudioContext)
    : null;
  if (!Ctor) return null;
  let ctx;
  try { ctx = new Ctor(); } catch (e) { return null; }
  const masterGain = ctx.createGain();
  masterGain.gain.value = stateRef.muted ? 0 : 0.18;
  masterGain.connect(ctx.destination);
  stateRef.ctx = ctx;
  stateRef.masterGain = masterGain;
  if (ctx.state === 'suspended') {
    try { ctx.resume(); } catch (e) { /* ignore */ }
  }
  return ctx;
}

function midiNoteToFreq(note) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

function clearScheduledNodes() {
  const ctx = stateRef.ctx;
  if (!ctx) { stateRef.scheduledNodes.length = 0; return; }
  for (const n of stateRef.scheduledNodes) {
    try { n.osc.stop(0); } catch (e) { /* already stopped */ }
    try { n.osc.disconnect(); } catch (e) { /* */ }
    try { n.gain.disconnect(); } catch (e) { /* */ }
  }
  stateRef.scheduledNodes.length = 0;
}

function cancelLoopTimer() {
  if (stateRef.loopTimerId != null) {
    clearTimeout(stateRef.loopTimerId);
    stateRef.loopTimerId = null;
  }
}

function buildPairedNotes(parsed) {
  const ons = [];
  for (const tr of parsed.tracks) {
    const pending = new Map();
    for (const ev of tr.events) {
      if (ev.channel === 9) continue;
      const key = `${ev.channel}:${ev.note}`;
      if (ev.type === 'noteOn' && ev.velocity > 0) {
        const arr = pending.get(key) || [];
        arr.push({ ev, onIndex: ons.length });
        pending.set(key, arr);
        ons.push({
          timeSec: ev.timeSec,
          note: ev.note,
          velocity: ev.velocity,
          durSec: DEFAULT_NOTE_DUR_SEC,
        });
      } else {
        const arr = pending.get(key);
        if (arr && arr.length > 0) {
          const { ev: onEv, onIndex } = arr.shift();
          const dur = Math.max(MIN_NOTE_DUR_SEC,
            Math.min(MAX_NOTE_DUR_SEC, ev.timeSec - onEv.timeSec));
          ons[onIndex].durSec = dur;
        }
      }
    }
  }
  ons.sort((a, b) => a.timeSec - b.timeSec);
  return ons;
}

function scheduleLoopIteration() {
  const ctx = stateRef.ctx;
  const parsed = stateRef.parsed;
  const notes = stateRef.pairedNotes;
  if (!ctx || !parsed || !notes || stateRef.paused) return;

  if (ctx.state === 'suspended') {
    if (!stateRef._waitingForGesture) {
      stateRef._waitingForGesture = true;
      const onChange = () => {
        if (ctx.state === 'running') {
          ctx.removeEventListener('statechange', onChange);
          stateRef._waitingForGesture = false;
          if (!stateRef.paused && stateRef.parsed) scheduleLoopIteration();
        }
      };
      ctx.addEventListener('statechange', onChange);
      try { ctx.resume(); } catch (e) { /* ignore */ }
    }
    return;
  }

  const loopStart = ctx.currentTime + SCHEDULE_LOOKAHEAD_SEC;
  stateRef.loopStartCtxTime = loopStart;

  let activeAtCursor = 0;
  let scheduled = 0;
  // 32k cap covers long dense tracks like Beethoven's Fifth (~11k notes).
  // Per-window voice limit (MAX_VOICES) still caps concurrent notes.
  for (const n of notes) {
    if (scheduled >= 32768) break;
    if (activeAtCursor >= MAX_VOICES) continue;
    const startAt = loopStart + n.timeSec;
    scheduleNote(n.note, n.velocity, startAt, n.durSec);
    scheduled++;
    activeAtCursor = countActiveAt(notes, n.timeSec);
  }

  const loopLen = Math.max(parsed.durationSec, 0.5);
  // Add a deliberate 1s silence between iterations so tracks like
  // morning-mood (which has a long final note + trailing silence already in
  // the MIDI) don't loop directly into themselves and overlap. Also serves
  // as breathing room — most pieces feel better with a small pause than
  // a hard cut to bar 1.
  const POST_LOOP_PAUSE_SEC = 1.0;
  const reArmMs = Math.max(50, Math.floor((loopLen + POST_LOOP_PAUSE_SEC - SCHEDULE_LOOKAHEAD_SEC) * 1000));
  cancelLoopTimer();
  const loopStartedTrack = stateRef.trackName;
  stateRef.loopTimerId = setTimeout(() => {
    stateRef.loopTimerId = null;
    // Wake AudioContext defensively — some browsers silently suspend it after
    // long inactivity, which would block the next loop iteration.
    if (stateRef.ctx && stateRef.ctx.state === 'suspended') {
      try { stateRef.ctx.resume(); } catch (e) { /* ignore */ }
    }
    // Guard against a stale timer firing after the track was changed or stopped.
    if (stateRef.paused || !stateRef.parsed) return;
    if (stateRef.trackName !== loopStartedTrack) return;
    scheduleLoopIteration();
  }, reArmMs);
}

function countActiveAt(notes, t) {
  let n = 0;
  for (const x of notes) {
    if (x.timeSec <= t && (x.timeSec + x.durSec) > t) n++;
  }
  return n;
}

function scheduleNote(note, velocity, startAt, durSec) {
  const ctx = stateRef.ctx;
  if (!ctx || !stateRef.masterGain) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = midiNoteToFreq(note);
  const peak = Math.min(0.15, (velocity / 127) * 0.2);
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(peak, startAt + 0.01);
  gain.gain.linearRampToValueAtTime(0, startAt + durSec);
  osc.connect(gain);
  gain.connect(stateRef.masterGain);
  osc.start(startAt);
  osc.stop(startAt + durSec + 0.02);
  stateRef.scheduledNodes.push({ osc, gain, stopAt: startAt + durSec });
  // Cap tracking at 16k nodes — keeps the array bounded while still covering
  // long tracks. Untracked nodes still self-stop via their scheduled osc.stop.
  if (stateRef.scheduledNodes.length > 16384) {
    stateRef.scheduledNodes.splice(0, stateRef.scheduledNodes.length - 16384);
  }
}

async function fetchAndParse(name) {
  try {
    const res = await fetch(`./assets/music/${name}.mid`);
    if (!res.ok) {
      warnFetchOnce(`fetch-status:${name}`, `music: fetch ${name}.mid failed: ${res.status}`);
      return null;
    }
    const buf = await res.arrayBuffer();
    return parseMidi(new Uint8Array(buf));
  } catch (err) {
    warnFetchOnce(`fetch-error:${name}`, `music: load ${name}.mid failed`, err && err.message ? err.message : err);
    return null;
  }
}

export async function playTrack(name) {
  if (!name) return;
  if (stateRef.trackName === name && stateRef.parsed && !stateRef.paused) return;
  if (stateRef.loading && stateRef.pendingTrackName === name) return;

  stop();
  stateRef.pendingTrackName = name;
  stateRef.loading = true;

  const parsed = await fetchAndParse(name);
  stateRef.loading = false;
  if (stateRef.pendingTrackName !== name) return;
  if (!parsed) return;

  const ctx = ensureContext();
  if (!ctx) return;

  stateRef.parsed = parsed;
  stateRef.pairedNotes = buildPairedNotes(parsed);
  stateRef.trackName = name;
  stateRef.paused = false;
  stateRef.pauseOffsetSec = 0;
  scheduleLoopIteration();
}

export function stop() {
  stateRef.pendingTrackName = null;
  stateRef.trackName = null;
  stateRef.parsed = null;
  stateRef.pairedNotes = null;
  stateRef.paused = false;
  stateRef.pauseOffsetSec = 0;
  cancelLoopTimer();
  clearScheduledNodes();
  // Belt-and-suspenders: swap masterGain so any leftover oscillators (whose gain
  // is connected to the OLD masterGain) lose their path to destination.
  // Avoids the "two tracks playing simultaneously" symptom across track switches.
  if (stateRef.ctx && stateRef.masterGain) {
    try { stateRef.masterGain.disconnect(); } catch (e) { /* */ }
    try {
      const fresh = stateRef.ctx.createGain();
      fresh.gain.value = stateRef.muted ? 0 : 0.18;
      fresh.connect(stateRef.ctx.destination);
      stateRef.masterGain = fresh;
    } catch (e) { /* leave masterGain as-is if creation fails */ }
  }
}

export function pause() {
  if (!stateRef.parsed || stateRef.paused) return;
  stateRef.paused = true;
  const ctx = stateRef.ctx;
  if (ctx) {
    stateRef.pauseOffsetSec = Math.max(0, ctx.currentTime - stateRef.loopStartCtxTime);
  }
  cancelLoopTimer();
  clearScheduledNodes();
  // Defensive: swap masterGain so any leftover note tails are routed to a
  // disconnected node and never reach the destination after resume.
  if (stateRef.ctx && stateRef.masterGain) {
    try { stateRef.masterGain.disconnect(); } catch (e) { /* */ }
    try {
      const fresh = stateRef.ctx.createGain();
      fresh.gain.value = stateRef.muted ? 0 : 0.18;
      fresh.connect(stateRef.ctx.destination);
      stateRef.masterGain = fresh;
    } catch (e) { /* */ }
  }
}

export function resume() {
  if (!stateRef.parsed || !stateRef.paused) return;
  stateRef.paused = false;
  scheduleLoopIteration();
}

export function setMuted(muted) {
  stateRef.muted = !!muted;
  if (stateRef.masterGain && stateRef.ctx) {
    stateRef.masterGain.gain.setValueAtTime(
      stateRef.muted ? 0 : 0.18,
      stateRef.ctx.currentTime,
    );
  }
}

export function isPlaying() {
  return stateRef.parsed != null && !stateRef.paused;
}

export function unlock() {
  // ensureContext both creates the AudioContext (if absent) and resumes it
  // (if suspended). Calling it inside a user-gesture handler unblocks playback
  // for any track that was queued before the gesture.
  ensureContext();
}

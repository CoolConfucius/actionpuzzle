// Minimal Standard MIDI File parser. Pure-logic; no DOM/audio APIs.

const META = 0xff;
const SYSEX_F0 = 0xf0;
const SYSEX_F7 = 0xf7;

function readUint32(bytes, off) {
  return (bytes[off] << 24 | bytes[off + 1] << 16 | bytes[off + 2] << 8 | bytes[off + 3]) >>> 0;
}

function readUint16(bytes, off) {
  return (bytes[off] << 8 | bytes[off + 1]) >>> 0;
}

function readVlq(bytes, off) {
  let value = 0;
  let i = off;
  while (i < bytes.length) {
    const b = bytes[i++];
    value = (value << 7) | (b & 0x7f);
    if ((b & 0x80) === 0) return { value, next: i };
  }
  throw new Error('midi: VLQ ran off end of buffer');
}

function readString(bytes, off, len) {
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(bytes[off + i]);
  return s;
}

function parseHeader(bytes) {
  if (bytes.length < 14) throw new Error('midi: header too short');
  if (readString(bytes, 0, 4) !== 'MThd') throw new Error('midi: missing MThd');
  const length = readUint32(bytes, 4);
  const format = readUint16(bytes, 8);
  const numTracks = readUint16(bytes, 10);
  const division = readUint16(bytes, 12);
  if (division & 0x8000) throw new Error('midi: SMPTE division not supported');
  return { format, numTracks, ticksPerQuarter: division, next: 8 + length };
}

function parseTrackEvents(bytes, start, end) {
  const events = [];
  let off = start;
  let runningStatus = 0;
  let absTick = 0;
  const programByChannel = new Array(16).fill(0);

  while (off < end) {
    const vlq = readVlq(bytes, off);
    absTick += vlq.value;
    off = vlq.next;
    if (off >= end) break;

    let status = bytes[off];
    if (status < 0x80) {
      status = runningStatus;
    } else {
      off += 1;
      if (status < 0xf0) runningStatus = status;
      else runningStatus = 0;
    }

    if (status === META) {
      const metaType = bytes[off++];
      const lenVlq = readVlq(bytes, off);
      off = lenVlq.next;
      const dataOff = off;
      off += lenVlq.value;
      if (metaType === 0x51 && lenVlq.value === 3) {
        const us = (bytes[dataOff] << 16) | (bytes[dataOff + 1] << 8) | bytes[dataOff + 2];
        events.push({ tick: absTick, kind: 'tempo', usPerQuarter: us });
      } else if (metaType === 0x2f) {
        break;
      }
      continue;
    }

    if (status === SYSEX_F0 || status === SYSEX_F7) {
      const lenVlq = readVlq(bytes, off);
      off = lenVlq.next + lenVlq.value;
      continue;
    }

    const highNibble = status & 0xf0;
    const channel = status & 0x0f;

    if (highNibble === 0x80 || highNibble === 0x90 || highNibble === 0xa0
        || highNibble === 0xb0 || highNibble === 0xe0) {
      const d1 = bytes[off++];
      const d2 = bytes[off++];
      if (highNibble === 0x90) {
        const type = d2 === 0 ? 'noteOff' : 'noteOn';
        events.push({
          tick: absTick, kind: 'note', type, channel,
          note: d1, velocity: d2, program: programByChannel[channel],
        });
      } else if (highNibble === 0x80) {
        events.push({
          tick: absTick, kind: 'note', type: 'noteOff', channel,
          note: d1, velocity: d2, program: programByChannel[channel],
        });
      }
    } else if (highNibble === 0xc0 || highNibble === 0xd0) {
      const d1 = bytes[off++];
      if (highNibble === 0xc0) programByChannel[channel] = d1;
    } else {
      off += 1;
    }
  }

  return events;
}

function parseTrackChunk(bytes, off) {
  if (readString(bytes, off, 4) !== 'MTrk') throw new Error('midi: missing MTrk');
  const length = readUint32(bytes, off + 4);
  const start = off + 8;
  const end = start + length;
  const rawEvents = parseTrackEvents(bytes, start, end);
  return { rawEvents, next: end };
}

function buildTempoMap(allRawEvents) {
  const tempos = [];
  for (const ev of allRawEvents) {
    if (ev.kind === 'tempo') tempos.push({ tick: ev.tick, usPerQuarter: ev.usPerQuarter });
  }
  tempos.sort((a, b) => a.tick - b.tick);
  if (tempos.length === 0 || tempos[0].tick > 0) {
    tempos.unshift({ tick: 0, usPerQuarter: 500000 });
  }
  return tempos;
}

function tickToSec(tick, tempoMap, ticksPerQuarter) {
  let sec = 0;
  let lastTick = 0;
  let lastUs = tempoMap[0].usPerQuarter;
  for (let i = 0; i < tempoMap.length; i++) {
    const t = tempoMap[i];
    if (t.tick >= tick) break;
    sec += (t.tick - lastTick) * lastUs / ticksPerQuarter / 1e6;
    lastTick = t.tick;
    lastUs = t.usPerQuarter;
  }
  sec += (tick - lastTick) * lastUs / ticksPerQuarter / 1e6;
  return sec;
}

export function parseMidi(bytes) {
  const header = parseHeader(bytes);
  const tracks = [];
  const allRaw = [];
  let off = header.next;
  for (let i = 0; i < header.numTracks; i++) {
    const tr = parseTrackChunk(bytes, off);
    off = tr.next;
    tracks.push(tr.rawEvents);
    for (const ev of tr.rawEvents) allRaw.push(ev);
  }
  const tempoMap = buildTempoMap(allRaw);
  const ticksPerQuarter = header.ticksPerQuarter;

  const resolvedTracks = tracks.map((rawEvents) => {
    const noteEvents = [];
    for (const ev of rawEvents) {
      if (ev.kind !== 'note') continue;
      noteEvents.push({
        timeSec: tickToSec(ev.tick, tempoMap, ticksPerQuarter),
        type: ev.type,
        channel: ev.channel,
        note: ev.note,
        velocity: ev.velocity,
        program: ev.program,
      });
    }
    return { events: noteEvents };
  });

  let durationSec = 0;
  for (const tr of resolvedTracks) {
    for (const ev of tr.events) {
      if (ev.timeSec > durationSec) durationSec = ev.timeSec;
    }
  }

  return {
    format: header.format,
    ticksPerQuarter,
    tracks: resolvedTracks,
    tempoMap,
    durationSec,
  };
}

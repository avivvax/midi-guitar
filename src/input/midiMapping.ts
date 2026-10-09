import { isStringIndex, type GuitarEvent } from './types';

/** CC number the firmware uses to report the fretted position of a string. */
export const FRET_CC = 20;
/** CC value meaning "string damped / muted" (maps to fret: null). */
export const FRET_MUTED_VALUE = 127;
export const MAX_FRET = 12;

export interface MidiMessage {
  status: number;
  data: number[];
  /** BLE-MIDI 13-bit millisecond timestamp, if the message came from BLE. */
  timestamp?: number;
}

/**
 * Channel 1–6 → string 0–5 (channel 1 = low E).
 * Note On (velocity > 0) → strum, velocity / 127.
 * CC 20 value 0–12 → fret (0 = open), 127 → muted (null).
 */
export function mapMidiMessage(msg: MidiMessage, t?: number): GuitarEvent | null {
  const kind = msg.status & 0xf0;
  const channel = msg.status & 0x0f;
  if (msg.status >= 0xf0 || !isStringIndex(channel)) return null;
  const [d1 = 0, d2 = 0] = msg.data;
  if (kind === 0x90 && d2 > 0) {
    return { type: 'strum', string: channel, velocity: d2 / 127, t };
  }
  if (kind === 0xb0 && d1 === FRET_CC) {
    if (d2 === FRET_MUTED_VALUE) return { type: 'fret', string: channel, fret: null, t };
    return { type: 'fret', string: channel, fret: Math.min(d2, MAX_FRET), t };
  }
  return null;
}

/** Number of data bytes that follow a status byte. */
export function dataLength(status: number): number {
  if (status >= 0xf8) return 0;
  switch (status & 0xf0) {
    case 0x80:
    case 0x90:
    case 0xa0:
    case 0xb0:
    case 0xe0:
      return 2;
    case 0xc0:
    case 0xd0:
      return 1;
  }
  switch (status) {
    case 0xf1:
    case 0xf3:
      return 1;
    case 0xf2:
      return 2;
    default:
      return 0;
  }
}

/**
 * Parse one BLE-MIDI packet (Bluetooth LE MIDI spec 1.0):
 *   header(1) [timestamp(1) status data…] [data… (running status)] [timestamp(1) data… (running status)] …
 * Handles running status, multiple messages per packet, real-time bytes and
 * SysEx (which is skipped).
 */
export function parseBleMidiPacket(packet: Uint8Array): MidiMessage[] {
  const out: MidiMessage[] = [];
  if (packet.length < 2 || (packet[0] & 0x80) === 0) return out;
  const tsHigh = packet[0] & 0x3f;
  let ts = tsHigh << 7;
  let running = 0;
  let i = 1;

  const readMessage = (status: number): boolean => {
    const n = dataLength(status);
    if (i + n > packet.length) return false;
    const data: number[] = [];
    for (let k = 0; k < n; k++) {
      const b = packet[i + k];
      if (b & 0x80) return false; // malformed
      data.push(b);
    }
    i += n;
    out.push({ status, data, timestamp: ts });
    return true;
  };

  while (i < packet.length) {
    let b = packet[i];
    if (b & 0x80) {
      // Timestamp-low byte.
      const low = b & 0x7f;
      // Timestamp low wrapped → high part incremented (spec 3.2).
      if (low < (ts & 0x7f)) ts = (((ts >> 7) + 1) & 0x3f) << 7;
      ts = (ts & ~0x7f) | low;
      i++;
      if (i >= packet.length) break;
      b = packet[i];
      if (b & 0x80) {
        i++;
        if (b === 0xf0) {
          // SysEx: skip until a timestamp byte followed by F7 (end) or packet end.
          while (i < packet.length) {
            if (packet[i] & 0x80) {
              if (packet[i + 1] === 0xf7) {
                i += 2;
                break;
              }
              i++;
            } else {
              i++;
            }
          }
          running = 0;
          continue;
        }
        if (b >= 0xf8) {
          out.push({ status: b, data: [], timestamp: ts });
          continue;
        }
        if (b >= 0xf0) running = 0;
        else running = b;
        if (!readMessage(b)) break;
        continue;
      }
      // Timestamp followed by data byte: running status.
      if (!running || !readMessage(running)) break;
      continue;
    }
    // Data byte with no timestamp: additional running-status message.
    if (!running || !readMessage(running)) break;
  }
  return out;
}

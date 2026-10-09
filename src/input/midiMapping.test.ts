import { describe, expect, it } from 'vitest';
import { mapMidiMessage, parseBleMidiPacket } from './midiMapping';

describe('parseBleMidiPacket', () => {
  it('parses a single note on', () => {
    const msgs = parseBleMidiPacket(new Uint8Array([0x80, 0x80, 0x90, 0x40, 0x7f]));
    expect(msgs).toEqual([{ status: 0x90, data: [0x40, 0x7f], timestamp: 0 }]);
  });

  it('parses multiple messages with timestamps and running status', () => {
    const p = new Uint8Array([
      0x81, // header, tsHigh=1
      0x82, 0x91, 0x30, 0x40, // ts, note on ch2
      0x31, 0x50, // running status without timestamp
      0x85, 0x32, 0x60, // timestamp + running status
      0x86, 0xb2, 0x14, 0x05, // ts + CC20=5 ch3
    ]);
    const msgs = parseBleMidiPacket(p);
    expect(msgs.map((m) => [m.status, ...m.data])).toEqual([
      [0x91, 0x30, 0x40],
      [0x91, 0x31, 0x50],
      [0x91, 0x32, 0x60],
      [0xb2, 0x14, 0x05],
    ]);
    expect(msgs[0].timestamp).toBe((1 << 7) | 2);
    expect(msgs[2].timestamp).toBe((1 << 7) | 5);
  });

  it('skips sysex and keeps following messages', () => {
    const p = new Uint8Array([0x80, 0x80, 0xf0, 0x01, 0x02, 0x81, 0xf7, 0x82, 0x90, 0x40, 0x10]);
    expect(parseBleMidiPacket(p).map((m) => m.status)).toEqual([0x90]);
  });

  it('passes real-time bytes without breaking running status', () => {
    const p = new Uint8Array([0x80, 0x80, 0x90, 0x40, 0x10, 0x81, 0xf8, 0x82, 0x41, 0x20]);
    expect(parseBleMidiPacket(p).map((m) => [m.status, ...m.data])).toEqual([
      [0x90, 0x40, 0x10],
      [0xf8],
      [0x90, 0x41, 0x20],
    ]);
  });

  it('rejects packets without a header', () => {
    expect(parseBleMidiPacket(new Uint8Array([0x10, 0x90]))).toEqual([]);
  });
});

describe('mapMidiMessage', () => {
  it('maps note on to a strum on the channel string', () => {
    expect(mapMidiMessage({ status: 0x92, data: [60, 127] })).toMatchObject({
      type: 'strum',
      string: 2,
      velocity: 1,
    });
  });
  it('ignores note on with zero velocity and channels > 6', () => {
    expect(mapMidiMessage({ status: 0x90, data: [60, 0] })).toBeNull();
    expect(mapMidiMessage({ status: 0x96, data: [60, 100] })).toBeNull();
  });
  it('maps CC20 to frets and 127 to muted', () => {
    expect(mapMidiMessage({ status: 0xb5, data: [20, 7] })).toMatchObject({ type: 'fret', string: 5, fret: 7 });
    expect(mapMidiMessage({ status: 0xb0, data: [20, 127] })).toMatchObject({ type: 'fret', fret: null });
  });
});

import { describe, expect, it } from 'vitest';
import {
  CC,
  applyDeviceCC,
  buildBleMidiPacket,
  ccFromLevel,
  emptyDeviceConfig,
  gainFromCC,
  neighbourFromCC,
  releaseFromCC,
  thresholdFromCC,
} from './configProtocol';
import { mapMidiMessage, parseBleMidiPacket } from './midiMapping';

describe('config mappings (same vectors as firmware/test/test_config.cpp)', () => {
  it('threshold: quadratic 10–2010 and round-trips', () => {
    expect(thresholdFromCC(0)).toBe(10);
    expect(thresholdFromCC(127)).toBe(2010);
    expect(thresholdFromCC(32)).toBeGreaterThan(100);
    expect(thresholdFromCC(32)).toBeLessThan(150);
    for (let v = 8; v <= 127; v++) expect(ccFromLevel(thresholdFromCC(v))).toBe(v);
    expect(ccFromLevel(5000)).toBe(127);
  });
  it('gain, release, neighbour', () => {
    expect(gainFromCC(64)).toBe(1);
    expect(gainFromCC(0)).toBeCloseTo(0.25, 2);
    expect(gainFromCC(127)).toBeCloseTo(3.9, 1);
    expect(releaseFromCC(127)).toBeCloseTo(1);
    expect(releaseFromCC(0)).toBeCloseTo(0.05);
    expect(neighbourFromCC(127)).toBe(2);
    expect(neighbourFromCC(64)).toBeCloseTo(1, 1);
  });
});

describe('BLE-MIDI packets to the guitar', () => {
  it('round-trips through the BLE-MIDI parser', () => {
    const pkt = buildBleMidiPacket([[CC.gainSelect, 3], [CC.gain, 80]], 0xbf, 1234);
    expect(pkt[0] & 0x80).toBe(0x80);
    expect(parseBleMidiPacket(pkt).map((m) => [m.status, ...m.data])).toEqual([
      [0xbf, 29, 3],
      [0xbf, 28, 80],
    ]);
  });
  it('clamps values to 7 bits', () => {
    const pkt = buildBleMidiPacket([[20, 300]]);
    expect(pkt[4]).toBe(127);
  });
});

describe('settings reported by the guitar', () => {
  it('applies thresholds, release, neighbour and selected gains', () => {
    const sel = { gainString: 0 };
    let cfg = emptyDeviceConfig();
    for (const [cc, v] of [[22, 50], [26, 30], [27, 70], [29, 6], [28, 90]] as const) {
      cfg = applyDeviceCC(cfg, sel, cc, v) ?? cfg;
    }
    expect(cfg.threshold[2]).toBe(50);
    expect(cfg.release).toBe(30);
    expect(cfg.neighbour).toBe(70);
    expect(cfg.gain).toEqual([64, 64, 64, 64, 64, 90]);
    expect(applyDeviceCC(cfg, sel, CC.peak, 10)).toBeNull();
  });
  it('channel-16 messages never become guitar events', () => {
    expect(mapMidiMessage({ status: 0xbf, data: [20, 64] })).toBeNull();
    expect(mapMidiMessage({ status: 0xbf, data: [40, 64] })).toBeNull();
  });
});

describe('sustain: Note Off is ignored', () => {
  it('Note Off and Note On with velocity 0 produce no event', () => {
    expect(mapMidiMessage({ status: 0x82, data: [60, 0] })).toBeNull();
    expect(mapMidiMessage({ status: 0x82, data: [60, 64] })).toBeNull();
    expect(mapMidiMessage({ status: 0x92, data: [60, 0] })).toBeNull();
  });
  it('CC 20 = 127 is the explicit mute (fret null)', () => {
    expect(mapMidiMessage({ status: 0xb3, data: [20, 127] })).toMatchObject({ type: 'fret', string: 3, fret: null });
  });
});

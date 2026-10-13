import { describe, expect, it } from 'vitest';
import { renderBowed } from '../audio/bowed';
import { renderKarplusStrong } from '../audio/karplus';
import { migrateV1 } from '../state/store';
import { makeSetup, registerRange } from './mapping';
import { INSTRUMENTS } from './registry';
import { getSampleSet, sampleNotes, sampleSetIds } from './samples';
import { SOUNDS } from './sounds';

const finite = (a: Float32Array) => a.every((x) => Number.isFinite(x));
const peak = (a: Float32Array) => a.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

describe('sounds', () => {
  it('every instrument has a synth preset and a known sample set', () => {
    for (const inst of INSTRUMENTS) {
      expect(SOUNDS[inst.sound], `${inst.id} sound ${inst.sound}`).toBeDefined();
      if (inst.samples) expect(getSampleSet(inst.samples), `${inst.id} samples ${inst.samples}`).not.toBeNull();
    }
  });

  it('sample sets cover the notes their instruments play (open strings, up to 12 frets, any key)', () => {
    for (const inst of INSTRUMENTS.filter((i) => i.samples)) {
      const set = getSampleSet(inst.samples)!;
      for (const key of [0, 6]) {
        const s = makeSetup({ instrumentId: inst.id, key: { root: key, mode: 'major' }, capo: 0, register: 0, extraStrings: 'double' });
        const range = registerRange(inst, s.tuning);
        const low = Math.min(...s.tuning.slice(0, 6 + range.max));
        const high = Math.max(...s.tuning) + (inst.fretting.kind === 'open' ? 0 : 12);
        expect(low >= set.lo - 2, `${inst.id} low ${low} < ${set.lo}`).toBe(true);
        expect(high <= set.hi + 2, `${inst.id} high ${high} > ${set.hi}`).toBe(true);
      }
    }
  });

  it('every sample file exists', () => {
    const files = new Set(Object.keys(import.meta.glob('../../public/samples/*/*.mp3')));
    for (const id of sampleSetIds()) {
      for (const m of sampleNotes(getSampleSet(id)!)) expect(files.has(`../../public/samples/${id}/${m}.mp3`), `${id}/${m}`).toBe(true);
    }
  });

  it('renders plucked (noise, hammer, buzz) and bowed notes', () => {
    const base = { t60: 2, stretch: 0.4, pickPos: 0.12, brightness: 0.7, duration: 1 };
    for (const o of [base, { ...base, excitation: 'hammer' as const }, { ...base, buzz: 0.6 }]) {
      const a = renderKarplusStrong(44100, 220, o, 3);
      expect(a.length).toBe(44100);
      expect(finite(a)).toBe(true);
      expect(peak(a)).toBeGreaterThan(0.1);
    }
    const b = renderBowed(44100, 196, { brightness: 0.6, vibrato: { rate: 5.5, cents: 12, delay: 0.2 }, attack: 0.08, sustain: 0.6, release: 0.25, noise: 0.03 });
    expect(b.length).toBe(Math.floor(0.93 * 44100));
    expect(finite(b)).toBe(true);
    // Swells in, sustains, releases to silence.
    expect(Math.abs(b[10])).toBeLessThan(0.05);
    expect(peak(b.subarray(Math.floor(0.3 * 44100), Math.floor(0.5 * 44100)))).toBeGreaterThan(0.5);
    expect(peak(b.subarray(b.length - 50))).toBeLessThan(0.05);
  });
});

describe('settings migration', () => {
  it('maps the old sounds and keeps the guitar tuning', () => {
    expect(migrateV1({ instrument: 'acoustic', tuningId: 'dadgad', capo: 3 })).toMatchObject({ instrument: 'guitar-steel', tunings: { 'guitar-steel': 'dadgad' }, capo: 3 });
    expect(migrateV1({ instrument: 'bass', tuningId: 'dropd' })).toMatchObject({ instrument: 'bass-4', tunings: {} });
    expect(migrateV1({ instrument: 'synth', tuningId: 'custom', customTuning: [38, 45, 50, 55, 59, 64] })).toMatchObject({
      instrument: 'synth-lead',
      customTunings: { 'synth-lead': [38, 45, 50, 55, 59, 64] },
    });
    expect(migrateV1({})).toMatchObject({ instrument: 'guitar-steel' });
  });
});

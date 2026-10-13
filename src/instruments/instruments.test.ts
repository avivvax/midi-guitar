import { describe, expect, it } from 'vitest';
import { CHORD_TYPES, chordDef, chordPitchClasses, pc, type Chord, type ChordType } from '../music/theory';
import { chordNotes, effectiveTuning, freeNote, makeSetup, registerRange, type PhysNote } from './mapping';
import { INSTRUMENTS, getInstrument } from './registry';
import { ukuleleShape } from './shapes';

const G_MAJOR = { root: 7, mode: 'major' } as const;
const setupFor = (id: string, extra: 'double' | 'mute' = 'double', key: { root: number; mode: 'major' | 'minor' } = G_MAJOR) =>
  makeSetup({ instrumentId: id, key, capo: 0, register: null, extraStrings: extra });
const notesOf = (rs: ReturnType<typeof chordNotes>['physical']) => rs.filter((r): r is PhysNote => r !== null && r !== 'mute');

describe('registry', () => {
  it('has unique ids, names in both languages and consistent tunings', () => {
    expect(new Set(INSTRUMENTS.map((i) => i.id)).size).toBe(INSTRUMENTS.length);
    expect(INSTRUMENTS.length).toBeGreaterThanOrEqual(70);
    for (const inst of INSTRUMENTS) {
      expect(inst.name.en && inst.name.he, inst.id).toBeTruthy();
      const n = inst.tunings[0].notes.length;
      for (const t of inst.tunings) {
        expect(t.notes.length, `${inst.id}/${t.id}`).toBe(n);
        for (const m of t.notes) expect(m >= 12 && m <= 108, `${inst.id}/${t.id} ${m}`).toBe(true);
      }
      if (inst.courses) expect(inst.courses.length, inst.id).toBe(n);
      for (const c of inst.openOnly ?? []) expect(c < n, inst.id).toBe(true);
      expect(inst.gm >= 0 && inst.gm <= 127).toBe(true);
      if (inst.fretting.kind === 'open') expect(inst.chordStyle === undefined || inst.chordStyle === 'drone', inst.id).toBe(true);
    }
  });

  it('falls back to the default instrument for unknown ids', () => {
    expect(getInstrument('nope').id).toBe('guitar-steel');
  });
});

describe('ukulele shapes', () => {
  it('every table shape contains exactly the chord tones', () => {
    const gcea = [67, 60, 64, 69];
    for (let root = 0; root < 12; root++) {
      for (const t of CHORD_TYPES) {
        const chord: Chord = { root, type: t.id };
        const v = ukuleleShape(chord, gcea);
        if (!v) continue;
        const pcs = new Set(v.map((f, i) => pc(gcea[i] + f!)));
        const tones = new Set(chordPitchClasses(chord));
        for (const p of pcs) expect(tones.has(p), `${root}${t.id}`).toBe(true);
        const def = chordDef(t.id);
        for (const i of def.intervals) if (!def.optional?.includes(i)) expect(pcs.has(pc(root + i)), `${root}${t.id} missing ${i}`).toBe(true);
      }
    }
  });

  it('uses the standard shapes and follows D tuning', () => {
    expect(ukuleleShape({ root: 7, type: 'maj' }, [67, 60, 64, 69])).toEqual([0, 2, 3, 2]);
    expect(ukuleleShape({ root: 9, type: 'min' }, [55, 60, 64, 69])).toEqual([2, 0, 0, 0]);
    // a D F# B: D major uses the C shape.
    expect(ukuleleShape({ root: 2, type: 'maj' }, [69, 62, 66, 71])).toEqual([0, 0, 0, 3]);
  });
});

describe('chord mode on every instrument', () => {
  const chords: Chord[] = [];
  for (const root of [0, 2, 4, 5, 7, 9, 10]) for (const type of ['maj', 'min', '7'] as ChordType[]) chords.push({ root, type });

  it('only sounds chord tones (or the drone), within the instrument range', () => {
    for (const inst of INSTRUMENTS) {
      const s = setupFor(inst.id);
      for (const chord of chords) {
        const r = chordNotes(s, chord);
        expect(r.physical.length).toBe(6);
        const notes = notesOf(r.physical);
        if (inst.chordStyle === 'drone') continue;
        const tones = new Set(chordPitchClasses(chord));
        for (const n of notes) {
          expect(tones.has(pc(n.midi)), `${inst.id} ${chord.root}${chord.type} ${n.midi}`).toBe(true);
          expect(n.midi >= s.tuning[n.course], inst.id).toBe(true);
        }
      }
    }
  });

  it('voices the common chords on the main instruments', () => {
    for (const id of ['guitar-steel', 'uke-soprano', 'mandolin', 'banjo-5', 'violin', 'oud-arabic', 'bouzouki-greek4', 'lute', 'harp-lever', 'autoharp', 'charango']) {
      const s = setupFor(id);
      for (const chord of [{ root: 0, type: 'maj' }, { root: 7, type: 'maj' }, { root: 2, type: 'maj' }, { root: 9, type: 'min' }] as Chord[]) {
        const pcs = new Set(notesOf(chordNotes(s, chord).physical).map((n) => pc(n.midi)));
        expect(pcs.size, `${id} ${chord.root}${chord.type}`).toBe(3);
      }
    }
  });

  it('keeps the known fingerings', () => {
    const v = (id: string, chord: Chord) => chordNotes(setupFor(id), chord).voicing!.join('');
    expect(chordNotes(setupFor('guitar-steel'), { root: 0, type: 'maj' }).voicing).toEqual([null, 3, 2, 0, 1, 0]);
    expect(v('mandolin', { root: 7, type: 'maj' })).toBe('0023');
    expect(v('mandolin', { root: 2, type: 'maj' })).toBe('2002');
    expect(v('mandolin', { root: 0, type: 'maj' })).toBe('0230');
    expect(v('banjo-5', { root: 7, type: 'maj' })).toBe('00000');
    expect(v('banjo-5', { root: 0, type: 'maj' })).toBe('02012');
    expect(v('uke-baritone', { root: 7, type: 'maj' })).toBe('0003');
  });

  it('plays root and fifth on basses', () => {
    const s = setupFor('bass-4');
    const notes = notesOf(chordNotes(s, { root: 9, type: 'min' }).physical);
    expect(new Set(notes.map((n) => pc(n.midi)))).toEqual(new Set([9, 4]));
    expect(Math.min(...notes.map((n) => n.midi)) % 12).toBe(9);
  });

  it('bars straight across on lap steel and skips non-chord strings', () => {
    const r = chordNotes(setupFor('lap-steel'), { root: 7, type: 'maj' });
    const frets = notesOf(r.physical).map((n) => n.fret);
    expect(new Set(frets).size).toBe(1);
    expect(r.physical.filter((x) => x === 'mute')).toHaveLength(0);
  });

  it('harps play chord-tone strings in order from a root', () => {
    const notes = notesOf(chordNotes(setupFor('harp-pedal'), { root: 0, type: 'maj' }).physical).map((n) => n.midi);
    expect(notes).toHaveLength(6);
    expect(pc(notes[0])).toBe(0);
    for (let i = 1; i < notes.length; i++) expect(notes[i]).toBeGreaterThan(notes[i - 1]);
  });

  it('the tanpura drones regardless of the chord, on Sa = key', () => {
    const s = setupFor('tanpura', 'double', { root: 2, mode: 'major' });
    const notes = notesOf(chordNotes(s, { root: 0, type: 'maj' }).physical).map((n) => pc(n.midi));
    expect(new Set(notes)).toEqual(new Set([2, 9]));
  });

  it('arpeggiates chord tones on melody instruments', () => {
    const notes = notesOf(chordNotes(setupFor('erhu'), { root: 7, type: 'maj' }).physical).map((n) => n.midi);
    expect(notes.slice(0, 4)).toEqual([67, 71, 74, 79]);
  });
});

describe('physical mapping', () => {
  it('centres 4 courses and doubles or mutes the outer strings', () => {
    expect(setupFor('uke-soprano').physical).toEqual([0, 0, 1, 2, 3, 3]);
    expect(setupFor('uke-soprano', 'mute').physical).toEqual([null, 0, 1, 2, 3, null]);
    expect(setupFor('guitar-steel').physical).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('windows instruments with more than 6 courses', () => {
    const inst = getInstrument('guitar-7');
    expect(registerRange(inst, inst.tunings[0].notes)).toEqual({ max: 1, step: 1, def: 1 });
    const low = makeSetup({ instrumentId: 'guitar-7', key: G_MAJOR, capo: 0, register: 0, extraStrings: 'double' });
    expect(low.window).toEqual([0, 1, 2, 3, 4, 5]);
    const harp = getInstrument('harp-lever');
    const r = registerRange(harp, harp.tunings[0].notes);
    expect(r.step).toBe(7);
    expect(r.max).toBe(28);
  });

  it('free mode adds the touch-neck fret (diatonic on a mountain dulcimer)', () => {
    const s = setupFor('guitar-steel');
    expect(freeNote(s, 0, 3)).toMatchObject({ midi: 43, fret: 3 });
    expect(freeNote(s, 0, null)).toBe('mute');
    const d = setupFor('dulcimer-mountain');
    // Fret 7 is the 6½ fret = 11 semitones.
    expect(freeNote(d, 3, 7)).toMatchObject({ midi: 57 + 11, fret: 7 });
    // Open-string instruments ignore frets.
    expect(freeNote(setupFor('harp-lever'), 0, 5)).toMatchObject({ fret: 0 });
  });

  it('capo transposes what a shape sounds like', () => {
    const s = makeSetup({ instrumentId: 'guitar-steel', key: G_MAJOR, capo: 2, register: null, extraStrings: 'double' });
    const notes = notesOf(chordNotes(s, { root: 7, type: 'maj' }).physical);
    expect(pc(notes[0].midi)).toBe(9); // G shape, capo 2 → A
  });
});

describe('key re-tuning', () => {
  it('snaps harps to the key scale without duplicates', () => {
    const inst = getInstrument('harp-lever');
    const e = effectiveTuning(inst, inst.tunings[0].notes, { root: 4, mode: 'major' });
    expect(new Set(e).size).toBe(e.length);
    expect(new Set(e.map(pc))).toEqual(new Set([4, 6, 8, 9, 11, 1, 3]));
    const kinnor = getInstrument('kinnor');
    const g = effectiveTuning(kinnor, kinnor.tunings[0].notes, G_MAJOR);
    expect(new Set(g).size).toBe(g.length);
  });

  it('moves Sa to the key on Indian instruments and transposes pentatonic zithers', () => {
    const sitar = getInstrument('sitar');
    expect(pc(effectiveTuning(sitar, sitar.tunings[0].notes, { root: 2, mode: 'major' })[0])).toBe(2);
    const gz = getInstrument('guzheng');
    const inC = effectiveTuning(gz, gz.tunings[0].notes, { root: 0, mode: 'major' });
    expect(new Set(inC.map(pc))).toEqual(new Set([0, 2, 4, 7, 9]));
    // A minor uses the relative major's pentatonic (C).
    expect(effectiveTuning(gz, gz.tunings[0].notes, { root: 9, mode: 'minor' })).toEqual(inC);
  });
});

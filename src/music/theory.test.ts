import { describe, expect, it } from 'vitest';
import { TUNINGS, chordPitchClasses, defaultPalette, diatonicChords, findVoicing, voicingToString, pc } from './theory';

const std = TUNINGS[0].notes;
const dadgad = TUNINGS[2].notes;

describe('voicings', () => {
  it('uses open shapes in standard tuning', () => {
    expect(voicingToString(findVoicing({ root: 0, type: 'maj' }, std))).toBe('x32010');
    expect(voicingToString(findVoicing({ root: 4, type: 'min' }, std))).toBe('022000');
  });

  it('generates valid voicings for every chord in every tuning', () => {
    for (const t of TUNINGS) {
      for (let root = 0; root < 12; root++) {
        for (const type of ['maj', 'min', '7', 'maj7', 'm7', 'sus2', 'sus4', 'dim', 'aug', '5'] as const) {
          const v = findVoicing({ root, type }, t.notes);
          const notes = v.map((f, i) => (f === null ? null : t.notes[i] + f)).filter((n): n is number => n !== null);
          expect(notes.length, `${t.id} ${root}${type}`).toBeGreaterThanOrEqual(2);
          expect(pc(notes[0])).toBe(root);
          const tones = new Set(chordPitchClasses({ root, type }));
          for (const n of notes) expect(tones.has(pc(n))).toBe(true);
        }
      }
    }
  });

  it('finds DADGAD D major with open strings', () => {
    const v = findVoicing({ root: 2, type: 'maj' }, dadgad);
    expect(v.filter((f) => f === 0).length).toBeGreaterThanOrEqual(3);
  });
});

describe('keys', () => {
  it('lists diatonic chords of G major', () => {
    const names = diatonicChords({ root: 7, mode: 'major' }).map((c) => `${c.root}${c.type}`);
    expect(names).toContain('7maj');
    expect(names).toContain('27'); // D7
    expect(names).toContain('4m7'); // Em7
    expect(names).not.toContain('5maj'); // F major isn't in G major
  });
  it('builds an 8-chord default palette', () => {
    expect(defaultPalette({ root: 9, mode: 'minor' })).toHaveLength(8);
  });
});

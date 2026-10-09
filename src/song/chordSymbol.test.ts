import { describe, expect, it } from 'vitest';
import { parseChordSymbol, symbolToChord, transposeKey, transposeSymbol } from './chordSymbol';

describe('parseChordSymbol', () => {
  it.each([
    ['C', 0, 'maj'],
    ['Am', 9, 'min'],
    ['F#m7', 6, 'm7'],
    ['Bb', 10, 'maj'],
    ['Ebmaj7', 3, 'maj7'],
    ['G7', 7, '7'],
    ['Dsus4', 2, 'sus4'],
    ['Asus2', 9, 'sus2'],
    ['Bdim', 11, 'dim'],
    ['Bm7b5', 11, 'dim'],
    ['Caug', 0, 'aug'],
    ['E5', 4, '5'],
    ['Cadd9', 0, 'maj'],
    ['C(add9)', 0, 'maj'],
    ['D6/9', 2, 'maj'],
    ['A7sus4', 9, 'sus4'],
    ['C#m', 1, 'min'],
    ['Em9', 4, 'm7'],
  ] as const)('%s', (sym, root, type) => {
    expect(parseChordSymbol(sym)).toMatchObject({ root, type });
  });

  it('parses slash chords', () => {
    expect(parseChordSymbol('G/B')).toMatchObject({ root: 7, type: 'maj', bass: 11, bassName: 'B' });
    expect(parseChordSymbol('D/F#')).toMatchObject({ root: 2, bass: 6 });
    expect(symbolToChord('Am/G')).toEqual({ root: 9, type: 'min' });
  });

  it('rejects words that are not chords', () => {
    for (const w of ['And', 'Hello', 'Am I', 'Cat', 'Dream', 'H', 'Ab12x', 'שלום', 'x2', '']) {
      expect(parseChordSymbol(w), w).toBeNull();
    }
  });
});

describe('transpose', () => {
  it('transposes root, bass and keeps quality', () => {
    expect(transposeSymbol('Am7', 2)).toBe('Bm7');
    expect(transposeSymbol('G/B', 2)).toBe('A/C#');
    expect(transposeSymbol('C', -1)).toBe('B');
    expect(transposeSymbol('Bb', 2)).toBe('C');
    expect(transposeSymbol('Eb', 1)).toBe('E');
    expect(transposeSymbol('F#m', 12)).toBe('F#m');
  });
  it('keeps flat spelling for flat chords', () => {
    expect(transposeSymbol('Bb', 1)).toBe('B');
    expect(transposeSymbol('Eb', 3)).toBe('Gb');
  });
  it('transposes keys', () => {
    expect(transposeKey('Am', 3)).toBe('Cm');
    expect(transposeKey('G', -2)).toBe('F');
  });
});

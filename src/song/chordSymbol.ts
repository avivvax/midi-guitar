import { FLAT_NAMES, NOTE_NAMES, pc, type Chord, type ChordType } from '../music/theory';

const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Quality text → closest chord type the voicing engine knows. */
const QUALITY: Record<string, ChordType> = {
  '': 'maj', maj: 'maj', M: 'maj', '6': 'maj', '69': 'maj', '6/9': 'maj', add9: 'maj', add2: 'sus2', add4: 'maj', add11: 'maj',
  m: 'min', min: 'min', '-': 'min', m6: 'min', madd9: 'min', 'm(maj7)': 'min', mmaj7: 'min', mM7: 'min', 'm/maj7': 'min',
  '7': '7', '9': '7', '11': '7', '13': '7', '7b9': '7', '7#9': '7', '7b5': '7', '7#11': '7', dom7: '7', '7(b9)': '7', '7(#9)': '7',
  maj7: 'maj7', M7: 'maj7', 'Δ': 'maj7', 'Δ7': 'maj7', ma7: 'maj7', maj9: 'maj7', M9: 'maj7', maj13: 'maj7', 'maj7#11': 'maj7',
  m7: 'm7', min7: 'm7', '-7': 'm7', m9: 'm7', m11: 'm7', m13: 'm7',
  sus2: 'sus2',
  sus: 'sus4', sus4: 'sus4', '7sus4': 'sus4', '7sus': 'sus4', '9sus4': 'sus4', '7sus2': 'sus2',
  dim: 'dim', '°': 'dim', o: 'dim', dim7: 'dim', '°7': 'dim', o7: 'dim', m7b5: 'dim', 'm7-5': 'dim', 'ø': 'dim', 'ø7': 'dim',
  aug: 'aug', '+': 'aug', '7#5': 'aug', '+7': 'aug', aug7: 'aug', '7+5': 'aug',
  '5': '5',
};

export interface ParsedChordSymbol {
  /** Root letter as written, e.g. "F#", "Bb". */
  rootName: string;
  root: number;
  quality: string;
  type: ChordType;
  bassName?: string;
  bass?: number;
}

const SYMBOL_RE = /^([A-G])([#b♯♭]?)([^/]*?)(?:\/([A-G])([#b♯♭]?))?$/;

function accidental(a: string): number {
  return a === '#' || a === '♯' ? 1 : a === 'b' || a === '♭' ? -1 : 0;
}

/** Parse a chord symbol ("Am7", "G/B", "C#m7b5", "D6/9"). Returns null for non-chords. */
export function parseChordSymbol(raw: string): ParsedChordSymbol | null {
  let s = raw.trim();
  if (!s || s.length > 14) return null;
  // "6/9" would look like a slash chord; protect it.
  s = s.replace('6/9', '69');
  const m = SYMBOL_RE.exec(s);
  if (!m) return null;
  const [, letter, acc, qualityRaw, bassLetter, bassAcc] = m;
  // Ignore cosmetic parentheses: C(add9) → Cadd9, but keep m(maj7) which is in the table.
  let quality = qualityRaw;
  if (!(quality in QUALITY)) quality = quality.replace(/[()]/g, '');
  const type = QUALITY[quality];
  if (type === undefined) return null;
  const out: ParsedChordSymbol = {
    rootName: letter + (acc ? (accidental(acc) > 0 ? '#' : 'b') : ''),
    root: pc(LETTER[letter] + accidental(acc)),
    quality: qualityRaw,
    type,
  };
  if (bassLetter) {
    out.bassName = bassLetter + (bassAcc ? (accidental(bassAcc) > 0 ? '#' : 'b') : '');
    out.bass = pc(LETTER[bassLetter] + accidental(bassAcc));
  }
  return out;
}

export const isChordSymbol = (s: string): boolean => parseChordSymbol(s) !== null;

/** Engine chord for a symbol (bass note of slash chords is not voiced). */
export function symbolToChord(sym: string): Chord | null {
  const p = parseChordSymbol(sym);
  return p ? { root: p.root, type: p.type } : null;
}

/** Transpose a chord symbol by `semitones`, keeping its quality text. */
export function transposeSymbol(sym: string, semitones: number, preferFlats?: boolean): string {
  const p = parseChordSymbol(sym);
  if (!p || semitones % 12 === 0) return sym;
  const flats = preferFlats ?? p.rootName.endsWith('b');
  const names = flats ? FLAT_NAMES : NOTE_NAMES;
  let out = names[pc(p.root + semitones)] + p.quality;
  if (p.bass !== undefined) out += '/' + names[pc(p.bass + semitones)];
  return out;
}

/** Transpose a key name like "Am", "F#", "Bb major". */
export function transposeKey(key: string, semitones: number): string {
  const m = /^([A-G][#b]?)(.*)$/.exec(key.trim());
  if (!m) return key;
  const p = parseChordSymbol(m[1]);
  if (!p) return key;
  const names = p.rootName.endsWith('b') ? FLAT_NAMES : NOTE_NAMES;
  return names[pc(p.root + semitones)] + m[2];
}

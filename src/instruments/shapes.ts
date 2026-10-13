import { CHORD_TYPES, chordName, pc, type Chord, type Voicing } from '../music/theory';

/**
 * Standard ukulele chord shapes for G C E A (high or low G), written 4th → 1st
 * string. Re-used for any tuning with the same intervals (e.g. D tuning
 * a D F# B = GCEA + 2). Every shape is checked against the chord's notes in
 * shapes.test.ts.
 */
const UKE: Record<string, string> = {
  C: '0003', Cm: '0333', C7: '0001', Cmaj7: '0002', Cm7: '3333', Csus4: '0013', Csus2: '0233',
  'C#': '1114', 'C#m': '1104', 'C#7': '1112',
  D: '2220', Dm: '2210', D7: '2223', Dmaj7: '2224', Dm7: '2213', Dsus2: '2200', Dsus4: '0230',
  Eb: '0331', Ebm: '3321', Eb7: '3334',
  E: '4442', Em: '0432', E7: '1202', Em7: '0202', Emaj7: '1302',
  F: '2010', Fm: '1013', F7: '2313', Fmaj7: '2413',
  'F#': '3121', 'F#m': '2120', 'F#7': '3424',
  G: '0232', Gm: '0231', G7: '0212', Gmaj7: '0222', Gm7: '0211', Gsus4: '0233', Gsus2: '0230',
  Ab: '5343', Abm: '4342', Ab7: '1323',
  A: '2100', Am: '2000', A7: '0100', Amaj7: '1100', Am7: '0000', Asus4: '2200', Asus2: '2452',
  Bb: '3211', Bbm: '3111', Bb7: '1211', Bbmaj7: '3210',
  B: '4322', Bm: '4222', B7: '2322', Bm7: '2222',
};

/** chordName() spells with sharps; the table uses the usual ukulele spellings. */
const TABLE_ROOT: Record<string, string> = { 'D#': 'Eb', 'G#': 'Ab', 'A#': 'Bb' };

/** Pitch classes of G C E A relative to G (re-entrancy doesn't change the frets). */
const UKE_PCS = [0, 5, 9, 2];

function lookupName(table: Record<string, string>, chord: Chord): string | undefined {
  const name = chordName(chord);
  if (table[name]) return table[name];
  const suffix = CHORD_TYPES.find((c) => c.id === chord.type)!.suffix;
  const root = name.slice(0, name.length - suffix.length);
  const alt = TABLE_ROOT[root];
  return alt ? table[alt + suffix] : undefined;
}

const parse = (s: string): Voicing => [...s].map((c) => (c === 'x' ? null : Number(c)));

/** Shape for a GCEA-family tuning, or null if the tuning isn't one or the chord isn't in the table. */
export function ukuleleShape(chord: Chord, tuning: number[]): Voicing | null {
  if (tuning.length !== 4) return null;
  const shift = pc(tuning[0] - 7); // G = 7
  if (!tuning.every((n, i) => pc(n - shift - 7) === UKE_PCS[i])) return null;
  const s = lookupName(UKE, { root: pc(chord.root - shift), type: chord.type });
  return s ? parse(s) : null;
}

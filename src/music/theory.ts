export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

export const pc = (midi: number): number => ((midi % 12) + 12) % 12;
export const noteName = (midi: number): string => NOTE_NAMES[pc(midi)];
export const noteNameOct = (midi: number): string => `${noteName(midi)}${Math.floor(midi / 12) - 1}`;
export const midiToFreq = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

// ---------- Tunings ----------
export interface Tuning {
  id: string;
  name: string;
  /** MIDI notes, string 0 (low) … 5 (high). */
  notes: number[];
}

const STD = [40, 45, 50, 55, 59, 64];
export const TUNINGS: Tuning[] = [
  { id: 'standard', name: 'Standard (E A D G B E)', notes: STD },
  { id: 'dropd', name: 'Drop D (D A D G B E)', notes: [38, 45, 50, 55, 59, 64] },
  { id: 'dadgad', name: 'DADGAD', notes: [38, 45, 50, 55, 57, 62] },
  { id: 'openg', name: 'Open G (D G D G B D)', notes: [38, 43, 50, 55, 59, 62] },
  { id: 'halfdown', name: 'Half-step down (Eb)', notes: STD.map((n) => n - 1) },
];

/** Offset from standard tuning if the tuning is standard shifted uniformly, else null. */
export const standardShift = (notes: number[]): number | null => {
  const k = notes[0] - STD[0];
  return notes.every((n, i) => n - STD[i] === k) ? k : null;
};

// ---------- Chords ----------
export type ChordType = 'maj' | 'min' | '7' | 'maj7' | 'm7' | 'sus2' | 'sus4' | 'dim' | 'aug' | '5';

export const CHORD_TYPES: { id: ChordType; suffix: string; intervals: number[]; optional?: number[] }[] = [
  { id: 'maj', suffix: '', intervals: [0, 4, 7] },
  { id: 'min', suffix: 'm', intervals: [0, 3, 7] },
  { id: '7', suffix: '7', intervals: [0, 4, 7, 10], optional: [7] },
  { id: 'maj7', suffix: 'maj7', intervals: [0, 4, 7, 11], optional: [7] },
  { id: 'm7', suffix: 'm7', intervals: [0, 3, 7, 10], optional: [7] },
  { id: 'sus2', suffix: 'sus2', intervals: [0, 2, 7] },
  { id: 'sus4', suffix: 'sus4', intervals: [0, 5, 7] },
  { id: 'dim', suffix: 'dim', intervals: [0, 3, 6] },
  { id: 'aug', suffix: 'aug', intervals: [0, 4, 8] },
  { id: '5', suffix: '5', intervals: [0, 7] },
];

export interface Chord {
  root: number; // pitch class 0–11
  type: ChordType;
}

export const chordDef = (type: ChordType) => CHORD_TYPES.find((c) => c.id === type)!;
export const chordName = (c: Chord): string => `${NOTE_NAMES[c.root]}${chordDef(c.type).suffix}`;
export const chordPitchClasses = (c: Chord): number[] => chordDef(c.type).intervals.map((i) => pc(c.root + i));

/** Fret per string; null = muted. */
export type Voicing = (number | null)[];

export const voicingToString = (v: Voicing): string =>
  v.map((f) => (f === null ? 'x' : f > 9 ? `(${f})` : String(f))).join('');

// Hand-written open shapes for standard tuning (low E → high E).
const OPEN_SHAPES: Record<string, string> = {
  C: 'x32010', A: 'x02220', G: '320003', E: '022100', D: 'xx0232', F: '133211',
  Am: 'x02210', Em: '022000', Dm: 'xx0231', Bm: 'x24432',
  A7: 'x02020', E7: '020100', D7: 'xx0212', G7: '320001', C7: 'x32310', B7: 'x21202',
  Amaj7: 'x02120', Cmaj7: 'x32000', Dmaj7: 'xx0222', Fmaj7: 'xx3210', Emaj7: '021100', Gmaj7: '320002',
  Am7: 'x02010', Em7: '022030', Dm7: 'xx0211',
  Asus2: 'x02200', Dsus2: 'xx0230', Esus2: '024400',
  Asus4: 'x02230', Dsus4: 'xx0233', Esus4: '022200',
  E5: '022xxx', A5: 'x022xx', D5: 'xx023x',
};

const parseShape = (s: string): Voicing => [...s].map((ch) => (ch === 'x' ? null : Number(ch)));

// Movable barre templates (fret offsets from the root fret) for standard tuning.
type Template = (number | null)[];
const E_SHAPE: Record<ChordType, Template> = {
  maj: [0, 2, 2, 1, 0, 0], min: [0, 2, 2, 0, 0, 0], '7': [0, 2, 0, 1, 0, 0], maj7: [0, null, 1, 1, 0, null],
  m7: [0, 2, 0, 0, 0, 0], sus2: [0, 2, 4, 4, null, null], sus4: [0, 2, 2, 2, 0, 0], dim: [0, 1, 2, 0, null, null],
  aug: [0, 3, 2, 1, 1, 0], '5': [0, 2, 2, null, null, null],
};
const A_SHAPE: Record<ChordType, Template> = {
  maj: [null, 0, 2, 2, 2, 0], min: [null, 0, 2, 2, 1, 0], '7': [null, 0, 2, 0, 2, 0], maj7: [null, 0, 2, 1, 2, 0],
  m7: [null, 0, 2, 0, 1, 0], sus2: [null, 0, 2, 2, 0, 0], sus4: [null, 0, 2, 2, 3, 0], dim: [null, 0, 1, 2, 1, null],
  aug: [null, 0, 3, 2, 2, 1], '5': [null, 0, 2, 2, null, null],
};

function standardVoicing(chord: Chord): Voicing {
  const shape = OPEN_SHAPES[chordName(chord)];
  if (shape) return parseShape(shape);
  const rE = pc(chord.root - 4);
  const rA = pc(chord.root - 9);
  const [r, t] = rA < rE ? [rA, A_SHAPE[chord.type]] : [rE, E_SHAPE[chord.type]];
  return t.map((o) => (o === null ? null : r + o));
}

/**
 * Find a playable voicing for `chord` on a tuning (capo excluded — the capo
 * transposes the shape, like on a real guitar).
 * Search: for each hand position, each string may be muted, open, or fretted
 * on a chord tone within a 4-fret span; score favours full, low, bass-rooted
 * voicings with few fingers and no interior mutes.
 */
export function findVoicing(chord: Chord, tuning: number[]): Voicing {
  const shift = standardShift(tuning);
  if (shift !== null) {
    // Uniformly shifted standard tuning: use the shape for the transposed chord.
    const shapeChord = { root: pc(chord.root - shift), type: chord.type };
    const v = standardVoicing(shapeChord);
    // A downward shift could need negative frets on open shapes; move up an octave then.
    if (v.every((f) => f === null || f >= 0)) return v;
    return v.map((f) => (f === null ? null : f + 12));
  }
  const def = chordDef(chord.type);
  const tones = new Set(chordPitchClasses(chord));
  const required = new Set(def.intervals.filter((i) => !def.optional?.includes(i)).map((i) => pc(chord.root + i)));
  const power = chord.type === '5';

  let best: Voicing = tuning.map(() => null);
  let bestScore = -Infinity;

  for (let pos = 0; pos <= 9; pos++) {
    const options: (number | null)[][] = tuning.map((open) => {
      const o: (number | null)[] = [null];
      if (tones.has(pc(open))) o.push(0);
      for (let f = Math.max(1, pos); f <= pos + 3; f++) if (tones.has(pc(open + f))) o.push(f);
      return o;
    });
    const cur: (number | null)[] = new Array(6).fill(null);
    const rec = (s: number) => {
      if (s === 6) {
        const score = scoreVoicing(cur, tuning, chord.root, required, power);
        if (score > bestScore) {
          bestScore = score;
          best = cur.slice();
        }
        return;
      }
      for (const f of options[s]) {
        cur[s] = f;
        rec(s + 1);
      }
    };
    rec(0);
  }
  return best;
}

function scoreVoicing(v: Voicing, tuning: number[], root: number, required: Set<number>, power: boolean): number {
  const played = v.map((f, i) => (f === null ? null : tuning[i] + f));
  const idx = played.map((n, i) => (n === null ? -1 : i)).filter((i) => i >= 0);
  if (idx.length < 2) return -Infinity;
  const lowest = played[idx[0]]!;
  if (pc(lowest) !== root) return -Infinity;
  const present = new Set(idx.map((i) => pc(played[i]!)));
  for (const r of required) if (!present.has(r)) return -Infinity;

  const fretted = v.filter((f): f is number => f !== null && f > 0);
  const minF = fretted.length ? Math.min(...fretted) : 0;
  const maxF = fretted.length ? Math.max(...fretted) : 0;
  if (maxF - minF > 3) return -Infinity;
  // Fingers: a barre at minF counts as one finger.
  const atMin = fretted.filter((f) => f === minF).length;
  const fingers = fretted.length - (atMin > 1 ? atMin - 1 : 0);
  if (fingers > 4) return -Infinity;
  if (atMin > 1) {
    // A barre covers every string from its first one upward: no open strings above it.
    const barreStart = v.findIndex((f) => f === minF);
    for (let i = barreStart + 1; i < 6; i++) if (v[i] === 0) return -Infinity;
  }

  const first = idx[0];
  const last = idx[idx.length - 1];
  const interiorMutes = last - first + 1 - idx.length;
  const opens = v.filter((f) => f === 0).length;

  let score = 0;
  if (power) {
    if (idx.length > 3) return -Infinity;
    score += idx.length * 6 - first * 4;
  } else {
    score += idx.length * 10;
    // Prefer voicings that reach the top string.
    score -= (5 - last) * 6;
  }
  score -= interiorMutes * 25;
  score -= minF * 2;
  score += opens * 2;
  score -= (maxF - minF) * 1.5;
  score -= fingers;
  return score;
}

// ---------- Keys ----------
export interface Key {
  root: number;
  mode: 'major' | 'minor';
}
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
export const keyName = (k: Key) => `${NOTE_NAMES[k.root]} ${k.mode}`;
export const scalePitchClasses = (k: Key): number[] => (k.mode === 'major' ? MAJOR : MINOR).map((i) => pc(k.root + i));

export const isDiatonic = (c: Chord, k: Key): boolean => {
  const scale = new Set(scalePitchClasses(k));
  return chordPitchClasses(c).every((p) => scale.has(p));
};

export function diatonicChords(k: Key): Chord[] {
  const out: Chord[] = [];
  for (const deg of scalePitchClasses(k)) {
    for (const t of CHORD_TYPES) {
      const c = { root: deg, type: t.id };
      if (isDiatonic(c, k)) out.push(c);
    }
  }
  return out;
}

/** 8 sensible default palette chords for a key. */
export function defaultPalette(k: Key): Chord[] {
  const s = scalePitchClasses(k);
  if (k.mode === 'major') {
    return [
      { root: s[0], type: 'maj' }, { root: s[3], type: 'maj' }, { root: s[4], type: 'maj' }, { root: s[5], type: 'min' },
      { root: s[1], type: 'min' }, { root: s[2], type: 'min' }, { root: s[4], type: '7' }, { root: s[0], type: 'maj7' },
    ];
  }
  return [
    { root: s[0], type: 'min' }, { root: s[3], type: 'min' }, { root: s[4], type: 'min' }, { root: s[5], type: 'maj' },
    { root: s[6], type: 'maj' }, { root: s[2], type: 'maj' }, { root: s[4], type: '7' }, { root: s[0], type: 'm7' },
  ];
}

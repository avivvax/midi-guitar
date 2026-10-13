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

export interface VoicingOptions {
  /** Largest distance between the lowest and highest fretted note (default 3 = four frets). */
  span?: number;
  /** Highest hand position searched (default 9). */
  maxPos?: number;
  /** Fret positions available, in semitones above open (diatonic necks); default chromatic. */
  frets?: number[];
  /** 'require' (default for 5+ strings): the lowest note must be the root; 'prefer': a bonus only (ukulele, mandolin …). */
  rootInBass?: 'require' | 'prefer';
  /** Courses that cannot be fretted: open if a chord tone, else muted. */
  openOnly?: number[];
  /** Use the guitar open-shape table when the tuning is (shifted) standard (default true for 6 strings). */
  guitarShapes?: boolean;
  /** Treat the fifth as optional (fallback for 3–4 course instruments). */
  optionalFifth?: boolean;
}

/**
 * Find a playable voicing for `chord` on a tuning of any number of courses
 * (capo excluded — the capo transposes the shape, like on a real guitar).
 * Search: for each hand position, each string may be muted, open, or fretted
 * on a chord tone within the span; score favours full, low, bass-rooted
 * voicings with few fingers and no interior mutes.
 */
export function findVoicing(chord: Chord, tuning: number[], opts: VoicingOptions = {}): Voicing {
  const n = tuning.length;
  const shift = n === 6 && opts.guitarShapes !== false ? standardShift(tuning) : null;
  if (shift !== null) {
    // Uniformly shifted standard tuning: use the shape for the transposed chord.
    const shapeChord = { root: pc(chord.root - shift), type: chord.type };
    const v = standardVoicing(shapeChord);
    // A downward shift could need negative frets on open shapes; move up an octave then.
    if (v.every((f) => f === null || f >= 0)) return v;
    return v.map((f) => (f === null ? null : f + 12));
  }
  const span = opts.span ?? 3;
  const maxPos = opts.maxPos ?? 9;
  const fretSet = opts.frets ?? Array.from({ length: maxPos + span + 1 }, (_, i) => i);
  const openOnly = new Set(opts.openOnly ?? []);
  const rootRule = opts.rootInBass ?? (n >= 5 ? 'require' : 'prefer');
  const def = chordDef(chord.type);
  const tones = new Set(chordPitchClasses(chord));
  const optional = opts.optionalFifth ? [...(def.optional ?? []), 7] : def.optional;
  const required = new Set(def.intervals.filter((i) => !optional?.includes(i)).map((i) => pc(chord.root + i)));
  const power = chord.type === '5';

  let best: Voicing = tuning.map(() => null);
  let bestScore = -Infinity;
  const cur: (number | null)[] = new Array(n).fill(null);

  for (let pos = 0; pos <= maxPos; pos++) {
    const options: (number | null)[][] = tuning.map((open, s) => {
      const o: (number | null)[] = [null];
      if (tones.has(pc(open))) o.push(0);
      if (openOnly.has(s)) return o;
      for (const f of fretSet) if (f >= Math.max(1, pos) && f <= pos + span && tones.has(pc(open + f))) o.push(f);
      return o;
    });
    // Depth-first over strings, pruning branches whose fretted notes already exceed the span.
    const rec = (s: number, lo: number, hi: number) => {
      if (s === n) {
        const score = scoreVoicing(cur, tuning, chord.root, required, power, rootRule, span, openOnly);
        if (score > bestScore) {
          bestScore = score;
          best = cur.slice();
        }
        return;
      }
      for (const f of options[s]) {
        if (f !== null && f > 0) {
          const l = Math.min(lo, f);
          const h = Math.max(hi, f);
          if (h - l > span) continue;
          cur[s] = f;
          rec(s + 1, l, h);
        } else {
          cur[s] = f;
          rec(s + 1, lo, hi);
        }
      }
    };
    rec(0, Infinity, -Infinity);
  }
  return best;
}

function scoreVoicing(
  v: Voicing,
  tuning: number[],
  root: number,
  required: Set<number>,
  power: boolean,
  rootRule: 'require' | 'prefer',
  span: number,
  openOnly: Set<number>,
): number {
  const n = v.length;
  const played = v.map((f, i) => (f === null ? null : tuning[i] + f));
  const idx = played.map((p, i) => (p === null ? -1 : i)).filter((i) => i >= 0);
  if (idx.length < Math.min(2, n)) return -Infinity;
  const lowestNote = Math.min(...idx.map((i) => played[i]!));
  const rootLow = pc(lowestNote) === root;
  if (!rootLow && rootRule === 'require') return -Infinity;
  const present = new Set(idx.map((i) => pc(played[i]!)));
  for (const r of required) if (!present.has(r)) return -Infinity;

  const fretted = v.filter((f): f is number => f !== null && f > 0);
  const minF = fretted.length ? Math.min(...fretted) : 0;
  const maxF = fretted.length ? Math.max(...fretted) : 0;
  if (maxF - minF > span) return -Infinity;
  // Fingers: one per fretted string; with more than four, a barre at minF must cover the rest
  // (a barre covers every string from its first one upward, so no open strings above it).
  let fingers = fretted.length;
  if (fingers > 4) {
    const atMin = fretted.filter((f) => f === minF).length;
    const barreStart = v.findIndex((f) => f === minF);
    if (atMin < 2 || v.some((f, i) => i > barreStart && f === 0)) return -Infinity;
    fingers -= atMin - 1;
    if (fingers > 4) return -Infinity;
  }

  // Interior mutes only count between fretted-capable strings (open-only drones may be skipped freely).
  const first = idx[0];
  const last = idx[idx.length - 1];
  let interiorMutes = 0;
  for (let i = first + 1; i < last; i++) if (v[i] === null && !openOnly.has(i)) interiorMutes++;
  const opens = v.filter((f) => f === 0).length;

  let score = 0;
  if (power) {
    if (idx.length > 3) return -Infinity;
    score += idx.length * 6 - first * 4;
  } else {
    score += idx.length * 10;
    // Prefer voicings that reach the top string.
    score -= (n - 1 - last) * 6;
  }
  if (rootRule === 'prefer' && rootLow) score += 6;
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

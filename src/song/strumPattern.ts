/**
 * Strum patterns for the auto-strummer. A bar is 8 eighth-note slots; a
 * chord lasting `beats` beats uses the first beats×2 slots (repeating the
 * pattern for chords longer than a bar).
 */
export type PatternId = 'folk' | 'quarters' | 'pop' | 'arpeggio';
export type Stroke = 'D' | 'U' | 'A';

export interface PatternDef {
  id: PatternId;
  label: string;
  /** Stroke per eighth-note slot (null = rest). Arpeggio uses 'A' with a pick index. */
  slots: (Stroke | null)[];
}

export const PATTERNS: PatternDef[] = [
  { id: 'folk', label: 'D-DU-UDU', slots: ['D', null, 'D', 'U', null, 'U', 'D', 'U'] },
  { id: 'quarters', label: 'D-D-D-D', slots: ['D', null, 'D', null, 'D', null, 'D', null] },
  { id: 'pop', label: 'D-DU-D-DU', slots: ['D', null, 'D', 'U', 'D', null, 'D', 'U'] },
  { id: 'arpeggio', label: 'ארפג׳ו', slots: ['A', 'A', 'A', 'A', 'A', 'A', 'A', 'A'] },
];

export const patternById = (id: PatternId): PatternDef => PATTERNS.find((p) => p.id === id) ?? PATTERNS[0];

export interface StrokeEvent {
  /** Slot index inside the chord (eighth notes from the chord start). */
  slot: number;
  stroke: Stroke;
  /** Downbeat of a bar (slot 0 of each group of 8): played a little harder. */
  accent: boolean;
}

/** Strokes for a chord of `beats` beats. */
export function chordStrokes(pattern: PatternDef, beats: number): StrokeEvent[] {
  const out: StrokeEvent[] = [];
  const n = Math.max(1, Math.round(beats * 2));
  for (let slot = 0; slot < n; slot++) {
    const stroke = pattern.slots[slot % pattern.slots.length];
    if (stroke) out.push({ slot, stroke, accent: slot % 8 === 0 });
  }
  return out;
}

export interface NoteHit {
  string: number;
  midi: number;
  /** Seconds after the stroke's nominal time. */
  offset: number;
  velocity: number;
}

/** Arpeggio pick order over the played strings: bass, then up and back (8 picks per bar). */
const ARP_ORDER = [0, 2, 3, 4, 5, 4, 3, 2];

/**
 * Notes for one stroke.
 *  - D: all played strings low→high; U: the top 3–4 strings high→low, lighter.
 *  - A: one string per slot following ARP_ORDER over the played strings.
 * `rand` (0..1) adds human variation: stroke speed, per-string velocity and
 * a few ms of timing jitter. Muted strings (null) are skipped.
 */
export function strokeNotes(
  stroke: Stroke,
  slot: number,
  accent: boolean,
  midis: (number | null)[],
  rand: () => number = Math.random,
): NoteHit[] {
  const played = midis.map((m, s) => (m === null ? null : { s, m })).filter((x): x is { s: number; m: number } => !!x);
  if (!played.length) return [];
  const base = stroke === 'U' ? 0.42 : stroke === 'A' ? 0.5 : 0.62;
  const strokeVel = Math.min(1, base + (accent ? 0.16 : 0) + (rand() - 0.5) * 0.14);
  const jitter = (rand() - 0.5) * 0.012;

  if (stroke === 'A') {
    const pick = played[Math.min(played.length - 1, Math.round((ARP_ORDER[slot % 8] / 5) * (played.length - 1)))];
    const v = slot % 8 === 0 ? Math.min(1, strokeVel + 0.1) : strokeVel;
    return [{ string: pick.s, midi: pick.m, offset: Math.max(0, jitter), velocity: clampVel(v) }];
  }

  const strings = stroke === 'D' ? played : played.slice(-Math.min(played.length, rand() < 0.5 ? 3 : 4)).reverse();
  // Harder strokes are faster: ~7–14 ms between strings.
  const spread = (0.014 - strokeVel * 0.007) * (0.85 + rand() * 0.3);
  return strings.map((p, i) => ({
    string: p.s,
    midi: p.m,
    offset: Math.max(0, jitter + i * spread),
    // Down strokes hit the bass a bit harder; up strokes the treble.
    velocity: clampVel(strokeVel * (stroke === 'D' ? 1 - i * 0.03 : 1 - i * 0.05) + (rand() - 0.5) * 0.08),
  }));
}

const clampVel = (v: number) => Math.max(0.08, Math.min(1, v));

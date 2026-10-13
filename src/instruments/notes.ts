/** Note-name helpers for writing instrument data readably ("E2 A2 D3", "F#3", "Bb2"). */

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C4" → 60, "F#3" → 54, "Bb2" → 46. */
export function noteToMidi(name: string): number {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name.trim());
  if (!m) throw new Error(`bad note name: ${name}`);
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return (Number(m[3]) + 1) * 12 + PC[m[1]] + acc;
}

/** "E2 A2 D3 G3 B3 E4" → [40, 45, 50, 55, 59, 64]. */
export const t = (notes: string): number[] => notes.trim().split(/\s+/).map(noteToMidi);

export const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
export const MAJOR_PENTA = [0, 2, 4, 7, 9];

/**
 * `count` ascending notes from `low` that belong to `scale` (semitone offsets)
 * built on pitch class `tonic`. `low` is raised to the first scale note.
 */
export function scaleRun(low: string | number, count: number, scale: number[] = MAJOR_STEPS, tonic = 0): number[] {
  const set = new Set(scale.map((s) => (s + tonic) % 12));
  const out: number[] = [];
  for (let m = typeof low === 'number' ? low : noteToMidi(low); out.length < count; m++) if (set.has(((m % 12) + 12) % 12)) out.push(m);
  return out;
}

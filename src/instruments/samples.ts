import data from './sampleSets.json';

/**
 * Sample sets (data in sampleSets.json, shared with tools/samples/fetch_samples.py).
 * Files: public/samples/<set>/<midi>.mp3, one every `step` semitones from lo to hi;
 * a note is played from the nearest sample (≤ 1–2 semitones of pitch shift).
 */
export interface SampleSet {
  id: string;
  gm: string;
  lo: number;
  hi: number;
  /** Bowed/sustained source: the engine shapes the length (bow stroke) itself. */
  sustained: boolean;
}

export const SAMPLE_STEP: number = data.step;
export const SAMPLE_SOURCE: string = data.source;

const SETS = data.sets as Record<string, { gm: string; lo: number; hi: number; sustained?: boolean }>;

export function getSampleSet(id: string | undefined): SampleSet | null {
  if (!id || !SETS[id]) return null;
  const s = SETS[id];
  return { id, gm: s.gm, lo: s.lo, hi: s.hi, sustained: !!s.sustained };
}

export const sampleSetIds = (): string[] => Object.keys(SETS);

/** MIDI notes that have a file. */
export function sampleNotes(set: SampleSet): number[] {
  const out: number[] = [];
  for (let m = set.lo; m <= set.hi; m += SAMPLE_STEP) out.push(m);
  return out;
}

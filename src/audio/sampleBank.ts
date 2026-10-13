import { getSampleSet, sampleNotes, type SampleSet } from '../instruments/samples';

export type SampleStatus = 'idle' | 'loading' | 'ready' | 'error';

interface Loaded {
  midi: number;
  buffer: AudioBuffer;
  /** Seconds of encoder padding / silence before the attack (skipped on playback). */
  onset: number;
}

/**
 * Lazy per-instrument sample loading. A set is fetched (all of its few dozen
 * small files) the first time an instrument that uses it is selected; until
 * then – or if anything fails – the engine plays the synth preset.
 */
export class SampleBank {
  private sets = new Map<string, { status: SampleStatus; notes: Loaded[]; promise: Promise<void> | null }>();
  onChange: ((setId: string, status: SampleStatus) => void) | null = null;

  constructor(
    private ctx: BaseAudioContext,
    private baseUrl: string,
  ) {}

  status(setId: string | undefined): SampleStatus {
    return (setId && this.sets.get(setId)?.status) || 'idle';
  }

  load(setId: string): Promise<void> {
    const set = getSampleSet(setId);
    if (!set) return Promise.resolve();
    let entry = this.sets.get(setId);
    if (entry?.promise) return entry.promise;
    entry = { status: 'loading', notes: [], promise: null };
    this.sets.set(setId, entry);
    const e = entry;
    this.onChange?.(setId, 'loading');
    e.promise = this.fetchAll(set)
      .then((notes) => {
        e.notes = notes;
        e.status = 'ready';
        this.onChange?.(setId, 'ready');
      })
      .catch(() => {
        e.status = 'error';
        e.promise = null; // allow a retry on the next selection
        this.onChange?.(setId, 'error');
      });
    return e.promise;
  }

  private async fetchAll(set: SampleSet): Promise<Loaded[]> {
    const notes = sampleNotes(set);
    const out = await Promise.all(
      notes.map(async (midi) => {
        const res = await fetch(`${this.baseUrl}samples/${set.id}/${midi}.mp3`);
        if (!res.ok) throw new Error(`${res.status} ${set.id}/${midi}`);
        const buffer = await this.ctx.decodeAudioData(await res.arrayBuffer());
        return { midi, buffer, onset: findOnset(buffer) };
      }),
    );
    return out.sort((a, b) => a.midi - b.midi);
  }

  /** Nearest sample for a note, with the playback rate that tunes it; null if the set isn't ready. */
  pick(setId: string, midi: number): { buffer: AudioBuffer; rate: number; onset: number } | null {
    const e = this.sets.get(setId);
    if (!e || e.status !== 'ready' || !e.notes.length) return null;
    let best = e.notes[0];
    for (const n of e.notes) if (Math.abs(n.midi - midi) < Math.abs(best.midi - midi)) best = n;
    return { buffer: best.buffer, rate: Math.pow(2, (midi - best.midi) / 12), onset: best.onset };
  }
}

/** First sample above −40 dB of the peak, minus 1 ms – skips MP3 encoder delay and leading silence. */
export function findOnset(buf: AudioBuffer): number {
  const d = buf.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  const th = peak * 0.01;
  let i = 0;
  while (i < d.length && Math.abs(d[i]) < th) i++;
  return Math.max(0, i / buf.sampleRate - 0.001);
}

export { getSampleSet };

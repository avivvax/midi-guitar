import { midiToFreq } from '../music/theory';
import { renderKarplusStrong, type KsOptions } from './karplus';

export type InstrumentId = 'acoustic' | 'electric' | 'bass' | 'distorted' | 'synth';

export const INSTRUMENTS: { id: InstrumentId; name: string }[] = [
  { id: 'acoustic', name: 'Acoustic' },
  { id: 'electric', name: 'Clean electric' },
  { id: 'bass', name: 'Bass' },
  { id: 'distorted', name: 'Distorted' },
  { id: 'synth', name: 'Synth lead' },
];

const KS_PRESETS: Record<Exclude<InstrumentId, 'synth'>, Omit<KsOptions, 'brightness'>> = {
  acoustic: { t60: 3.2, stretch: 0.5, pickPos: 0.13, duration: 3.5 },
  electric: { t60: 5, stretch: 0.42, pickPos: 0.2, duration: 4.5 },
  bass: { t60: 3.5, stretch: 0.5, pickPos: 0.25, duration: 3.5 },
  distorted: { t60: 6, stretch: 0.4, pickPos: 0.22, duration: 4.5 },
};

interface Voice {
  /** Pre-allocated per-string nodes. */
  filter: BiquadFilterNode;
  out: GainNode;
  /** Currently sounding note, for note-off on retrigger. */
  current: { stop: (when: number) => void } | null;
}

/** 'live' = the player's own strums; 'auto' = scheduled auto-strum (demo / guide). */
export type VoicePool = 'live' | 'auto';

const VEL_BUCKETS = 4;
const CACHE_MAX = 96;

/**
 * Low-latency Web Audio engine: one pre-allocated voice per string feeding an
 * instrument bus (swappable effect chain) → master, with a reverb send.
 */
export class AudioEngine {
  readonly ctx: AudioContext;
  private master: GainNode;
  private reverbSend: GainNode;
  private busIn: GainNode;
  private busOut: GainNode;
  private chainNodes: AudioNode[] = [];
  private chainSources: OscillatorNode[] = [];
  private voices: Voice[];
  /** Separate voices for auto-strum, so it never cuts off or delays the player's own strings. */
  private autoVoices: Voice[];
  private autoOut: GainNode;
  /** Every scheduled auto note that may still sound, so stopAuto() can silence them all. */
  private autoNotes = new Set<{ stop: (when: number) => void }>();
  private cache = new Map<string, AudioBuffer>();
  private noise: AudioBuffer;
  instrument: InstrumentId = 'acoustic';

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.15;
    this.master.connect(limiter).connect(ctx.destination);

    const convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(ctx, 2.2, 2.5);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.2;
    this.reverbSend.connect(convolver).connect(this.master);

    this.busIn = ctx.createGain();
    this.busOut = ctx.createGain();
    this.busOut.connect(this.master);
    this.busOut.connect(this.reverbSend);

    const makeVoices = (dest: AudioNode): Voice[] =>
      Array.from({ length: 6 }, () => {
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.Q.value = 0.7;
        const out = ctx.createGain();
        filter.connect(out).connect(dest);
        return { filter, out, current: null };
      });
    this.voices = makeVoices(this.busIn);
    // Auto voices go through the same instrument bus (so instrument changes apply live) at their own level.
    this.autoOut = ctx.createGain();
    this.autoOut.connect(this.busIn);
    this.autoVoices = makeVoices(this.autoOut);

    this.noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.08), ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.008));

    this.buildChain();
  }

  resume(): Promise<void> {
    return this.ctx.state === 'running' ? Promise.resolve() : this.ctx.resume();
  }

  /** Output latency estimate in ms (hardware + base). */
  get outputLatencyMs(): number {
    const c = this.ctx as AudioContext & { outputLatency?: number };
    return ((c.baseLatency ?? 0) + (c.outputLatency ?? 0)) * 1000;
  }

  setVolume(v: number): void {
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  setReverb(v: number): void {
    this.reverbSend.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  setInstrument(id: InstrumentId): void {
    if (id === this.instrument) return;
    this.instrument = id;
    for (let i = 0; i < 6; i++) {
      this.noteOff(i);
      this.noteOff(i, this.ctx.currentTime, 'auto');
    }
    this.buildChain();
  }

  private buildChain(): void {
    const ctx = this.ctx;
    this.busIn.disconnect();
    for (const n of this.chainNodes) n.disconnect();
    for (const o of this.chainSources) o.stop();
    this.chainNodes = [];
    this.chainSources = [];

    const chain: AudioNode[] = [];
    switch (this.instrument) {
      case 'electric': {
        const tone = ctx.createBiquadFilter();
        tone.type = 'lowpass';
        tone.frequency.value = 5500;
        // Light chorus: dry + modulated short delay.
        const split = ctx.createGain();
        const delay = ctx.createDelay(0.05);
        delay.delayTime.value = 0.012;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.8;
        const depth = ctx.createGain();
        depth.gain.value = 0.0025;
        lfo.connect(depth).connect(delay.delayTime);
        lfo.start();
        const wet = ctx.createGain();
        wet.gain.value = 0.45;
        const sum = ctx.createGain();
        sum.gain.value = 0.85;
        tone.connect(split);
        split.connect(sum);
        split.connect(delay).connect(wet).connect(sum);
        this.chainSources.push(lfo);
        this.chainNodes.push(tone, split, delay, depth, wet, sum, lfo);
        this.busIn.connect(tone);
        sum.connect(this.busOut);
        return;
      }
      case 'distorted': {
        const pre = ctx.createBiquadFilter();
        pre.type = 'highpass';
        pre.frequency.value = 120;
        const drive = ctx.createGain();
        drive.gain.value = 8;
        const shaper = ctx.createWaveShaper();
        shaper.curve = makeDistortionCurve(3.5);
        shaper.oversample = '4x';
        const cab = ctx.createBiquadFilter();
        cab.type = 'lowpass';
        cab.frequency.value = 4200;
        cab.Q.value = 0.9;
        const cab2 = ctx.createBiquadFilter();
        cab2.type = 'peaking';
        cab2.frequency.value = 1600;
        cab2.gain.value = -5;
        const post = ctx.createGain();
        post.gain.value = 0.25;
        chain.push(pre, drive, shaper, cab, cab2, post);
        break;
      }
      case 'bass': {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 2500;
        chain.push(lp);
        break;
      }
      default: {
        const g = ctx.createGain();
        chain.push(g);
      }
    }
    let node: AudioNode = this.busIn;
    for (const n of chain) {
      node.connect(n);
      node = n;
    }
    node.connect(this.busOut);
    this.chainNodes = chain;
  }

  private ksBuffer(id: Exclude<InstrumentId, 'synth'>, midi: number, velocity: number): AudioBuffer {
    const bucket = Math.min(VEL_BUCKETS - 1, Math.floor(velocity * VEL_BUCKETS));
    const key = `${id}:${midi}:${bucket}`;
    let buf = this.cache.get(key);
    if (buf) {
      // LRU refresh.
      this.cache.delete(key);
      this.cache.set(key, buf);
      return buf;
    }
    const p = KS_PRESETS[id];
    const sr = this.ctx.sampleRate;
    const data = renderKarplusStrong(sr, midiToFreq(midi), { ...p, brightness: 0.25 + 0.75 * ((bucket + 0.5) / VEL_BUCKETS) }, midi * 31 + bucket + 1);
    buf = this.ctx.createBuffer(1, data.length, sr);
    buf.copyToChannel(data, 0);
    this.cache.set(key, buf);
    if (this.cache.size > CACHE_MAX) this.cache.delete(this.cache.keys().next().value!);
    return buf;
  }

  /** Render buffers ahead of time (e.g. when a chord is selected). */
  warm(midis: number[]): void {
    if (this.instrument === 'synth') return;
    const id = this.instrument;
    const target = id === 'bass' ? -12 : 0;
    const work = midis.flatMap((m) => [1, 2, 3].map((b) => [m + target, b / VEL_BUCKETS] as const));
    const step = () => {
      const job = work.shift();
      if (!job || this.instrument !== id) return;
      this.ksBuffer(id, job[0], job[1]);
      setTimeout(step, 0);
    };
    setTimeout(step, 0);
  }

  /** Level of the auto-strum voices (1 = demo, low = guide under the player's own strums). */
  setAutoLevel(level: number, when = this.ctx.currentTime): void {
    this.autoOut.gain.setTargetAtTime(level, when, 0.03);
  }

  /** Silence every auto-strum voice now (stop / instrument change). */
  stopAuto(): void {
    const now = this.ctx.currentTime;
    for (const n of this.autoNotes) n.stop(now);
    this.autoNotes.clear();
    for (const v of this.autoVoices) v.current = null;
  }

  noteOff(string: number, when = this.ctx.currentTime, pool: VoicePool = 'live'): void {
    const v = (pool === 'auto' ? this.autoVoices : this.voices)[string];
    v.current?.stop(when);
    v.current = null;
  }

  /**
   * Play a note on a string. Live strums use the defaults (start now on the
   * live voices); auto-strum passes a future AudioContext time and pool 'auto'.
   * Returns the AudioContext time the note starts at.
   */
  pluck(string: number, midi: number, velocity: number, when?: number, pool: VoicePool = 'live'): number {
    const ctx = this.ctx;
    const v = (pool === 'auto' ? this.autoVoices : this.voices)[string];
    const now = Math.max(when ?? ctx.currentTime, ctx.currentTime);
    this.noteOff(string, now, pool);
    const vel = Math.max(0.02, Math.min(1, velocity));
    const gain = Math.pow(vel, 1.5);

    if (this.instrument === 'synth') {
      v.filter.frequency.setValueAtTime(20000, now);
      v.current = this.synthNote(v, midi, vel, gain, now);
      if (pool === 'auto' && v.current) {
        const h = v.current;
        this.autoNotes.add(h);
        setTimeout(() => this.autoNotes.delete(h), (now - ctx.currentTime + 5) * 1000);
      }
      return now;
    }
    const id = this.instrument;
    const note = id === 'bass' ? midi - 12 : midi;
    // Brightness: cutoff follows velocity.
    const cutoff = id === 'bass' ? 400 + vel * vel * 2500 : 1200 + vel * vel * 9000;
    v.filter.frequency.setValueAtTime(cutoff, now);

    const src = ctx.createBufferSource();
    src.buffer = this.ksBuffer(id, note, vel);
    const env = ctx.createGain();
    env.gain.value = gain;
    src.connect(env).connect(v.filter);
    src.start(now);
    const handle = {
      stop: (when: number) => {
        env.gain.cancelScheduledValues(when);
        env.gain.setValueAtTime(gain, when);
        env.gain.linearRampToValueAtTime(0, when + 0.012);
        src.stop(Math.max(when + 0.015, 0));
      },
    };
    src.onended = () => {
      env.disconnect();
      this.autoNotes.delete(handle);
    };
    if (pool === 'auto') this.autoNotes.add(handle);
    v.current = handle;
    return now;
  }

  private synthNote(v: Voice, midi: number, vel: number, gain: number, now: number): Voice['current'] {
    const ctx = this.ctx;
    const f = midiToFreq(midi);
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o2.type = 'sawtooth';
    o1.frequency.value = f;
    o2.frequency.value = f;
    o2.detune.value = 9;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.Q.value = 6;
    const peak = 800 + vel * 7000;
    filt.frequency.setValueAtTime(peak, now);
    filt.frequency.exponentialRampToValueAtTime(Math.max(300, f * 2), now + 0.35);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(0.3 * gain, now + 0.005);
    env.gain.setTargetAtTime(0.18 * gain, now + 0.005, 0.15);
    env.gain.setTargetAtTime(0, now + 1.2, 0.5);
    o1.connect(filt);
    o2.connect(filt);
    filt.connect(env).connect(v.filter);
    o1.start(now);
    o2.start(now);
    const end = now + 4;
    o1.stop(end);
    o2.stop(end);
    o1.onended = () => env.disconnect();
    return {
      stop: (when) => {
        env.gain.cancelScheduledValues(when);
        env.gain.setValueAtTime(env.gain.value, when);
        env.gain.linearRampToValueAtTime(0, when + 0.02);
        o1.stop(when + 0.025);
        o2.stop(when + 0.025);
      },
    };
  }

  /** Metronome tick at AudioContext time `when`; accented on the bar's first beat. Dry, straight to master. */
  metronomeClick(when: number, accent: boolean): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.frequency.value = accent ? 1600 : 1000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(accent ? 0.5 : 0.3, when + 0.001);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.04);
    osc.connect(g).connect(this.master);
    osc.start(when);
    osc.stop(when + 0.05);
    osc.onended = () => g.disconnect();
  }

  /** Percussive muted-string click. */
  click(string: number, velocity: number): number {
    const ctx = this.ctx;
    const v = this.voices[string];
    const now = ctx.currentTime;
    this.noteOff(string, now);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500 + string * 250;
    bp.Q.value = 1.5;
    const g = ctx.createGain();
    g.gain.value = 0.9 * Math.max(0.1, velocity);
    v.filter.frequency.setValueAtTime(8000, now);
    src.connect(bp).connect(g).connect(v.filter);
    src.start(now);
    src.onended = () => g.disconnect();
    return now;
  }
}

function makeImpulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // Darker tail: progressively stronger low-pass on the noise.
      const a = 0.9 - 0.75 * t;
      lp += a * (Math.random() * 2 - 1 - lp);
      d[i] = lp * Math.pow(1 - t, decay) * (i < ctx.sampleRate * 0.01 ? i / (ctx.sampleRate * 0.01) : 1);
    }
  }
  return buf;
}

function makeDistortionCurve(k: number): Float32Array<ArrayBuffer> {
  const n = 2048;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

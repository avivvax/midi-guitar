import { midiToFreq, pc } from '../music/theory';
import type { SampleSet } from '../instruments/samples';
import { DEFAULT_CUTOFF, SOUNDS, type BodyBand, type BowPreset, type Chain, type PluckPreset, type SoundPreset } from '../instruments/sounds';
import { renderBowed } from './bowed';
import { renderKarplusStrong } from './karplus';
import { SampleBank, type SampleStatus } from './sampleBank';

/** What the engine needs to know about the selected instrument. */
export interface EngineInstrument {
  /** Instrument id (cache key for rendered notes). */
  id: string;
  soundId: string;
  samples: SampleSet | null;
  /** Sympathetic strings (sitar taraf, hardanger understrings …). */
  sympathetic: number[];
  /** Continuous drone notes (hurdy-gurdy) and their level. */
  drone: number[];
  droneLevel: number;
  /** Re-pick each note rapidly (mandolin / bouzouki tremolo). */
  tremolo: boolean;
}

const DEFAULT_INSTRUMENT: EngineInstrument = {
  id: 'guitar-steel',
  soundId: 'steel',
  samples: null,
  sympathetic: [],
  drone: [],
  droneLevel: 0,
  tremolo: false,
};

interface Handle {
  stop: (when: number) => void;
}

interface Voice {
  /** Pre-allocated per-string nodes. */
  filter: BiquadFilterNode;
  out: GainNode;
  /** Notes started or scheduled on this string (several while a tremolo is scheduled). */
  notes: Set<Handle>;
}

/** 'live' = the player's own strums; 'auto' = scheduled auto-strum (demo / guide). */
export type VoicePool = 'live' | 'auto';

const VEL_BUCKETS = 4;
const CACHE_MAX = 160;
const TREMOLO_RATE = 12; // picks per second

/**
 * Low-latency Web Audio engine: one pre-allocated voice per physical string
 * feeding an instrument bus (body filters + effect chain) → master, with a
 * reverb send. Every note is a single AudioBufferSourceNode start: either a
 * sample or a buffer pre-rendered offline from the instrument's synth preset.
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
  private autoNotes = new Set<Handle>();
  private sympOut: GainNode;
  private sympNotes = new Map<number, Handle>();
  private drones: { stop: (when: number) => void }[] = [];
  private droneTimer = 0;
  private droneWave: PeriodicWave | null = null;
  private cache = new Map<string, AudioBuffer>();
  private noise: AudioBuffer;
  readonly samples: SampleBank;
  private spec: EngineInstrument = DEFAULT_INSTRUMENT;
  private chainKey = '';
  /** Called when a sample set finishes loading (or fails) – e.g. to refresh the UI. */
  onSampleStatus: ((setId: string, status: SampleStatus) => void) | null = null;

  constructor(baseUrl = import.meta.env.BASE_URL) {
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
        return { filter, out, notes: new Set<Handle>() };
      });
    this.voices = makeVoices(this.busIn);
    // Auto voices go through the same instrument bus (so instrument changes apply live) at their own level.
    this.autoOut = ctx.createGain();
    this.autoOut.connect(this.busIn);
    this.autoVoices = makeVoices(this.autoOut);
    this.sympOut = ctx.createGain();
    this.sympOut.connect(this.busIn);

    this.noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.08), ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.008));

    this.samples = new SampleBank(ctx, baseUrl);
    this.samples.onChange = (id, status) => {
      if (status === 'ready' && this.spec.samples?.id === id) this.buildChain();
      this.onSampleStatus?.(id, status);
    };
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

  get instrument(): EngineInstrument {
    return this.spec;
  }

  private get preset(): SoundPreset {
    return SOUNDS[this.spec.soundId] ?? SOUNDS.steel;
  }

  /** True while the instrument's samples are loaded and in use. */
  get usingSamples(): boolean {
    return !!this.spec.samples && this.samples.status(this.spec.samples.id) === 'ready';
  }

  setInstrument(spec: EngineInstrument): void {
    const prev = this.spec;
    this.spec = spec;
    if (prev.id !== spec.id || prev.soundId !== spec.soundId) {
      for (let i = 0; i < 6; i++) {
        this.noteOff(i);
        this.noteOff(i, this.ctx.currentTime, 'auto');
      }
      for (const h of this.sympNotes.values()) h.stop(this.ctx.currentTime);
      this.sympNotes.clear();
    }
    if (prev.drone.join() !== spec.drone.join()) this.stopDrone(0.3);
    if (spec.samples) void this.samples.load(spec.samples.id);
    this.buildChain();
  }

  private buildChain(): void {
    const preset = this.preset;
    // Samples carry their own body (and the GM overdrive/distortion sets their own amp).
    const sampled = this.usingSamples;
    const chainType: Chain = sampled ? (preset.chain === 'electric' || preset.chain === 'bass' ? preset.chain : 'clean') : preset.chain;
    const body = sampled ? [] : (preset.body ?? []);
    const key = `${chainType}|${JSON.stringify(body)}`;
    if (key === this.chainKey) return;
    this.chainKey = key;

    const ctx = this.ctx;
    this.busIn.disconnect();
    for (const n of this.chainNodes) n.disconnect();
    for (const o of this.chainSources) o.stop();
    this.chainNodes = [];
    this.chainSources = [];

    const chain: AudioNode[] = body.map((b) => bodyFilter(ctx, b));
    let tail: AudioNode | null = null;
    switch (chainType) {
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
        this.chainNodes.push(split, delay, depth, wet, lfo);
        chain.push(tone);
        tail = sum;
        break;
      }
      case 'overdrive':
      case 'distortion':
      case 'hurdy': {
        const amount = chainType === 'distortion' ? 3.5 : chainType === 'overdrive' ? 1.8 : 1.2;
        const pre = ctx.createBiquadFilter();
        pre.type = 'highpass';
        pre.frequency.value = chainType === 'hurdy' ? 200 : 120;
        const drive = ctx.createGain();
        drive.gain.value = chainType === 'distortion' ? 8 : chainType === 'overdrive' ? 4 : 2;
        const shaper = ctx.createWaveShaper();
        shaper.curve = makeDistortionCurve(amount);
        shaper.oversample = '4x';
        const cab = ctx.createBiquadFilter();
        cab.type = 'lowpass';
        cab.frequency.value = chainType === 'hurdy' ? 6000 : 4200;
        cab.Q.value = 0.9;
        const cab2 = ctx.createBiquadFilter();
        cab2.type = 'peaking';
        cab2.frequency.value = 1600;
        cab2.gain.value = -5;
        const post = ctx.createGain();
        post.gain.value = chainType === 'distortion' ? 0.25 : chainType === 'overdrive' ? 0.4 : 0.55;
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
      default:
        chain.push(ctx.createGain());
    }
    let node: AudioNode = this.busIn;
    for (const n of chain) {
      node.connect(n);
      node = n;
    }
    // The electric chain wires its own tone → chorus → sum; only its sum goes to the bus out.
    (tail ?? node).connect(this.busOut);
    this.chainNodes.push(...chain);
    if (tail) this.chainNodes.push(tail);
  }

  // ------------------------------------------------------------------ rendering

  private cached(key: string, render: () => Float32Array<ArrayBuffer>): AudioBuffer {
    let buf = this.cache.get(key);
    if (buf) {
      // LRU refresh.
      this.cache.delete(key);
      this.cache.set(key, buf);
      return buf;
    }
    const data = render();
    buf = this.ctx.createBuffer(1, data.length, this.ctx.sampleRate);
    buf.copyToChannel(data, 0);
    this.cache.set(key, buf);
    if (this.cache.size > CACHE_MAX) this.cache.delete(this.cache.keys().next().value!);
    return buf;
  }

  /** Pre-rendered synth note (plucked or bowed), course strings mixed in. */
  private synthBuffer(soundId: string, preset: PluckPreset | BowPreset, midi: number, bucket: number, extras: number[]): AudioBuffer {
    const key = `${soundId}:${midi}:${bucket}:${extras.join(',')}`;
    return this.cached(key, () => {
      const sr = this.ctx.sampleRate;
      const level = (bucket + 0.5) / VEL_BUCKETS;
      const one = (m: number, cents: number, seed: number) =>
        preset.kind === 'pluck'
          ? renderKarplusStrong(
              sr,
              midiToFreq(m) * Math.pow(2, cents / 1200),
              {
                t60: preset.t60,
                stretch: preset.stretch,
                pickPos: preset.pickPos,
                duration: preset.duration,
                brightness: preset.brightness[0] + (preset.brightness[1] - preset.brightness[0]) * level,
                buzz: preset.buzz,
                excitation: preset.excitation,
              },
              seed,
            )
          : renderBowed(
              sr,
              midiToFreq(m) * Math.pow(2, cents / 1200),
              {
                brightness: Math.min(1, preset.brightness + (level - 0.5) * 0.25),
                vibrato: preset.vibrato,
                attack: preset.attack * (1.3 - level * 0.6),
                // Harder strum = longer, stronger bow stroke.
                sustain: 0.35 + bucket * 0.55,
                release: 0.25,
                noise: preset.noise,
              },
              seed,
            );
      const main = one(midi, 0, midi * 31 + bucket + 1);
      if (!extras.length) return main;
      // Course strings: unison pairs slightly detuned, octave strings quieter.
      const out = main.slice();
      extras.forEach((off, k) => {
        const cents = off === 0 ? (preset.detune ?? 4) * (k % 2 ? -1 : 1) : 0;
        const gain = off === 0 ? 0.85 : off > 0 ? 0.5 : 0.7;
        const s = one(midi + off, cents, midi * 17 + k * 7 + bucket + 3);
        for (let i = 0; i < out.length && i < s.length; i++) out[i] += gain * s[i];
      });
      let peak = 1e-9;
      for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
      if (peak > 1) for (let i = 0; i < out.length; i++) out[i] /= peak;
      return out;
    });
  }

  /** Render buffers ahead of time (e.g. when a chord is selected). */
  warm(notes: { midi: number; extras: number[] }[]): void {
    const preset = this.preset;
    if (preset.kind === 'synth' || this.usingSamples) return;
    const id = this.spec.soundId;
    const work = notes.flatMap((n) => [1, 2, 3].map((b) => [n.midi, b, n.extras] as const));
    const step = () => {
      const job = work.shift();
      if (!job || this.spec.soundId !== id) return;
      this.synthBuffer(id, preset, job[0], job[1], job[2]);
      setTimeout(step, 0);
    };
    setTimeout(step, 0);
  }

  // ------------------------------------------------------------------ playing

  /** Level of the auto-strum voices (1 = demo, low = guide under the player's own strums). */
  setAutoLevel(level: number, when = this.ctx.currentTime): void {
    this.autoOut.gain.setTargetAtTime(level, when, 0.03);
  }

  /** Silence every auto-strum voice now (stop / instrument change). */
  stopAuto(): void {
    const now = this.ctx.currentTime;
    for (const n of this.autoNotes) n.stop(now);
    this.autoNotes.clear();
    for (const v of this.autoVoices) v.notes.clear();
  }

  noteOff(string: number, when = this.ctx.currentTime, pool: VoicePool = 'live'): void {
    const v = (pool === 'auto' ? this.autoVoices : this.voices)[string];
    for (const h of v.notes) h.stop(when);
    v.notes.clear();
  }

  /**
   * Play a note on a (physical) string. Live strums use the defaults (start
   * now on the live voices); auto-strum passes a future AudioContext time and
   * pool 'auto'. `extras` = the course's other strings (semitone offsets).
   * Returns the AudioContext time the note starts at.
   */
  pluck(string: number, midi: number, velocity: number, when?: number, pool: VoicePool = 'live', extras: number[] = []): number {
    const ctx = this.ctx;
    const v = (pool === 'auto' ? this.autoVoices : this.voices)[string];
    const now = Math.max(when ?? ctx.currentTime, ctx.currentTime);
    this.noteOff(string, now, pool);
    const vel = Math.max(0.02, Math.min(1, velocity));
    const preset = this.preset;
    const [base, range] = preset.cutoff ?? (preset.kind === 'bow' ? [1500, 9000] : DEFAULT_CUTOFF);
    v.filter.frequency.setValueAtTime(preset.kind === 'synth' ? 20000 : base + vel * vel * range, now);

    const track = (h: Handle | null) => {
      if (!h) return;
      v.notes.add(h);
      if (pool === 'auto') this.autoNotes.add(h);
    };
    if (this.spec.tremolo && pool === 'live' && preset.kind !== 'bow') {
      // Tremolo: re-pick at ~12 Hz for a time that grows with the strum strength.
      const count = Math.max(2, Math.round((0.25 + 1.4 * vel) * TREMOLO_RATE));
      let prev: Handle | null = null;
      for (let k = 0; k < count; k++) {
        const t = now + k / TREMOLO_RATE;
        prev?.stop(t);
        const kv = vel * Math.pow(0.985, k) * (k % 2 ? 0.82 : 1);
        prev = this.playNote(v, midi, kv, t, extras, pool);
        track(prev);
      }
    } else {
      track(this.playNote(v, midi, vel, now, extras, pool));
    }
    this.sympathetic(midi, vel, now);
    if (this.spec.drone.length && pool === 'live') this.keepDrone(now);
    return now;
  }

  private playNote(v: Voice, midi: number, vel: number, when: number, extras: number[], pool: VoicePool): Handle | null {
    const preset = this.preset;
    const gain = Math.pow(vel, 1.5);
    if (preset.kind === 'synth') return this.synthNote(v, midi, vel, gain, when);
    const set = this.spec.samples;
    const sample = set ? this.samples.pick(set.id, midi) : null;
    if (set && sample) return this.sampleNote(v, set, midi, vel, gain, when, extras, pool);

    const bucket = Math.min(VEL_BUCKETS - 1, Math.floor(vel * VEL_BUCKETS));
    const src = this.ctx.createBufferSource();
    src.buffer = this.synthBuffer(this.spec.soundId, preset, midi, bucket, extras);
    const env = this.ctx.createGain();
    env.gain.value = gain * (preset.kind === 'bow' ? 0.6 : 1);
    src.connect(env).connect(v.filter);
    src.start(when);
    const fade = preset.kind === 'bow' ? 0.08 : 0.012;
    const h: Handle = {
      stop: (t: number) => {
        env.gain.cancelScheduledValues(t);
        env.gain.setValueAtTime(env.gain.value, t);
        env.gain.linearRampToValueAtTime(0, t + fade);
        src.stop(Math.max(t + fade + 0.003, 0));
      },
    };
    src.onended = () => {
      env.disconnect();
      v.notes.delete(h);
      this.autoNotes.delete(h);
    };
    return h;
  }

  private sampleNote(v: Voice, set: SampleSet, midi: number, vel: number, gain: number, when: number, extras: number[], pool: VoicePool): Handle {
    const ctx = this.ctx;
    const env = ctx.createGain();
    env.gain.value = 0;
    env.connect(v.filter);
    const sources: AudioBufferSourceNode[] = [];
    const add = (m: number, cents: number, g: number) => {
      const pick = this.samples.pick(set.id, m);
      if (!pick) return;
      const src = ctx.createBufferSource();
      src.buffer = pick.buffer;
      src.playbackRate.value = pick.rate;
      src.detune.value = cents;
      const sg = ctx.createGain();
      sg.gain.value = g;
      src.connect(sg).connect(env);
      src.start(when, pick.onset);
      src.onended = () => sg.disconnect();
      sources.push(src);
    };
    add(midi, 0, 1);
    extras.forEach((off, k) => add(midi + off, off === 0 ? (SOUNDS[this.spec.soundId]?.detune ?? 5) * (k % 2 ? -1 : 1) : 0, off === 0 ? 0.8 : 0.5));
    env.gain.setValueAtTime(gain * (extras.length ? 0.75 : 1), when);
    let end = when + (sources[0]?.buffer?.duration ?? 4);
    if (set.sustained) {
      // Bowed samples: the strum sets the bow stroke – harder = longer.
      const release = when + 0.35 + 1.9 * vel;
      env.gain.setValueAtTime(gain, release);
      env.gain.linearRampToValueAtTime(0, release + 0.25);
      end = Math.min(end, release + 0.3);
      for (const s of sources) s.stop(end);
    }
    const h: Handle = {
      stop: (t: number) => {
        const fade = set.sustained ? 0.08 : 0.015;
        env.gain.cancelScheduledValues(t);
        env.gain.setValueAtTime(env.gain.value, t);
        env.gain.linearRampToValueAtTime(0, t + fade);
        for (const s of sources) s.stop(Math.max(t + fade + 0.003, 0));
      },
    };
    const first = sources[0];
    if (first) {
      first.addEventListener('ended', () => {
        env.disconnect();
        v.notes.delete(h);
        if (pool === 'auto') this.autoNotes.delete(h);
      });
    }
    return h;
  }

  /** Sympathetic strings ring softly when the played note (or its fifth partial) matches them. */
  private sympathetic(midi: number, vel: number, when: number): void {
    const strings = this.spec.sympathetic;
    if (!strings.length) return;
    const preset = SOUNDS.harp as PluckPreset;
    for (const s of strings) {
      const rel = pc(midi - s);
      const amp = rel === 0 ? 0.12 : pc(midi + 7 - s) === 0 ? 0.045 : 0;
      if (!amp) continue;
      this.sympNotes.get(s)?.stop(when + 0.02);
      const src = this.ctx.createBufferSource();
      src.buffer = this.synthBuffer('symp', { ...preset, t60: 6, duration: 6, brightness: [0.1, 0.2] }, s, 0, []);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(amp * vel, when + 0.06);
      src.connect(g).connect(this.sympOut);
      src.start(when);
      const h = {
        stop: (t: number) => {
          g.gain.cancelScheduledValues(t);
          g.gain.setValueAtTime(g.gain.value, t);
          g.gain.linearRampToValueAtTime(0, t + 0.05);
          src.stop(t + 0.06);
        },
      };
      src.onended = () => {
        g.disconnect();
        if (this.sympNotes.get(s) === h) this.sympNotes.delete(s);
      };
      this.sympNotes.set(s, h);
    }
  }

  /** Drone (hurdy-gurdy): sounds while notes are being played, fades out ~2.5 s after the last one. */
  private keepDrone(now: number): void {
    const ctx = this.ctx;
    if (!this.drones.length) {
      const wave = (this.droneWave ??= makeDroneWave(ctx));
      for (const m of this.spec.drone) {
        const osc = ctx.createOscillator();
        osc.setPeriodicWave(wave);
        osc.frequency.value = midiToFreq(m);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(this.spec.droneLevel / this.spec.drone.length, now + 0.25);
        osc.connect(g).connect(this.busIn);
        osc.start(now);
        this.drones.push({
          stop: (t) => {
            g.gain.cancelScheduledValues(t);
            g.gain.setValueAtTime(g.gain.value, t);
            g.gain.linearRampToValueAtTime(0, t + 0.8);
            osc.stop(t + 0.85);
            osc.onended = () => g.disconnect();
          },
        });
      }
    }
    clearTimeout(this.droneTimer);
    this.droneTimer = window.setTimeout(() => this.stopDrone(0), 2500);
  }

  private stopDrone(delay: number): void {
    clearTimeout(this.droneTimer);
    const t = this.ctx.currentTime + delay;
    for (const d of this.drones) d.stop(t);
    this.drones = [];
  }

  private synthNote(v: Voice, midi: number, vel: number, gain: number, now: number): Handle {
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
    const h: Handle = {
      stop: (when) => {
        env.gain.cancelScheduledValues(when);
        env.gain.setValueAtTime(env.gain.value, when);
        env.gain.linearRampToValueAtTime(0, when + 0.02);
        o1.stop(when + 0.025);
        o2.stop(when + 0.025);
      },
    };
    o1.onended = () => {
      env.disconnect();
      v.notes.delete(h);
      this.autoNotes.delete(h);
    };
    return h;
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

function bodyFilter(ctx: BaseAudioContext, b: BodyBand): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = b.type;
  f.frequency.value = b.freq;
  if (b.gain !== undefined) f.gain.value = b.gain;
  f.Q.value = b.q ?? (b.type === 'peaking' ? 1 : 0.7);
  return f;
}

function makeDroneWave(ctx: BaseAudioContext): PeriodicWave {
  const n = 16;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let k = 1; k < n; k++) imag[k] = 1 / Math.pow(k, 1.2);
  return ctx.createPeriodicWave(real, imag);
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

/**
 * Synth presets (data). Every instrument names one; it is what plays until
 * (or instead of) a sample set. Rendered offline per note into an
 * AudioBuffer, so playing a note is a single buffer start.
 *
 *  pluck – extended Karplus-Strong (see audio/karplus.ts); `buzz` = bridge
 *          nonlinearity (sitar jawari, shamisen sawari), `excitation`
 *          'hammer' for struck strings
 *  bow   – wavetable bowed tone: attack, sustain set by the strum velocity
 *          (bow pressure → loudness, brightness and bow length), delayed
 *          vibrato, bow noise
 *  synth – the original sawtooth lead
 *
 * `body` filters run once on the instrument bus (body resonances / formants);
 * `chain` picks the effect chain (amp, distortion …).
 */

export type Chain = 'clean' | 'electric' | 'overdrive' | 'distortion' | 'bass' | 'hurdy';

export interface BodyBand {
  type: 'peaking' | 'lowpass' | 'highpass' | 'highshelf' | 'lowshelf';
  freq: number;
  gain?: number;
  q?: number;
}

interface Common {
  chain: Chain;
  body?: BodyBand[];
  /** Voice low-pass: cutoff = base + velocity² · range (Hz). */
  cutoff?: [number, number];
  /** Detune of unison course strings, in cents. */
  detune?: number;
}

export interface PluckPreset extends Common {
  kind: 'pluck';
  t60: number;
  stretch: number;
  pickPos: number;
  /** Excitation brightness at the softest and hardest velocity. */
  brightness: [number, number];
  duration: number;
  buzz?: number;
  excitation?: 'noise' | 'hammer';
}

export interface BowPreset extends Common {
  kind: 'bow';
  brightness: number;
  vibrato: { rate: number; cents: number; delay: number };
  attack: number;
  noise: number;
}

export interface SynthPreset extends Common {
  kind: 'synth';
}

export type SoundPreset = PluckPreset | BowPreset | SynthPreset;

const pk = (o: Omit<PluckPreset, 'kind' | 'chain'> & { chain?: Chain }): PluckPreset => ({ kind: 'pluck', chain: 'clean', ...o });
const bw = (o: Omit<BowPreset, 'kind' | 'chain' | 'cutoff'> & { chain?: Chain }): BowPreset => ({
  kind: 'bow',
  chain: 'clean',
  cutoff: [1500, 9000],
  ...o,
});

export const SOUNDS: Record<string, SoundPreset> = {
  // Guitars (the first four keep the original engine's values).
  steel: pk({ t60: 3.2, stretch: 0.5, pickPos: 0.13, brightness: [0.25, 1], duration: 3.5, body: [{ type: 'peaking', freq: 110, gain: 3 }, { type: 'peaking', freq: 2500, gain: 2 }] }),
  nylon: pk({ t60: 2.6, stretch: 0.55, pickPos: 0.18, brightness: [0.15, 0.75], duration: 3, body: [{ type: 'peaking', freq: 100, gain: 3 }, { type: 'highshelf', freq: 4000, gain: -4 }] }),
  electric: pk({ t60: 5, stretch: 0.42, pickPos: 0.2, brightness: [0.25, 1], duration: 4.5, chain: 'electric' }),
  overdrive: pk({ t60: 6, stretch: 0.4, pickPos: 0.22, brightness: [0.25, 1], duration: 4.5, chain: 'overdrive' }),
  distortion: pk({ t60: 6, stretch: 0.4, pickPos: 0.22, brightness: [0.25, 1], duration: 4.5, chain: 'distortion' }),
  bass: pk({ t60: 3.5, stretch: 0.5, pickPos: 0.25, brightness: [0.25, 1], duration: 3.5, chain: 'bass', cutoff: [400, 2500] }),
  lapsteel: pk({ t60: 7, stretch: 0.42, pickPos: 0.2, brightness: [0.25, 0.9], duration: 6, chain: 'electric', body: [{ type: 'lowpass', freq: 4500 }] }),
  resonator: pk({
    t60: 3, stretch: 0.4, pickPos: 0.12, brightness: [0.4, 1], duration: 3.5,
    body: [{ type: 'highpass', freq: 120 }, { type: 'peaking', freq: 900, gain: 6, q: 2 }, { type: 'peaking', freq: 2400, gain: 4 }],
  }),
  synth: { kind: 'synth', chain: 'clean' },

  // Small plucked.
  uke: pk({ t60: 1.5, stretch: 0.55, pickPos: 0.2, brightness: [0.2, 0.8], duration: 2, body: [{ type: 'peaking', freq: 400, gain: 3 }, { type: 'highshelf', freq: 5000, gain: -3 }] }),
  'uke-tenor': pk({ t60: 2, stretch: 0.55, pickPos: 0.18, brightness: [0.2, 0.8], duration: 2.5, body: [{ type: 'peaking', freq: 300, gain: 3 }, { type: 'highshelf', freq: 5000, gain: -3 }] }),
  banjo: pk({
    t60: 1.2, stretch: 0.35, pickPos: 0.08, brightness: [0.5, 1], duration: 1.8,
    body: [{ type: 'highpass', freq: 150 }, { type: 'peaking', freq: 1000, gain: 6, q: 1.5 }, { type: 'peaking', freq: 3000, gain: 4 }],
  }),
  mandolin: pk({ t60: 1.6, stretch: 0.4, pickPos: 0.1, brightness: [0.4, 1], duration: 2.2, detune: 6, body: [{ type: 'peaking', freq: 700, gain: 3 }, { type: 'peaking', freq: 2800, gain: 3 }] }),
  bouzouki: pk({ t60: 3, stretch: 0.4, pickPos: 0.1, brightness: [0.4, 1], duration: 3.5, detune: 5, body: [{ type: 'peaking', freq: 300, gain: 2 }, { type: 'peaking', freq: 2500, gain: 3 }] }),
  balalaika: pk({ t60: 1.4, stretch: 0.4, pickPos: 0.1, brightness: [0.4, 1], duration: 2, body: [{ type: 'peaking', freq: 900, gain: 3 }] }),
  lute: pk({ t60: 2.2, stretch: 0.55, pickPos: 0.15, brightness: [0.15, 0.65], duration: 2.6, detune: 4, body: [{ type: 'peaking', freq: 250, gain: 3 }, { type: 'highshelf', freq: 3500, gain: -5 }] }),

  // Middle East / Asia.
  oud: pk({
    t60: 1.7, stretch: 0.5, pickPos: 0.09, brightness: [0.3, 0.85], duration: 2.2, detune: 4,
    body: [{ type: 'peaking', freq: 180, gain: 4 }, { type: 'peaking', freq: 1200, gain: -2 }, { type: 'highshelf', freq: 5000, gain: -4 }],
  }),
  saz: pk({ t60: 2.8, stretch: 0.38, pickPos: 0.08, brightness: [0.4, 1], duration: 3.2, buzz: 0.15, detune: 5, body: [{ type: 'peaking', freq: 1500, gain: 3 }] }),
  qanun: pk({ t60: 2.5, stretch: 0.4, pickPos: 0.12, brightness: [0.4, 1], duration: 3, detune: 6, body: [{ type: 'peaking', freq: 2200, gain: 3 }] }),
  sitar: pk({ t60: 5, stretch: 0.3, pickPos: 0.1, brightness: [0.5, 1], duration: 5.5, buzz: 0.55, body: [{ type: 'peaking', freq: 600, gain: 3 }, { type: 'peaking', freq: 3000, gain: 4 }] }),
  sarod: pk({ t60: 2.2, stretch: 0.35, pickPos: 0.1, brightness: [0.5, 1], duration: 3, buzz: 0.2, body: [{ type: 'peaking', freq: 1000, gain: 4 }] }),
  tanpura: pk({ t60: 9, stretch: 0.3, pickPos: 0.2, brightness: [0.3, 0.7], duration: 9, buzz: 0.6 }),
  pipa: pk({ t60: 1.4, stretch: 0.4, pickPos: 0.12, brightness: [0.4, 1], duration: 2, body: [{ type: 'peaking', freq: 1500, gain: 3 }] }),
  shamisen: pk({
    t60: 0.9, stretch: 0.35, pickPos: 0.06, brightness: [0.6, 1], duration: 1.5, buzz: 0.35,
    body: [{ type: 'highpass', freq: 120 }, { type: 'peaking', freq: 1200, gain: 5 }],
  }),
  guzheng: pk({ t60: 3.5, stretch: 0.4, pickPos: 0.15, brightness: [0.35, 1], duration: 4, body: [{ type: 'peaking', freq: 300, gain: 3 }, { type: 'peaking', freq: 2400, gain: 2 }] }),
  koto: pk({ t60: 2.6, stretch: 0.45, pickPos: 0.15, brightness: [0.3, 0.9], duration: 3 }),

  // Harps / zithers.
  harp: pk({ t60: 4.5, stretch: 0.55, pickPos: 0.5, brightness: [0.15, 0.6], duration: 5, body: [{ type: 'peaking', freq: 200, gain: 3 }] }),
  lyre: pk({ t60: 3, stretch: 0.55, pickPos: 0.3, brightness: [0.15, 0.65], duration: 3.5 }),
  autoharp: pk({ t60: 3.5, stretch: 0.45, pickPos: 0.12, brightness: [0.3, 0.9], duration: 4 }),
  zither: pk({ t60: 4, stretch: 0.4, pickPos: 0.12, brightness: [0.35, 1], duration: 4.5 }),
  hammered: pk({ t60: 3.5, stretch: 0.4, pickPos: 0.12, brightness: [0.4, 1], duration: 4, detune: 5, excitation: 'hammer' }),

  // Bowed.
  violin: bw({
    brightness: 0.65, vibrato: { rate: 5.8, cents: 12, delay: 0.25 }, attack: 0.07, noise: 0.03,
    body: [{ type: 'peaking', freq: 280, gain: 3 }, { type: 'peaking', freq: 450, gain: 2 }, { type: 'peaking', freq: 3000, gain: 5, q: 1.2 }, { type: 'lowpass', freq: 9000 }],
  }),
  viola: bw({
    brightness: 0.55, vibrato: { rate: 5.5, cents: 12, delay: 0.25 }, attack: 0.08, noise: 0.03,
    body: [{ type: 'peaking', freq: 220, gain: 3 }, { type: 'peaking', freq: 1700, gain: 3 }, { type: 'lowpass', freq: 7000 }],
  }),
  cello: bw({
    brightness: 0.5, vibrato: { rate: 5.2, cents: 14, delay: 0.3 }, attack: 0.09, noise: 0.03,
    body: [{ type: 'peaking', freq: 110, gain: 3 }, { type: 'peaking', freq: 300, gain: 3 }, { type: 'peaking', freq: 1500, gain: 3 }, { type: 'lowpass', freq: 5000 }],
  }),
  contrabass: bw({
    brightness: 0.45, vibrato: { rate: 4.8, cents: 12, delay: 0.35 }, attack: 0.12, noise: 0.02,
    body: [{ type: 'peaking', freq: 70, gain: 3 }, { type: 'peaking', freq: 250, gain: 3 }, { type: 'lowpass', freq: 3000 }],
  }),
  fiddle: bw({
    brightness: 0.7, vibrato: { rate: 5.5, cents: 8, delay: 0.3 }, attack: 0.05, noise: 0.04,
    body: [{ type: 'peaking', freq: 300, gain: 3 }, { type: 'peaking', freq: 2800, gain: 5 }],
  }),
  kemenche: bw({
    brightness: 0.75, vibrato: { rate: 6, cents: 18, delay: 0.2 }, attack: 0.05, noise: 0.05,
    body: [{ type: 'peaking', freq: 700, gain: 4, q: 2 }, { type: 'peaking', freq: 2500, gain: 5 }],
  }),
  erhu: bw({
    brightness: 0.7, vibrato: { rate: 6, cents: 22, delay: 0.2 }, attack: 0.06, noise: 0.05,
    body: [{ type: 'highpass', freq: 200 }, { type: 'peaking', freq: 900, gain: 6, q: 2.5 }, { type: 'peaking', freq: 2200, gain: 4 }],
  }),
  hurdy: bw({ brightness: 0.85, vibrato: { rate: 0, cents: 0, delay: 0 }, attack: 0.04, noise: 0.06, chain: 'hurdy', body: [{ type: 'peaking', freq: 1200, gain: 4 }] }),
  psaltery: bw({ brightness: 0.45, vibrato: { rate: 5, cents: 6, delay: 0.3 }, attack: 0.15, noise: 0.02, body: [{ type: 'peaking', freq: 2000, gain: 2 }] }),
};

export const DEFAULT_CUTOFF: [number, number] = [1200, 9000];

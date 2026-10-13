/**
 * Offline bowed-string tone: a band-limited wavetable (sawtooth-like
 * Helmholtz spectrum, brighter with more bow pressure) read with delayed
 * vibrato, under a bow-stroke envelope (attack swell, sustain with slight bow
 * fluctuation, release), plus bow noise. Body resonances are applied live by
 * the instrument bus filters.
 */
export interface BowOptions {
  /** 0..1 – spectral tilt (bow pressure / contact point). */
  brightness: number;
  vibrato: { rate: number; cents: number; delay: number };
  attack: number;
  /** Seconds of full bow after the attack (the stroke length). */
  sustain: number;
  release: number;
  noise: number;
}

const TABLE = 2048;

export function renderBowed(sampleRate: number, freq: number, o: BowOptions, seed = 1): Float32Array<ArrayBuffer> {
  const harmonics = Math.max(1, Math.min(48, Math.floor((sampleRate * 0.45) / freq)));
  const tilt = 1.9 - 1.1 * Math.max(0, Math.min(1, o.brightness));
  const table = new Float32Array(TABLE + 1);
  for (let k = 1; k <= harmonics; k++) {
    const a = 1 / Math.pow(k, tilt);
    for (let i = 0; i < TABLE; i++) table[i] += a * Math.sin((2 * Math.PI * k * i) / TABLE);
  }
  let peak = 1e-9;
  for (let i = 0; i < TABLE; i++) peak = Math.max(peak, Math.abs(table[i]));
  for (let i = 0; i < TABLE; i++) table[i] /= peak;
  table[TABLE] = table[0];

  let rnd = seed >>> 0 || 1;
  const noise = () => {
    rnd ^= rnd << 13;
    rnd ^= rnd >>> 17;
    rnd ^= rnd << 5;
    return ((rnd >>> 0) / 4294967296) * 2 - 1;
  };

  const total = o.attack + o.sustain + o.release;
  const len = Math.max(1, Math.floor(total * sampleRate));
  const out = new Float32Array(len);
  let phase = 0;
  let wobble = 0;
  let prevNoise = 0;
  for (let n = 0; n < len; n++) {
    const t = n / sampleRate;
    const vibOn = Math.max(0, Math.min(1, (t - o.vibrato.delay) / 0.3));
    const cents = o.vibrato.cents * vibOn * Math.sin(2 * Math.PI * o.vibrato.rate * t);
    phase += ((freq * Math.pow(2, cents / 1200)) / sampleRate) * TABLE;
    if (phase >= TABLE) phase -= TABLE;
    const i = Math.floor(phase);
    const tone = table[i] + (table[i + 1] - table[i]) * (phase - i);

    let env: number;
    if (t < o.attack) env = 0.5 - 0.5 * Math.cos((Math.PI * t) / o.attack);
    else if (t < o.attack + o.sustain) env = 1 - 0.15 * ((t - o.attack) / Math.max(0.01, o.sustain));
    else env = 0.85 * Math.max(0, 1 - (t - o.attack - o.sustain) / o.release);
    // Slow bow-pressure fluctuation (±3 %).
    wobble += 0.0005 * (noise() - wobble);
    const nz = noise();
    const scratch = (nz - prevNoise) * 0.5;
    prevNoise = nz;
    const noiseAmt = o.noise * (t < o.attack * 1.5 ? 2.5 : 1);
    out[n] = env * (tone * (1 + 0.06 * wobble) + scratch * noiseAmt);
  }
  return out;
}

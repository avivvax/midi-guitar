/**
 * Extended Karplus-Strong (Jaffe & Smith):
 *  - noise burst excitation, low-passed by velocity (harder = brighter);
 *  - pick-position comb filter on the excitation;
 *  - two-point loop filter with stretch factor S and loss factor rho for decay;
 *  - first-order all-pass for fractional delay (accurate tuning).
 * Rendered offline into a Float32Array so playback is a single
 * AudioBufferSourceNode start (lowest possible latency and CPU on phones).
 */
export interface KsOptions {
  /** Seconds until −60 dB at the fundamental. */
  t60: number;
  /** Loop filter stretch 0..1 (0.5 = classic average; lower = brighter, longer highs). */
  stretch: number;
  /** Pluck position as a fraction of string length (0..0.5). */
  pickPos: number;
  /** Excitation brightness 0..1. */
  brightness: number;
  duration: number;
  /**
   * Bridge nonlinearity 0..1 (sitar jawari, shamisen sawari): positive
   * excursions above a fraction of the running envelope are compressed inside
   * the loop, which keeps feeding energy into high partials as the note rings.
   */
  buzz?: number;
  /** 'hammer' = struck string (hammered dulcimer): a smooth pulse instead of noise. */
  excitation?: 'noise' | 'hammer';
}

export function renderKarplusStrong(sampleRate: number, freq: number, o: KsOptions, seed = 1): Float32Array<ArrayBuffer> {
  const len = Math.max(1, Math.floor(o.duration * sampleRate));
  const out = new Float32Array(len);
  const period = sampleRate / freq;
  // Loop delay = L samples + 0.5 (two-point filter group delay) + allpass fraction.
  let L = Math.floor(period - o.stretch);
  let frac = period - o.stretch - L;
  if (frac < 0.1) {
    L -= 1;
    frac += 1;
  }
  L = Math.max(2, L);
  const apC = (1 - frac) / (1 + frac);

  // Per-period loss so amplitude reaches −60 dB after t60 seconds.
  const rho = Math.min(0.99999, Math.pow(10, -3 / (o.t60 * freq)));

  // Excitation: filtered noise with pick-position comb.
  let rnd = seed >>> 0 || 1;
  const noise = () => {
    rnd ^= rnd << 13;
    rnd ^= rnd >>> 17;
    rnd ^= rnd << 5;
    return ((rnd >>> 0) / 4294967296) * 2 - 1;
  };
  const exc = new Float32Array(L);
  if (o.excitation === 'hammer') {
    // Raised-cosine hammer pulse at the strike point; harder = narrower = brighter.
    const width = Math.max(2, Math.round(L * (0.25 - 0.18 * o.brightness)));
    const centre = Math.round(o.pickPos * L);
    for (let i = 0; i < L; i++) {
      const x = (i - centre) / width;
      exc[i] = (Math.abs(x) < 1 ? 0.5 + 0.5 * Math.cos(Math.PI * x) : 0) + 0.05 * noise();
    }
  } else {
    const lpA = 0.15 + 0.8 * o.brightness; // one-pole coefficient
    let lp = 0;
    for (let i = 0; i < L; i++) {
      lp += lpA * (noise() - lp);
      exc[i] = lp;
    }
  }
  const pick = Math.max(1, Math.round(o.pickPos * L));
  const delay = new Float32Array(L);
  let mean = 0;
  for (let i = 0; i < L; i++) {
    delay[i] = exc[i] - (i >= pick ? exc[i - pick] : 0);
    mean += delay[i];
  }
  // Remove DC and normalise peak.
  mean /= L;
  let peak = 1e-9;
  for (let i = 0; i < L; i++) {
    delay[i] -= mean;
    peak = Math.max(peak, Math.abs(delay[i]));
  }
  for (let i = 0; i < L; i++) delay[i] /= peak;

  let idx = 0;
  let prev = 0;
  let apX = 0;
  let apY = 0;
  const S = o.stretch;
  const buzz = o.buzz ?? 0;
  const envDecay = Math.exp(-1 / (0.02 * sampleRate));
  let env = 1;
  for (let n = 0; n < len; n++) {
    const cur = delay[idx];
    out[n] = cur;
    const filtered = rho * ((1 - S) * cur + S * prev);
    prev = cur;
    // Fractional delay all-pass.
    let y = apC * filtered + apX - apC * apY;
    apX = filtered;
    apY = y;
    if (buzz > 0) {
      env = Math.max(Math.abs(y), env * envDecay);
      const th = env * 0.3;
      if (y > th) y = th + (y - th) * (1 - buzz);
    }
    delay[idx] = y;
    idx = idx + 1 === L ? 0 : idx + 1;
  }
  if (buzz > 0) {
    // The one-sided limiting adds DC; remove it.
    let dc = 0;
    for (let n = 0; n < len; n++) {
      dc += 0.0005 * (out[n] - dc);
      out[n] -= dc;
    }
  }
  // Short fade at the end to avoid a click.
  const fade = Math.min(len, Math.floor(0.05 * sampleRate));
  for (let i = 0; i < fade; i++) out[len - 1 - i] *= i / fade;
  return out;
}

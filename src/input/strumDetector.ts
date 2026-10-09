import type { StringIndex } from './types';

/**
 * Piezo strum detector (port of the guitar_studio.py engine).
 *
 * Per string:
 *  - baseline: slow EMA of the ADC value, frozen while a hit is in progress;
 *  - signal = |value − baseline| (or value − baseline when rectify is off) × gain;
 *  - rising edge through `threshold`, outside the refractory window, opens a
 *    short peak-tracking window;
 *  - at the end of the window the hit is accepted unless it looks like
 *    crosstalk: the body reference piezo (7th value) was too loud relative to
 *    the peak, or a neighbouring string had a much larger peak in the same window;
 *  - velocity = (peak − threshold) / (fullScale − threshold), shaped by a curve.
 */
export interface DetectorParams {
  /** Nominal sample period of the firmware stream, ms. */
  sampleMs: number;
  /** Signal level (ADC counts above baseline) that triggers a hit. */
  threshold: number;
  /** Peak level that maps to velocity 1. */
  fullScale: number;
  /** EMA coefficient for baseline tracking (per sample). */
  baselineAlpha: number;
  /** Minimum time between two hits on the same string. */
  refractoryMs: number;
  /** How long to keep tracking the peak after the threshold crossing. */
  peakWindowMs: number;
  /** Reject if refPeak > refRatio × peak (body knock). 0 disables. */
  refRatio: number;
  /** Reject if peak < neighbourRatio × max neighbour peak. 0 disables. */
  neighbourRatio: number;
  /** Velocity curve exponent (<1 = more sensitive, >1 = harder). */
  velocityCurve: number;
  /** Use absolute deviation from baseline. */
  rectify: boolean;
  /** Per-string input gain (compensates piezo coupling differences). */
  gains: number[];
}

export const DEFAULT_DETECTOR_PARAMS: DetectorParams = {
  sampleMs: 2,
  threshold: 60,
  fullScale: 1200,
  baselineAlpha: 0.01,
  refractoryMs: 60,
  peakWindowMs: 6,
  refRatio: 0.8,
  neighbourRatio: 0.35,
  velocityCurve: 0.7,
  rectify: true,
  gains: [1, 1, 1, 1, 1, 1],
};

export interface DetectedStrum {
  string: StringIndex;
  velocity: number;
  peak: number;
  /** Detector clock (ms) of the threshold crossing. */
  tCross: number;
}

export interface DetectorResult {
  strums: DetectedStrum[];
  rejected: { string: StringIndex; reason: 'reference' | 'neighbour'; peak: number }[];
  /** Current signal per string (after baseline removal and gain), for meters. */
  signals: number[];
  refSignal: number;
}

interface StringState {
  baseline: number;
  initialised: boolean;
  prevSignal: number;
  lastHit: number;
  /** Detector clock when the open window closes, or -1 when idle. */
  windowEnd: number;
  tCross: number;
  peak: number;
}

const N = 6;

export class StrumDetector {
  params: DetectorParams;
  private s: StringState[];
  private ref = { baseline: 0, initialised: false, windowPeak: 0 };
  /** Recent per-string peaks for neighbour comparison (decays with time). */
  private recentPeak = new Float64Array(N);
  private recentPeakT = new Float64Array(N).fill(-Infinity);
  private clock = 0;

  constructor(params: Partial<DetectorParams> = {}) {
    this.params = { ...DEFAULT_DETECTOR_PARAMS, ...params };
    this.s = Array.from({ length: N }, () => ({
      baseline: 0,
      initialised: false,
      prevSignal: 0,
      lastHit: -Infinity,
      windowEnd: -1,
      tCross: 0,
      peak: 0,
    }));
  }

  setParams(p: Partial<DetectorParams>): void {
    this.params = { ...this.params, ...p };
  }

  reset(): void {
    const p = this.params;
    Object.assign(this, new StrumDetector(p));
  }

  get now(): number {
    return this.clock;
  }

  /** Feed one sample frame (6 string values, optional 7th reference). */
  process(values: number[]): DetectorResult {
    const p = this.params;
    const t = (this.clock += p.sampleMs);
    const signals = new Array<number>(N).fill(0);
    const result: DetectorResult = { strums: [], rejected: [], signals, refSignal: 0 };

    // Reference piezo.
    if (values.length > N) {
      const v = values[N];
      const r = this.ref;
      if (!r.initialised) {
        r.baseline = v;
        r.initialised = true;
      }
      const dev = v - r.baseline;
      const sig = p.rectify ? Math.abs(dev) : Math.max(0, dev);
      result.refSignal = sig;
      r.baseline += p.baselineAlpha * (v - r.baseline);
      // Track the max reference level across any open window.
      const anyOpen = this.s.some((st) => st.windowEnd >= 0);
      r.windowPeak = anyOpen ? Math.max(r.windowPeak, sig) : sig;
    }

    for (let i = 0; i < N; i++) {
      const st = this.s[i];
      const v = values[i];
      if (v === undefined || !Number.isFinite(v)) continue;
      if (!st.initialised) {
        st.baseline = v;
        st.initialised = true;
      }
      const dev = v - st.baseline;
      const sig = (p.rectify ? Math.abs(dev) : Math.max(0, dev)) * (p.gains[i] ?? 1);
      signals[i] = sig;

      if (st.windowEnd >= 0) {
        st.peak = Math.max(st.peak, sig);
      } else {
        // Baseline only follows the signal while idle so hits don't drag it.
        if (sig < p.threshold) st.baseline += p.baselineAlpha * dev;
        const rising = st.prevSignal < p.threshold && sig >= p.threshold;
        if (rising && t - st.lastHit >= p.refractoryMs) {
          st.windowEnd = t + p.peakWindowMs;
          st.tCross = t;
          st.peak = sig;
          st.lastHit = t;
        }
      }
      st.prevSignal = sig;

      if (st.windowEnd >= 0) {
        this.recentPeak[i] = Math.max(
          t - this.recentPeakT[i] <= p.peakWindowMs * 2 ? this.recentPeak[i] : 0,
          sig,
        );
        this.recentPeakT[i] = t;
      }
    }

    // Close windows whose time is up.
    for (let i = 0; i < N; i++) {
      const st = this.s[i];
      if (st.windowEnd < 0 || t < st.windowEnd) continue;
      st.windowEnd = -1;
      const string = i as StringIndex;
      const peak = st.peak;
      if (p.refRatio > 0 && this.ref.initialised && this.ref.windowPeak > p.refRatio * peak) {
        result.rejected.push({ string, reason: 'reference', peak });
        continue;
      }
      if (p.neighbourRatio > 0) {
        let maxNeighbour = 0;
        for (const j of [i - 1, i + 1]) {
          if (j < 0 || j >= N) continue;
          if (t - this.recentPeakT[j] <= p.peakWindowMs * 2) {
            maxNeighbour = Math.max(maxNeighbour, this.recentPeak[j]);
          }
        }
        if (peak < p.neighbourRatio * maxNeighbour) {
          result.rejected.push({ string, reason: 'neighbour', peak });
          continue;
        }
      }
      const span = Math.max(1, p.fullScale - p.threshold);
      const lin = Math.min(1, Math.max(0, (peak - p.threshold) / span));
      const velocity = Math.max(0.02, Math.pow(lin, p.velocityCurve));
      result.strums.push({ string, velocity, peak, tCross: st.tCross });
    }
    return result;
  }
}

/** Parse one firmware line: space/comma/tab separated integers. */
export function parseSerialLine(line: string): number[] | null {
  const parts = line.trim().split(/[\s,;]+/);
  if (parts.length < 6) return null;
  const out: number[] = [];
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isFinite(n)) return null;
    out.push(n);
  }
  return out.slice(0, 7);
}

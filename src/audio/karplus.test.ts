import { describe, expect, it } from 'vitest';
import { renderKarplusStrong } from './karplus';

function estimateFreq(buf: Float32Array, sr: number): number {
  // Autocorrelation peak over a mid-section.
  const start = Math.floor(sr * 0.1);
  const n = 4096;
  let best = 0;
  let bestLag = 0;
  for (let lag = 20; lag < 2000; lag++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += buf[start + i] * buf[start + i + lag];
    if (s > best) {
      best = s;
      bestLag = lag;
    }
  }
  return sr / bestLag;
}

describe('renderKarplusStrong', () => {
  it('is pitched correctly and decays', () => {
    const sr = 48000;
    for (const f of [82.41, 110, 329.63]) {
      const buf = renderKarplusStrong(sr, f, { t60: 3, stretch: 0.5, pickPos: 0.13, brightness: 0.7, duration: 1.5 });
      const est = estimateFreq(buf, sr);
      expect(Math.abs(1200 * Math.log2(est / f))).toBeLessThan(30); // within 30 cents (lag resolution)
      const rms = (a: number, b: number) => Math.sqrt(buf.slice(a, b).reduce((s, x) => s + x * x, 0) / (b - a));
      expect(rms(sr, sr + 4000)).toBeLessThan(rms(0, 4000));
    }
  });
});

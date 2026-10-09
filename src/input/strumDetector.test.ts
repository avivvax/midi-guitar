import { describe, expect, it } from 'vitest';
import { StrumDetector, parseSerialLine } from './strumDetector';

const BASE = 2000;
function frame(over: Partial<Record<number, number>> = {}, ref = BASE): number[] {
  return [0, 1, 2, 3, 4, 5].map((i) => BASE + (over[i] ?? 0)).concat(ref);
}

function settle(d: StrumDetector, n = 50) {
  for (let i = 0; i < n; i++) d.process(frame());
}

function pulse(d: StrumDetector, shape: Partial<Record<number, number>>[], refShape: number[] = []) {
  const strums = [];
  const rejected = [];
  for (let k = 0; k < 40; k++) {
    const r = d.process(frame(shape[k] ?? {}, BASE + (refShape[k] ?? 0)));
    strums.push(...r.strums);
    rejected.push(...r.rejected);
  }
  return { strums, rejected };
}

describe('StrumDetector', () => {
  it('detects a single hit with velocity proportional to peak', () => {
    const d = new StrumDetector();
    settle(d);
    const { strums } = pulse(d, [{ 2: 300 }, { 2: 700 }, { 2: 400 }, { 2: 100 }]);
    expect(strums).toHaveLength(1);
    expect(strums[0].string).toBe(2);
    expect(strums[0].peak).toBe(700);
    expect(strums[0].velocity).toBeGreaterThan(0.4);
    expect(strums[0].velocity).toBeLessThan(1);
  });

  it('applies the refractory window', () => {
    const d = new StrumDetector({ refractoryMs: 60 });
    settle(d);
    // Two hits 10 ms apart (5 samples) → only one strum.
    const { strums } = pulse(d, [{ 0: 500 }, {}, {}, {}, {}, { 0: 500 }]);
    expect(strums).toHaveLength(1);
  });

  it('rejects body knocks via the reference piezo', () => {
    const d = new StrumDetector();
    settle(d);
    const { strums, rejected } = pulse(d, [{ 1: 300 }, { 1: 300 }], [900, 900]);
    expect(strums).toHaveLength(0);
    expect(rejected[0]).toMatchObject({ string: 1, reason: 'reference' });
  });

  it('rejects neighbour crosstalk but keeps a real strum across strings', () => {
    const d = new StrumDetector();
    settle(d);
    const crosstalk = pulse(d, [{ 3: 1000, 4: 120 }, { 3: 1100, 4: 150 }]);
    expect(crosstalk.strums.map((s) => s.string)).toEqual([3]);
    expect(crosstalk.rejected.map((r) => r.string)).toEqual([4]);

    const d2 = new StrumDetector();
    settle(d2);
    const chord = pulse(d2, [{ 3: 600, 4: 500 }, { 3: 700, 4: 650 }]);
    expect(chord.strums.map((s) => s.string).sort()).toEqual([3, 4]);
  });

  it('tracks a drifting baseline', () => {
    const d = new StrumDetector();
    for (let i = 0; i < 2000; i++) d.process(frame({ 0: Math.min(40, i / 10) }));
    const r = d.process(frame({ 0: 40 }));
    expect(r.signals[0]).toBeLessThan(5);
    expect(r.strums).toHaveLength(0);
  });
});

describe('parseSerialLine', () => {
  it('parses 6 and 7 value lines', () => {
    expect(parseSerialLine('1 2 3 4 5 6')).toEqual([1, 2, 3, 4, 5, 6]);
    expect(parseSerialLine('1 2 3 4 5 6 7\r')).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
  it('rejects garbage', () => {
    expect(parseSerialLine('boot ok')).toBeNull();
    expect(parseSerialLine('1 2 3')).toBeNull();
  });
});

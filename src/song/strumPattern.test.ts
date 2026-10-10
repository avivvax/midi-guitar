import { describe, expect, it } from 'vitest';
import { PATTERNS, chordStrokes, patternById, strokeNotes } from './strumPattern';

// Deterministic "random" for tests.
const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};
const C = [null, 48, 52, 55, 60, 64]; // x32010 in standard tuning (MIDI)

describe('chordStrokes', () => {
  it('lays out the requested patterns on eighth-note slots', () => {
    const slots = (id: Parameters<typeof patternById>[0]) => chordStrokes(patternById(id), 4).map((e) => `${e.slot}${e.stroke}`);
    expect(slots('folk')).toEqual(['0D', '2D', '3U', '5U', '6D', '7U']);
    expect(slots('quarters')).toEqual(['0D', '2D', '4D', '6D']);
    expect(slots('pop')).toEqual(['0D', '2D', '3U', '4D', '6D', '7U']);
    expect(chordStrokes(patternById('arpeggio'), 4)).toHaveLength(8);
    expect(PATTERNS.map((p) => p.label)).toEqual(['D-DU-UDU', 'D-D-D-D', 'D-DU-D-DU', 'ארפג׳ו']);
  });
  it('fits shorter and longer chords and accents bar downbeats', () => {
    expect(chordStrokes(patternById('folk'), 2).map((e) => e.slot)).toEqual([0, 2, 3]);
    const eight = chordStrokes(patternById('quarters'), 8);
    expect(eight.map((e) => e.slot)).toEqual([0, 2, 4, 6, 8, 10, 12, 14]);
    expect(eight.filter((e) => e.accent).map((e) => e.slot)).toEqual([0, 8]);
  });
});

describe('strokeNotes', () => {
  it('down strokes play every sounding string low to high, skipping muted ones', () => {
    const notes = strokeNotes('D', 0, true, C, seq(0.5));
    expect(notes.map((n) => n.string)).toEqual([1, 2, 3, 4, 5]);
    const offsets = notes.map((n) => n.offset);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
    expect(offsets[4] - offsets[0]).toBeGreaterThan(0.02);
    expect(offsets[4] - offsets[0]).toBeLessThan(0.07);
  });
  it('up strokes play the top strings high to low, lighter than down strokes', () => {
    const up = strokeNotes('U', 3, false, C, seq(0.5, 0.5, 0.2));
    expect(up.map((n) => n.string)).toEqual([5, 4, 3]);
    const down = strokeNotes('D', 2, false, C, seq(0.5));
    expect(Math.max(...up.map((n) => n.velocity))).toBeLessThan(Math.max(...down.map((n) => n.velocity)));
  });
  it('arpeggio starts on the bass and picks one string per slot', () => {
    const picks = [0, 1, 2, 3, 4, 5, 6, 7].map((slot) => strokeNotes('A', slot, slot === 0, C, seq(0.5)));
    expect(picks.every((p) => p.length === 1)).toBe(true);
    expect(picks[0][0].string).toBe(1);
    expect(picks.map((p) => p[0].string)).toContain(5);
  });
  it('varies velocity and timing like a human but stays in range', () => {
    const vels = new Set<number>();
    for (let i = 0; i < 200; i++) {
      for (const n of strokeNotes('D', 0, i % 2 === 0, C)) {
        expect(n.velocity).toBeGreaterThanOrEqual(0.08);
        expect(n.velocity).toBeLessThanOrEqual(1);
        expect(n.offset).toBeGreaterThanOrEqual(0);
        expect(n.offset).toBeLessThan(0.1);
        vels.add(Math.round(n.velocity * 100));
      }
    }
    expect(vels.size).toBeGreaterThan(10);
  });
  it('accented downbeats are louder on average', () => {
    const avg = (accent: boolean) => {
      let sum = 0;
      for (let i = 0; i < 300; i++) sum += strokeNotes('D', 0, accent, C)[0].velocity;
      return sum / 300;
    };
    expect(avg(true)).toBeGreaterThan(avg(false) + 0.08);
  });
  it('returns nothing for an all-muted chord', () => {
    expect(strokeNotes('D', 0, true, [null, null, null, null, null, null])).toEqual([]);
  });
});

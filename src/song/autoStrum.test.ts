import { describe, expect, it } from 'vitest';
import { scheduleWindow, startCursor, type AutoContext } from './autoStrum';
import { flatten, initialState } from './player';
import { patternById } from './strumPattern';
import type { Song } from './types';

const song: Song = {
  id: 't', title: 'T', artist: 'A', key: 'C', tempo: 120,
  sections: [
    { name: 'Verse', chords: [{ chord: 'C', beats: 4 }, { chord: 'G', beats: 2 }] },
    { name: 'Chorus', chords: [{ chord: 'F', beats: 4 }] },
  ],
};
const steps = flatten(song);
const midis = (pos: number) => [[null, 48, 52, 55, 60, 64], [43, 47, 50, 55, 59, 67], [41, 48, 53, 57, 60, 65]][pos];
const ctx = (over: Partial<AutoContext> = {}): AutoContext => ({
  steps, tempo: 120, pattern: patternById('quarters'), midisFor: midis, rand: () => 0.5, ...over,
});
const chordChanges = (changes: { time: number; state: { pos: number; beat: number; finished: boolean } }[]) =>
  changes.filter((c) => c.state.beat === 0 && !c.state.finished).map((c) => [c.state.pos, +c.time.toFixed(3)]);

describe('scheduleWindow', () => {
  it('changes chord after each chord’s beats at the song tempo', () => {
    // 120 bpm: beat = 0.5 s. C (4 beats) at 0, G (2) at 2 s, F (4) at 3 s, end at 5 s.
    const { changes, cursor } = scheduleWindow(startCursor(initialState(), 0), ctx(), 10);
    expect(chordChanges(changes)).toEqual([[0, 0], [1, 2], [2, 3]]);
    expect(cursor.done).toBe(true);
    expect(changes.at(-1)).toMatchObject({ time: 5, state: { finished: true } });
  });

  it('plays the pattern strokes with the chord voicing', () => {
    const { notes } = scheduleWindow(startCursor(initialState(), 0), ctx(), 2 - 1e-9);
    // Quarter-note down strokes on C: 4 strokes × 5 sounding strings.
    expect(notes).toHaveLength(20);
    expect(new Set(notes.map((n) => n.midi))).toEqual(new Set([48, 52, 55, 60, 64]));
    const strokeStarts = [...new Set(notes.map((n) => Math.round(n.when * 2) / 2))];
    expect(strokeStarts).toEqual([0, 0.5, 1, 1.5]);
  });

  it('resumes seamlessly across windows (look-ahead scheduling)', () => {
    let cursor = startCursor(initialState(), 0);
    const all: number[] = [];
    for (let t = 0.1; t < 6; t += 0.1) {
      const r = scheduleWindow(cursor, ctx(), t);
      cursor = r.cursor;
      all.push(...r.changes.filter((c) => c.state.beat === 0).map((c) => c.time));
    }
    expect(all.map((x) => +x.toFixed(3))).toEqual([0, 2, 3, 5]);
  });

  it('starts from the current chord and loops the current section', () => {
    const start = { ...initialState(), pos: 1, loopSection: true };
    const { changes } = scheduleWindow(startCursor(start, 10), ctx(), 10 + 6.5);
    // G (2 beats) → back to C (section start) → G …
    expect(chordChanges(changes).slice(0, 4)).toEqual([[1, 10], [0, 11], [1, 13], [0, 14]]);
  });

  it('follows tempo changes between windows', () => {
    const a = scheduleWindow(startCursor(initialState(), 0), ctx({ tempo: 60 }), 4 - 1e-9);
    expect(a.cursor.time).toBeCloseTo(4); // 4 beats at 60 bpm
    const b = scheduleWindow(a.cursor, ctx({ tempo: 120 }), 10);
    expect(chordChanges(b.changes)[0]).toEqual([1, 4]);
  });
});

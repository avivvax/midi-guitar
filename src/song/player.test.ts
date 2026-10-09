import { describe, expect, it } from 'vitest';
import { flatten, initialState, jumpToSection, next, onBeat, onStringHit, prev, restart, STRUM_GROUP_MS, type PlayerState } from './player';
import type { Song } from './types';

const song: Song = {
  id: 't',
  title: 'T',
  artist: 'A',
  key: 'C',
  tempo: 100,
  sections: [
    { name: 'Verse', chords: [{ chord: 'C', beats: 4 }, { chord: 'G', beats: 2 }] },
    { name: 'Chorus', chords: [{ chord: 'F', beats: 4 }, { chord: 'Am', beats: 4 }] },
  ],
};
const steps = flatten(song);
const chordAt = (s: PlayerState) => steps[s.pos].chord;

describe('flatten', () => {
  it('lists every chord in order with its section', () => {
    expect(steps.map((s) => `${s.section}:${s.chord}`)).toEqual(['0:C', '0:G', '1:F', '1:Am']);
  });
});

describe('tempo mode', () => {
  it('advances after the chord beats elapse', () => {
    let s = initialState();
    for (let i = 0; i < 3; i++) s = onBeat(steps, s);
    expect(chordAt(s)).toBe('C');
    expect(s.beat).toBe(3);
    s = onBeat(steps, s);
    expect(chordAt(s)).toBe('G');
    s = onBeat(steps, onBeat(steps, s));
    expect(chordAt(s)).toBe('F');
  });

  it('stops at the end of the song', () => {
    let s = { ...initialState(), pos: 3 };
    for (let i = 0; i < 4; i++) s = onBeat(steps, s);
    expect(s.finished).toBe(true);
    expect(chordAt(s)).toBe('Am');
    expect(onBeat(steps, s)).toBe(s);
  });

  it('loops the current section', () => {
    let s: PlayerState = { ...initialState(), pos: 1, loopSection: true };
    s = onBeat(steps, onBeat(steps, s));
    expect(chordAt(s)).toBe('C');
    s = { ...s, pos: 3 };
    s = next(steps, s);
    expect(chordAt(s)).toBe('F');
    expect(s.finished).toBe(false);
  });
});

describe('strum-count mode', () => {
  const hitStrum = (s: PlayerState, t: number, n = 4) => {
    // A downstrum: 6 strings 12 ms apart.
    for (let k = 0; k < 6; k++) s = onStringHit(steps, s, t + k * 12, n);
    return s;
  };

  it('groups string hits into strums and advances on the strum after N', () => {
    let s = initialState();
    let t = 1000;
    for (let i = 0; i < 4; i++) {
      s = hitStrum(s, t);
      expect(chordAt(s)).toBe('C');
      t += 500;
    }
    expect(s.strums).toBe(4);
    // 5th strum: advances first, so the whole strum sounds G.
    s = onStringHit(steps, s, t, 4);
    expect(chordAt(s)).toBe('G');
    expect(s.strums).toBe(1);
    s = onStringHit(steps, s, t + 20, 4);
    expect(chordAt(s)).toBe('G');
    expect(s.strums).toBe(1);
  });

  it('treats hits further apart than the group window as separate strums', () => {
    let s = initialState();
    s = onStringHit(steps, s, 0, 2);
    s = onStringHit(steps, s, STRUM_GROUP_MS + 1, 2);
    expect(s.strums).toBe(2);
    s = onStringHit(steps, s, 2 * STRUM_GROUP_MS + 2, 2);
    expect(chordAt(s)).toBe('G');
  });

  it('respects a per-song strum count', () => {
    let s = initialState();
    s = hitStrum(s, 0, 1);
    s = hitStrum(s, 500, 1);
    expect(chordAt(s)).toBe('G');
  });
});

describe('manual controls', () => {
  it('next / prev / restart / jump', () => {
    let s = next(steps, initialState());
    expect(chordAt(s)).toBe('G');
    s = prev(steps, prev(steps, s));
    expect(s.pos).toBe(0);
    s = jumpToSection(steps, s, 1);
    expect(chordAt(s)).toBe('F');
    s = restart({ ...s, finished: true, beat: 2 });
    expect(s).toMatchObject({ pos: 0, beat: 0, finished: false });
  });
});

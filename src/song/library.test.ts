import { describe, expect, it } from 'vitest';
import { parseChordSymbol } from './chordSymbol';
import { SEED_SONGS, searchSongs } from './library';

describe('seed songs', () => {
  it('has about 60+ songs including Hebrew ones', () => {
    expect(SEED_SONGS.length).toBeGreaterThanOrEqual(55);
    expect(SEED_SONGS.some((s) => /[֐-׿]/.test(s.title))).toBe(true);
  });

  it.each(SEED_SONGS.map((s) => [s.id, s] as const))('%s is valid', (_id, s) => {
    expect(s.title).toBeTruthy();
    expect(s.artist).toBeTruthy();
    expect(parseChordSymbol(s.key.replace(/ (major|minor)$/, ''))).not.toBeNull();
    expect(s.tempo).toBeGreaterThanOrEqual(40);
    expect(s.tempo).toBeLessThanOrEqual(220);
    expect(s.sections.length).toBeGreaterThan(0);
    for (const sec of s.sections) {
      expect(sec.name).toBeTruthy();
      expect(sec.chords.length).toBeGreaterThan(0);
      for (const c of sec.chords) {
        expect(parseChordSymbol(c.chord), `${s.id}: ${c.chord}`).not.toBeNull();
        expect(Number.isInteger(c.beats) && c.beats > 0).toBe(true);
      }
    }
    // Progressions only: no lyric-like fields.
    expect(Object.keys(s).sort()).toEqual(
      expect.arrayContaining(['artist', 'id', 'key', 'sections', 'tempo', 'title']),
    );
    expect(JSON.stringify(s)).not.toMatch(/lyric/i);
  });
});

describe('searchSongs', () => {
  it('matches title and artist, case-insensitively, all words', () => {
    expect(searchSongs(SEED_SONGS, 'beatles').length).toBeGreaterThanOrEqual(4);
    expect(searchSongs(SEED_SONGS, 'let it').map((s) => s.id)).toContain('let-it-be');
    expect(searchSongs(SEED_SONGS, 'KNOCKIN dylan').map((s) => s.id)).toEqual(['knockin-on-heavens-door']);
    expect(searchSongs(SEED_SONGS, 'נגילה').map((s) => s.id)).toEqual(['hava-nagila']);
    expect(searchSongs(SEED_SONGS, '')).toHaveLength(SEED_SONGS.length);
  });
});

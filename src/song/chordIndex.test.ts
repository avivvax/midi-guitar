import { describe, expect, it } from 'vitest';
import { bodyToSong, matches, normalize, pickWord, prefixFile, rank, shardPrefix, stableId, type IndexRow } from './chordIndex';
import { parseChordSymbol } from './chordSymbol';

describe('normalisation shared with the Python builder', () => {
  it('matches tools/chord_index/test_common.py vectors', () => {
    expect(normalize("Knockin' On Heaven's Door")).toBe('knockin on heavens door');
    expect(normalize('Beyoncé – Halo (Live)')).toBe('beyonce halo live');
    expect(normalize('הַתִּקְוָה')).toBe('התקוה');
    expect(prefixFile('ab')).toBe('6162');
    expect(prefixFile('הת')).toBe('d794d7aa');
  });
});

describe('shard selection', () => {
  it('picks the longest non-stopword', () => {
    expect(pickWord('Knockin on heavens door')).toBe('knockin');
    expect(pickWord('the you')).toBeNull();
    expect(pickWord('a')).toBeNull();
  });
  it('follows split depths', () => {
    const depth = { lo: 3, lov: 4 };
    expect(shardPrefix('love', depth)).toBe('love');
    expect(shardPrefix('lovely', depth)).toBe('love');
    expect(shardPrefix('lost', depth)).toBe('los');
    expect(shardPrefix('lo', depth)).toBe('lo');
    expect(shardPrefix('hey', depth)).toBe('he');
  });
});

describe('matching and ranking', () => {
  const rows: IndexRow[] = [
    [1, 'Let It Be', 'The Beatles', 'C'],
    [2, 'Let It Be Me', 'The Everly Brothers', 'C'],
    [3, 'Let Her Go', 'Passenger', 'G'],
    [4, 'Be My Baby', 'The Ronettes', 'E'],
  ];
  it('requires every query word as a word prefix of title or artist', () => {
    expect(matches(rows[0], ['let', 'beat'])).toBe(true);
    expect(matches(rows[2], ['let', 'beat'])).toBe(false);
  });
  it('ranks exact and prefix title matches first', () => {
    expect(rank(rows, 'let it be').map((r) => r[0])).toEqual([1, 2]);
    expect(rank(rows, 'beatles').map((r) => r[0])).toEqual([1]);
  });
});

describe('bodyToSong', () => {
  it('expands shared patterns into sections with 4-beat chords', () => {
    const song = bodyToSong([7, 'Song', 'Artist', 'G'], {
      p: ['G D Am C', 'Em C G D'],
      s: [['Verse', 0], ['Chorus', 1], ['Verse 2', 0]],
      k: 'G',
      y: 1999,
      g: 'rock',
    });
    expect(song.sections.map((s) => s.name)).toEqual(['Verse', 'Chorus', 'Verse 2']);
    expect(song.sections[2].chords.map((c) => c.chord)).toEqual(['G', 'D', 'Am', 'C']);
    expect(song.sections[0].chords[0].beats).toBe(4);
    expect(song).toMatchObject({ source: 'chordonomicon', year: 1999, genre: 'rock', key: 'G' });
    expect(song.sections.flatMap((s) => s.chords).every((c) => parseChordSymbol(c.chord))).toBe(true);
  });
  it('gives a stable id from title and artist', () => {
    expect(stableId('Let It Be', 'The Beatles')).toBe(stableId("let it be", 'the beatles'));
    expect(stableId('Let It Be', 'The Beatles')).not.toBe(stableId('Let It Be', 'Aretha Franklin'));
  });
});

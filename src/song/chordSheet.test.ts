import { describe, expect, it } from 'vitest';
import { parseChordSheet, sectionName } from './chordSheet';

const names = (r: ReturnType<typeof parseChordSheet>) => r.sections.map((s) => s.name);
const chords = (r: ReturnType<typeof parseChordSheet>, i = 0) => r.sections[i].chords.map((c) => c.chord);

describe('plain text chord sheets', () => {
  it('extracts chords above lyrics and drops the lyrics', () => {
    const sheet = `
[Verse 1]
C        G          Am      F
Some lyric line that we do not keep
C          G        F    C
Another lyric line here

[Chorus]
Am   G    F    C
La la la la la
`;
    const r = parseChordSheet(sheet);
    expect(names(r)).toEqual(['Verse 1', 'Chorus']);
    expect(chords(r, 0)).toEqual(['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'C']);
    expect(chords(r, 1)).toEqual(['Am', 'G', 'F', 'C']);
    expect(r.lyricLines).toBe(3);
    // No lyric text survives anywhere in the result.
    expect(JSON.stringify(r)).not.toMatch(/lyric line|La la/);
    expect(r.sections[0].chords[0].beats).toBe(4);
  });

  it('handles Hebrew lyrics and Hebrew section headers', () => {
    const sheet = `בית:
Am        Dm
שורה ראשונה של השיר
G           C
שורה שנייה

פזמון
F    G    C    Am
מילים של הפזמון`;
    const r = parseChordSheet(sheet);
    expect(names(r)).toEqual(['Verse', 'Chorus']);
    expect(chords(r, 0)).toEqual(['Am', 'Dm', 'G', 'C']);
    expect(chords(r, 1)).toEqual(['F', 'G', 'C', 'Am']);
    expect(JSON.stringify(r)).not.toMatch(/[֐-׿]/);
  });

  it('reads inline headers, repeats, bars and metadata', () => {
    const sheet = `Key: G
Capo: 2
Tempo: 96
Intro: G D Em C x2
Verse
| G . . . | D C | Em |
Chorus (x2)
C D G`;
    const r = parseChordSheet(sheet);
    expect(r.key).toBe('G');
    expect(r.capo).toBe(2);
    expect(r.tempo).toBe(96);
    expect(names(r)).toEqual(['Intro', 'Verse', 'Chorus']);
    expect(chords(r, 0)).toEqual(['G', 'D', 'Em', 'C', 'G', 'D', 'Em', 'C']);
    expect(r.sections[1].chords).toEqual([
      { chord: 'G', beats: 4 },
      { chord: 'D', beats: 2 },
      { chord: 'C', beats: 2 },
      { chord: 'Em', beats: 4 },
    ]);
  });

  it('numbers repeated sections and names a header-less sheet "Song"', () => {
    const r = parseChordSheet('Verse\nC G\nChorus\nF G\nVerse\nAm F\n');
    expect(names(r)).toEqual(['Verse', 'Chorus', 'Verse 2']);
    expect(names(parseChordSheet('C G Am F\nwords here\n'))).toEqual(['Song']);
  });

  it('does not mistake lyric lines with chord-like words for chords', () => {
    const r = parseChordSheet('C G\nA Day In The Life\nAm I dreaming\nF\n');
    expect(chords(r)).toEqual(['C', 'G', 'F']);
  });

  it('guesses the key from the first chord', () => {
    expect(parseChordSheet('Em C G D').key).toBe('Em');
  });
});

describe('ChordPro', () => {
  it('reads directives and inline chords, discarding lyrics', () => {
    const sheet = `{title: My Song}
{artist: Someone}
{key: D}
{tempo: 120}
{start_of_verse: Verse 1}
[D]Words [A]more words [Bm]and [G]more
[D]Again [A]and [G]again
{end_of_verse}
{soc}
[G]Chorus [D]words [A]here
{eoc}
{comment: Bridge}
[Em]   [A]
`;
    const r = parseChordSheet(sheet);
    expect(r).toMatchObject({ title: 'My Song', artist: 'Someone', key: 'D', tempo: 120 });
    expect(names(r)).toEqual(['Verse 1', 'Chorus', 'Bridge']);
    expect(chords(r, 0)).toEqual(['D', 'A', 'Bm', 'G', 'D', 'A', 'G']);
    expect(chords(r, 1)).toEqual(['G', 'D', 'A']);
    expect(chords(r, 2)).toEqual(['Em', 'A']);
    expect(JSON.stringify(r)).not.toMatch(/Words|again|Chorus words/);
  });

  it('reports unknown bracket tokens', () => {
    const r = parseChordSheet('[C]one [Xyz]two [G]three');
    expect(chords(r)).toEqual(['C', 'G']);
    expect(r.unknown).toEqual(['Xyz']);
  });
});

describe('sectionName', () => {
  it('recognises headers in English and Hebrew', () => {
    expect(sectionName('[Chorus]')).toBe('Chorus');
    expect(sectionName('Verse 2:')).toBe('Verse 2');
    expect(sectionName('Pre-Chorus')).toBe('Pre-Chorus');
    expect(sectionName('גשר')).toBe('Bridge');
    expect(sectionName('Chorus of angels sang')).toBeNull();
  });
});

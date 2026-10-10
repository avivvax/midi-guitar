import { describe, expect, it } from 'vitest';
import { parseChordSymbol } from './chordSymbol';
import { bodyToHeSong, groupArtists, heLetter, heSongId, performers, searchHe, type HeRow } from './hebrewLibrary';

// The generated library itself (public/he), checked like the seed songs.
const index = Object.values(import.meta.glob<HeRow[]>('../../public/he/index.json', { eager: true, import: 'default' }))[0];
const shardFiles = import.meta.glob<{ p: string[]; s: [string, number][]; k: string }[]>('../../public/he/s/*.json', {
  eager: true,
  import: 'default',
});
const bodies = Object.entries(shardFiles)
  .sort(([a], [b]) => Number(a.match(/(\d+)\.json$/)![1]) - Number(b.match(/(\d+)\.json$/)![1]))
  .flatMap(([, v]) => v);

describe('generated Hebrew library', () => {
  it('has every song with a body', () => {
    expect(index.length).toBe(1394);
    expect(bodies.length).toBe(index.length);
  });
  it('every chord parses and every section is named', () => {
    const bad = new Set<string>();
    for (const b of bodies) {
      for (const pat of b.p) for (const c of pat.split(' ')) if (!parseChordSymbol(c)) bad.add(c);
      for (const [name, i] of b.s) {
        expect(name).toMatch(/^(בית \d+|פזמון|שיר)$/);
        expect(b.p[i]).toBeTruthy();
      }
    }
    expect([...bad]).toEqual([]);
  });
  it('has clean titles and artists and unique ids', () => {
    for (const r of index) {
      expect(r[1]).toBe(r[1].trim());
      expect(r[1].length).toBeGreaterThan(0);
      expect(r[2]).not.toMatch(/\s,|\s{2}|^\./);
    }
    expect(new Set(index.map(heSongId)).size).toBe(index.length);
  });
});

describe('Hebrew library helpers', () => {
  const rows: HeRow[] = [
    [0, 'לילה טוב', 'אביב גפן', 'Am', 889],
    [1, 'לילה טוב', 'סטלה מאריס', 'C', 891],
    [2, 'הפרח בגני', 'זהר ארגוב', 'Am', 500],
    [3, 'שיר', 'מתי כספי, שלמה גרוניך', 'G', 900],
  ];
  it('searches title and artist by word prefix', () => {
    expect(searchHe(rows, 'לילה').map((r) => r[0])).toEqual([0, 1]);
    expect(searchHe(rows, 'לילה גפן').map((r) => r[0])).toEqual([0]);
    expect(searchHe(rows, 'גרוניך').map((r) => r[0])).toEqual([3]);
    expect(searchHe(rows, 'ל')).toEqual([]);
  });
  it('credits each performer and folds final letters', () => {
    expect(performers('מתי כספי, שלמה גרוניך')).toEqual(['מתי כספי', 'שלמה גרוניך']);
    expect(groupArtists(rows).find((a) => a.name === 'שלמה גרוניך')?.rows.length).toBe(1);
    expect(heLetter('אביב גפן')).toBe('א');
    expect(heLetter('Let it')).toBe('#');
  });
  it('builds a playable song with a stable id', () => {
    const song = bodyToHeSong(rows[2], { p: ['Am G', 'F E'], s: [['בית 1', 0], ['פזמון', 1], ['בית 1', 0]], k: 'Am' }, { source: 'ספר' });
    expect(song.id).toBe('he-500');
    expect(song.source).toBe('hebrew-book');
    expect(song.sections.map((s) => s.name)).toEqual(['בית 1', 'פזמון', 'בית 1']);
    expect(song.sections[0].chords).toEqual([{ chord: 'Am', beats: 4 }, { chord: 'G', beats: 4 }]);
  });
});

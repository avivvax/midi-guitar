import type { Song } from './types';

type SongFile = Omit<Song, 'id'>;

// Every songs/*.json file is bundled; the file name is the song id.
const files = import.meta.glob<SongFile>('../../songs/*.json', { eager: true, import: 'default' });

export const SEED_SONGS: Song[] = Object.entries(files)
  .map(([path, s]) => ({ ...s, id: path.slice(path.lastIndexOf('/') + 1, -'.json'.length) }))
  .sort((a, b) => a.title.localeCompare(b.title, 'he'));

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[֑-ׇ]/g, '') // Hebrew niqqud / cantillation
    .replace(/[̀-ͯ]/g, '') // Latin accents
    .replace(/['’"]/g, '');

/** Case/accent-insensitive search over title and artist; every word must match. */
export function searchSongs(songs: Song[], query: string): Song[] {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return songs;
  return songs.filter((s) => {
    const hay = norm(`${s.title} ${s.artist}`);
    return words.every((w) => hay.includes(w));
  });
}

import { useMemo, useState } from 'react';
import { transposeKey } from '../song/chordSymbol';
import { SEED_SONGS, searchSongs } from '../song/library';
import { useStore } from '../state/store';
import styles from './Songs.module.css';

type Filter = 'all' | 'fav' | 'mine';

export default function SongLibrary() {
  const { userSongs, favorites, songPrefs, toggleFavorite, openSong, deleteUserSong, set } = useStore();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const all = useMemo(() => [...userSongs, ...SEED_SONGS], [userSongs]);
  const shown = useMemo(() => {
    let list = all;
    if (filter === 'fav') list = list.filter((s) => favorites.includes(s.id));
    if (filter === 'mine') list = list.filter((s) => s.user);
    return searchSongs(list, query);
  }, [all, filter, favorites, query]);

  return (
    <div className={styles.wrap}>
      <div className={styles.libHead}>
        <input
          type="search"
          className={styles.search}
          placeholder="חיפוש לפי שם שיר או אמן"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="חיפוש"
        />
        <button className={styles.importBtn} onClick={() => set({ songView: 'import' })}>
          + ייבוא
        </button>
      </div>
      <div className={styles.chips} role="group" aria-label="סינון">
        {(
          [
            ['all', `הכל (${all.length})`],
            ['fav', `★ מועדפים (${favorites.filter((f) => all.some((s) => s.id === f)).length})`],
            ['mine', `שלי (${userSongs.length})`],
          ] as [Filter, string][]
        ).map(([id, label]) => (
          <button key={id} className={filter === id ? styles.chipOn : ''} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 && (
        <p className={styles.empty}>
          {filter === 'fav' ? 'עוד אין מועדפים. סמן ★ ליד שיר.' : filter === 'mine' ? 'עוד לא ייבאת שירים.' : 'לא נמצאו שירים.'}
        </p>
      )}

      <ul className={styles.list}>
        {shown.map((song) => {
          const fav = favorites.includes(song.id);
          const t = songPrefs[song.id]?.transpose ?? 0;
          return (
            <li key={song.id} className={styles.row}>
              <button
                className={`${styles.star} ${fav ? styles.starOn : ''}`}
                aria-label={fav ? 'הסר ממועדפים' : 'הוסף למועדפים'}
                aria-pressed={fav}
                onClick={() => toggleFavorite(song.id)}
              >
                {fav ? '★' : '☆'}
              </button>
              <button className={styles.rowMain} onClick={() => openSong(song.id)}>
                <span className={styles.rowTitle} dir="auto">{song.title}</span>
                <span className={styles.rowSub}>
                  <bdi>{song.artist}</bdi> · <span className="ltr">{transposeKey(song.key, t)}</span>
                  {song.capo ? ` · קאפו ${song.capo}` : ''}
                </span>
              </button>
              {song.user && (
                <button
                  className={styles.del}
                  aria-label="מחק שיר"
                  onClick={() => {
                    if (window.confirm(`למחוק את "${song.title}"?`)) deleteUserSong(song.id);
                  }}
                >
                  🗑
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

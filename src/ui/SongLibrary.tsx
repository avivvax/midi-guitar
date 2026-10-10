import { useEffect, useMemo, useState } from 'react';
import { loadIndexSong, loadManifest, searchIndex, stableId, type IndexManifest, type IndexRow } from '../song/chordIndex';
import { transposeKey } from '../song/chordSymbol';
import { SEED_SONGS, searchSongs } from '../song/library';
import { useStore } from '../state/store';
import SongBrowse from './SongBrowse';
import styles from './Songs.module.css';

type Filter = 'all' | 'fav' | 'mine';

export default function SongLibrary() {
  const { userSongs, cachedSongs, favorites, songPrefs, toggleFavorite, openSong, deleteUserSong, cacheSong, set } = useStore();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [manifest, setManifest] = useState<IndexManifest | null | undefined>(undefined);
  const [remote, setRemote] = useState<{ q: string; rows: IndexRow[]; needMore: boolean } | null>(null);
  const [loadingRow, setLoadingRow] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void loadManifest().then(setManifest);
  }, []);

  // Debounced search of the Chordonomicon index.
  useEffect(() => {
    const q = query.trim();
    if (!manifest || filter !== 'all' || q.length < 2) {
      setRemote(null);
      return;
    }
    let live = true;
    const id = window.setTimeout(() => {
      searchIndex(q)
        .then((r) => live && setRemote({ q, ...r }))
        .catch(() => live && setRemote({ q, rows: [], needMore: false }));
    }, 250);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [query, manifest, filter]);

  const openRow = async (row: IndexRow, favorite = false) => {
    setLoadingRow(row[0]);
    setError('');
    try {
      const song = await loadIndexSong(row);
      if (!song) throw new Error('missing');
      cacheSong(song);
      if (favorite) {
        if (!useStore.getState().favorites.includes(song.id)) toggleFavorite(song.id);
      } else openSong(song.id);
    } catch {
      setError('לא הצלחתי לטעון את השיר. בדוק חיבור לאינטרנט ונסה שוב.');
    } finally {
      setLoadingRow(null);
    }
  };

  const all = useMemo(() => [...userSongs, ...SEED_SONGS], [userSongs]);
  const shown = useMemo(() => {
    let list = all;
    if (filter === 'fav') list = [...all, ...cachedSongs].filter((s) => favorites.includes(s.id));
    if (filter === 'mine') list = list.filter((s) => s.user);
    return searchSongs(list, query);
  }, [all, cachedSongs, filter, favorites, query]);
  const localIds = new Set(shown.map((s) => s.id));

  /** Index rows (search, artist and genre lists): tap to open, ☆ to keep as a favorite. */
  const renderRows = (rows: IndexRow[]) => (
    <ul className={styles.list}>
      {rows.map((r) => {
        const id = stableId(r[1], r[2]);
        const fav = favorites.includes(id);
        return (
          <li key={r[0]} className={styles.row}>
            <button
              className={`${styles.star} ${fav ? styles.starOn : ''}`}
              aria-label={fav ? 'הסר ממועדפים' : 'הוסף למועדפים'}
              aria-pressed={fav}
              onClick={() => (fav ? toggleFavorite(id) : void openRow(r, true))}
            >
              {fav ? '★' : '☆'}
            </button>
            <button className={styles.rowMain} onClick={() => void openRow(r)} disabled={loadingRow !== null}>
              <span className={styles.rowTitle} dir="auto">
                {r[1]}
              </span>
              <span className={styles.rowSub}>
                <bdi>{r[2]}</bdi> · <span className="ltr">{r[3]}</span>
                {loadingRow === r[0] ? ' · טוען…' : ''}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );

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
            ['fav', `★ מועדפים (${favorites.filter((f) => all.some((s) => s.id === f) || cachedSongs.some((s) => s.id === f)).length})`],
            ['mine', `שלי (${userSongs.length})`],
          ] as [Filter, string][]
        ).map(([id, label]) => (
          <button key={id} className={filter === id ? styles.chipOn : ''} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
        {manifest?.browse && filter === 'all' && !query.trim() && (
          <button
            className={styles.jump}
            onClick={() => document.getElementById('browse')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            דפדוף במאגר ↓
          </button>
        )}
      </div>

      {shown.length === 0 && !remote?.rows.length && (
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

      {filter === 'all' && manifest && query.trim().length >= 2 && (
        <section className={styles.remote} aria-label="תוצאות מהמאגר">
          <h2>
            מהמאגר <span className="ltr">Chordonomicon</span>
          </h2>
          {error && <p className={styles.warn}>{error}</p>}
          {!remote || remote.q !== query.trim() ? (
            <p className={styles.empty}>מחפש…</p>
          ) : remote.needMore ? (
            <p className={styles.empty}>הקלד מילה מהשם (לפחות 2 אותיות)</p>
          ) : remote.rows.length === 0 ? (
            <p className={styles.empty}>לא נמצא במאגר</p>
          ) : (
            renderRows(remote.rows.filter((r) => !localIds.has(stableId(r[1], r[2]))))
          )}
        </section>
      )}

      {filter === 'all' && manifest?.browse && query.trim().length < 2 && (
        <SongBrowse manifest={manifest} renderRows={renderRows} />
      )}
      {error && query.trim().length < 2 && <p className={styles.warn}>{error}</p>}

      {manifest && (
        <p className={styles.credit}>
          {manifest.songs.toLocaleString('he-IL')} שירים מהמאגר{' '}
          <a href="https://huggingface.co/datasets/ailsntua/Chordonomicon" target="_blank" rel="noreferrer">
            Chordonomicon
          </a>{' '}
          (Kantarelis et al., 2024, CC BY-NC 4.0) – לשימוש לא מסחרי בלבד.
        </p>
      )}
    </div>
  );
}

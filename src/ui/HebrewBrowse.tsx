import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { groupArtists, heLetter, loadHeIndex, loadHeManifest, type HeArtist, type HeManifest, type HeRow } from '../song/hebrewLibrary';
import { songCount } from './songCount';
import styles from './Songs.module.css';

type Tab = 'az' | 'popular';
const POPULAR = 40;

/**
 * "עברית" browse section for the built-in Hebrew library: artists א–ת and the
 * artists with the most songs. The library index loads only when a tab opens.
 */
export default function HebrewBrowse({ renderRows }: { renderRows: (rows: HeRow[]) => ReactNode }) {
  const [manifest, setManifest] = useState<HeManifest | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);
  const [rows, setRows] = useState<HeRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [letter, setLetter] = useState<string | null>(null);
  const [artist, setArtist] = useState<HeArtist | null>(null);

  useEffect(() => {
    void loadHeManifest().then(setManifest);
  }, []);
  useEffect(() => {
    if (!tab || rows) return;
    let live = true;
    setFailed(false);
    loadHeIndex()
      .then((r) => live && (r.length ? setRows(r) : setFailed(true)))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [tab, rows]);

  const artists = useMemo(() => (rows ? groupArtists(rows) : []), [rows]);
  const letters = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of artists) m.set(heLetter(a.name), (m.get(heLetter(a.name)) ?? 0) + 1);
    return [...m].sort(([a], [b]) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b, 'he')));
  }, [artists]);

  if (!manifest) return null;

  const artistList = (list: HeArtist[]) => (
    <ul className={styles.list}>
      {list.map((a) => (
        <li key={a.name} className={styles.row}>
          <button className={styles.rowMain} onClick={() => setArtist(a)}>
            <span className={styles.rowTitle} dir="auto">
              {a.name}
            </span>
            <span className={styles.rowSub}>{songCount(a.rows.length)}</span>
          </button>
        </li>
      ))}
    </ul>
  );

  let body: ReactNode = null;
  if (artist) {
    body = (
      <>
        <div className={styles.pHead}>
          <button className={styles.back} onClick={() => setArtist(null)} aria-label="חזרה לרשימת האמנים">
            →
          </button>
          <div className={styles.pTitle}>
            <b dir="auto">{artist.name}</b>
            <span>{songCount(artist.rows.length)}</span>
          </div>
        </div>
        {renderRows(artist.rows)}
      </>
    );
  } else if (tab && !rows) {
    body = <p className={styles.empty}>{failed ? 'הטעינה נכשלה. בדוק חיבור לאינטרנט.' : 'טוען…'}</p>;
  } else if (tab === 'az') {
    body = (
      <>
        <div className={styles.letters}>
          {letters.map(([l, n]) => (
            <button key={l} className={letter === l ? styles.chipOn : ''} onClick={() => setLetter(letter === l ? null : l)} aria-label={`${l} (${n})`}>
              {l}
            </button>
          ))}
        </div>
        {letter &&
          artistList(
            artists.filter((a) => heLetter(a.name) === letter).sort((a, b) => a.name.localeCompare(b.name, 'he')),
          )}
      </>
    );
  } else if (tab === 'popular') {
    body = (
      <>
        <p className={styles.note}>האמנים עם הכי הרבה שירים בספר</p>
        {artistList([...artists].sort((a, b) => b.rows.length - a.rows.length || a.name.localeCompare(b.name, 'he')).slice(0, POPULAR))}
      </>
    );
  }

  return (
    <section className={styles.browse} id="hebrew" aria-label="עברית">
      <h2>עברית · {manifest.songs.toLocaleString('he-IL')} שירים</h2>
      {!artist && (
        <div className={styles.seg} role="tablist" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {(
            [
              ['az', 'אמנים א–ת'],
              ['popular', 'אמנים פופולריים'],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? styles.segOn : ''}
              onClick={() => setTab(tab === id ? null : id)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {body}
      <p className={styles.credit}>{manifest.credit}</p>
    </section>
  );
}

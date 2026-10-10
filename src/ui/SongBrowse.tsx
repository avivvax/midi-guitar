import { useEffect, useState, type ReactNode } from 'react';
import {
  decadeLabel,
  facetKey,
  genreLabel,
  letterLabel,
  loadArtistSongs,
  loadFacetPage,
  loadFacets,
  loadLetter,
  loadPopular,
  type BrowseArtist,
  type Facets,
  type IndexManifest,
  type IndexRow,
} from '../song/chordIndex';
import { songCount } from './songCount';
import styles from './Songs.module.css';

type Tab = 'artists' | 'facets' | 'popular';

/**
 * Browse the Chordonomicon index without searching: artists A–Z, genre /
 * decade chips, and the most-covered artists. Every list is a small static
 * file fetched only when the user opens it.
 */
export default function SongBrowse(props: { manifest: IndexManifest; renderRows: (rows: IndexRow[]) => ReactNode }) {
  const { manifest, renderRows } = props;
  const [tab, setTab] = useState<Tab | null>(null);
  const [artist, setArtist] = useState<BrowseArtist | null>(null);
  if (!manifest.browse) return null;

  return (
    <section className={styles.browse} id="browse" aria-label="דפדוף במאגר">
      <h2>דפדוף במאגר</h2>
      {artist ? (
        <ArtistSongs artist={artist} onBack={() => setArtist(null)} renderRows={renderRows} />
      ) : (
        <>
          <div className={styles.seg} role="tablist">
            {(
              [
                ['artists', 'אמנים A–Z'],
                ['facets', "ז'אנר ועשור"],
                ['popular', 'פופולרי'],
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
          {tab === 'artists' && <ArtistsAZ letters={manifest.browse.letters} onArtist={setArtist} />}
          {tab === 'facets' && <FacetBrowse renderRows={renderRows} />}
          {tab === 'popular' && <Popular onArtist={setArtist} />}
        </>
      )}
    </section>
  );
}

function useLoad<T>(load: () => Promise<T>, deps: unknown[]): { data: T | null; failed: boolean } {
  const [state, setState] = useState<{ data: T | null; failed: boolean }>({ data: null, failed: false });
  useEffect(() => {
    let live = true;
    setState({ data: null, failed: false });
    load()
      .then((data) => live && setState({ data, failed: false }))
      .catch(() => live && setState({ data: null, failed: true }));
    return () => {
      live = false;
    };
  }, deps);
  return state;
}

function Status({ failed }: { failed: boolean }) {
  return <p className={styles.empty}>{failed ? 'הטעינה נכשלה. בדוק חיבור לאינטרנט.' : 'טוען…'}</p>;
}

function ArtistList({ artists, onArtist }: { artists: BrowseArtist[]; onArtist: (a: BrowseArtist) => void }) {
  return (
    <ul className={styles.list}>
      {artists.map((a) => (
        <li key={a[0]} className={styles.row}>
          <button className={styles.rowMain} onClick={() => onArtist(a)}>
            <span className={styles.rowTitle} dir="auto">
              {a[1]}
            </span>
            <span className={styles.rowSub}>{songCount(a[2])}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ArtistsAZ({ letters, onArtist }: { letters: [string, number][]; onArtist: (a: BrowseArtist) => void }) {
  const [letter, setLetter] = useState<string | null>(null);
  return (
    <>
      <div className={`${styles.letters} ltr`}>
        {letters.map(([l, n]) => (
          <button
            key={l}
            className={letter === l ? styles.chipOn : ''}
            onClick={() => setLetter(letter === l ? null : l)}
            aria-label={`${letterLabel(l)} (${n})`}
          >
            {letterLabel(l)}
          </button>
        ))}
      </div>
      {letter && <LetterArtists letter={letter} onArtist={onArtist} />}
    </>
  );
}

function LetterArtists({ letter, onArtist }: { letter: string; onArtist: (a: BrowseArtist) => void }) {
  const { data, failed } = useLoad(() => loadLetter(letter), [letter]);
  if (!data) return <Status failed={failed} />;
  return <ArtistList artists={data} onArtist={onArtist} />;
}

function Popular({ onArtist }: { onArtist: (a: BrowseArtist) => void }) {
  const { data, failed } = useLoad(loadPopular, []);
  if (!data) return <Status failed={failed} />;
  return (
    <>
      <p className={styles.note}>האמנים עם הכי הרבה שירים במאגר</p>
      <ArtistList artists={data} onArtist={onArtist} />
    </>
  );
}

function ArtistSongs(props: { artist: BrowseArtist; onBack: () => void; renderRows: (rows: IndexRow[]) => ReactNode }) {
  const { artist, onBack, renderRows } = props;
  const { data, failed } = useLoad(() => loadArtistSongs(artist), [artist[0]]);
  return (
    <>
      <div className={styles.pHead}>
        <button className={styles.back} onClick={onBack} aria-label="חזרה לרשימת האמנים">
          →
        </button>
        <div className={styles.pTitle}>
          <b dir="auto">{artist[1]}</b>
          <span>{songCount(artist[2])}</span>
        </div>
      </div>
      {data ? renderRows(data) : <Status failed={failed} />}
    </>
  );
}

function FacetBrowse({ renderRows }: { renderRows: (rows: IndexRow[]) => ReactNode }) {
  const facets = useLoad<Facets | null>(loadFacets, []);
  const [genre, setGenre] = useState<string | null>(null);
  const [decade, setDecade] = useState<number | null>(null);
  const [rows, setRows] = useState<IndexRow[]>([]);
  const [pages, setPages] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const f = facets.data;
  const total = f && (genre || decade) ? (f.combos[facetKey(genre, decade)] ?? 0) : 0;

  // Selection changed: start again from the first page.
  useEffect(() => {
    setRows([]);
    setPages(0);
    setFailed(false);
    if (!genre && decade === null) return;
    let live = true;
    setBusy(true);
    loadFacetPage(genre, decade, 0)
      .then((r) => {
        if (!live) return;
        setRows(r);
        setPages(1);
      })
      .catch(() => live && setFailed(true))
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
  }, [genre, decade]);

  const more = () => {
    setBusy(true);
    loadFacetPage(genre, decade, pages)
      .then((r) => {
        setRows((prev) => [...prev, ...r]);
        setPages((p) => p + 1);
      })
      .catch(() => setFailed(true))
      .finally(() => setBusy(false));
  };

  if (!f) return <Status failed={facets.failed} />;
  return (
    <>
      <div className={styles.facetChips}>
        {f.genres.map(([g, n]) => (
          <button key={g} className={genre === g ? styles.chipOn : ''} onClick={() => setGenre(genre === g ? null : g)}>
            {genreLabel(g)} <small>{n.toLocaleString('he-IL')}</small>
          </button>
        ))}
      </div>
      <div className={styles.facetChips}>
        {f.decades.map(([d, n]) => (
          <button key={d} className={decade === d ? styles.chipOn : ''} onClick={() => setDecade(decade === d ? null : d)}>
            {decadeLabel(d)} <small>{n.toLocaleString('he-IL')}</small>
          </button>
        ))}
      </div>
      {!genre && decade === null ? (
        <p className={styles.empty}>בחר ז'אנר, עשור או שניהם</p>
      ) : (
        <>
          <p className={styles.note}>
            {total.toLocaleString('he-IL')} שירים · מסודרים לפי אמנים עם הכי הרבה שירים במאגר
          </p>
          {rows.length > 0 && renderRows(rows)}
          {failed && <p className={styles.warn}>הטעינה נכשלה. בדוק חיבור לאינטרנט.</p>}
          {busy ? (
            <p className={styles.empty}>טוען…</p>
          ) : (
            rows.length < total &&
            pages * f.page < total && (
              <button className={styles.moreBtn} onClick={more}>
                עוד שירים ({(total - rows.length).toLocaleString('he-IL')} נוספים)
              </button>
            )
          )}
        </>
      )}
    </>
  );
}

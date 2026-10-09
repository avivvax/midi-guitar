import { useMemo, useState } from 'react';
import { parseChordSheet } from '../song/chordSheet';
import { useStore } from '../state/store';
import styles from './Songs.module.css';

const EXAMPLE = `[Verse]
C        G        Am       F
(מילים – לא יישמרו)
[Chorus]
F    G    C    Am`;

export default function SongImport() {
  const { set, saveUserSong, openSong } = useStore();
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [tempo, setTempo] = useState('');
  const parsed = useMemo(() => (text.trim() ? parseChordSheet(text) : null), [text]);
  const chordCount = parsed?.sections.reduce((n, s) => n + s.chords.length, 0) ?? 0;

  const finalTitle = title.trim() || parsed?.title || '';
  const canSave = chordCount > 0 && finalTitle.length > 0;

  const save = () => {
    if (!parsed || !canSave) return;
    const id = `user-${Date.now().toString(36)}`;
    saveUserSong({
      id,
      user: true,
      title: finalTitle,
      artist: artist.trim() || parsed.artist || '—',
      key: parsed.key ?? 'C',
      tempo: Math.max(40, Math.min(220, Number(tempo) || parsed.tempo || 100)),
      ...(parsed.capo ? { capo: parsed.capo } : {}),
      sections: parsed.sections,
    });
    openSong(id);
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.pHead}>
        <button className={styles.back} onClick={() => set({ songView: 'library' })} aria-label="חזרה לרשימה">
          →
        </button>
        <div className={styles.pTitle}>
          <b>ייבוא שיר</b>
          <span>מדביקים דף אקורדים (ChordPro או אקורדים מעל מילים)</span>
        </div>
      </div>

      <textarea
        className={`${styles.paste} ltr`}
        placeholder={EXAMPLE}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="דף אקורדים"
        spellCheck={false}
      />
      <p className={styles.note}>רק רצף האקורדים ושמות החלקים נשמרים. המילים נמחקות ולא נשמרות בשום מקום.</p>

      {parsed && (
        <>
          <div className={styles.form}>
            <label>
              שם השיר
              <input value={title} placeholder={parsed.title ?? ''} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label>
              אמן
              <input value={artist} placeholder={parsed.artist ?? ''} onChange={(e) => setArtist(e.target.value)} />
            </label>
            <label>
              טמפו (BPM)
              <input inputMode="numeric" value={tempo} placeholder={String(parsed.tempo ?? 100)} onChange={(e) => setTempo(e.target.value)} />
            </label>
          </div>

          <div className={styles.preview}>
            <div className={styles.previewHead}>
              {chordCount} אקורדים ב-{parsed.sections.length} חלקים · סולם <span className="ltr">{parsed.key ?? '?'}</span>
              {parsed.capo ? ` · קאפו ${parsed.capo}` : ''} · {parsed.lyricLines} שורות מילים הושמטו
            </div>
            {parsed.sections.map((sec, i) => (
              <div key={i} className={styles.previewSec}>
                <b>{sec.name}</b>
                <span className="ltr">{sec.chords.map((c) => c.chord).join('  ')}</span>
              </div>
            ))}
            {parsed.unknown.length > 0 && (
              <div className={styles.warn}>
                לא זוהו: <span className="ltr">{[...new Set(parsed.unknown)].join(', ')}</span>
              </div>
            )}
            {chordCount === 0 && <div className={styles.warn}>לא נמצאו אקורדים בטקסט.</div>}
          </div>

          <button className={styles.saveBtn} disabled={!canSave} onClick={save}>
            {canSave ? 'שמור ופתח' : chordCount ? 'צריך שם לשיר' : 'אין אקורדים לשמור'}
          </button>
        </>
      )}
    </div>
  );
}

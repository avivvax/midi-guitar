import { useEffect } from 'react';
import { ensureAudio, setSongPlaying } from '../controller';
import { symbolToChord, transposeKey } from '../song/chordSymbol';
import { next, prev, restart, jumpToSection, type AdvanceMode } from '../song/player';
import { displaySymbol, findSong, songSettings, stepsOf } from '../song/session';
import { tuningNotes, useStore, voicingFor } from '../state/store';
import ChordDiagram from './ChordDiagram';
import styles from './Songs.module.css';

const MODES: { id: AdvanceMode; label: string }[] = [
  { id: 'tempo', label: 'טמפו' },
  { id: 'strum', label: 'פריטות' },
  { id: 'manual', label: 'ידני' },
];

export default function SongPlayer() {
  const s = useStore();
  const song = findSong(s, s.songId);

  // Stop the metronome when leaving the player.
  useEffect(() => () => void setSongPlaying(false), []);

  if (!song) {
    return (
      <div className={styles.wrap}>
        <p className={styles.empty}>השיר לא נמצא.</p>
        <button onClick={() => s.set({ songView: 'library' })}>חזרה לרשימה</button>
      </div>
    );
  }

  const steps = stepsOf(song);
  const cfg = songSettings(s, song);
  const p = s.player;
  const cur = steps[p.pos];
  const nxt = p.loopSection
    ? steps[p.pos + 1]?.section === cur.section
      ? steps[p.pos + 1]
      : steps.find((st) => st.section === cur.section)
    : steps[p.pos + 1];
  const curSym = displaySymbol(cur.chord, cfg.transpose);
  const nextSym = nxt ? displaySymbol(nxt.chord, cfg.transpose) : null;
  const curChord = symbolToChord(curSym);
  const fav = s.favorites.includes(song.id);
  const mode = s.advanceMode;
  const setPrefs = (patch: Parameters<typeof s.setSongPrefs>[1]) => s.setSongPrefs(song.id, patch);

  const go = (fn: () => typeof p) => {
    void ensureAudio();
    s.setPlayer(fn());
  };
  const advance = () => go(() => next(steps, p));

  // Beat / strum indicator.
  const dots =
    mode === 'tempo' ? cur.beats : mode === 'strum' ? cfg.strumsPerChord : 0;
  const filled = mode === 'tempo' ? (s.playing ? p.beat + 1 : 0) : mode === 'strum' ? p.strums : 0;

  return (
    <div className={styles.player}>
      <div className={styles.pHead}>
        <button className={styles.back} onClick={() => s.set({ songView: 'library' })} aria-label="חזרה לרשימה">
          →
        </button>
        <div className={styles.pTitle}>
          <b dir="auto">{song.title}</b>
          <span dir="auto">
            <bdi>{song.artist}</bdi> · <span className="ltr">{transposeKey(song.key, cfg.transpose)}</span>
          </span>
        </div>
        <button
          className={`${styles.star} ${fav ? styles.starOn : ''}`}
          onClick={() => s.toggleFavorite(song.id)}
          aria-label={fav ? 'הסר ממועדפים' : 'הוסף למועדפים'}
          aria-pressed={fav}
        >
          {fav ? '★' : '☆'}
        </button>
      </div>

      {song.capo !== undefined && song.capo !== s.capo && (
        <div className={styles.capoHint}>
          השיר כתוב לקאפו {song.capo} (כרגע {s.capo})
          <button onClick={() => s.set({ capo: song.capo })}>החל</button>
        </div>
      )}

      <div className={`${styles.sections} ltr`}>
        {song.sections.map((sec, i) => (
          <button
            key={i}
            className={i === cur.section ? styles.chipOn : ''}
            onClick={() => go(() => jumpToSection(steps, p, i))}
          >
            {sec.name}
          </button>
        ))}
      </div>

      <div
        className={`${styles.stage} ${mode === 'manual' ? styles.tappable : ''}`}
        onClick={mode === 'manual' ? advance : undefined}
        role={mode === 'manual' ? 'button' : undefined}
        aria-label={mode === 'manual' ? 'אקורד הבא' : undefined}
      >
        <div className={styles.sectionName}>{song.sections[cur.section].name}</div>
        <div className={styles.stageRow}>
          <div className={`${styles.bigChord} ltr`} data-testid="current-chord">
            {curSym}
          </div>
          {curChord && <ChordDiagram voicing={voicingFor(curChord, tuningNotes(s))} size={78} />}
        </div>
        {dots > 0 && (
          <div className={`${styles.dots} ltr`} aria-label={`${filled}/${dots}`}>
            {Array.from({ length: Math.min(dots, 12) }, (_, i) => (
              <span key={i} className={i < filled ? styles.dotOn : ''} />
            ))}
          </div>
        )}
        <div className={styles.nextLine}>
          {p.finished ? (
            <span>סוף השיר</span>
          ) : nextSym ? (
            <>
              הבא: <b className="ltr">{nextSym}</b>
              {nxt && nxt.section !== cur.section && <small> ({song.sections[nxt.section].name})</small>}
            </>
          ) : (
            <span>אקורד אחרון</span>
          )}
        </div>
      </div>

      <div className={styles.seg} role="group" aria-label="מצב התקדמות">
        {MODES.map((m) => (
          <button
            key={m.id}
            className={mode === m.id ? styles.segOn : ''}
            onClick={() => {
              if (m.id !== 'tempo') void setSongPlaying(false);
              s.set({ advanceMode: m.id, player: { ...p, beat: 0, strums: 0 } });
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className={styles.ctlRow}>
        {mode === 'tempo' && (
          <>
            <button className={styles.play} onClick={() => void setSongPlaying(!s.playing)} aria-label={s.playing ? 'עצור' : 'נגן'}>
              {s.playing ? '⏸' : '▶'}
            </button>
            <Stepper
              label="BPM"
              value={cfg.tempo}
              onChange={(v) => setPrefs({ tempo: Math.max(40, Math.min(220, v)) })}
              step={2}
            />
            <button
              className={s.clickOn ? styles.toggleOn : ''}
              onClick={() => s.set({ clickOn: !s.clickOn })}
              aria-pressed={s.clickOn}
            >
              קליק
            </button>
          </>
        )}
        {mode === 'strum' && (
          <Stepper
            label="פריטות לאקורד"
            value={cfg.strumsPerChord}
            onChange={(v) => setPrefs({ strumsPerChord: Math.max(1, Math.min(16, v)) })}
          />
        )}
        {mode === 'manual' && <span className={styles.hint}>הקש על האקורד או על "הבא"</span>}
      </div>

      <div className={styles.ctlRow}>
        <Stepper label="טרנספוז" value={cfg.transpose} signed onChange={(v) => setPrefs({ transpose: Math.max(-11, Math.min(11, v)) })} />
        <button
          className={p.loopSection ? styles.toggleOn : ''}
          onClick={() => s.setPlayer({ ...p, loopSection: !p.loopSection, finished: false })}
          aria-pressed={p.loopSection}
        >
          🔁 לופ
        </button>
        <button onClick={() => go(() => restart(p))} aria-label="מההתחלה">
          ⏮
        </button>
      </div>

      <div className={styles.bottom}>
        <button className={styles.prevBtn} onClick={() => go(() => prev(steps, p))} aria-label="אקורד קודם">
          ◀
        </button>
        <button className={styles.nextBtn} onClick={advance}>
          הבא ▶
        </button>
      </div>
    </div>
  );
}

function Stepper(props: { label: string; value: number; onChange: (v: number) => void; step?: number; signed?: boolean }) {
  const { label, value, onChange, step = 1, signed } = props;
  return (
    <div className={styles.stepper}>
      <button onClick={() => onChange(value - step)} aria-label={`${label} פחות`}>
        −
      </button>
      <span>
        <small>{label}</small>
        <b className="ltr">{signed && value > 0 ? `+${value}` : value}</b>
      </span>
      <button onClick={() => onChange(value + step)} aria-label={`${label} יותר`}>
        +
      </button>
    </div>
  );
}

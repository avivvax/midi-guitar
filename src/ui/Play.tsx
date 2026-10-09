import { INSTRUMENTS, type InstrumentId } from '../audio/engine';
import { live } from '../controller';
import { chordName, noteName, pc, voicingToString } from '../music/theory';
import { currentChord, tuningNotes, useStore, voicingFor } from '../state/store';
import ChordDiagram from './ChordDiagram';
import StringsView from './StringsView';
import { useTicker } from './useRaf';
import styles from './Play.module.css';

export default function Play() {
  const s = useStore();
  const tuning = tuningNotes(s);
  const chord = currentChord(s);
  const voicing = voicingFor(chord, tuning);
  const chordMode = s.mode === 'chord';
  // Free mode shows live frets from the neck, so refresh a few times a second.
  useTicker(chordMode ? 1 : 8);

  const labels = tuning.map((n, i) => {
    const f = chordMode ? voicing[i] : live.frets[i];
    return f === null ? '×' : noteName(n + s.capo + f);
  });

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div className={styles.chordBox}>
          {chordMode ? (
            <>
              <div className={`${styles.chord} ltr`}>{chordName(chord)}</div>
              <div className={`${styles.sub} ltr`}>
                {voicingToString(voicing)}
                {s.capo > 0 && ` · sounds ${chordName({ ...chord, root: pc(chord.root + s.capo) })}`}
              </div>
            </>
          ) : (
            <>
              <div className={styles.chord}>חופשי</div>
              <div className={`${styles.sub} ltr`}>frets {live.frets.map((f) => (f === null ? 'x' : f)).join(' ')}</div>
            </>
          )}
        </div>
        {chordMode && <ChordDiagram voicing={voicing} size={84} />}
      </div>

      <div className={styles.controls}>
        <div className={styles.seg} role="group" aria-label="מצב">
          <button className={chordMode ? styles.on : ''} onClick={() => s.set({ mode: 'chord' })}>
            אקורדים
          </button>
          <button className={!chordMode ? styles.on : ''} onClick={() => s.set({ mode: 'free' })}>
            חופשי
          </button>
        </div>
        <div className={styles.capo}>
          <button aria-label="capo down" onClick={() => s.set({ capo: Math.max(0, s.capo - 1) })}>
            −
          </button>
          <span>
            קאפו <b className="ltr">{s.capo}</b>
          </span>
          <button aria-label="capo up" onClick={() => s.set({ capo: Math.min(7, s.capo + 1) })}>
            +
          </button>
        </div>
        <select
          aria-label="כלי"
          className={`${styles.inst} ltr`}
          value={s.instrument}
          onChange={(e) => s.set({ instrument: e.target.value as InstrumentId })}
        >
          {INSTRUMENTS.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </div>

      <StringsView labels={labels} />

      <div className={`${styles.palette} ${chordMode ? '' : styles.dim} ltr`}>
        {s.palette.map((c, i) => (
          <button
            key={i}
            className={`${styles.slot} ${i === s.selectedSlot ? styles.sel : ''} ltr`}
            onPointerDown={() => s.set({ selectedSlot: i, mode: 'chord' })}
          >
            {chordName(c)}
          </button>
        ))}
      </div>
    </div>
  );
}

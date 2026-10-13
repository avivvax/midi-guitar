import { live, shiftRegister } from '../controller';
import { chordNotes, freeNote, registerRange, type PhysNote } from '../instruments/mapping';
import { chordName, noteName, noteNameOct, pc, voicingToString } from '../music/theory';
import { currentChord, playSetup, useStore } from '../state/store';
import ChordDiagram from './ChordDiagram';
import InstrumentButton from './InstrumentButton';
import { physLabel } from './instrumentText';
import StringsView from './StringsView';
import { useTicker } from './useRaf';
import styles from './Play.module.css';

export default function Play() {
  const s = useStore();
  const setup = playSetup(s);
  const inst = setup.inst;
  const chord = currentChord(s);
  const chordMode = s.mode === 'chord';
  const chordRes = chordNotes(setup, chord);
  // Free mode shows live frets from the neck, so refresh a few times a second.
  useTicker(chordMode ? 1 : 8);

  const results = chordMode ? chordRes.physical : setup.physical.map((_, p) => freeNote(setup, p, live.frets[p]));
  const labels = results.map(physLabel);
  const range = registerRange(inst, setup.tuning);
  const winNotes = setup.window.map((c) => setup.tuning[c] + setup.capo);
  const sounding = chordRes.physical.filter((r): r is PhysNote => r !== null && r !== 'mute');

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div className={styles.chordBox}>
          {chordMode ? (
            <>
              <div className={`${styles.chord} ltr`}>{chordName(chord)}</div>
              <div className={`${styles.sub} ltr`}>
                {chordRes.voicing ? voicingToString(chordRes.voicing) : [...new Set(sounding.map((n) => noteName(n.midi)))].join(' ')}
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
        {chordMode && chordRes.voicing && <ChordDiagram voicing={chordRes.voicing} size={84} />}
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
        <InstrumentButton className={styles.inst} />
        {range.max > 0 && (
          <div className={`${styles.capo} ${styles.wide} ltr`} role="group" aria-label="רגיסטר">
            <button aria-label="register down" onClick={() => shiftRegister(-1)} disabled={setup.register <= 0}>
              ◀
            </button>
            <span>
              רגיסטר{' '}
              <b className="ltr">
                {noteNameOct(Math.min(...winNotes))}–{noteNameOct(Math.max(...winNotes))}
              </b>
            </span>
            <button aria-label="register up" onClick={() => shiftRegister(1)} disabled={setup.register >= range.max}>
              ▶
            </button>
          </div>
        )}
        {inst.articulation.tremolo && (
          <label className={`${styles.toggle} ${styles.wide}`}>
            <input type="checkbox" checked={s.tremolo} onChange={(e) => s.set({ tremolo: e.target.checked })} />
            טרמולו
          </label>
        )}
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

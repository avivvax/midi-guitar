import { useEffect, useState } from 'react';
import { getMidiOut } from '../controller';
import {
  CHORD_TYPES,
  NOTE_NAMES,
  TUNINGS,
  chordName,
  isDiatonic,
  noteNameOct,
  voicingToString,
  type ChordType,
} from '../music/theory';
import { tuningNotes, useStore, voicingFor } from '../state/store';
import Calibration from './Calibration';
import ChordDiagram from './ChordDiagram';
import styles from './Settings.module.css';

export default function Settings() {
  const s = useStore();
  const tuning = tuningNotes(s);
  const [slot, setSlot] = useState(s.selectedSlot);
  const [diatonicOnly, setDiatonicOnly] = useState(true);
  const [midiOuts, setMidiOuts] = useState<string[] | null>(null);
  const [midiErr, setMidiErr] = useState('');
  const [calibrating, setCalibrating] = useState(false);
  const editing = s.palette[slot];

  useEffect(() => {
    if (s.midiOutName) {
      getMidiOut()
        .init()
        .then((outs) => {
          setMidiOuts(outs);
          getMidiOut().select(s.midiOutName);
        })
        .catch(() => undefined);
    }
    // Only on mount: re-select the persisted output.
  }, []);

  const setTuningNote = (i: number, delta: number) => {
    const base = s.tuningId === 'custom' ? s.customTuning : tuning;
    const next = base.slice();
    next[i] = Math.max(28, Math.min(76, next[i] + delta));
    s.set({ tuningId: 'custom', customTuning: next });
  };

  if (calibrating) return <Calibration onBack={() => setCalibrating(false)} />;

  return (
    <div className={styles.wrap}>
      <button onClick={() => setCalibrating(true)}>כיול מיתרים ›</button>

      <h2>כיוון</h2>
      <select className="ltr" value={s.tuningId} onChange={(e) => s.set({ tuningId: e.target.value })}>
        {TUNINGS.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
        <option value="custom">Custom</option>
      </select>
      <div className={`${styles.tuning} ltr`}>
        {tuning.map((n, i) => (
          <div key={i} className={styles.tString}>
            <button aria-label={`string ${i + 1} up`} onClick={() => setTuningNote(i, 1)}>
              ▲
            </button>
            <b>{noteNameOct(n)}</b>
            <button aria-label={`string ${i + 1} down`} onClick={() => setTuningNote(i, -1)}>
              ▼
            </button>
          </div>
        ))}
      </div>

      <h2>סולם</h2>
      <div className={styles.row}>
        <select
          className="ltr"
          aria-label="key root"
          value={s.key.root}
          onChange={(e) => s.setKey({ ...s.key, root: Number(e.target.value) }, false)}
        >
          {NOTE_NAMES.map((n, i) => (
            <option key={n} value={i}>
              {n}
            </option>
          ))}
        </select>
        <select
          className="ltr"
          aria-label="key mode"
          value={s.key.mode}
          onChange={(e) => s.setKey({ ...s.key, mode: e.target.value as 'major' | 'minor' }, false)}
        >
          <option value="major">major</option>
          <option value="minor">minor</option>
        </select>
        <button onClick={() => s.setKey(s.key, true)}>מלא פלטה מהסולם</button>
      </div>

      <h2>עורך אקורדים</h2>
      <div className={`${styles.slots} ltr`}>
        {s.palette.map((c, i) => (
          <button key={i} className={i === slot ? styles.sel : ''} onClick={() => setSlot(i)}>
            {i + 1}. {chordName(c)}
          </button>
        ))}
      </div>
      <div className={styles.editor}>
        <div className={styles.editorCtl}>
          <label className={styles.check}>
            <input type="checkbox" checked={diatonicOnly} onChange={(e) => setDiatonicOnly(e.target.checked)} />
            רק אקורדים מהסולם
          </label>
          <div className={`${styles.roots} ltr`}>
            {NOTE_NAMES.map((n, root) => {
              const any = CHORD_TYPES.some((t) => isDiatonic({ root, type: t.id }, s.key));
              return (
                <button
                  key={n}
                  disabled={diatonicOnly && !any}
                  className={editing.root === root ? styles.sel : ''}
                  onClick={() => {
                    const type = diatonicOnly && !isDiatonic({ root, type: editing.type }, s.key)
                      ? CHORD_TYPES.find((t) => isDiatonic({ root, type: t.id }, s.key))!.id
                      : editing.type;
                    s.setPaletteSlot(slot, { root, type });
                  }}
                >
                  {n}
                </button>
              );
            })}
          </div>
          <div className={`${styles.types} ltr`}>
            {CHORD_TYPES.map((t) => (
              <button
                key={t.id}
                disabled={diatonicOnly && !isDiatonic({ root: editing.root, type: t.id }, s.key)}
                className={editing.type === t.id ? styles.sel : ''}
                onClick={() => s.setPaletteSlot(slot, { root: editing.root, type: t.id as ChordType })}
              >
                {t.suffix || 'maj'}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.preview}>
          <b className="ltr">{chordName(editing)}</b>
          <ChordDiagram voicing={voicingFor(editing, tuning)} size={90} />
          <span className="ltr">{voicingToString(voicingFor(editing, tuning))}</span>
        </div>
      </div>

      <h2>אודיו</h2>
      <label className={styles.slider}>
        <span>עוצמה</span>
        <input type="range" min={0} max={1} step={0.01} value={s.volume} onChange={(e) => s.set({ volume: Number(e.target.value) })} />
      </label>
      <label className={styles.slider}>
        <span>הד (Reverb)</span>
        <input type="range" min={0} max={1} step={0.01} value={s.reverb} onChange={(e) => s.set({ reverb: Number(e.target.value) })} />
      </label>

      <h2>MIDI Out (ל-DAW)</h2>
      {midiOuts === null ? (
        <button
          onClick={() =>
            getMidiOut()
              .init()
              .then(setMidiOuts)
              .catch((e: unknown) => setMidiErr(e instanceof Error ? e.message : String(e)))
          }
        >
          הפעל MIDI Out
        </button>
      ) : (
        <select className="ltr" value={s.midiOutName ?? ''} onChange={(e) => s.set({ midiOutName: e.target.value || null })}>
          <option value="">Off</option>
          {midiOuts.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )}
      {midiErr && <div className={styles.err}>{midiErr}</div>}
    </div>
  );
}

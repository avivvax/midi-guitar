import { useEffect, useRef, useState } from 'react';
import {
  calibrationAvailable,
  live,
  resetCalibration,
  saveCalibration,
  setCalibrationMonitor,
  setDeviceSetting,
} from '../controller';
import { gainFromCC, neighbourFromCC, releaseFromCC, thresholdFromCC } from '../input/configProtocol';
import { useStore } from '../state/store';
import { useRaf } from './useRaf';
import styles from './Calibration.module.css';

const LABELS = ['E', 'A', 'D', 'G', 'B', 'e'];
/** Show the "update the firmware" hint if no settings dump arrived by then. */
const DUMP_TIMEOUT_MS = 2500;

/** "כיול מיתרים": per-string sensitivity of the guitar, adjusted live over BLE. */
export default function Calibration({ onBack }: { onBack: () => void }) {
  const status = useStore((s) => s.status);
  const transport = useStore((s) => s.transport);
  const cfg = useStore((s) => s.deviceConfig);
  const velocityFloor = useStore((s) => s.velocityFloor);
  const set = useStore((s) => s.set);
  const ble = transport === 'ble' && status === 'connected' && calibrationAvailable();
  const [noDump, setNoDump] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!ble) return;
    setCalibrationMonitor(true);
    setNoDump(false);
    const t = window.setTimeout(() => setNoDump(useStore.getState().deviceConfig === null), DUMP_TIMEOUT_MS);
    return () => {
      clearTimeout(t);
      setCalibrationMonitor(false);
    };
  }, [ble]);

  // Peak bars: follow the guitar's 20 Hz reports, falling back smoothly between hits.
  const bars = useRef<(HTMLDivElement | null)[]>([]);
  const last = useRef(performance.now());
  useRaf((now) => {
    const dt = Math.min(0.1, (now - last.current) / 1000);
    last.current = now;
    const decay = Math.exp(-dt * 3);
    for (let i = 0; i < 6; i++) {
      const el = bars.current[i];
      if (el) el.style.transform = `scaleX(${(live.calibPeaks[i] / 127).toFixed(3)})`;
      live.calibPeaks[i] *= decay;
    }
  });

  const save = () => {
    saveCalibration();
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <button onClick={onBack} aria-label="חזרה להגדרות">
          →
        </button>
        <h2>כיול מיתרים</h2>
      </div>

      <label className={styles.slider}>
        <span>סף עוצמה מינימלי</span>
        <input
          type="range"
          dir="ltr"
          aria-label="סף עוצמה מינימלי"
          min={0}
          max={0.5}
          step={0.01}
          value={velocityFloor}
          onChange={(e) => set({ velocityFloor: Number(e.target.value) })}
        />
        <output className="ltr">{velocityFloor.toFixed(2)}</output>
      </label>
      <p className={styles.note}>פריטות חלשות מזה לא יושמעו, בכל סוגי החיבור. ברירת מחדל 0.08.</p>

      {!ble ? (
        <p className={styles.info}>
          כיול הרגישות של הגיטרה עובד רק בחיבור <b>Bluetooth MIDI</b>. התחבר בלשונית חיבור ופתח את המסך הזה שוב.
          {transport === 'serial' && status === 'connected' && ' בחיבור USB Serial הזיהוי נעשה באפליקציה: הפרמטרים נמצאים במסך דיבאג.'}
        </p>
      ) : !cfg ? (
        <p className={styles.info}>
          {noDump
            ? 'הגיטרה לא שלחה את ההגדרות שלה. כנראה שהקושחה ישנה: צרוב את הגרסה העדכנית (firmware/SETUP.md) ונסה שוב.'
            : 'קורא הגדרות מהגיטרה…'}
        </p>
      ) : (
        <>
          <p className={styles.note}>
            פרוט כל מיתר: הפס מראה את עוצמת הפריטה, והקו את הסף. פריטה שעוברת את הקו נקלטת. השינויים פועלים מיד; לחץ
            "שמור לגיטרה" כדי שיישארו אחרי כיבוי.
          </p>
          <div className={styles.strings}>
            {LABELS.map((l, i) => (
              <div key={i} className={styles.string} data-testid={`calib-string-${i + 1}`}>
                <b className="ltr">
                  {i + 1} · {l}
                </b>
                <div className={`${styles.meter} ltr`}>
                  <div className={styles.peak} ref={(el) => void (bars.current[i] = el)} />
                  <div className={styles.mark} style={{ left: `${(cfg.threshold[i] / 127) * 100}%` }} />
                </div>
                <label className={styles.slider}>
                  <span>סף</span>
                  <input
                    type="range"
                    dir="ltr"
                    aria-label={`סף מיתר ${i + 1}`}
                    min={0}
                    max={127}
                    value={cfg.threshold[i]}
                    onChange={(e) => setDeviceSetting({ kind: 'threshold', string: i }, Number(e.target.value))}
                  />
                  <output className="ltr">{thresholdFromCC(cfg.threshold[i])}</output>
                </label>
                <label className={styles.slider}>
                  <span>הגברה</span>
                  <input
                    type="range"
                    dir="ltr"
                    aria-label={`הגברה מיתר ${i + 1}`}
                    min={0}
                    max={127}
                    value={cfg.gain[i]}
                    onChange={(e) => setDeviceSetting({ kind: 'gain', string: i }, Number(e.target.value))}
                  />
                  <output className="ltr">×{gainFromCC(cfg.gain[i]).toFixed(2)}</output>
                </label>
              </div>
            ))}
          </div>

          <label className={styles.slider}>
            <span>שחרור</span>
            <input
              type="range"
              dir="ltr"
              aria-label="שחרור"
              min={0}
              max={127}
              value={cfg.release}
              onChange={(e) => setDeviceSetting({ kind: 'release' }, Number(e.target.value))}
            />
            <output className="ltr">{releaseFromCC(cfg.release).toFixed(2)}</output>
          </label>
          <p className={styles.note}>
            כמה האות צריך לרדת (ביחס לסף) לפני שהמיתר יכול להיקלט שוב. נמוך יותר = פחות פריטות כפולות.
          </p>
          <label className={styles.slider}>
            <span>דחיית שכנים</span>
            <input
              type="range"
              dir="ltr"
              aria-label="דחיית שכנים"
              min={0}
              max={127}
              value={cfg.neighbour}
              onChange={(e) => setDeviceSetting({ kind: 'neighbour' }, Number(e.target.value))}
            />
            <output className="ltr">{neighbourFromCC(cfg.neighbour).toFixed(2)}</output>
          </label>
          <p className={styles.note}>
            פריטה נדחית כשמיתר שכן, כפול הערך הזה, חזק ממנה. גבוה יותר = פחות מיתרים "רועדים"; נמוך יותר = פחות מיתרים
            נבלעים בסטרום מהיר. 0 = כבוי.
          </p>

          <div className={styles.actions}>
            <button className={styles.primary} onClick={save}>
              {saved ? 'נשמר ✓' : 'שמור לגיטרה'}
            </button>
            <button
              onClick={() => {
                if (window.confirm('להחזיר את הגיטרה להגדרות היצרן? ההגדרות השמורות יימחקו.')) resetCalibration();
              }}
            >
              איפוס להגדרות יצרן
            </button>
          </div>
        </>
      )}
    </div>
  );
}

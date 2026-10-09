import { connect, disconnect } from '../controller';
import { BleMidiInput } from '../input/bleMidi';
import { SerialInput } from '../input/serial';
import type { TransportId } from '../input/types';
import { WebMidiInput } from '../input/webMidi';
import { useStore } from '../state/store';
import SignalMeter from './SignalMeter';
import styles from './Connect.module.css';

const TRANSPORTS: { id: TransportId; title: string; desc: string; supported: () => boolean }[] = [
  { id: 'ble', title: 'Bluetooth MIDI', desc: 'חיבור אלחוטי ישיר לגיטרה (BLE-MIDI)', supported: () => BleMidiInput.supported },
  { id: 'serial', title: 'USB Serial', desc: 'אותות גולמיים מהפיאזו, לפיתוח ודיבאג', supported: () => SerialInput.supported },
  { id: 'webmidi', title: 'Web MIDI', desc: 'כשמערכת ההפעלה כבר מזהה את הגיטרה כהתקן MIDI', supported: () => WebMidiInput.supported },
  { id: 'keyboard', title: 'מקלדת', desc: 'מקשים 1–6, Shift = חזק, רווח = סטרום. בלי חומרה', supported: () => true },
];

const STATUS_TEXT = { idle: 'לא מחובר', connecting: 'מתחבר…', connected: 'מחובר', error: 'שגיאה' } as const;

export default function Connect() {
  const { status, statusMsg, transport, deviceName, set } = useStore();
  const secure = window.isSecureContext;
  return (
    <div className={styles.wrap}>
      <div className={`${styles.status} ${styles[status]}`}>
        <strong>{STATUS_TEXT[status]}</strong>
        {transport && <span className="ltr"> · {TRANSPORTS.find((t) => t.id === transport)?.title}</span>}
        {deviceName && <div className={styles.sub}>{deviceName}</div>}
        {statusMsg && <div className={styles.sub}>{statusMsg}</div>}
      </div>

      {!secure && <div className={styles.warn}>Bluetooth ו-Serial דורשים HTTPS (או localhost).</div>}

      <div className={styles.list}>
        {TRANSPORTS.map((t) => {
          const ok = t.supported();
          const active = transport === t.id && status === 'connected';
          return (
            <button
              key={t.id}
              className={`${styles.card} ${active ? styles.activeCard : ''}`}
              disabled={!ok || status === 'connecting'}
              onClick={() => (active ? disconnect() : void connect(t.id))}
            >
              <span className={`${styles.title} ltr`}>{t.title}</span>
              <span className={styles.desc}>{ok ? t.desc : 'לא נתמך בדפדפן הזה'}</span>
              <span className={styles.action}>{active ? 'נתק' : 'התחבר'}</span>
            </button>
          );
        })}
      </div>

      <h2>אות חי</h2>
      <SignalMeter />

      {status === 'connected' && (
        <button className={styles.go} onClick={() => set({ screen: 'play' })}>
          לנגינה ←
        </button>
      )}
    </div>
  );
}

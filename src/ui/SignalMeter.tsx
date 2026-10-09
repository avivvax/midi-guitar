import { useRef } from 'react';
import { live } from '../controller';
import { useRaf } from './useRaf';
import styles from './SignalMeter.module.css';

const LABELS = ['E', 'A', 'D', 'G', 'B', 'e'];

/** Live 6-bar meter. Levels decay each frame; updated without React re-renders. */
export default function SignalMeter() {
  const bars = useRef<(HTMLDivElement | null)[]>([]);
  const last = useRef(performance.now());
  useRaf((now) => {
    const dt = Math.min(0.1, (now - last.current) / 1000);
    last.current = now;
    const decay = Math.exp(-dt * 6);
    for (let i = 0; i < 6; i++) {
      const el = bars.current[i];
      if (el) el.style.transform = `scaleY(${live.levels[i].toFixed(3)})`;
      live.levels[i] *= decay;
    }
  });
  return (
    <div className={`${styles.meter} ltr`} role="img" aria-label="signal meter">
      {LABELS.map((l, i) => (
        <div key={i} className={styles.col}>
          <div className={styles.track}>
            <div className={styles.bar} ref={(el) => void (bars.current[i] = el)} />
          </div>
          <span>{l}</span>
        </div>
      ))}
    </div>
  );
}

import { useRef } from 'react';
import { HISTORY, getEngine, live } from '../controller';
import { DEFAULT_DETECTOR_PARAMS, type DetectorParams } from '../input/strumDetector';
import { useStore } from '../state/store';
import { useRaf, useTicker } from './useRaf';
import styles from './Debug.module.css';

const COLORS = ['#ff6b6b', '#f5a524', '#ffe066', '#3ccf7a', '#4cc2ff', '#b18cff', '#8b93a5'];

type NumKey = { [K in keyof DetectorParams]: DetectorParams[K] extends number ? K : never }[keyof DetectorParams];
const PARAMS: { key: NumKey; label: string; min: number; max: number; step: number }[] = [
  { key: 'threshold', label: 'Threshold', min: 5, max: 1000, step: 5 },
  { key: 'fullScale', label: 'Full scale', min: 100, max: 4095, step: 25 },
  { key: 'refractoryMs', label: 'Refractory ms', min: 10, max: 200, step: 5 },
  { key: 'peakWindowMs', label: 'Peak window ms', min: 2, max: 30, step: 1 },
  { key: 'baselineAlpha', label: 'Baseline α', min: 0.001, max: 0.1, step: 0.001 },
  { key: 'refRatio', label: 'Ref reject ratio', min: 0, max: 3, step: 0.05 },
  { key: 'neighbourRatio', label: 'Neighbour ratio', min: 0, max: 1, step: 0.05 },
  { key: 'velocityCurve', label: 'Velocity curve', min: 0.2, max: 3, step: 0.05 },
  { key: 'sampleMs', label: 'Sample period ms', min: 0.5, max: 10, step: 0.5 },
];

function Scope() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useRaf(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (c.width !== Math.round(w * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const { fullScale, threshold } = useStore.getState().detector;
    const yOf = (v: number) => h - 4 - (Math.min(v, fullScale) / fullScale) * (h - 8);
    g.strokeStyle = '#ff5d5d';
    g.setLineDash([5, 5]);
    g.beginPath();
    g.moveTo(0, yOf(threshold));
    g.lineTo(w, yOf(threshold));
    g.stroke();
    g.setLineDash([]);
    for (let ch = 0; ch < 7; ch++) {
      const buf = live.history[ch];
      g.strokeStyle = COLORS[ch];
      g.lineWidth = ch === 6 ? 1 : 1.5;
      g.beginPath();
      for (let k = 0; k < HISTORY; k++) {
        const v = buf[(live.historyPos + k) % HISTORY];
        const x = (k / (HISTORY - 1)) * w;
        if (k === 0) g.moveTo(x, yOf(v));
        else g.lineTo(x, yOf(v));
      }
      g.stroke();
    }
  });
  return <canvas ref={canvas} className={`${styles.scope} ltr`} />;
}

function stats(xs: number[]) {
  if (!xs.length) return null;
  const sorted = xs.slice().sort((a, b) => a - b);
  return {
    min: sorted[0],
    med: sorted[Math.floor(sorted.length / 2)],
    max: sorted[sorted.length - 1],
  };
}

export default function Debug() {
  useTicker(8);
  const detector = useStore((s) => s.detector);
  const setDetector = useStore((s) => s.setDetector);
  const transport = useStore((s) => s.transport);
  const engine = getEngine();
  const proc = stats(live.latency.map((l) => l.proc));
  const total = stats(live.latency.map((l) => l.total));
  const fmt = (n: number) => n.toFixed(1);

  return (
    <div className={styles.wrap}>
      <h2>אותות (אחרי הסרת baseline)</h2>
      <Scope />
      <div className={`${styles.legend} ltr`}>
        {['E', 'A', 'D', 'G', 'B', 'e', 'ref'].map((l, i) => (
          <span key={l} style={{ color: COLORS[i] }}>
            ■ {l}
          </span>
        ))}
      </div>
      <div className={`${styles.mono} ltr`}>
        raw: {live.lastRaw.join(' ') || '—'} · {transport === 'serial' ? `${live.framesPerSec.toFixed(0)} fps` : transport ?? 'not connected'}
      </div>

      <h2>השהיה (Strum → Sound)</h2>
      <div className={`${styles.latency} ltr`}>
        <div>
          <span>JS processing</span>
          <b>{proc ? `${fmt(proc.med)} ms` : '—'}</b>
          <small>{proc ? `min ${fmt(proc.min)} / max ${fmt(proc.max)}` : ''}</small>
        </div>
        <div>
          <span>+ audio output</span>
          <b>{engine ? `${fmt(engine.outputLatencyMs)} ms` : '—'}</b>
          <small>{engine ? `${engine.ctx.sampleRate} Hz` : ''}</small>
        </div>
        <div>
          <span>Total (est.)</span>
          <b>{total ? `${fmt(total.med)} ms` : '—'}</b>
          <small>{total ? `max ${fmt(total.max)}` : ''}</small>
        </div>
      </div>

      <h2>פרמטרי זיהוי סטרום (Serial)</h2>
      <div className={`${styles.params} ltr`}>
        {PARAMS.map((p) => (
          <label key={p.key}>
            <span>
              {p.label} <b>{detector[p.key]}</b>
            </span>
            <input
              type="range"
              min={p.min}
              max={p.max}
              step={p.step}
              value={detector[p.key]}
              onChange={(e) => setDetector({ [p.key]: Number(e.target.value) })}
            />
          </label>
        ))}
        <label className={styles.inline}>
          <input type="checkbox" checked={detector.rectify} onChange={(e) => setDetector({ rectify: e.target.checked })} />
          Rectify (|signal|)
        </label>
        <div>
          <span>Per-string gain</span>
          <div className={styles.gains}>
            {detector.gains.map((g, i) => (
              <input
                key={i}
                type="number"
                step={0.1}
                min={0}
                max={5}
                value={g}
                aria-label={`gain string ${i + 1}`}
                onChange={(e) => {
                  const gains = detector.gains.slice();
                  gains[i] = Number(e.target.value) || 0;
                  setDetector({ gains });
                }}
              />
            ))}
          </div>
        </div>
        <button onClick={() => setDetector(DEFAULT_DETECTOR_PARAMS)}>Reset defaults</button>
      </div>

      <h2>יומן אירועים</h2>
      <button onClick={() => (live.log.length = 0)}>נקה</button>
      <ol className={`${styles.log} ltr`}>
        {live.log.slice(0, 60).map((l, i) => (
          <li key={`${l.t}-${i}`} className={styles[l.kind]}>
            <time>{(l.t / 1000).toFixed(3)}</time> {l.text}
          </li>
        ))}
      </ol>
    </div>
  );
}

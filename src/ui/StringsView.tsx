import { useRef } from 'react';
import { live, touchStrum } from '../controller';
import { useRaf } from './useRaf';
import styles from './StringsView.module.css';

/**
 * Six strings (high e on top, like tab) that vibrate on strums. Tap a string
 * to pluck it; drag across strings to strum them.
 */
export default function StringsView({ labels }: { labels: string[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const lastString = useRef<number | null>(null);

  const stringAt = (clientY: number): number => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    const row = Math.floor(((clientY - r.top) / r.height) * 6);
    return 5 - Math.max(0, Math.min(5, row));
  };

  useRaf((now) => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const left = 44;
    for (let row = 0; row < 6; row++) {
      const s = 5 - row;
      const y = (row + 0.5) * (h / 6);
      const age = now - live.strumAt[s];
      const amp = age < 1500 ? live.strumVel[s] * 10 * Math.exp(-age / 350) : 0;
      const thick = 3.5 - s * 0.45;
      g.strokeStyle = amp > 0.3 ? '#f5a524' : '#9aa3b5';
      g.lineWidth = Math.max(1, thick);
      g.beginPath();
      const L = w - left - 8;
      for (let x = 0; x <= L; x += 4) {
        const env = Math.sin((Math.PI * x) / L);
        const dy = amp * env * Math.sin(now / (18 + s * 3) + x * 0.02);
        if (x === 0) g.moveTo(left + x, y + dy);
        else g.lineTo(left + x, y + dy);
      }
      g.stroke();
      g.fillStyle = amp > 0.3 ? '#f5a524' : '#8b93a5';
      g.font = '600 14px system-ui';
      g.textBaseline = 'middle';
      g.fillText(labels[s] ?? '', 6, y);
    }
  });

  return (
    <canvas
      ref={canvas}
      className={`${styles.canvas} ltr`}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        const s = stringAt(e.clientY);
        lastString.current = s;
        touchStrum(s, 0.65);
      }}
      onPointerMove={(e) => {
        if (lastString.current === null) return;
        const s = stringAt(e.clientY);
        if (s === lastString.current) return;
        const step = s > lastString.current ? 1 : -1;
        for (let k = lastString.current + step; k !== s + step; k += step) touchStrum(k, 0.6);
        lastString.current = s;
      }}
      onPointerUp={() => (lastString.current = null)}
      onPointerCancel={() => (lastString.current = null)}
    />
  );
}

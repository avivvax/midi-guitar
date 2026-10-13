import type { Voicing } from '../music/theory';

/** Compact chord box for any number of strings: left = the low-E side of the neck, 4–5 frets. */
export default function ChordDiagram({ voicing, size = 96 }: { voicing: Voicing; size?: number }) {
  const fretted = voicing.filter((f): f is number => f !== null && f > 0);
  const maxF = fretted.length ? Math.max(...fretted) : 0;
  const minF = fretted.length ? Math.min(...fretted) : 1;
  const base = maxF <= 4 ? 1 : minF;
  const rows = 4;
  const w = size;
  const h = size * 1.15;
  const padX = w * 0.14;
  const top = h * 0.2;
  const n = voicing.length;
  const gx = (w - padX * 2) / Math.max(1, n - 1);
  const x0 = n === 1 ? w / 2 : padX;
  const gy = (h - top - h * 0.06) / rows;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="ltr" aria-hidden>
      {base > 1 && (
        <text x={2} y={top + gy * 0.65} fill="var(--muted)" fontSize={w * 0.11}>
          {base}
        </text>
      )}
      {base === 1 && n > 1 && <rect x={padX} y={top - 3} width={gx * (n - 1)} height={4} fill="var(--text)" />}
      {Array.from({ length: rows + 1 }, (_, r) => (
        <line key={`f${r}`} x1={n === 1 ? x0 - 8 : padX} x2={n === 1 ? x0 + 8 : w - padX} y1={top + r * gy} y2={top + r * gy} stroke="var(--line)" strokeWidth={1.5} />
      ))}
      {Array.from({ length: n }, (_, s) => (
        <line key={`s${s}`} x1={x0 + s * gx} x2={x0 + s * gx} y1={top} y2={top + rows * gy} stroke="var(--muted)" strokeWidth={1.2} />
      ))}
      {voicing.map((f, s) => {
        const x = x0 + s * gx;
        if (f === null)
          return (
            <text key={s} x={x} y={top - 6} textAnchor="middle" fill="var(--err)" fontSize={w * 0.12}>
              ×
            </text>
          );
        if (f === 0) return <circle key={s} cx={x} cy={top - 10} r={w * 0.035} fill="none" stroke="var(--text)" strokeWidth={1.5} />;
        const row = f - base;
        if (row < 0 || row >= rows) return null;
        return <circle key={s} cx={x} cy={top + (row + 0.5) * gy} r={w * 0.055} fill="var(--accent)" />;
      })}
    </svg>
  );
}

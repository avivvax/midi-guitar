import { useEffect, useRef, useState } from 'react';

/** Run `cb` every animation frame while mounted (latest callback is used). */
export function useRaf(cb: (now: number) => void): void {
  const ref = useRef(cb);
  useEffect(() => {
    ref.current = cb;
  });
  useEffect(() => {
    let id = 0;
    const loop = (t: number) => {
      ref.current(t);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);
}

/** Re-render the component at `hz`. */
export function useTicker(hz: number): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setN((x) => x + 1), 1000 / hz);
    return () => clearInterval(id);
  }, [hz]);
  return n;
}

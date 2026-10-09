import { Emitter, type GuitarInput, type StringIndex } from './types';

/**
 * Keyboard test input: Digit1–6 strum strings 0–5 (1 = low E), Shift = hard strum.
 * Space = down-strum all strings, Shift+Space = up-strum.
 */
export class KeyboardInput extends Emitter implements GuitarInput {
  private timers: number[] = [];

  async connect(): Promise<void> {
    window.addEventListener('keydown', this.onKey);
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
    const velocity = e.shiftKey ? 1 : 0.55;
    const m = /^Digit([1-6])$/.exec(e.code);
    if (m) {
      e.preventDefault();
      this.emit({ type: 'strum', string: (Number(m[1]) - 1) as StringIndex, velocity, t: performance.now() });
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      const order = e.shiftKey ? [5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5];
      order.forEach((s, k) => {
        const fire = () => this.emit({ type: 'strum', string: s as StringIndex, velocity: 0.6, t: performance.now() });
        if (k === 0) fire();
        else this.timers.push(window.setTimeout(fire, k * 14));
      });
    }
  };

  disconnect(): void {
    window.removeEventListener('keydown', this.onKey);
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }
}

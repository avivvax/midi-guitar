export type StringIndex = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * String 0 = low E (6th string) … string 5 = high E (1st string).
 * `t` is an optional performance.now() timestamp of when the physical event
 * was detected; used only for latency measurement.
 */
export type GuitarEvent =
  | { type: 'strum'; string: StringIndex; velocity: number; t?: number }
  | { type: 'fret'; string: StringIndex; fret: number | null; t?: number }
  | { type: 'raw'; values: number[]; t?: number };

export interface GuitarInput {
  connect(): Promise<void>;
  disconnect(): void;
  onEvent(cb: (e: GuitarEvent) => void): void;
}

export type TransportId = 'serial' | 'ble' | 'webmidi' | 'keyboard';

export function isStringIndex(n: number): n is StringIndex {
  return Number.isInteger(n) && n >= 0 && n <= 5;
}

/** Small helper so every transport shares the same listener plumbing. */
export class Emitter {
  private listeners: ((e: GuitarEvent) => void)[] = [];
  onEvent(cb: (e: GuitarEvent) => void): void {
    this.listeners.push(cb);
  }
  protected emit(e: GuitarEvent): void {
    for (const l of this.listeners) l(e);
  }
}

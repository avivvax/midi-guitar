import { Emitter, type GuitarInput } from './types';
import { StrumDetector, parseSerialLine, type DetectorResult } from './strumDetector';

export const SERIAL_BAUD = 115200;

/**
 * Web Serial transport: reads the firmware's raw ADC lines and runs the
 * strum detector in the browser.
 */
export class SerialInput extends Emitter implements GuitarInput {
  readonly detector = new StrumDetector();
  /** Called for every processed frame (debug panel / meters). */
  onFrame: ((r: DetectorResult, values: number[]) => void) | null = null;
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<string> | null = null;
  private closed: Promise<void> | null = null;
  private running = false;

  static get supported(): boolean {
    return 'serial' in navigator;
  }

  async connect(): Promise<void> {
    if (!SerialInput.supported) throw new Error('Web Serial לא נתמך בדפדפן הזה (נדרש Chrome בדסקטופ / Android 13+ עם USB OTG)');
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: SERIAL_BAUD });
    this.port = port;
    this.running = true;
    this.detector.reset();
    this.closed = this.readLoop(port);
  }

  private async readLoop(port: SerialPort): Promise<void> {
    if (!port.readable) return;
    const decoder = new TextDecoderStream();
    const pipe = port.readable.pipeTo(decoder.writable as WritableStream<Uint8Array>).catch(() => undefined);
    const reader = decoder.readable.getReader();
    this.reader = reader;
    let buf = '';
    try {
      while (this.running) {
        const { value, done } = await reader.read();
        if (done) break;
        const t = performance.now();
        buf += value;
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          this.handleLine(line, t);
        }
        if (buf.length > 4096) buf = '';
      }
    } catch {
      // Device unplugged or reader cancelled.
    } finally {
      reader.releaseLock();
      await pipe;
    }
  }

  private handleLine(line: string, t: number): void {
    const values = parseSerialLine(line);
    if (!values) return;
    const r = this.detector.process(values);
    this.emit({ type: 'raw', values, t });
    this.onFrame?.(r, values);
    for (const s of r.strums) this.emit({ type: 'strum', string: s.string, velocity: s.velocity, t });
  }

  disconnect(): void {
    this.running = false;
    const port = this.port;
    this.port = null;
    void (async () => {
      try {
        await this.reader?.cancel();
        await this.closed;
        await port?.close();
      } catch {
        // already closed
      }
    })();
  }
}

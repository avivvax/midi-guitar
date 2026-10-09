import { Emitter, type GuitarInput } from './types';
import { mapMidiMessage } from './midiMapping';

/** Web MIDI transport: listens on all inputs (or the named one) with the same channel mapping. */
export class WebMidiInput extends Emitter implements GuitarInput {
  private access: MIDIAccess | null = null;
  private inputs: MIDIInput[] = [];
  deviceNames: string[] = [];

  static get supported(): boolean {
    return typeof navigator.requestMIDIAccess === 'function';
  }

  async connect(): Promise<void> {
    if (!WebMidiInput.supported) throw new Error('Web MIDI לא נתמך בדפדפן הזה');
    this.access = await navigator.requestMIDIAccess();
    this.access.onstatechange = () => this.bind();
    this.bind();
  }

  private bind(): void {
    for (const i of this.inputs) i.onmidimessage = null;
    this.inputs = this.access ? [...this.access.inputs.values()].filter((i) => i.state === 'connected') : [];
    this.deviceNames = this.inputs.map((i) => i.name ?? i.id);
    for (const input of this.inputs) {
      input.onmidimessage = (ev: MIDIMessageEvent) => {
        const d = ev.data;
        if (!d || d.length === 0) return;
        const e = mapMidiMessage({ status: d[0], data: [d[1] ?? 0, d[2] ?? 0] }, performance.now());
        if (e) this.emit(e);
      };
    }
  }

  disconnect(): void {
    for (const i of this.inputs) i.onmidimessage = null;
    if (this.access) this.access.onstatechange = null;
    this.inputs = [];
    this.access = null;
  }
}

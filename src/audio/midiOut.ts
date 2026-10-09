/** Optional MIDI out mirror (channel = string + 1) for DAWs. */
export class MidiOut {
  private access: MIDIAccess | null = null;
  private output: MIDIOutput | null = null;
  private sounding: (number | null)[] = new Array(6).fill(null);

  async init(): Promise<string[]> {
    if (!navigator.requestMIDIAccess) throw new Error('Web MIDI not supported');
    this.access ??= await navigator.requestMIDIAccess();
    return [...this.access.outputs.values()].map((o) => o.name ?? o.id);
  }

  select(name: string | null): void {
    if (!this.access || !name) {
      this.output = null;
      return;
    }
    this.output = [...this.access.outputs.values()].find((o) => (o.name ?? o.id) === name) ?? null;
  }

  noteOn(string: number, midi: number, velocity: number): void {
    if (!this.output) return;
    this.noteOff(string);
    this.output.send([0x90 | string, midi & 0x7f, Math.max(1, Math.round(velocity * 127))]);
    this.sounding[string] = midi;
  }

  noteOff(string: number): void {
    const n = this.sounding[string];
    if (!this.output || n === null) return;
    this.output.send([0x80 | string, n, 0]);
    this.sounding[string] = null;
  }
}

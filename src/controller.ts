import { AudioEngine } from './audio/engine';
import { MidiOut } from './audio/midiOut';
import { BleMidiInput } from './input/bleMidi';
import { KeyboardInput } from './input/keyboard';
import { SerialInput } from './input/serial';
import type { DetectorResult } from './input/strumDetector';
import type { GuitarEvent, GuitarInput, TransportId } from './input/types';
import { WebMidiInput } from './input/webMidi';
import { chordName, noteNameOct } from './music/theory';
import { symbolToChord } from './song/chordSymbol';
import { Metronome, displaySymbol, songActive, songChordForHit, songSettings, stepsOf } from './song/session';
import { currentChord, tuningNotes, useStore, voicingFor } from './state/store';

/**
 * Glue between transports, music logic and audio. High-rate data (signals,
 * animation state, logs) lives in plain mutable objects read by the UI via
 * requestAnimationFrame / polling, so React never re-renders at 500 Hz.
 */

export const HISTORY = 600; // frames kept for the debug scope (~1.2 s at 2 ms)

export const live = {
  /** 0..1 meter level per string. */
  levels: new Float32Array(6),
  strumAt: new Float64Array(6).fill(-1e9),
  strumVel: new Float32Array(6),
  notes: new Array<string | null>(6).fill(null),
  frets: new Array<number | null>(6).fill(0),
  /** Debug scope: detector signal per string + reference, ring buffer. */
  history: Array.from({ length: 7 }, () => new Float32Array(HISTORY)),
  historyPos: 0,
  lastRaw: [] as number[],
  framesPerSec: 0,
  log: [] as { t: number; text: string; kind: 'strum' | 'fret' | 'reject' | 'info' }[],
  latency: [] as { proc: number; total: number }[],
};

let engine: AudioEngine | null = null;
let input: GuitarInput | null = null;
const midiOut = new MidiOut();
let frameCount = 0;
let frameWindowStart = performance.now();

export function getEngine(): AudioEngine | null {
  return engine;
}
export function getMidiOut(): MidiOut {
  return midiOut;
}

function log(kind: (typeof live.log)[number]['kind'], text: string) {
  live.log.unshift({ t: performance.now(), text, kind });
  if (live.log.length > 200) live.log.length = 200;
}

/** Create/resume the AudioContext. Must be called from a user gesture. */
export async function ensureAudio(): Promise<void> {
  if (!engine) {
    engine = new AudioEngine();
    const s = useStore.getState();
    engine.setInstrument(s.instrument);
    engine.setVolume(s.volume);
    engine.setReverb(s.reverb);
    warmCurrentChord();
  }
  await engine.resume();
  if (!useStore.getState().audioReady) useStore.getState().set({ audioReady: true });
}

/** Pre-render the notes about to be played: palette chord, or current + next song chord. */
function warmCurrentChord() {
  if (!engine) return;
  const s = useStore.getState();
  const tuning = tuningNotes(s);
  const song = songActive(s);
  let chords = [currentChord(s)];
  if (song) {
    const steps = stepsOf(song);
    const t = songSettings(s, song).transpose;
    chords = [steps[s.player.pos], steps[s.player.pos + 1]]
      .filter(Boolean)
      .map((st) => symbolToChord(displaySymbol(st.chord, t)))
      .filter((c): c is NonNullable<typeof c> => c !== null);
  }
  const midis = chords.flatMap((c) =>
    voicingFor(c, tuning).flatMap((f, i) => (f === null ? [] : [tuning[i] + s.capo + f])),
  );
  engine.warm([...new Set(midis)]);
}

useStore.subscribe((s, prev) => {
  if (engine) {
    if (s.instrument !== prev.instrument) {
      engine.setInstrument(s.instrument);
      warmCurrentChord();
    }
    if (s.volume !== prev.volume) engine.setVolume(s.volume);
    if (s.reverb !== prev.reverb) engine.setReverb(s.reverb);
    if (
      s.selectedSlot !== prev.selectedSlot ||
      s.palette !== prev.palette ||
      s.capo !== prev.capo ||
      s.tuningId !== prev.tuningId ||
      s.player.pos !== prev.player.pos ||
      s.songId !== prev.songId ||
      s.songView !== prev.songView ||
      s.songPrefs !== prev.songPrefs
    )
      warmCurrentChord();
  }
  if (s.detector !== prev.detector && input instanceof SerialInput) input.detector.setParams(s.detector);
  if (s.midiOutName !== prev.midiOutName) midiOut.select(s.midiOutName);
});

function handleFrame(r: DetectorResult, values: number[]) {
  const pos = live.historyPos;
  for (let i = 0; i < 6; i++) live.history[i][pos] = r.signals[i];
  live.history[6][pos] = r.refSignal;
  live.historyPos = (pos + 1) % HISTORY;
  live.lastRaw = values;
  const fs = useStore.getState().detector.fullScale;
  for (let i = 0; i < 6; i++) live.levels[i] = Math.max(live.levels[i], Math.min(1, r.signals[i] / fs));
  for (const rj of r.rejected) log('reject', `S${rj.string + 1} rejected (${rj.reason}) peak ${Math.round(rj.peak)}`);
  frameCount++;
  const now = performance.now();
  if (now - frameWindowStart >= 1000) {
    live.framesPerSec = (frameCount * 1000) / (now - frameWindowStart);
    frameCount = 0;
    frameWindowStart = now;
  }
}

export function handleEvent(e: GuitarEvent): void {
  if (e.type === 'raw') return; // handled per-frame via handleFrame for serial
  const s = useStore.getState();
  if (e.type === 'fret') {
    live.frets[e.string] = e.fret;
    log('fret', `S${e.string + 1} fret ${e.fret ?? 'muted'}`);
    return;
  }
  // Strum. In the song player the song decides the chord (and may advance on this strum).
  const string = e.string;
  const tuning = tuningNotes(s);
  const songChord = songChordForHit(e.t ?? performance.now());
  const chord = songChord ?? currentChord(s);
  const fret = songChord || s.mode === 'chord' ? voicingFor(chord, tuning)[string] : live.frets[string];
  const now = performance.now();
  live.strumAt[string] = now;
  live.strumVel[string] = e.velocity;
  live.levels[string] = Math.max(live.levels[string], e.velocity);

  if (!engine || engine.ctx.state !== 'running') {
    log('info', 'Audio not started – tap anywhere first');
    return;
  }
  let label: string;
  if (fret === null) {
    engine.click(string, e.velocity);
    midiOut.noteOff(string);
    live.notes[string] = null;
    label = 'mute';
  } else {
    const midi = tuning[string] + s.capo + fret;
    engine.pluck(string, midi, e.velocity);
    midiOut.noteOn(string, midi, e.velocity);
    live.notes[string] = noteNameOct(midi);
    label = noteNameOct(midi);
  }
  const done = performance.now();
  if (e.t !== undefined) {
    const proc = done - e.t;
    live.latency.push({ proc, total: proc + engine.outputLatencyMs });
    if (live.latency.length > 50) live.latency.shift();
  }
  const ctx = songChord || s.mode === 'chord' ? ` [${chordName(chord)}]` : '';
  log('strum', `S${string + 1} ${label}${ctx} vel ${e.velocity.toFixed(2)}`);
}

/** Strum from the on-screen strings (touch). */
export function touchStrum(string: number, velocity = 0.6): void {
  void ensureAudio().then(() =>
    handleEvent({ type: 'strum', string: string as 0, velocity, t: performance.now() }),
  );
}

export async function connect(transport: TransportId): Promise<void> {
  const { set } = useStore.getState();
  disconnect();
  await ensureAudio();
  set({ transport, status: 'connecting', statusMsg: '', deviceName: '' });
  let inp: GuitarInput;
  switch (transport) {
    case 'serial': {
      const si = new SerialInput();
      si.detector.setParams(useStore.getState().detector);
      si.onFrame = handleFrame;
      inp = si;
      break;
    }
    case 'ble': {
      const b = new BleMidiInput();
      b.onDisconnected = () => {
        if (input === b) {
          set({ status: 'error', statusMsg: 'החיבור נותק' });
          log('info', 'BLE disconnected');
        }
      };
      inp = b;
      break;
    }
    case 'webmidi':
      inp = new WebMidiInput();
      break;
    case 'keyboard':
      inp = new KeyboardInput();
      break;
  }
  inp.onEvent(handleEvent);
  try {
    await inp.connect();
    input = inp;
    const deviceName =
      inp instanceof BleMidiInput
        ? inp.deviceName
        : inp instanceof WebMidiInput
          ? inp.deviceNames.join(', ') || 'אין התקני MIDI מחוברים'
          : inp instanceof KeyboardInput
            ? 'מקלדת 1–6, Shift = חזק, רווח = סטרום'
            : 'Serial 115200';
    set({ status: 'connected', deviceName });
    log('info', `Connected: ${transport}`);
  } catch (err) {
    inp.disconnect();
    const msg = err instanceof Error ? err.message : String(err);
    const cancelled = err instanceof DOMException && (err.name === 'NotFoundError' || err.name === 'AbortError');
    set({ status: cancelled ? 'idle' : 'error', statusMsg: cancelled ? 'בוטל' : msg, transport: cancelled ? null : transport });
  }
}

export function disconnect(): void {
  if (input) {
    input.disconnect();
    input = null;
    log('info', 'Disconnected');
  }
  useStore.getState().set({ status: 'idle', transport: null, deviceName: '' });
}

let metronome: Metronome | null = null;

/** Start/stop tempo-mode playback (call from a user gesture). */
export async function setSongPlaying(on: boolean): Promise<void> {
  const { set } = useStore.getState();
  if (!on) {
    metronome?.stop();
    set({ playing: false });
    return;
  }
  await ensureAudio();
  if (!engine) return;
  metronome ??= new Metronome(engine);
  set({ playing: true });
  metronome.start();
}

export function getSerialDetector() {
  return input instanceof SerialInput ? input.detector : null;
}

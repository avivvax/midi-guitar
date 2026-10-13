import { AudioEngine, type EngineInstrument } from './audio/engine';
import { MidiOut } from './audio/midiOut';
import { BleMidiInput } from './input/bleMidi';
import { CC, applyDeviceCC, emptyDeviceConfig } from './input/configProtocol';
import { KeyboardInput } from './input/keyboard';
import { SerialInput } from './input/serial';
import type { DetectorResult } from './input/strumDetector';
import type { GuitarEvent, GuitarInput, TransportId } from './input/types';
import { WebMidiInput } from './input/webMidi';
import { chordName, noteNameOct } from './music/theory';
import { symbolToChord } from './song/chordSymbol';
import { scheduleWindow, startCursor, type AutoCursor, type StateChange } from './song/autoStrum';
import { Metronome, displaySymbol, findSong, songActive, songChordForHit, songSettings, stepsOf } from './song/session';
import { patternById } from './song/strumPattern';
import { chordNotes, courseExtras, freeNote, registerRange, type PhysResult } from './instruments/mapping';
import { getSampleSet } from './instruments/samples';
import { currentChord, playSetup, useStore, type State } from './state/store';

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
  /** Calibration peak meter per string, in threshold CC units (0–127), from the guitar over BLE. */
  calibPeaks: new Float32Array(6),
  calibPeakAt: 0,
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
    engine.onSampleStatus = (id, status) => useStore.getState().set({ sampleStatus: { ...useStore.getState().sampleStatus, [id]: status } });
    engine.setInstrument(engineInstrument(s));
    engine.setVolume(s.volume);
    engine.setReverb(s.reverb);
    warmCurrentChord();
  }
  await engine.resume();
  if (!useStore.getState().audioReady) useStore.getState().set({ audioReady: true });
}

/** What the audio engine needs for the selected instrument (sound, samples, sympathetic strings, drone, tremolo). */
function engineInstrument(s: State): EngineInstrument {
  const setup = playSetup(s);
  const inst = setup.inst;
  return {
    id: inst.id,
    soundId: inst.sound,
    samples: getSampleSet(inst.samples),
    sympathetic: setup.sympathetic,
    drone: setup.drone,
    droneLevel: inst.articulation.drone?.level ?? 0,
    tremolo: s.tremolo && !!inst.articulation.tremolo,
  };
}

/** Chords the player is about to strum: the palette chord, or the current + next song chord. */
function upcomingChords(s: State) {
  const song = songActive(s);
  if (!song) return [currentChord(s)];
  const steps = stepsOf(song);
  const t = songSettings(s, song).transpose;
  return [steps[s.player.pos], steps[s.player.pos + 1]]
    .filter(Boolean)
    .map((st) => symbolToChord(displaySymbol(st.chord, t)))
    .filter((c): c is NonNullable<typeof c> => c !== null);
}

/** Pre-compute fingerings and pre-render the notes about to be played. */
function warmCurrentChord() {
  const s = useStore.getState();
  const setup = playSetup(s);
  // Fingering searches are cached; doing them here keeps them off the strum path.
  const notes = upcomingChords(s).flatMap((c) => chordNotes(setup, c).physical);
  if (!engine) return;
  const uniq = new Map<string, { midi: number; extras: number[] }>();
  for (const n of notes) {
    if (n === null || n === 'mute') continue;
    const extras = courseExtras(setup.inst, n.course);
    uniq.set(`${n.midi}:${extras.join(',')}`, { midi: n.midi, extras });
  }
  engine.warm([...uniq.values()]);
}

useStore.subscribe((s, prev) => {
  const instChanged =
    s.instrument !== prev.instrument ||
    s.tunings !== prev.tunings ||
    s.customTunings !== prev.customTunings ||
    s.key !== prev.key ||
    s.tremolo !== prev.tremolo;
  if (engine) {
    if (instChanged) engine.setInstrument(engineInstrument(s));
    if (s.volume !== prev.volume) engine.setVolume(s.volume);
    if (s.reverb !== prev.reverb) engine.setReverb(s.reverb);
  }
  if (s.instrument !== prev.instrument) midiOut.program(playSetup(s).inst.gm);
  if (
    instChanged ||
    s.selectedSlot !== prev.selectedSlot ||
    s.palette !== prev.palette ||
    s.capo !== prev.capo ||
    s.registers !== prev.registers ||
    s.extraStrings !== prev.extraStrings ||
    s.player.pos !== prev.player.pos ||
    s.songId !== prev.songId ||
    s.songView !== prev.songView ||
    s.songPrefs !== prev.songPrefs
  )
    warmCurrentChord();
  if (s.detector !== prev.detector && input instanceof SerialInput) input.detector.setParams(s.detector);
  if (s.midiOutName !== prev.midiOutName) {
    midiOut.select(s.midiOutName);
    midiOut.program(playSetup(s).inst.gm);
  }
});

/** Move the register window of an instrument with more than 6 courses (dir = −1 lower, +1 higher). */
export function shiftRegister(dir: number): void {
  const s = useStore.getState();
  const setup = playSetup(s);
  const r = registerRange(setup.inst, setup.tuning);
  if (!r.max) return;
  const next = Math.max(0, Math.min(r.max, setup.register + dir * r.step));
  if (next !== setup.register) s.set({ registers: { ...s.registers, [s.instrument]: next } });
}

window.addEventListener('keydown', (e) => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
  if (e.code === 'BracketLeft') shiftRegister(-1);
  else if (e.code === 'BracketRight') shiftRegister(1);
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
    const setup = playSetup(s);
    if (setup.inst.fretting.kind === 'open' && e.fret) {
      // Open-string instruments have no frets: the touch-neck position picks the register (fret 1 = lowest).
      const r = registerRange(setup.inst, setup.tuning);
      if (r.max) {
        const reg = Math.round(((Math.min(12, e.fret) - 1) / 11) * r.max);
        if (reg !== setup.register) s.set({ registers: { ...s.registers, [s.instrument]: reg } });
      }
    }
    if (e.fret === null) {
      // Explicit mute (CC 20 = 127) is the only thing that stops a ringing string;
      // Note Off is ignored so plucked strings sustain until they decay or are re-plucked.
      engine?.noteOff(e.string);
      midiOut.noteOff(e.string);
      live.notes[e.string] = null;
    }
    log('fret', `S${e.string + 1} fret ${e.fret ?? 'muted'}`);
    return;
  }
  if (e.velocity < s.velocityFloor) {
    log('reject', `S${e.string + 1} below velocity floor (${e.velocity.toFixed(2)} < ${s.velocityFloor.toFixed(2)})`);
    return;
  }
  // Strum. In the song player the song decides the chord (and may advance on this strum).
  const string = e.string;
  const setup = playSetup(s);
  const songChord = songChordForHit(e.t ?? performance.now());
  const chord = songChord ?? currentChord(s);
  const res: PhysResult =
    songChord || s.mode === 'chord' ? chordNotes(setup, chord).physical[string] : freeNote(setup, string, live.frets[string]);
  const now = performance.now();
  live.strumAt[string] = now;
  live.strumVel[string] = e.velocity;
  live.levels[string] = Math.max(live.levels[string], e.velocity);

  if (!engine || engine.ctx.state !== 'running') {
    log('info', 'Audio not started – tap anywhere first');
    return;
  }
  let label: string;
  if (res === null) {
    // No course on this physical string (fewer courses than strings, 'mute' extra strings, or not a chord tone on a slide).
    label = 'no string';
  } else if (res === 'mute') {
    engine.click(string, e.velocity);
    midiOut.noteOff(string);
    live.notes[string] = null;
    label = 'mute';
  } else {
    engine.pluck(string, res.midi, e.velocity, undefined, 'live', courseExtras(setup.inst, res.course));
    midiOut.noteOn(string, res.midi, e.velocity);
    live.notes[string] = noteNameOct(res.midi);
    label = noteNameOct(res.midi);
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
      const sel = { gainString: 0 };
      b.onConfig = (cc, value) => {
        if (cc >= CC.peak && cc < CC.peak + 6) {
          const i = cc - CC.peak;
          live.calibPeaks[i] = Math.max(live.calibPeaks[i], value);
          live.calibPeakAt = performance.now();
          return;
        }
        const st = useStore.getState();
        const next = applyDeviceCC(st.deviceConfig ?? emptyDeviceConfig(), sel, cc, value);
        if (next) st.set({ deviceConfig: next });
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
  useStore.getState().set({ status: 'idle', transport: null, deviceName: '', deviceConfig: null });
}

// ---------------------------------------------------------------------------
// Remote calibration over BLE (MIDI channel 16, see input/configProtocol.ts)
// ---------------------------------------------------------------------------
function bleInput(): BleMidiInput | null {
  return input instanceof BleMidiInput && input.connected ? input : null;
}

/** Calibration needs a live BLE link; over Serial the app's own detector is tuned instead. */
export function calibrationAvailable(): boolean {
  return bleInput() !== null;
}

/** Ask the guitar to stream peak levels (and send its current settings). */
export function setCalibrationMonitor(on: boolean): void {
  live.calibPeaks.fill(0);
  bleInput()?.setMonitor(on);
}

type DeviceSetting = { kind: 'threshold'; string: number } | { kind: 'gain'; string: number } | { kind: 'release' } | { kind: 'neighbour' };

/** Change one guitar setting (CC value 0–127); applied live, not saved until saveCalibration(). */
export function setDeviceSetting(which: DeviceSetting, value: number): void {
  const b = bleInput();
  if (!b) return;
  const st = useStore.getState();
  const cfg = st.deviceConfig ?? emptyDeviceConfig();
  switch (which.kind) {
    case 'threshold': {
      const threshold = cfg.threshold.slice();
      threshold[which.string] = value;
      st.set({ deviceConfig: { ...cfg, threshold } });
      b.sendConfig(`th${which.string}`, [[CC.threshold + which.string, value]]);
      break;
    }
    case 'gain': {
      const gain = cfg.gain.slice();
      gain[which.string] = value;
      st.set({ deviceConfig: { ...cfg, gain } });
      b.sendConfig(`gain${which.string}`, [
        [CC.gainSelect, which.string + 1],
        [CC.gain, value],
      ]);
      break;
    }
    case 'release':
      st.set({ deviceConfig: { ...cfg, release: value } });
      b.sendConfig('release', [[CC.release, value]]);
      break;
    case 'neighbour':
      st.set({ deviceConfig: { ...cfg, neighbour: value } });
      b.sendConfig('neighbour', [[CC.neighbour, value]]);
      break;
  }
}

export function saveCalibration(): void {
  bleInput()?.sendConfig('save', [[CC.save, 127]]);
  log('info', 'Calibration saved to guitar');
}

/** Factory defaults on the guitar; it answers with a fresh settings dump. */
export function resetCalibration(): void {
  bleInput()?.sendConfig('reset', [[CC.reset, 127]]);
  log('info', 'Calibration reset to defaults');
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
  stopAutoPlay();
  metronome ??= new Metronome(engine);
  set({ playing: true });
  metronome.start();
}

// ---------------------------------------------------------------------------
// Auto-strum ("השמע דוגמה" / "נגן איתי")
// ---------------------------------------------------------------------------
const AUTO_LEVEL = { demo: 1, along: 0.3 } as const;
const LOOKAHEAD = 0.12; // s of audio scheduled ahead
const PUMP_MS = 25;

class AutoPlayer {
  private timer = 0;
  private cursor: AutoCursor | null = null;
  private pending: StateChange[] = [];
  /** Player position the display was last set to by us (to detect user jumps). */
  private shownPos = -1;

  constructor(private engine: AudioEngine) {}

  start(): void {
    const s = useStore.getState();
    this.engine.stopAuto();
    this.cursor = startCursor(s.player, this.engine.ctx.currentTime + 0.06);
    this.pending = [];
    this.shownPos = s.player.pos;
    clearInterval(this.timer);
    this.timer = window.setInterval(() => this.pump(), PUMP_MS);
    this.pump();
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = 0;
    this.cursor = null;
    this.pending = [];
    this.engine.stopAuto();
  }

  private pump(): void {
    const s = useStore.getState();
    const song = findSong(s, s.songId);
    if (!song || !s.autoPlay || !this.cursor || s.screen !== 'songs' || s.songView !== 'player') {
      stopAutoPlay();
      return;
    }
    const now = this.engine.ctx.currentTime;

    // The user jumped (prev / next / section chip / restart): continue from there on the next eighth.
    if (s.player.pos !== this.shownPos) {
      this.engine.stopAuto();
      this.pending = [];
      this.cursor = startCursor(s.player, Math.max(now + 0.03, this.cursor.time));
      this.shownPos = s.player.pos;
    }
    // Loop-section toggles apply immediately.
    if (this.cursor.state.loopSection !== s.player.loopSection) {
      this.cursor = { ...this.cursor, state: { ...this.cursor.state, loopSection: s.player.loopSection } };
    }

    const cfg = songSettings(s, song);
    const setup = playSetup(s);
    const steps = stepsOf(song);
    const noteAt = (pos: number) => {
      const st = steps[pos];
      const chord = st ? symbolToChord(displaySymbol(st.chord, cfg.transpose)) : null;
      return chord ? chordNotes(setup, chord).physical : null;
    };
    // Remember which course each (string, note) came from, for the course's doubling strings.
    const courseOf = new Map<string, number>();
    const midisFor = (pos: number) =>
      (noteAt(pos) ?? []).map((n, string) => {
        if (n === null || n === 'mute') return null;
        courseOf.set(`${string}:${n.midi}`, n.course);
        return n.midi;
      });
    const r = scheduleWindow(
      this.cursor,
      { steps, tempo: cfg.tempo, pattern: patternById(s.strumPattern), midisFor },
      now + LOOKAHEAD,
    );
    this.cursor = r.cursor;
    for (const n of r.notes) {
      const course = courseOf.get(`${n.string}:${n.midi}`);
      this.engine.pluck(n.string, n.midi, n.velocity, n.when, 'auto', course === undefined ? [] : courseExtras(setup.inst, course));
    }
    this.pending.push(...r.changes);

    // Show each beat / chord change when it actually sounds.
    while (this.pending.length && this.pending[0].time <= now) {
      const c = this.pending.shift()!;
      if (c.state.finished) {
        useStore.getState().setPlayer({ ...useStore.getState().player, beat: 0 });
        stopAutoPlay();
        return;
      }
      this.shownPos = c.state.pos;
      const cur = useStore.getState().player;
      useStore.getState().setPlayer({ ...cur, pos: c.state.pos, beat: c.state.beat, strums: 0, finished: false });
    }
  }
}

let autoPlayer: AutoPlayer | null = null;

/** Start auto-strum from the current chord ('demo' = full volume, 'along' = quiet guide). */
export async function startAutoPlay(mode: 'demo' | 'along'): Promise<void> {
  await ensureAudio();
  if (!engine) return;
  metronome?.stop();
  useStore.getState().set({ playing: false, autoPlay: mode });
  engine.setAutoLevel(AUTO_LEVEL[mode]);
  autoPlayer ??= new AutoPlayer(engine);
  autoPlayer.start();
}

/** Switch between demo and play-along without interrupting playback. */
export function setAutoMode(mode: 'demo' | 'along'): void {
  if (!engine || !useStore.getState().autoPlay) return;
  useStore.getState().set({ autoPlay: mode });
  engine.setAutoLevel(AUTO_LEVEL[mode]);
}

export function stopAutoPlay(): void {
  autoPlayer?.stop();
  if (useStore.getState().autoPlay) useStore.getState().set({ autoPlay: null });
}

export function getSerialDetector() {
  return input instanceof SerialInput ? input.detector : null;
}

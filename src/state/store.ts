import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { InstrumentId } from '../audio/engine';
import { DEFAULT_DETECTOR_PARAMS, type DetectorParams } from '../input/strumDetector';
import type { TransportId } from '../input/types';
import { TUNINGS, defaultPalette, findVoicing, type Chord, type Key, type Voicing } from '../music/theory';

export type PlayMode = 'chord' | 'free';
export type Screen = 'connect' | 'play' | 'settings' | 'debug';
export type ConnStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface Settings {
  tuningId: string;
  customTuning: number[];
  capo: number;
  key: Key;
  palette: Chord[];
  selectedSlot: number;
  mode: PlayMode;
  instrument: InstrumentId;
  volume: number;
  reverb: number;
  detector: DetectorParams;
  midiOutName: string | null;
}

export interface Runtime {
  screen: Screen;
  transport: TransportId | null;
  status: ConnStatus;
  statusMsg: string;
  deviceName: string;
  audioReady: boolean;
}

export interface Actions {
  set: (p: Partial<Settings & Runtime>) => void;
  setDetector: (p: Partial<DetectorParams>) => void;
  setPaletteSlot: (slot: number, chord: Chord) => void;
  setKey: (k: Key, resetPalette: boolean) => void;
}

export type State = Settings & Runtime & Actions;

const defaultKey: Key = { root: 7, mode: 'major' };

export const useStore = create<State>()(
  persist(
    (set) => ({
      tuningId: 'standard',
      customTuning: TUNINGS[0].notes.slice(),
      capo: 0,
      key: defaultKey,
      palette: defaultPalette(defaultKey),
      selectedSlot: 0,
      mode: 'chord',
      instrument: 'acoustic',
      volume: 0.8,
      reverb: 0.2,
      detector: DEFAULT_DETECTOR_PARAMS,
      midiOutName: null,

      screen: 'connect',
      transport: null,
      status: 'idle',
      statusMsg: '',
      deviceName: '',
      audioReady: false,

      set: (p) => set(p),
      setDetector: (p) => set((s) => ({ detector: { ...s.detector, ...p } })),
      setPaletteSlot: (slot, chord) =>
        set((s) => {
          const palette = s.palette.slice();
          palette[slot] = chord;
          return { palette };
        }),
      setKey: (key, resetPalette) => set(resetPalette ? { key, palette: defaultPalette(key) } : { key }),
    }),
    {
      name: 'midi-guitar-settings',
      version: 1,
      partialize: (s): Settings => ({
        tuningId: s.tuningId,
        customTuning: s.customTuning,
        capo: s.capo,
        key: s.key,
        palette: s.palette,
        selectedSlot: s.selectedSlot,
        mode: s.mode,
        instrument: s.instrument,
        volume: s.volume,
        reverb: s.reverb,
        detector: s.detector,
        midiOutName: s.midiOutName,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Settings>;
        return { ...current, ...p, detector: { ...DEFAULT_DETECTOR_PARAMS, ...p.detector } };
      },
    },
  ),
);

export function tuningNotes(s: Pick<Settings, 'tuningId' | 'customTuning'>): number[] {
  if (s.tuningId === 'custom') return s.customTuning;
  return (TUNINGS.find((t) => t.id === s.tuningId) ?? TUNINGS[0]).notes;
}

const voicingCache = new Map<string, Voicing>();
export function voicingFor(chord: Chord, tuning: number[]): Voicing {
  const k = `${chord.root}:${chord.type}:${tuning.join(',')}`;
  let v = voicingCache.get(k);
  if (!v) {
    v = findVoicing(chord, tuning);
    voicingCache.set(k, v);
  }
  return v;
}

export function currentChord(s: Pick<Settings, 'palette' | 'selectedSlot'>): Chord {
  return s.palette[s.selectedSlot] ?? s.palette[0];
}

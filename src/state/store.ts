import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_DETECTOR_PARAMS, type DetectorParams } from '../input/strumDetector';
import type { DeviceConfig } from '../input/configProtocol';
import type { TransportId } from '../input/types';
import { makeSetup, type ExtraStrings, type PlaySetup } from '../instruments/mapping';
import { DEFAULT_INSTRUMENT, getInstrument } from '../instruments/registry';
import { defaultPalette, type Chord, type Key } from '../music/theory';
import { initialState as initialPlayer, type AdvanceMode, type PlayerState } from '../song/player';
import type { PatternId } from '../song/strumPattern';
import type { Song } from '../song/types';

export type PlayMode = 'chord' | 'free';
export type Screen = 'connect' | 'play' | 'songs' | 'settings' | 'debug';
export type SongView = 'library' | 'player' | 'import';

/** Per-song user overrides. */
export interface SongPrefs {
  transpose?: number;
  strumsPerChord?: number;
  tempo?: number;
  advanceMode?: AdvanceMode;
}

/** Dataset songs kept on the device (favorites always; plus the most recent ones). */
export const RECENT_DATASET_SONGS = 40;
export type ConnStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface Settings {
  /** Selected tuning per instrument id ('custom' = customTunings[id]); missing = the instrument's standard tuning. */
  tunings: Record<string, string>;
  customTunings: Record<string, number[]>;
  /** Register window start per instrument (instruments with more than 6 courses). */
  registers: Record<string, number>;
  /** Physical strings beyond a 1–5 course instrument: double the edge course or stay silent. */
  extraStrings: ExtraStrings;
  /** Tremolo on instruments that support it (mandolin, bouzouki, balalaika …). */
  tremolo: boolean;
  capo: number;
  key: Key;
  palette: Chord[];
  selectedSlot: number;
  mode: PlayMode;
  /** Instrument id from the registry (src/instruments/registry.ts). */
  instrument: string;
  volume: number;
  reverb: number;
  detector: DetectorParams;
  midiOutName: string | null;
  favorites: string[];
  userSongs: Song[];
  /** Songs opened from the Chordonomicon index, cached for offline use and favorites. */
  cachedSongs: Song[];
  songPrefs: Record<string, SongPrefs>;
  advanceMode: AdvanceMode;
  clickOn: boolean;
  strumPattern: PatternId;
  /** Strums quieter than this (0–1) are ignored – filters ghost hits from neighbouring strings. */
  velocityFloor: number;
}

export interface Runtime {
  screen: Screen;
  transport: TransportId | null;
  status: ConnStatus;
  statusMsg: string;
  deviceName: string;
  audioReady: boolean;
  songView: SongView;
  songId: string | null;
  player: PlayerState;
  /** Tempo mode metronome running. */
  playing: boolean;
  /** Auto-strum: 'demo' plays the song; 'along' plays it quietly as a guide under the user's strums. */
  autoPlay: null | 'demo' | 'along';
  /** Calibration values reported by the guitar over BLE (null until its settings dump arrives). */
  deviceConfig: DeviceConfig | null;
  /** Loading state of each sample set ('loading' | 'ready' | 'error'). */
  sampleStatus: Record<string, string>;
}

export interface Actions {
  set: (p: Partial<Settings & Runtime>) => void;
  setDetector: (p: Partial<DetectorParams>) => void;
  setPaletteSlot: (slot: number, chord: Chord) => void;
  setKey: (k: Key, resetPalette: boolean) => void;
  toggleFavorite: (id: string) => void;
  saveUserSong: (song: Song) => void;
  deleteUserSong: (id: string) => void;
  cacheSong: (song: Song) => void;
  setSongPrefs: (id: string, p: SongPrefs) => void;
  openSong: (id: string) => void;
  setPlayer: (p: PlayerState) => void;
}

export type State = Settings & Runtime & Actions;

const defaultKey: Key = { root: 7, mode: 'major' };

export const useStore = create<State>()(
  persist(
    (set) => ({
      tunings: {},
      customTunings: {},
      registers: {},
      extraStrings: 'double',
      tremolo: false,
      capo: 0,
      key: defaultKey,
      palette: defaultPalette(defaultKey),
      selectedSlot: 0,
      mode: 'chord',
      instrument: DEFAULT_INSTRUMENT,
      volume: 0.8,
      reverb: 0.2,
      detector: DEFAULT_DETECTOR_PARAMS,
      midiOutName: null,
      favorites: [],
      userSongs: [],
      cachedSongs: [],
      songPrefs: {},
      advanceMode: 'strum',
      clickOn: true,
      strumPattern: 'folk',
      velocityFloor: 0.08,

      screen: 'connect',
      transport: null,
      status: 'idle',
      statusMsg: '',
      deviceName: '',
      audioReady: false,
      songView: 'library',
      songId: null,
      player: initialPlayer(),
      playing: false,
      autoPlay: null,
      deviceConfig: null,
      sampleStatus: {},

      set: (p) => set(p),
      setDetector: (p) => set((s) => ({ detector: { ...s.detector, ...p } })),
      setPaletteSlot: (slot, chord) =>
        set((s) => {
          const palette = s.palette.slice();
          palette[slot] = chord;
          return { palette };
        }),
      setKey: (key, resetPalette) => set(resetPalette ? { key, palette: defaultPalette(key) } : { key }),
      toggleFavorite: (id) =>
        set((s) => ({ favorites: s.favorites.includes(id) ? s.favorites.filter((f) => f !== id) : [...s.favorites, id] })),
      saveUserSong: (song) => set((s) => ({ userSongs: [...s.userSongs.filter((u) => u.id !== song.id), song] })),
      deleteUserSong: (id) =>
        set((s) => ({
          userSongs: s.userSongs.filter((u) => u.id !== id),
          favorites: s.favorites.filter((f) => f !== id),
          songId: s.songId === id ? null : s.songId,
          songView: s.songId === id ? 'library' : s.songView,
        })),
      cacheSong: (song) =>
        set((s) => {
          const rest = s.cachedSongs.filter((c) => c.id !== song.id);
          // Most recent first; drop the oldest non-favorites beyond the cap.
          const next = [song, ...rest];
          let kept = 0;
          return {
            cachedSongs: next.filter((c) => s.favorites.includes(c.id) || ++kept <= RECENT_DATASET_SONGS),
          };
        }),
      setSongPrefs: (id, p) => set((s) => ({ songPrefs: { ...s.songPrefs, [id]: { ...s.songPrefs[id], ...p } } })),
      openSong: (id) => set({ songId: id, songView: 'player', player: initialPlayer(), playing: false, autoPlay: null }),
      setPlayer: (player) => set({ player }),
    }),
    {
      name: 'midi-guitar-settings',
      version: 2,
      migrate: (persisted, version) => (version < 2 ? migrateV1(persisted as Record<string, unknown>) : persisted) as Settings,
      partialize: (s): Settings => ({
        tunings: s.tunings,
        customTunings: s.customTunings,
        registers: s.registers,
        extraStrings: s.extraStrings,
        tremolo: s.tremolo,
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
        favorites: s.favorites,
        userSongs: s.userSongs,
        cachedSongs: s.cachedSongs,
        songPrefs: s.songPrefs,
        advanceMode: s.advanceMode,
        clickOn: s.clickOn,
        strumPattern: s.strumPattern,
        velocityFloor: s.velocityFloor,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Settings>;
        return { ...current, ...p, detector: { ...DEFAULT_DETECTOR_PARAMS, ...p.detector } };
      },
    },
  ),
);

/** Settings v1 (5 sounds on a guitar, one global tuning) → v2 (instrument registry). */
export function migrateV1(p: Record<string, unknown>): Partial<Settings> {
  const map: Record<string, string> = {
    acoustic: 'guitar-steel',
    electric: 'electric-clean',
    distorted: 'electric-distortion',
    bass: 'bass-4',
    synth: 'synth-lead',
  };
  const { tuningId, customTuning, instrument, ...rest } = p as { tuningId?: string; customTuning?: number[]; instrument?: string };
  const inst = map[instrument ?? ''] ?? DEFAULT_INSTRUMENT;
  const out: Partial<Settings> = { ...(rest as Partial<Settings>), instrument: inst, tunings: {}, customTunings: {} };
  // The old tuning applied to the guitar; keep it for the guitar-family instrument that replaces the old sound.
  if (getInstrument(inst).shapes === 'guitar' && tuningId) {
    out.tunings = { [inst]: tuningId };
    if (tuningId === 'custom' && customTuning?.length === 6) out.customTunings = { [inst]: customTuning };
  }
  return out;
}

/** Everything that decides what a physical string plays, for the current settings. Cached. */
export function playSetup(
  s: Pick<Settings, 'instrument' | 'tunings' | 'customTunings' | 'registers' | 'extraStrings' | 'capo' | 'key'>,
): PlaySetup {
  return makeSetup({
    instrumentId: s.instrument,
    tuningId: s.tunings[s.instrument],
    customTuning: s.customTunings[s.instrument],
    key: s.key,
    capo: s.capo,
    register: s.registers[s.instrument] ?? null,
    extraStrings: s.extraStrings,
  });
}

export function currentChord(s: Pick<Settings, 'palette' | 'selectedSlot'>): Chord {
  return s.palette[s.selectedSlot] ?? s.palette[0];
}

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { InstrumentId } from '../audio/engine';
import { DEFAULT_DETECTOR_PARAMS, type DetectorParams } from '../input/strumDetector';
import type { TransportId } from '../input/types';
import { TUNINGS, defaultPalette, findVoicing, type Chord, type Key, type Voicing } from '../music/theory';
import { initialState as initialPlayer, type AdvanceMode, type PlayerState } from '../song/player';
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
  favorites: string[];
  userSongs: Song[];
  /** Songs opened from the Chordonomicon index, cached for offline use and favorites. */
  cachedSongs: Song[];
  songPrefs: Record<string, SongPrefs>;
  advanceMode: AdvanceMode;
  clickOn: boolean;
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
      favorites: [],
      userSongs: [],
      cachedSongs: [],
      songPrefs: {},
      advanceMode: 'strum',
      clickOn: true,

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
      openSong: (id) => set({ songId: id, songView: 'player', player: initialPlayer(), playing: false }),
      setPlayer: (player) => set({ player }),
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
        favorites: s.favorites,
        userSongs: s.userSongs,
        cachedSongs: s.cachedSongs,
        songPrefs: s.songPrefs,
        advanceMode: s.advanceMode,
        clickOn: s.clickOn,
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

import type { AudioEngine } from '../audio/engine';
import type { Chord } from '../music/theory';
import { useStore, type State } from '../state/store';
import { symbolToChord, transposeSymbol } from './chordSymbol';
import { SEED_SONGS } from './library';
import { DEFAULT_STRUMS_PER_CHORD, flatten, onBeat, onStringHit, type Step } from './player';
import type { Song } from './types';

/** Song playback glue: which chord is current, strum counting, metronome. */

export function findSong(s: Pick<State, 'userSongs'>, id: string | null): Song | null {
  if (!id) return null;
  return SEED_SONGS.find((x) => x.id === id) ?? s.userSongs.find((x) => x.id === id) ?? null;
}

const stepCache = new WeakMap<Song, Step[]>();
export function stepsOf(song: Song): Step[] {
  let st = stepCache.get(song);
  if (!st) {
    st = flatten(song);
    stepCache.set(song, st);
  }
  return st;
}

export function songSettings(s: State, song: Song) {
  const p = s.songPrefs[song.id] ?? {};
  return {
    transpose: p.transpose ?? 0,
    strumsPerChord: p.strumsPerChord ?? song.strumsPerChord ?? DEFAULT_STRUMS_PER_CHORD,
    tempo: p.tempo ?? song.tempo,
  };
}

/** The song player owns the chord while its screen is open. */
export function songActive(s: State): Song | null {
  if (s.screen !== 'songs' || s.songView !== 'player') return null;
  return findSong(s, s.songId);
}

export function displaySymbol(sym: string, transpose: number): string {
  return transposeSymbol(sym, transpose);
}

/**
 * Called for every string hit while a song is open. Advances in strum mode,
 * then returns the chord the hit should sound.
 */
export function songChordForHit(t: number): Chord | null {
  const s = useStore.getState();
  const song = songActive(s);
  if (!song) return null;
  const steps = stepsOf(song);
  const cfg = songSettings(s, song);
  if (s.advanceMode === 'strum') {
    const next = onStringHit(steps, s.player, t, cfg.strumsPerChord);
    if (next !== s.player) s.setPlayer(next);
  }
  const cur = steps[useStore.getState().player.pos];
  return cur ? symbolToChord(displaySymbol(cur.chord, cfg.transpose)) : null;
}

/**
 * Look-ahead metronome on the audio clock: clicks are scheduled ~100 ms
 * ahead for sample-accurate timing; chord changes are applied when each
 * beat's time arrives.
 */
export class Metronome {
  private timer = 0;
  private nextTime = 0;
  private queue: number[] = [];
  private count = 0;
  private firstDone = false;

  constructor(private engine: AudioEngine) {}

  get running(): boolean {
    return this.timer !== 0;
  }

  start(): void {
    this.stop();
    this.nextTime = this.engine.ctx.currentTime + 0.06;
    this.count = 0;
    this.firstDone = false;
    this.queue = [];
    this.timer = window.setInterval(() => this.pump(), 25);
    this.pump();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = 0;
    this.queue = [];
  }

  private pump(): void {
    const s = useStore.getState();
    const song = findSong(s, s.songId);
    if (!song || !s.playing || s.advanceMode !== 'tempo') {
      this.stop();
      if (s.playing) s.set({ playing: false });
      return;
    }
    const tempo = Math.max(30, songSettings(s, song).tempo);
    const ctx = this.engine.ctx;
    while (this.nextTime < ctx.currentTime + 0.1) {
      if (s.clickOn) this.engine.metronomeClick(this.nextTime, this.count % 4 === 0);
      this.queue.push(this.nextTime);
      this.count++;
      this.nextTime += 60 / tempo;
    }
    while (this.queue.length && this.queue[0] <= ctx.currentTime) {
      this.queue.shift();
      // The first click starts the current chord; every later click is one beat elapsed.
      if (this.firstDone) {
        const cur = useStore.getState();
        const next = onBeat(stepsOf(song), cur.player);
        if (next !== cur.player) cur.setPlayer(next);
        if (next.finished) {
          cur.set({ playing: false });
          this.stop();
          return;
        }
      }
      this.firstDone = true;
    }
  }
}

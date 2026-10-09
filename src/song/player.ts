import type { Song } from './types';

/**
 * Pure song-advance logic, shared by tempo, strum-count and manual modes.
 * A position is a flat index into the song's chords.
 */
export type AdvanceMode = 'tempo' | 'strum' | 'manual';

export interface Step {
  section: number;
  index: number;
  chord: string;
  beats: number;
}

export interface PlayerState {
  /** Flat chord index. */
  pos: number;
  /** Beats already played on the current chord (tempo mode). */
  beat: number;
  /** Strums already played on the current chord (strum mode). */
  strums: number;
  /** performance.now() of the last string event, for strum grouping. */
  lastStrumAt: number;
  loopSection: boolean;
  finished: boolean;
}

/** Strings hit within this gap belong to the same strum. */
export const STRUM_GROUP_MS = 90;
export const DEFAULT_STRUMS_PER_CHORD = 4;

export function flatten(song: Song): Step[] {
  const out: Step[] = [];
  song.sections.forEach((sec, si) =>
    sec.chords.forEach((c, ci) => out.push({ section: si, index: ci, chord: c.chord, beats: Math.max(1, c.beats) })),
  );
  return out;
}

export function initialState(): PlayerState {
  return { pos: 0, beat: 0, strums: 0, lastStrumAt: -Infinity, loopSection: false, finished: false };
}

function sectionBounds(steps: Step[], pos: number): [number, number] {
  const sec = steps[pos]?.section ?? 0;
  let a = pos;
  let b = pos;
  while (a > 0 && steps[a - 1].section === sec) a--;
  while (b < steps.length - 1 && steps[b + 1].section === sec) b++;
  return [a, b];
}

/** Move to the next chord (wraps inside the section when looping; stops at the end). */
export function next(steps: Step[], s: PlayerState): PlayerState {
  if (!steps.length) return s;
  const reset = { beat: 0, strums: 0 };
  if (s.loopSection) {
    const [a, b] = sectionBounds(steps, s.pos);
    return { ...s, ...reset, pos: s.pos >= b ? a : s.pos + 1, finished: false };
  }
  if (s.pos >= steps.length - 1) return { ...s, ...reset, finished: true };
  return { ...s, ...reset, pos: s.pos + 1 };
}

export function prev(steps: Step[], s: PlayerState): PlayerState {
  if (!steps.length) return s;
  return { ...s, pos: Math.max(0, s.pos - 1), beat: 0, strums: 0, finished: false };
}

export function restart(s: PlayerState): PlayerState {
  return { ...s, pos: 0, beat: 0, strums: 0, finished: false, lastStrumAt: -Infinity };
}

export function jumpToSection(steps: Step[], s: PlayerState, section: number): PlayerState {
  const pos = steps.findIndex((st) => st.section === section);
  return pos < 0 ? s : { ...s, pos, beat: 0, strums: 0, finished: false };
}

/** Tempo mode: one metronome beat elapsed. */
export function onBeat(steps: Step[], s: PlayerState): PlayerState {
  if (!steps.length || s.finished) return s;
  const beat = s.beat + 1;
  if (beat >= steps[s.pos].beats) return next(steps, s);
  return { ...s, beat };
}

/**
 * Strum mode: a string was struck at time `t` (ms). Strings within
 * STRUM_GROUP_MS of each other form one strum. A new strum that arrives after
 * N completed strums first advances, so the whole strum sounds the new chord.
 */
export function onStringHit(steps: Step[], s: PlayerState, t: number, strumsPerChord: number): PlayerState {
  const newStrum = t - s.lastStrumAt > STRUM_GROUP_MS;
  let st: PlayerState = { ...s, lastStrumAt: t };
  if (!newStrum || !steps.length || st.finished) return st;
  if (st.strums >= Math.max(1, strumsPerChord)) {
    st = next(steps, st);
    if (st.finished) return st;
  }
  return { ...st, strums: st.strums + 1 };
}

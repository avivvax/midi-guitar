import {
  chordDef,
  chordPitchClasses,
  findVoicing,
  pc,
  scalePitchClasses,
  type Chord,
  type Key,
  type Voicing,
} from '../music/theory';
import { getInstrument } from './registry';
import { ukuleleShape } from './shapes';
import type { InstrumentDef, TuningDef } from './types';

/**
 * Maps the controller's 6 physical strings onto an instrument.
 *
 * Window: an instrument with ≤ 6 courses uses all of them; with more courses
 * (7-string guitar, theorbo, harp, qanun …) a window of 6 consecutive courses
 * is active and the "register" moves it (app buttons, `[` / `]` keys, and on
 * open-string instruments the touch-neck fret zone – see controller.ts).
 *
 * Fewer than 6 courses: the courses sit in the middle of the physical strings
 * (4 courses → physical strings 2–5); the outer physical strings either double
 * the nearest edge course ('double') or stay silent ('mute').
 *
 * Chord mode, by chord style:
 *  - fretted / fretless: a fingering is searched on the window's courses, using
 *    the instrument's own tuning (shape tables for guitar and ukulele);
 *  - open-string instruments (harp, zithers): physical strings play the
 *    chord-tone strings in order from the first root at or above the window;
 *  - arpeggio (melody instruments): chord tones in ascending order;
 *  - drone: the tuning itself, whatever the chord.
 */

export const PHYSICAL = 6;
export type ExtraStrings = 'double' | 'mute';

export interface PhysNote {
  midi: number;
  course: number;
  /** Fret as shown on the instrument (diatonic fret index on a mountain dulcimer), 0 = open. */
  fret: number;
}
/** Per physical string: a note, 'mute' (damped string – percussive click), or null (no string there – silent). */
export type PhysResult = PhysNote | 'mute' | null;

export interface PlaySetup {
  key: string;
  inst: InstrumentDef;
  /** Effective course notes after key re-tuning (no capo). */
  tuning: number[];
  capo: number;
  register: number;
  /** Course indexes of the active window (≤ 6). */
  window: number[];
  /** Physical string → course (free mode), null = silent. */
  physical: (number | null)[];
  /** Notes of sympathetic strings (for the engine). */
  sympathetic: number[];
  /** Drone notes (for the engine). */
  drone: number[];
  musicKey: Key;
}

export function tuningDef(inst: InstrumentDef, tuningId: string | undefined): TuningDef {
  return inst.tunings.find((t) => t.id === tuningId) ?? inst.tunings[0];
}

/** The tuning's notes: a custom tuning if one is stored for the instrument (same course count), else the named tuning. */
export function rawTuning(inst: InstrumentDef, tuningId: string | undefined, custom: number[] | undefined): number[] {
  const base = inst.tunings[0].notes;
  if (tuningId === 'custom' && custom && custom.length === base.length) return custom;
  return tuningDef(inst, tuningId).notes;
}

const wrapShift = (k: number) => {
  const m = pc(k);
  return m > 6 ? m - 12 : m;
};

/** Re-tune for the key: Indian Sa, transposable zithers, harps/qanun snapping to the scale. */
export function effectiveTuning(inst: InstrumentDef, notes: number[], key: Key): number[] {
  if (inst.retune === 'scale') {
    // The strings are a diatonic run; re-tune them by rank onto the key's scale (each string one scale step).
    const scale = new Set(scalePitchClasses(key));
    let m = notes[0] + ([0, 1, -1, 2, -2].find((d) => scale.has(pc(notes[0] + d))) ?? 0);
    return notes.map((_, i) => {
      if (i > 0) do m++; while (!scale.has(pc(m)));
      return m;
    });
  }
  if (inst.tonic !== undefined) {
    let target = key.root;
    if (inst.retune === 'transpose') {
      // Pentatonic/modal zithers: keep the instrument's mode, move to the key or its relative.
      const instMinor = inst.id === 'koto' || inst.id === 'kantele';
      if (instMinor && key.mode === 'major') target = pc(key.root + 9);
      if (!instMinor && key.mode === 'minor') target = pc(key.root + 3);
    }
    const k = wrapShift(target - inst.tonic);
    return notes.map((n) => n + k);
  }
  return notes;
}

/** How far the window can move, and by how much per step. */
export function registerRange(inst: InstrumentDef, tuning: number[]): { max: number; step: number; def: number } {
  const n = tuning.length;
  if (n <= PHYSICAL) return { max: 0, step: 0, def: 0 };
  const max = n - PHYSICAL;
  let def = inst.defaultRegister ?? 0;
  let step = 1;
  if (inst.fretting.kind === 'open') {
    // Move by about an octave; start around G3 unless the instrument says otherwise.
    step = Math.max(1, tuning.filter((m) => m >= tuning[0] && m < tuning[0] + 12).length);
    if (inst.defaultRegister === undefined) def = Math.max(0, tuning.findIndex((m) => m >= 55));
  }
  return { max, step, def: Math.min(max, def) };
}

const setupCache = new Map<string, PlaySetup>();

export interface SetupInput {
  instrumentId: string;
  tuningId?: string;
  customTuning?: number[];
  key: Key;
  capo: number;
  /** Window start (null = instrument default). */
  register: number | null;
  extraStrings: ExtraStrings;
}

export function makeSetup(input: SetupInput): PlaySetup {
  const inst = getInstrument(input.instrumentId);
  const raw = rawTuning(inst, input.tuningId, input.customTuning);
  const k = [inst.id, raw.join(','), input.key.root, input.key.mode, input.capo, input.register, input.extraStrings].join('|');
  const hit = setupCache.get(k);
  if (hit) return hit;
  const tuning = effectiveTuning(inst, raw, input.key);
  const range = registerRange(inst, tuning);
  const register = Math.max(0, Math.min(range.max, input.register ?? range.def));
  const window = Array.from({ length: Math.min(PHYSICAL, tuning.length) }, (_, i) => register + i);
  const off = Math.floor((PHYSICAL - window.length) / 2);
  const physical = Array.from({ length: PHYSICAL }, (_, p) => {
    const i = p - off;
    if (i >= 0 && i < window.length) return window[i];
    return input.extraStrings === 'double' ? window[Math.max(0, Math.min(window.length - 1, i))] : null;
  });
  const setup: PlaySetup = {
    key: k,
    inst,
    tuning,
    capo: input.capo,
    register,
    window,
    physical,
    sympathetic: sympatheticNotes(inst, input.key),
    drone: droneNotes(inst, input.key),
    musicKey: input.key,
  };
  if (setupCache.size > 64) setupCache.clear();
  setupCache.set(k, setup);
  return setup;
}

function sympatheticNotes(inst: InstrumentDef, key: Key): number[] {
  const s = inst.articulation.sympathetic;
  if (!s) return [];
  if ('notes' in s) return s.notes;
  const scale = new Set(scalePitchClasses(key));
  const out: number[] = [];
  for (let m = s.keyScale.low; out.length < s.keyScale.count; m++) if (scale.has(pc(m))) out.push(m);
  return out;
}

function droneNotes(inst: InstrumentDef, key: Key): number[] {
  const d = inst.articulation.drone;
  if (!d) return [];
  return d.intervals.map((i) => (d.octave + 1) * 12 + key.root + i);
}

/** Semitones above the open string for a touch-neck fret number. */
export function fretToSemitones(inst: InstrumentDef, fret: number): number {
  const f = inst.fretting;
  if (f.kind === 'fretted' && f.fretSemitones) return f.fretSemitones[Math.min(fret, f.fretSemitones.length - 1)];
  return fret;
}

/** Display fret for a semitone offset (inverse of fretToSemitones). */
export function semitonesToFret(inst: InstrumentDef, semis: number): number {
  const f = inst.fretting;
  if (f.kind === 'fretted' && f.fretSemitones) {
    const i = f.fretSemitones.indexOf(semis);
    return i >= 0 ? i : semis;
  }
  return semis;
}

const isOpenString = (inst: InstrumentDef) => inst.fretting.kind === 'open';

function note(setup: PlaySetup, course: number, semis: number): PhysNote {
  return { midi: setup.tuning[course] + setup.capo + semis, course, fret: semitonesToFret(setup.inst, semis) };
}

/** Free mode: what a physical string plays with the given touch-neck fret (null = not touched / open). */
export function freeNote(setup: PlaySetup, physical: number, fret: number | null): PhysResult {
  const course = setup.physical[physical];
  if (course === null || course === undefined) return null;
  if (fret === null) return 'mute';
  const inst = setup.inst;
  if (isOpenString(inst) || inst.openOnly?.includes(course) || inst.chordStyle === 'drone') return note(setup, course, 0);
  const max = inst.fretting.kind === 'fretless' ? inst.fretting.range : inst.fretting.kind === 'fretted' ? inst.fretting.frets : 0;
  return note(setup, course, fretToSemitones(inst, Math.min(fret, max)));
}

// --------------------------------------------------------------------------- chords

const chordCache = new Map<string, { physical: PhysResult[]; voicing: Voicing | null }>();

function maxFret(inst: InstrumentDef): number {
  const f = inst.fretting;
  return f.kind === 'fretted' ? (f.fretSemitones ? f.fretSemitones[f.fretSemitones.length - 1] : f.frets) : f.kind === 'fretless' ? f.range : 0;
}

/** Fingering (semitones per window course) for fretted / fretless chord styles. */
function windowVoicing(setup: PlaySetup, chord: Chord): Voicing {
  const inst = setup.inst;
  const tun = setup.window.map((c) => setup.tuning[c]);
  const style = inst.chordStyle ?? 'chord';
  const openOnly = (inst.openOnly ?? []).map((c) => setup.window.indexOf(c)).filter((i) => i >= 0);
  const span = inst.span ?? 3;
  const opts = {
    span,
    maxPos: Math.max(0, Math.min(9, maxFret(inst) - span)),
    frets: inst.fretting.kind === 'fretted' ? inst.fretting.fretSemitones : undefined,
    openOnly,
    guitarShapes: inst.shapes === 'guitar',
  };
  if (style === 'bass') return findVoicing({ root: chord.root, type: '5' }, tun, { ...opts, rootInBass: 'require', guitarShapes: false });
  if (style === 'slide') return slideVoicing(chord, tun);
  if (inst.shapes === 'ukulele') {
    const v = ukuleleShape(chord, tun);
    if (v) return v;
  }
  const ascending = tun.every((n, i) => i === 0 || n > tun[i - 1]);
  const rootInBass = tun.length >= 5 && ascending ? ('require' as const) : ('prefer' as const);
  // Fallbacks for chords the tuning can't fully voice: drop the fifth, widen the hand, then root + fifth.
  const attempts = [
    { ...opts, rootInBass },
    { ...opts, rootInBass, optionalFifth: true },
    { ...opts, rootInBass: 'prefer' as const, optionalFifth: true, span: span + 2, guitarShapes: false },
  ];
  for (const o of attempts) {
    const v = findVoicing(chord, tun, o);
    if (v.some((f) => f !== null)) return v;
  }
  return findVoicing({ root: chord.root, type: '5' }, tun, { ...opts, rootInBass: 'prefer', guitarShapes: false });
}

/** One straight bar across all strings: the fret where the chord's tones sound best (lap steel, dobro). */
function slideVoicing(chord: Chord, tun: number[]): Voicing {
  // 7th chords fall back to the triad, anything else to root + fifth (what a straight bar can give).
  const def = chordDef(chord.type);
  const tones = new Set(chordPitchClasses(chord));
  const full = def.intervals.filter((i) => !def.optional?.includes(i)).map((i) => pc(chord.root + i));
  for (const required of [full, full.filter((p) => p !== pc(chord.root + 10) && p !== pc(chord.root + 11)), [chord.root]]) {
    const v = slideAt(tones, required, chord.root, tun);
    if (v.some((f) => f !== null)) return v;
  }
  return tun.map(() => null);
}

function slideAt(tones: Set<number>, required: number[], root: number, tun: number[]): Voicing {
  let best: Voicing = tun.map(() => null);
  let bestScore = -Infinity;
  for (let f = 0; f <= 12; f++) {
    const v = tun.map((n) => (tones.has(pc(n + f)) ? f : null));
    const played = v.map((x, i) => (x === null ? null : tun[i] + f)).filter((x): x is number => x !== null);
    if (played.length < 2 || !required.every((r) => played.some((p) => pc(p) === r))) continue;
    const score = played.length * 4 + (pc(Math.min(...played)) === root ? 6 : 0) - f * 0.3;
    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }
  return best;
}

/** Chord tones ascending from the root at/above `low`, enough for every physical string. */
function chordRun(chord: Chord, low: number, count: number): number[] {
  const tones = new Set(chordPitchClasses(chord));
  let m = low;
  while (pc(m) !== chord.root) m++;
  const out: number[] = [];
  for (; out.length < count; m++) if (tones.has(pc(m))) out.push(m);
  return out;
}

/**
 * What each physical string plays for `chord` in chord mode, plus the window's
 * fingering for the chord diagram (null for styles without a fingering).
 */
export function chordNotes(setup: PlaySetup, chord: Chord): { physical: PhysResult[]; voicing: Voicing | null } {
  const ck = `${setup.key}|${chord.root}:${chord.type}`;
  const hit = chordCache.get(ck);
  if (hit) return hit;
  const res = computeChord(setup, chord);
  if (chordCache.size > 512) chordCache.clear();
  chordCache.set(ck, res);
  return res;
}

function computeChord(setup: PlaySetup, chord: Chord): { physical: PhysResult[]; voicing: Voicing | null } {
  const inst = setup.inst;
  const style = inst.chordStyle ?? 'chord';
  // As on a real guitar the chord names the shape; the capo transposes what it sounds like.
  const shapeChord = chord;

  if (style === 'drone') {
    return { physical: setup.physical.map((c) => (c === null ? null : note(setup, c, 0))), voicing: null };
  }

  if (isOpenString(inst)) {
    const tones = new Set(chordPitchClasses(shapeChord));
    const strings = setup.tuning.map((_, i) => i).filter((i) => tones.has(pc(setup.tuning[i])));
    let start = strings.findIndex((i) => i >= setup.register && pc(setup.tuning[i]) === shapeChord.root);
    if (start < 0) start = Math.max(0, strings.findIndex((i) => i >= setup.register));
    start = Math.max(0, Math.min(start, strings.length - PHYSICAL));
    const picked = strings.slice(start, start + PHYSICAL);
    return { physical: Array.from({ length: PHYSICAL }, (_, p) => (p < picked.length ? note(setup, picked[p], 0) : null)), voicing: null };
  }

  if (style === 'arpeggio') {
    const lowest = Math.min(...setup.window.map((c) => setup.tuning[c]));
    const run = chordRun(shapeChord, lowest, PHYSICAL);
    const max = maxFret(inst);
    const physical = run.map<PhysResult>((target) => {
      let best: PhysNote | null = null;
      for (const c of setup.window) {
        const semis = target - setup.tuning[c];
        if (semis >= 0 && semis <= max && (!best || semis < best.fret)) best = note(setup, c, semis);
      }
      return best;
    });
    return { physical, voicing: null };
  }

  const v = windowVoicing(setup, shapeChord);
  const off = Math.floor((PHYSICAL - setup.window.length) / 2);
  const physical = setup.physical.map<PhysResult>((course, p) => {
    if (course === null) return null;
    const semis = v[setup.window.indexOf(course)];
    if (semis === null) {
      // Slide: strings off the chord are simply not picked. Doubled outer strings follow their course.
      return style === 'slide' || p < off || p >= off + setup.window.length ? null : 'mute';
    }
    return note(setup, course, semis);
  });
  return { physical, voicing: v.map((s) => (s === null ? null : semitonesToFret(inst, s))) };
}

/** Text for a physical string's label: note name, × (muted), · (silent). */
export function describe(r: PhysResult, name: (midi: number) => string): string {
  if (r === null) return '·';
  if (r === 'mute') return '×';
  return name(r.midi);
}

/** Extra strings of a course (doubling), as semitone offsets. */
export function courseExtras(inst: InstrumentDef, course: number): number[] {
  return inst.courses?.[course] ?? [];
}

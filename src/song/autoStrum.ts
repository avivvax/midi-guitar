import { next, type PlayerState, type Step } from './player';
import { chordStrokes, strokeNotes, type PatternDef } from './strumPattern';

/**
 * Auto-strum timeline: walks the song from a player position on the audio
 * clock, one eighth-note slot at a time, producing scheduled notes and the
 * player-state changes (beat ticks, chord changes) that keep the display in
 * sync. Pure – the runtime calls it every ~25 ms for a short look-ahead window.
 */
export interface AutoCursor {
  /** Player state for the chord being played (pos, loopSection, …). */
  state: PlayerState;
  /** Eighth-note slot inside the current chord. */
  slot: number;
  /** Audio time of `slot`. */
  time: number;
  done: boolean;
}

export interface AutoContext {
  steps: Step[];
  tempo: number;
  pattern: PatternDef;
  /** MIDI note per string for the chord at a flat position (null = muted). */
  midisFor: (pos: number) => (number | null)[];
  rand?: () => number;
}

export interface ScheduledNote {
  string: number;
  midi: number;
  velocity: number;
  when: number;
}

export interface StateChange {
  time: number;
  state: PlayerState;
}

export function startCursor(state: PlayerState, time: number): AutoCursor {
  return { state: { ...state, beat: 0, strums: 0, finished: false }, slot: 0, time, done: false };
}

export function scheduleWindow(
  cursor: AutoCursor,
  ctx: AutoContext,
  until: number,
): { cursor: AutoCursor; notes: ScheduledNote[]; changes: StateChange[] } {
  const notes: ScheduledNote[] = [];
  const changes: StateChange[] = [];
  let { state, slot, time, done } = cursor;
  const eighth = 60 / Math.max(30, ctx.tempo) / 2;
  let guard = 0;

  while (!done && time < until && guard++ < 512) {
    const step = ctx.steps[state.pos];
    if (!step) {
      done = true;
      break;
    }
    const slots = Math.max(1, Math.round(step.beats * 2));
    if (slot === 0 || slot % 2 === 0) {
      // Beat tick (and chord start) for the display.
      changes.push({ time, state: { ...state, beat: slot / 2 } });
    }
    const stroke = chordStrokes(ctx.pattern, step.beats).find((e) => e.slot === slot);
    if (stroke) {
      for (const n of strokeNotes(stroke.stroke, slot, stroke.accent, ctx.midisFor(state.pos), ctx.rand)) {
        notes.push({ string: n.string, midi: n.midi, velocity: n.velocity, when: time + n.offset });
      }
    }
    slot++;
    time += eighth;
    if (slot >= slots) {
      const after = next(ctx.steps, state);
      if (after.finished) {
        done = true;
        changes.push({ time, state: { ...state, finished: true } });
      } else {
        state = { ...after, beat: 0, strums: 0 };
        slot = 0;
      }
    }
  }
  return { cursor: { state, slot, time, done }, notes, changes };
}

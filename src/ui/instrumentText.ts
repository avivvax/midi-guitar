import { describe, type PhysResult } from '../instruments/mapping';
import type { InstrumentDef } from '../instruments/types';
import { noteName, noteNameOct } from '../music/theory';

/** "4 מקהלות כפולות", "6 מיתרים", "34 מיתרים" … */
export function courseCount(inst: InstrumentDef): string {
  const n = inst.tunings[0].notes.length;
  const doubled = inst.courses?.some((c) => c.length > 0);
  if (n === 1) return doubled ? 'מקהלה אחת' : 'מיתר אחד';
  return doubled ? `${n} מקהלות` : `${n} מיתרים`;
}

/** Tuning as note names; long tunings as a range. */
export function tuningText(notes: number[]): string {
  if (notes.length > 8) return `${noteNameOct(Math.min(...notes))}–${noteNameOct(Math.max(...notes))}`;
  return notes.map(noteName).join(' ');
}

export const physLabel = (r: PhysResult): string => describe(r, noteName);

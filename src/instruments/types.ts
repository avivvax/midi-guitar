/**
 * Instrument data model. An instrument has N courses (a course = one string or
 * a pair/triple of strings played together); the controller has 6 physical
 * strings, which `mapping.ts` maps onto the courses.
 */

export type Family =
  | 'guitar'
  | 'bass'
  | 'small-plucked'
  | 'long-neck'
  | 'bowed'
  | 'zither'
  | 'harp'
  | 'drone'
  | 'other';

export type Region =
  | 'western'
  | 'latin'
  | 'eastern-europe'
  | 'middle-east'
  | 'south-asia'
  | 'east-asia'
  | 'southeast-asia'
  | 'africa';

export interface TuningDef {
  id: string;
  name: string;
  /** MIDI note per course, in physical order (course 0 = the bass side of the neck, like low E). */
  notes: number[];
  /** Set when the tuning (or its absolute pitch) is not certain – shown in the UI and listed in the docs. */
  uncertain?: string;
}

export type Fretting =
  /** Frets. `fretSemitones[k]` = semitones above open at fret k (diatonic necks); default chromatic. */
  | { kind: 'fretted'; frets: number; fretSemitones?: number[] }
  /** No frets; positions are still played in semitones (no microtones). `range` = semitones reachable. */
  | { kind: 'fretless'; range: number }
  /** Every string sounds one pitch (harp, zither, qanun …). */
  | { kind: 'open' };

/**
 * How chord mode voices a chord.
 *  chord    – search a playable fingering on the instrument's own tuning
 *  bass     – root + fifth (+ octave) low on the neck
 *  slide    – one straight bar across all strings (lap steel, dobro)
 *  arpeggio – melody instrument: the physical strings play chord tones in ascending order
 *  drone    – ignore the chord; always sound the tuning (tanpura)
 * Open-string instruments always pick chord-tone strings (see mapping.ts).
 */
export type ChordStyle = 'chord' | 'bass' | 'slide' | 'arpeggio' | 'drone';

export type Technique = 'pluck' | 'pick' | 'strum' | 'bow' | 'hammer';

export interface Articulation {
  technique: Technique;
  /** Offer a tremolo (rapid re-picking) toggle – mandolin, bouzouki, balalaika, pipa … */
  tremolo?: boolean;
  /** Sympathetic strings: ring softly when a played note matches them (sitar taraf, hardanger understrings). */
  sympathetic?: { notes: number[] } | { keyScale: { low: number; count: number } };
  /** Continuous drone on the key's root and fifth while playing (hurdy-gurdy). Offsets in semitones from the root in `octave`. */
  drone?: { intervals: number[]; octave: number; level: number };
}

export interface InstrumentDef {
  id: string;
  name: { en: string; he: string };
  family: Family;
  region: Region;
  /** First tuning = standard. Every tuning has the same number of courses. */
  tunings: TuningDef[];
  /** Extra strings per course as semitone offsets: [0] = unison pair, [12] = octave pair, [-12] = octave below, [0, 0] = triple. */
  courses?: number[][];
  /** Courses that are never fretted (banjo 5th string, theorbo diapasons): open if a chord tone, else silent. */
  openOnly?: number[];
  fretting: Fretting;
  chordStyle?: ChordStyle;
  /** Largest fret span of a chord shape (default 3 = four frets). */
  span?: number;
  /** Tuning is relative to a tonic that follows the key (Indian 'Sa'); value = pitch class of the tonic in the listed tuning. */
  tonic?: number;
  /**
   * Open-string instruments that are re-tuned for the key:
   *  scale      – every string snaps to the key's diatonic scale (pedal/lever harp, qanun mandals)
   *  transpose  – the whole tuning is moved so its tonic (`tonic`, default C) sits on the key root (guzheng, koto bridges)
   */
  retune?: 'scale' | 'transpose';
  /** First course of the 6-course window for instruments with more than 6 courses. */
  defaultRegister?: number;
  /** Use the hand-written shape table for this tuning family when the tuning is the standard one (shifted uniformly). */
  shapes?: 'guitar' | 'ukulele';
  sound: string;
  /** Sample set (lazy-loaded); the synth preset `sound` plays until it is loaded, or if it fails. */
  samples?: string;
  /** General MIDI program (0-based) sent to external MIDI apps. */
  gm: number;
  articulation: Articulation;
  /** Remarks shown in the picker (approximations etc.). */
  note?: string;
}

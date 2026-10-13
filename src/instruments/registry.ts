import { MAJOR_PENTA, MAJOR_STEPS, scaleRun, t } from './notes';
import type { InstrumentDef, TuningDef } from './types';

/**
 * The instrument registry – data only. Each entry lists its standard tuning(s)
 * in MIDI notes, course layout, fretting, how chords are voiced, its sound
 * (synth preset + optional sample set) and a General MIDI fallback.
 *
 * Course order is the physical order across the neck starting from the side
 * where a guitar has its low E. Re-entrant tunings (ukulele, banjo, charango,
 * cuatro …) are therefore not in ascending pitch.
 *
 * Anything not certain is marked with `uncertain` (tuning) or `note`
 * (instrument) – see also README "String instruments".
 */

const GUITAR_TUNINGS: TuningDef[] = [
  { id: 'standard', name: 'Standard (E A D G B E)', notes: t('E2 A2 D3 G3 B3 E4') },
  { id: 'dropd', name: 'Drop D (D A D G B E)', notes: t('D2 A2 D3 G3 B3 E4') },
  { id: 'dadgad', name: 'DADGAD', notes: t('D2 A2 D3 G3 A3 D4') },
  { id: 'openg', name: 'Open G (D G D G B D)', notes: t('D2 G2 D3 G3 B3 D4') },
  { id: 'opend', name: 'Open D (D A D F# A D)', notes: t('D2 A2 D3 F#3 A3 D4') },
  { id: 'halfdown', name: 'Half-step down (Eb)', notes: t('Eb2 Ab2 Db3 Gb3 Bb3 Eb4') },
];

const BASS4_TUNINGS: TuningDef[] = [
  { id: 'standard', name: 'Standard (E A D G)', notes: t('E1 A1 D2 G2') },
  { id: 'dropd', name: 'Drop D (D A D G)', notes: t('D1 A1 D2 G2') },
  { id: 'halfdown', name: 'Half-step down (Eb)', notes: t('Eb1 Ab1 Db2 Gb2') },
];

const UKE_TUNINGS: TuningDef[] = [
  { id: 'gcea', name: 'High G (g C E A)', notes: t('G4 C4 E4 A4') },
  { id: 'lowg', name: 'Low G (G C E A)', notes: t('G3 C4 E4 A4') },
  { id: 'adfsb', name: 'D tuning (a D F# B)', notes: t('A4 D4 F#4 B4') },
];

const FRETS_CHROMATIC = (n: number) => ({ kind: 'fretted' as const, frets: n });
const FRETLESS = (range = 24) => ({ kind: 'fretless' as const, range });
const OPEN = { kind: 'open' as const };

/** Mountain dulcimer: diatonic frets incl. the "6½" fret (index 7 = 11 semitones). */
const DULCIMER_FRETS = [0, 2, 4, 5, 7, 9, 10, 11, 12, 14, 16, 17, 19, 21, 22, 23, 24];

export const INSTRUMENTS: InstrumentDef[] = [
  // ------------------------------------------------------------------ guitars
  {
    id: 'guitar-steel', name: { en: 'Acoustic guitar (steel)', he: 'גיטרה אקוסטית' }, family: 'guitar', region: 'western',
    tunings: GUITAR_TUNINGS, fretting: FRETS_CHROMATIC(20), shapes: 'guitar',
    sound: 'steel', samples: 'steel', gm: 25, articulation: { technique: 'strum' },
  },
  {
    id: 'guitar-nylon', name: { en: 'Classical guitar (nylon)', he: 'גיטרה קלאסית' }, family: 'guitar', region: 'western',
    tunings: GUITAR_TUNINGS, fretting: FRETS_CHROMATIC(19), shapes: 'guitar',
    sound: 'nylon', samples: 'nylon', gm: 24, articulation: { technique: 'pluck' },
  },
  {
    id: 'guitar-12', name: { en: '12-string guitar', he: 'גיטרה 12 מיתרים' }, family: 'guitar', region: 'western',
    tunings: GUITAR_TUNINGS, fretting: FRETS_CHROMATIC(18), shapes: 'guitar',
    // Four bass courses with an octave string, two treble courses in unison.
    courses: [[12], [12], [12], [12], [0], [0]],
    sound: 'steel', samples: 'steel', gm: 25, articulation: { technique: 'strum' },
  },
  {
    id: 'guitar-baritone', name: { en: 'Baritone guitar', he: 'גיטרה בריטון' }, family: 'guitar', region: 'western',
    tunings: [
      { id: 'b', name: 'B standard (B E A D F# B)', notes: t('B1 E2 A2 D3 F#3 B3') },
      { id: 'a', name: 'A standard (A D G C E A)', notes: t('A1 D2 G2 C3 E3 A3') },
    ],
    fretting: FRETS_CHROMATIC(24), shapes: 'guitar', sound: 'steel', samples: 'steel', gm: 25, articulation: { technique: 'strum' },
  },
  {
    id: 'guitar-7', name: { en: '7-string guitar', he: 'גיטרה 7 מיתרים' }, family: 'guitar', region: 'western',
    tunings: [{ id: 'standard', name: 'Standard (B E A D G B E)', notes: t('B1 E2 A2 D3 G3 B3 E4') }],
    fretting: FRETS_CHROMATIC(24), defaultRegister: 1, shapes: 'guitar',
    sound: 'electric', samples: 'eclean', gm: 27, articulation: { technique: 'pick' },
    note: '7 courses on 6 physical strings: the register buttons move the window down to the low B.',
  },
  {
    id: 'electric-clean', name: { en: 'Electric guitar – clean', he: 'גיטרה חשמלית – נקי' }, family: 'guitar', region: 'western',
    tunings: GUITAR_TUNINGS, fretting: FRETS_CHROMATIC(22), shapes: 'guitar',
    sound: 'electric', samples: 'eclean', gm: 27, articulation: { technique: 'pick' },
  },
  {
    id: 'electric-overdrive', name: { en: 'Electric guitar – overdrive', he: 'גיטרה חשמלית – אוברדרייב' }, family: 'guitar', region: 'western',
    tunings: GUITAR_TUNINGS, fretting: FRETS_CHROMATIC(22), shapes: 'guitar',
    sound: 'overdrive', samples: 'eod', gm: 29, articulation: { technique: 'pick' },
  },
  {
    id: 'electric-distortion', name: { en: 'Electric guitar – distortion', he: 'גיטרה חשמלית – דיסטורשן' }, family: 'guitar', region: 'western',
    tunings: GUITAR_TUNINGS, fretting: FRETS_CHROMATIC(24), shapes: 'guitar',
    sound: 'distortion', samples: 'edist', gm: 30, articulation: { technique: 'pick' },
  },
  {
    id: 'lap-steel', name: { en: 'Lap steel guitar', he: 'לאפ סטיל' }, family: 'guitar', region: 'western',
    tunings: [
      { id: 'c6', name: 'C6 (C E G A C E)', notes: t('C3 E3 G3 A3 C4 E4') },
      { id: 'opene', name: 'Open E (E B E G# B E)', notes: t('E2 B2 E3 G#3 B3 E4') },
    ],
    fretting: FRETS_CHROMATIC(24), chordStyle: 'slide', sound: 'lapsteel', gm: 26, articulation: { technique: 'pick' },
    note: 'Chords are a straight bar across all strings, like a slide; strings that are not chord tones are skipped.',
  },
  {
    id: 'resonator', name: { en: 'Resonator guitar (dobro)', he: 'גיטרת רזונטור (דוברו)' }, family: 'guitar', region: 'western',
    tunings: [{ id: 'openg', name: 'Open G high-bass (G B D G B D)', notes: t('G2 B2 D3 G3 B3 D4') }],
    fretting: FRETS_CHROMATIC(19), chordStyle: 'slide', sound: 'resonator', gm: 25, articulation: { technique: 'pick' },
  },
  {
    id: 'synth-lead', name: { en: 'Synth lead (guitar tuning)', he: 'סינת׳ ליד' }, family: 'other', region: 'western',
    tunings: GUITAR_TUNINGS, fretting: FRETS_CHROMATIC(24), shapes: 'guitar', sound: 'synth', gm: 81, articulation: { technique: 'pick' },
  },

  // -------------------------------------------------------------------- basses
  {
    id: 'bass-4', name: { en: 'Bass guitar (4-string)', he: 'גיטרה בס 4 מיתרים' }, family: 'bass', region: 'western',
    tunings: BASS4_TUNINGS, fretting: FRETS_CHROMATIC(21), chordStyle: 'bass',
    sound: 'bass', samples: 'bass-finger', gm: 33, articulation: { technique: 'pluck' },
  },
  {
    id: 'bass-5', name: { en: 'Bass guitar (5-string)', he: 'גיטרה בס 5 מיתרים' }, family: 'bass', region: 'western',
    tunings: [{ id: 'standard', name: 'Standard (B E A D G)', notes: t('B0 E1 A1 D2 G2') }],
    fretting: FRETS_CHROMATIC(24), chordStyle: 'bass', sound: 'bass', samples: 'bass-finger', gm: 33, articulation: { technique: 'pluck' },
  },
  {
    id: 'bass-6', name: { en: 'Bass guitar (6-string)', he: 'גיטרה בס 6 מיתרים' }, family: 'bass', region: 'western',
    tunings: [{ id: 'standard', name: 'Standard (B E A D G C)', notes: t('B0 E1 A1 D2 G2 C3') }],
    fretting: FRETS_CHROMATIC(24), chordStyle: 'bass', sound: 'bass', samples: 'bass-finger', gm: 33, articulation: { technique: 'pluck' },
  },
  {
    id: 'bass-fretless', name: { en: 'Fretless bass', he: 'בס פרטלס' }, family: 'bass', region: 'western',
    tunings: BASS4_TUNINGS, fretting: FRETLESS(24), chordStyle: 'bass',
    sound: 'bass', samples: 'bass-fretless', gm: 35, articulation: { technique: 'pluck' },
  },
  {
    id: 'guitarron', name: { en: 'Guitarrón mexicano', he: 'גיטרון מקסיקני' }, family: 'bass', region: 'latin',
    // Re-entrant: the 1st string is an octave above the 6th.
    tunings: [{ id: 'standard', name: 'A D G C E A', notes: t('A1 D2 G2 C3 E3 A2') }],
    fretting: FRETLESS(12), chordStyle: 'bass', sound: 'bass', samples: 'bass-ac', gm: 32, articulation: { technique: 'pluck' },
    note: 'Sampled with an acoustic bass guitar (no free guitarrón samples).',
  },

  // ------------------------------------------------------------- small plucked
  ...(['soprano', 'concert', 'tenor'] as const).map<InstrumentDef>((size, i) => ({
    id: `uke-${size}`,
    name: { en: `Ukulele (${size})`, he: `יוקוללה ${['סופרן', 'קונצרט', 'טנור'][i]}` },
    family: 'small-plucked', region: 'western',
    tunings: UKE_TUNINGS, fretting: FRETS_CHROMATIC([12, 15, 18][i]), shapes: 'ukulele',
    sound: ['uke', 'uke', 'uke-tenor'][i], gm: 24, articulation: { technique: 'strum' },
  })),
  {
    id: 'uke-baritone', name: { en: 'Ukulele (baritone)', he: 'יוקוללה בריטון' }, family: 'small-plucked', region: 'western',
    tunings: [{ id: 'dgbe', name: 'D G B E', notes: t('D3 G3 B3 E4') }],
    fretting: FRETS_CHROMATIC(19), sound: 'uke-tenor', gm: 24, articulation: { technique: 'strum' },
  },
  {
    id: 'banjolele', name: { en: 'Banjolele', he: 'בנג׳ולֶלֶה' }, family: 'small-plucked', region: 'western',
    tunings: UKE_TUNINGS.slice(0, 1), fretting: FRETS_CHROMATIC(17), shapes: 'ukulele',
    sound: 'banjo', samples: 'banjo', gm: 105, articulation: { technique: 'strum' },
  },
  {
    id: 'cavaquinho', name: { en: 'Cavaquinho', he: 'קווקיניו' }, family: 'small-plucked', region: 'latin',
    tunings: [
      { id: 'dgbd', name: 'Brazilian (D G B D)', notes: t('D4 G4 B4 D5') },
      { id: 'dabe', name: 'Portuguese (D A B E)', notes: t('D4 A4 B4 E5'), uncertain: 'Portuguese "natural" tuning; octave placement varies by region.' },
    ],
    fretting: FRETS_CHROMATIC(17), sound: 'mandolin', gm: 24, articulation: { technique: 'strum' },
  },
  {
    id: 'charango', name: { en: 'Charango', he: 'צ׳רנגו' }, family: 'small-plucked', region: 'latin',
    // Five double courses, re-entrant; the middle E course is an octave pair (E5 + E4).
    tunings: [{ id: 'standard', name: 'G C E A E', notes: t('G4 C5 E5 A4 E5') }],
    courses: [[0], [0], [-12], [0], [0]],
    fretting: FRETS_CHROMATIC(17), sound: 'mandolin', gm: 24, articulation: { technique: 'strum', tremolo: true },
  },
  {
    id: 'cuatro-ve', name: { en: 'Cuatro (Venezuelan)', he: 'קואטרו ונצואלי' }, family: 'small-plucked', region: 'latin',
    // Re-entrant: the 1st string (B3) is below the 2nd.
    tunings: [{ id: 'standard', name: 'A D F# B', notes: t('A3 D4 F#4 B3') }],
    fretting: FRETS_CHROMATIC(17), sound: 'uke-tenor', gm: 24, articulation: { technique: 'strum' },
  },
  {
    id: 'cuatro-pr', name: { en: 'Cuatro (Puerto Rican)', he: 'קואטרו פוארטו-ריקני' }, family: 'small-plucked', region: 'latin',
    tunings: [{ id: 'standard', name: 'B E A D G', notes: t('B2 E3 A3 D4 G4'), uncertain: 'Octave pairing of the two bass courses as commonly described; verify.' }],
    courses: [[12], [12], [0], [0], [0]],
    fretting: FRETS_CHROMATIC(17), sound: 'bouzouki', gm: 25, articulation: { technique: 'pick', tremolo: true },
  },
  {
    id: 'tiple', name: { en: 'Tiple (Colombian)', he: 'טיפלה קולומביאנית' }, family: 'small-plucked', region: 'latin',
    // Four triple courses; in the lower three the outer strings are an octave above the centre one.
    tunings: [{ id: 'standard', name: 'D G B E', notes: t('D3 G3 B3 E4'), uncertain: 'Octave arrangement of the triple courses varies; absolute pitch as commonly given.' }],
    courses: [[12, 12], [12, 12], [12, 12], [0, 0]],
    fretting: FRETS_CHROMATIC(17), sound: 'steel', gm: 25, articulation: { technique: 'strum' },
  },
  {
    id: 'tres-cubano', name: { en: 'Tres cubano', he: 'טרס קובני' }, family: 'small-plucked', region: 'latin',
    tunings: [{ id: 'standard', name: 'G C E', notes: t('G3 C4 E4'), uncertain: 'Which strings of the outer courses are the octave strings varies between players.' }],
    courses: [[12], [0], [12]],
    fretting: FRETS_CHROMATIC(17), sound: 'bouzouki', gm: 25, articulation: { technique: 'pick' },
  },
  {
    id: 'bandurria', name: { en: 'Bandurria', he: 'בנדוריה' }, family: 'small-plucked', region: 'western',
    tunings: [{ id: 'standard', name: 'G# C# F# B E A', notes: t('G#3 C#4 F#4 B4 E5 A5') }],
    courses: [[0], [0], [0], [0], [0], [0]],
    fretting: FRETS_CHROMATIC(20), sound: 'mandolin', gm: 25, articulation: { technique: 'pick', tremolo: true },
  },
  {
    id: 'banjo-5', name: { en: 'Banjo (5-string)', he: 'בנג׳ו 5 מיתרים' }, family: 'small-plucked', region: 'western',
    // Course 0 is the short 5th (drone) string.
    tunings: [
      { id: 'openg', name: 'Open G (g D G B D)', notes: t('G4 D3 G3 B3 D4') },
      { id: 'doublec', name: 'Double C (g C G C D)', notes: t('G4 C3 G3 C4 D4') },
    ],
    openOnly: [0], fretting: FRETS_CHROMATIC(22), sound: 'banjo', samples: 'banjo', gm: 105, articulation: { technique: 'pick' },
  },
  {
    id: 'banjo-tenor', name: { en: 'Tenor banjo', he: 'בנג׳ו טנור' }, family: 'small-plucked', region: 'western',
    tunings: [
      { id: 'cgda', name: 'Standard (C G D A)', notes: t('C3 G3 D4 A4') },
      { id: 'irish', name: 'Irish (G D A E)', notes: t('G2 D3 A3 E4') },
    ],
    fretting: FRETS_CHROMATIC(19), span: 4, sound: 'banjo', samples: 'banjo', gm: 105, articulation: { technique: 'pick', tremolo: true },
  },
  {
    id: 'mandolin', name: { en: 'Mandolin', he: 'מנדולינה' }, family: 'small-plucked', region: 'western',
    tunings: [{ id: 'standard', name: 'G D A E', notes: t('G3 D4 A4 E5') }],
    courses: [[0], [0], [0], [0]], fretting: FRETS_CHROMATIC(20), span: 4,
    sound: 'mandolin', gm: 25, articulation: { technique: 'pick', tremolo: true },
  },
  {
    id: 'mandola', name: { en: 'Mandola', he: 'מנדולה' }, family: 'small-plucked', region: 'western',
    tunings: [{ id: 'standard', name: 'C G D A', notes: t('C3 G3 D4 A4') }],
    courses: [[0], [0], [0], [0]], fretting: FRETS_CHROMATIC(20), span: 4,
    sound: 'mandolin', gm: 25, articulation: { technique: 'pick', tremolo: true },
  },
  {
    id: 'mandolin-octave', name: { en: 'Octave mandolin', he: 'מנדולינת אוקטבה' }, family: 'small-plucked', region: 'western',
    tunings: [{ id: 'standard', name: 'G D A E', notes: t('G2 D3 A3 E4') }],
    courses: [[0], [0], [0], [0]], fretting: FRETS_CHROMATIC(20),
    sound: 'bouzouki', gm: 25, articulation: { technique: 'pick', tremolo: true },
  },
  {
    id: 'mandocello', name: { en: 'Mandocello', he: 'מנדוצ׳לו' }, family: 'small-plucked', region: 'western',
    tunings: [{ id: 'standard', name: 'C G D A', notes: t('C2 G2 D3 A3') }],
    courses: [[0], [0], [0], [0]], fretting: FRETS_CHROMATIC(20),
    sound: 'bouzouki', gm: 25, articulation: { technique: 'pick', tremolo: true },
  },
  {
    id: 'bouzouki-greek3', name: { en: 'Bouzouki (Greek, 3-course)', he: 'בוזוקי יווני (3 מקהלות)' }, family: 'small-plucked', region: 'middle-east',
    tunings: [{ id: 'dad', name: 'Trichordo (D A D)', notes: t('D3 A3 D4') }],
    courses: [[12], [0], [0]], fretting: FRETS_CHROMATIC(26),
    sound: 'bouzouki', gm: 25, articulation: { technique: 'pick', tremolo: true },
  },
  {
    id: 'bouzouki-greek4', name: { en: 'Bouzouki (Greek, 4-course)', he: 'בוזוקי יווני (4 מקהלות)' }, family: 'small-plucked', region: 'middle-east',
    tunings: [{ id: 'cfad', name: 'Tetrachordo (C F A D)', notes: t('C3 F3 A3 D4') }],
    courses: [[12], [12], [0], [0]], fretting: FRETS_CHROMATIC(26),
    sound: 'bouzouki', gm: 25, articulation: { technique: 'pick', tremolo: true },
  },
  {
    id: 'bouzouki-irish', name: { en: 'Irish bouzouki', he: 'בוזוקי אירי' }, family: 'small-plucked', region: 'western',
    tunings: [
      { id: 'gdad', name: 'G D A D', notes: t('G2 D3 A3 D4') },
      { id: 'gdae', name: 'G D A E', notes: t('G2 D3 A3 E4') },
    ],
    courses: [[0], [0], [0], [0]], fretting: FRETS_CHROMATIC(22),
    sound: 'bouzouki', gm: 25, articulation: { technique: 'strum', tremolo: true },
    note: 'Unison courses; octave pairs on the two bass courses are also common.',
  },
  {
    id: 'balalaika', name: { en: 'Balalaika (prima)', he: 'בללייקה' }, family: 'small-plucked', region: 'eastern-europe',
    tunings: [{ id: 'standard', name: 'E E A', notes: t('E4 E4 A4') }],
    fretting: FRETS_CHROMATIC(24), sound: 'balalaika', gm: 25, articulation: { technique: 'strum', tremolo: true },
  },
  {
    id: 'domra', name: { en: 'Domra (3-string)', he: 'דומרה' }, family: 'small-plucked', region: 'eastern-europe',
    tunings: [{ id: 'standard', name: 'E A D', notes: t('E4 A4 D5') }],
    fretting: FRETS_CHROMATIC(24), sound: 'balalaika', gm: 25, articulation: { technique: 'pick', tremolo: true },
  },

  // ----------------------------------------------------- Middle East / Mediterranean
  {
    id: 'oud-arabic', name: { en: 'Oud (Arabic)', he: 'עוד ערבי' }, family: 'long-neck', region: 'middle-east',
    // Five double courses plus a single bass course.
    tunings: [{ id: 'standard', name: 'C F A D G C', notes: t('C2 F2 A2 D3 G3 C4') }],
    courses: [[], [0], [0], [0], [0], [0]], fretting: FRETLESS(19),
    sound: 'oud', gm: 24, articulation: { technique: 'pick', tremolo: true },
    note: 'Fretless: frets from the touch neck are played as semitones (no quarter tones). The 6th course is also tuned to D or F.',
  },
  {
    id: 'oud-turkish', name: { en: 'Oud (Turkish)', he: 'עוד טורקי' }, family: 'long-neck', region: 'middle-east',
    tunings: [{ id: 'standard', name: 'D E A B E A', notes: t('D2 E2 A2 B2 E3 A3'), uncertain: 'Sounding pitch; Turkish notation is written higher, and the bass course varies (C#/D/E).' }],
    courses: [[], [0], [0], [0], [0], [0]], fretting: FRETLESS(19),
    sound: 'oud', gm: 24, articulation: { technique: 'pick', tremolo: true },
  },
  {
    id: 'saz', name: { en: 'Bağlama / saz', he: 'סאז / בגלמה' }, family: 'long-neck', region: 'middle-east',
    tunings: [{ id: 'baglama', name: 'Bağlama düzeni (G D A)', notes: t('G3 D4 A4'), uncertain: 'Course order and octave strings simplified; bağlama frets are microtonal (17 per octave), played here in semitones.' }],
    courses: [[0], [0], [0, -12]], fretting: FRETS_CHROMATIC(24),
    sound: 'saz', gm: 25, articulation: { technique: 'pick', tremolo: true },
  },
  {
    id: 'tanbur', name: { en: 'Tanbur (Turkish)', he: 'טנבור טורקי' }, family: 'long-neck', region: 'middle-east',
    tunings: [{ id: 'standard', name: 'A D A', notes: t('A2 D3 A3'), uncertain: 'Approximate; tanbur tunings vary and its frets are microtonal.' }],
    courses: [[0], [0], [0]], fretting: FRETS_CHROMATIC(24),
    sound: 'saz', gm: 25, articulation: { technique: 'pick' },
  },
  {
    id: 'cumbus', name: { en: 'Cümbüş', he: 'ג׳ומבוש' }, family: 'long-neck', region: 'middle-east',
    tunings: [{ id: 'oud', name: 'Oud tuning (D E A B E A)', notes: t('D2 E2 A2 B2 E3 A3'), uncertain: 'Usually tuned like a Turkish oud; absolute pitch varies.' }],
    courses: [[0], [0], [0], [0], [0], [0]], fretting: FRETLESS(19),
    sound: 'banjo', gm: 105, articulation: { technique: 'pick', tremolo: true },
  },
  {
    id: 'tar', name: { en: 'Tar (Persian)', he: 'תאר פרסי' }, family: 'long-neck', region: 'middle-east',
    tunings: [{ id: 'cgc', name: 'C G C', notes: t('C3 G3 C4'), uncertain: 'Main tuning C–G–C; the bass course has an octave string; absolute pitch varies.' }],
    courses: [[12], [0], [0]], fretting: FRETS_CHROMATIC(26),
    sound: 'saz', gm: 25, articulation: { technique: 'pick', tremolo: true },
  },
  {
    id: 'setar', name: { en: 'Setar', he: 'סה-תאר' }, family: 'long-neck', region: 'middle-east',
    tunings: [{ id: 'cgcc', name: 'C G C C', notes: t('C3 G3 C4 C4'), uncertain: 'Common C–G–C–C tuning; order and octave of the bass string simplified.' }],
    fretting: FRETS_CHROMATIC(25), sound: 'saz', gm: 25, articulation: { technique: 'pluck' },
  },
  {
    id: 'kemenche', name: { en: 'Kemenche (Pontic)', he: 'כמנצ׳ה' }, family: 'bowed', region: 'middle-east',
    tunings: [{ id: 'bea', name: 'B E A', notes: t('B3 E4 A4') }],
    fretting: FRETLESS(14), sound: 'kemenche', gm: 110, articulation: { technique: 'bow' },
  },
  {
    id: 'qanun', name: { en: 'Qanun / kanun', he: 'קאנון' }, family: 'zither', region: 'middle-east',
    // 26 triple courses, diatonic; the mandals (levers) re-tune it to the key.
    tunings: [{ id: 'standard', name: '26 courses A2–E6 (diatonic)', notes: scaleRun('A2', 26) }],
    courses: Array.from({ length: 26 }, () => [0, 0]), fretting: OPEN, retune: 'scale',
    sound: 'qanun', gm: 46, articulation: { technique: 'pluck' },
    note: 'Mandals follow the selected key (diatonic); quarter-tone maqam settings are not modelled.',
  },

  // ----------------------------------------------------------------------- Asia
  {
    id: 'sitar', name: { en: 'Sitar', he: 'סיטאר' }, family: 'long-neck', region: 'south-asia',
    tunings: [{ id: 'shankar', name: 'Sa Pa Sa Ma Pa Sa Sa (Sa = key)', notes: t('C2 G2 C3 F3 G3 C4 C5'), uncertain: 'Ravi Shankar-style 7 playing strings, listed in ascending pitch; Sa follows the key.' }],
    tonic: 0, fretting: FRETS_CHROMATIC(20), defaultRegister: 0,
    sound: 'sitar', samples: 'sitar', gm: 104,
    articulation: { technique: 'pluck', sympathetic: { keyScale: { low: 60, count: 13 } } },
    note: '13 sympathetic (taraf) strings tuned to the key\'s scale ring along. Movable frets played chromatically.',
  },
  {
    id: 'sarod', name: { en: 'Sarod', he: 'סרוד' }, family: 'long-neck', region: 'south-asia',
    tunings: [{ id: 'standard', name: 'Sa Pa Sa Ma Sa Sa (Sa = key)', notes: t('C2 G2 C3 F3 C4 C5'), uncertain: 'Playing + chikari strings simplified to 6, ascending; Sa follows the key.' }],
    tonic: 0, fretting: FRETLESS(24), sound: 'sarod', gm: 104,
    articulation: { technique: 'pick', sympathetic: { keyScale: { low: 60, count: 15 } } },
  },
  {
    id: 'tanpura', name: { en: 'Tanpura', he: 'טנפורה' }, family: 'drone', region: 'south-asia',
    tunings: [{ id: 'pa', name: 'Pa Sa Sa Sa (Sa = key)', notes: t('G2 C3 C3 C2') }, { id: 'ma', name: 'Ma Sa Sa Sa (Sa = key)', notes: t('F2 C3 C3 C2') }],
    tonic: 0, fretting: OPEN, chordStyle: 'drone', sound: 'tanpura', gm: 104, articulation: { technique: 'pluck' },
    note: 'Drone: always plays its four strings; Sa follows the key.',
  },
  {
    id: 'veena', name: { en: 'Veena (Saraswati)', he: 'וינה' }, family: 'long-neck', region: 'south-asia',
    tunings: [{ id: 'standard', name: 'Pa Sa Pa Sa (Sa = key)', notes: t('G2 C3 G3 C4'), uncertain: 'Four playing strings only (the three side drone strings are not modelled); Sa follows the key.' }],
    tonic: 0, fretting: FRETS_CHROMATIC(24), sound: 'sitar', gm: 104, articulation: { technique: 'pluck' },
  },
  {
    id: 'pipa', name: { en: 'Pipa', he: 'פיפה' }, family: 'small-plucked', region: 'east-asia',
    tunings: [{ id: 'adea', name: 'A D E A', notes: t('A2 D3 E3 A3') }],
    fretting: FRETS_CHROMATIC(25), sound: 'pipa', gm: 106, articulation: { technique: 'pluck', tremolo: true },
  },
  {
    id: 'ruan', name: { en: 'Ruan (zhongruan)', he: 'רואן' }, family: 'small-plucked', region: 'east-asia',
    tunings: [{ id: 'gdgd', name: 'G D G D', notes: t('G2 D3 G3 D4') }, { id: 'adae', name: 'A D A E', notes: t('A2 D3 A3 E4') }],
    fretting: FRETS_CHROMATIC(24), sound: 'pipa', gm: 106, articulation: { technique: 'pick', tremolo: true },
  },
  {
    id: 'sanxian', name: { en: 'Sanxian', he: 'סאנשיאן' }, family: 'long-neck', region: 'east-asia',
    tunings: [{ id: 'gdg', name: 'G D G', notes: t('G2 D3 G3'), uncertain: 'Several tunings are used (G–D–G, A–D–A …); absolute pitch varies.' }],
    fretting: FRETLESS(24), sound: 'shamisen', gm: 106, articulation: { technique: 'pluck' },
  },
  {
    id: 'shamisen', name: { en: 'Shamisen', he: 'שמיסן' }, family: 'long-neck', region: 'east-asia',
    tunings: [
      { id: 'honchoshi', name: 'Honchōshi (1–4–8)', notes: t('C3 F3 C4') },
      { id: 'niagari', name: 'Niagari (1–5–8)', notes: t('C3 G3 C4') },
      { id: 'sansagari', name: 'Sansagari (1–4–♭7)', notes: t('C3 F3 Bb3') },
    ],
    fretting: FRETLESS(24), sound: 'shamisen', samples: 'shamisen', gm: 106, articulation: { technique: 'pick' },
    note: 'Intervals are fixed; the absolute pitch is set to the singer, here the 1st string is C3.',
  },
  {
    id: 'guzheng', name: { en: 'Guzheng', he: 'גוּ-ג׳נג' }, family: 'zither', region: 'east-asia',
    tunings: [{ id: 'd', name: '21 strings, D pentatonic D2–D6', notes: scaleRun('D2', 21, MAJOR_PENTA, 2) }],
    tonic: 2, fretting: OPEN, retune: 'transpose', sound: 'guzheng', gm: 107, articulation: { technique: 'pluck' },
  },
  {
    id: 'koto', name: { en: 'Koto', he: 'קוטו' }, family: 'zither', region: 'east-asia',
    // Hirajōshi: string 1 = string 5 (re-entrant).
    tunings: [{ id: 'hirajoshi', name: 'Hirajōshi (13 strings)', notes: t('D4 G3 A3 Bb3 D4 Eb4 G4 A4 Bb4 D5 Eb5 G5 A5'), uncertain: 'Hirajōshi intervals are standard; the absolute octave is approximate.' }],
    tonic: 2, fretting: OPEN, retune: 'transpose', sound: 'koto', samples: 'koto', gm: 107, articulation: { technique: 'pluck' },
  },
  {
    id: 'gayageum', name: { en: 'Gayageum', he: 'קאיאגום' }, family: 'zither', region: 'east-asia',
    tunings: [{ id: 'sanjo', name: '12 strings, pentatonic', notes: scaleRun('D3', 12, [0, 2, 5, 7, 9], 2), uncertain: 'Approximate sanjo-style pentatonic layout; real tunings differ per school.' }],
    tonic: 2, fretting: OPEN, retune: 'transpose', sound: 'guzheng', gm: 107, articulation: { technique: 'pluck' },
  },
  {
    id: 'dan-tranh', name: { en: 'Đàn tranh', he: 'דאן טראנה' }, family: 'zither', region: 'southeast-asia',
    tunings: [{ id: 'bac', name: '16 strings, pentatonic (C D F G A)', notes: scaleRun('C3', 16, [0, 2, 5, 7, 9], 0), uncertain: 'One common pentatonic mode; Vietnamese modes (Bắc, Nam, Oán) differ.' }],
    tonic: 0, fretting: OPEN, retune: 'transpose', sound: 'guzheng', gm: 107, articulation: { technique: 'pluck' },
  },
  {
    id: 'erhu', name: { en: 'Erhu', he: 'אר-הו' }, family: 'bowed', region: 'east-asia',
    tunings: [{ id: 'da', name: 'D A', notes: t('D4 A4') }],
    fretting: FRETLESS(24), chordStyle: 'arpeggio', sound: 'erhu', gm: 110, articulation: { technique: 'bow' },
  },

  // ---------------------------------------------------------------- bowed (Western)
  {
    id: 'violin', name: { en: 'Violin', he: 'כינור' }, family: 'bowed', region: 'western',
    tunings: [{ id: 'gdae', name: 'G D A E', notes: t('G3 D4 A4 E5') }],
    fretting: FRETLESS(26), span: 4, sound: 'violin', samples: 'violin', gm: 40, articulation: { technique: 'bow' },
  },
  {
    id: 'viola', name: { en: 'Viola', he: 'ויולה' }, family: 'bowed', region: 'western',
    tunings: [{ id: 'cgda', name: 'C G D A', notes: t('C3 G3 D4 A4') }],
    fretting: FRETLESS(24), span: 4, sound: 'viola', samples: 'viola', gm: 41, articulation: { technique: 'bow' },
  },
  {
    id: 'cello', name: { en: 'Cello', he: 'צ׳לו' }, family: 'bowed', region: 'western',
    tunings: [{ id: 'cgda', name: 'C G D A', notes: t('C2 G2 D3 A3') }],
    fretting: FRETLESS(24), sound: 'cello', samples: 'cello', gm: 42, articulation: { technique: 'bow' },
  },
  {
    id: 'double-bass', name: { en: 'Double bass', he: 'קונטרבס' }, family: 'bowed', region: 'western',
    tunings: [{ id: 'eadg', name: 'E A D G', notes: t('E1 A1 D2 G2') }],
    fretting: FRETLESS(19), chordStyle: 'bass', sound: 'contrabass', samples: 'contrabass', gm: 43, articulation: { technique: 'bow' },
  },
  {
    id: 'hardanger', name: { en: 'Hardanger fiddle', he: 'כינור הרדנגר' }, family: 'bowed', region: 'western',
    tunings: [{ id: 'adae', name: 'A D A E (+ understrings D E F# A)', notes: t('A3 D4 A4 E5') }],
    fretting: FRETLESS(24), span: 4, sound: 'fiddle', samples: 'fiddle', gm: 110,
    articulation: { technique: 'bow', sympathetic: { notes: t('D4 E4 F#4 A4') } },
    note: 'Sampled with a GM fiddle; the four sympathetic understrings are synthesised.',
  },
  {
    id: 'nyckelharpa', name: { en: 'Nyckelharpa', he: 'ניקלהרפה' }, family: 'bowed', region: 'western',
    tunings: [{ id: 'standard', name: 'C G C A (chromatic)', notes: t('C3 G3 C4 A4') }],
    // Keys stop the strings in semitones, like frets.
    fretting: FRETS_CHROMATIC(24), sound: 'fiddle', gm: 110,
    articulation: { technique: 'bow', sympathetic: { notes: t('C4 D4 E4 F4 G4 A4 B4 C5 D5 E5 F5 G5') } },
    note: 'The 12 sympathetic strings are approximated as a C major run (real instruments are tuned chromatically).',
  },
  {
    id: 'hurdy-gurdy', name: { en: 'Hurdy-gurdy', he: 'הרדי-גרדי' }, family: 'bowed', region: 'western',
    tunings: [{ id: 'gc', name: 'Chanterelles G G (drones on the key)', notes: t('G4') }],
    courses: [[0]], fretting: FRETS_CHROMATIC(23), chordStyle: 'arpeggio', sound: 'hurdy', gm: 110,
    articulation: { technique: 'bow', drone: { intervals: [0, 7], octave: 2, level: 0.35 } },
    note: 'One melody course played by the keys; the bourdon/mouche drones follow the key root and fifth.',
  },

  // ------------------------------------------------------------------- harps / zithers / other
  {
    id: 'harp-lever', name: { en: 'Lever harp (34 strings)', he: 'נבל (לבר)' }, family: 'harp', region: 'western',
    tunings: [{ id: 'c', name: 'C2–A6, diatonic (levers follow the key)', notes: scaleRun('C2', 34) }],
    fretting: OPEN, retune: 'scale', sound: 'harp', samples: 'harp', gm: 46, articulation: { technique: 'pluck' },
    note: 'Levers are set for the selected key automatically (any key, unlike a real lever harp tuned in E♭).',
  },
  {
    id: 'harp-pedal', name: { en: 'Pedal harp (47 strings)', he: 'נבל קונצרטים (פדלים)' }, family: 'harp', region: 'western',
    tunings: [{ id: 'c', name: 'C1–G7, diatonic (pedals follow the key)', notes: scaleRun('C1', 47) }],
    fretting: OPEN, retune: 'scale', sound: 'harp', samples: 'harp', gm: 46, articulation: { technique: 'pluck' },
  },
  {
    id: 'kinnor', name: { en: 'Lyre / kinnor', he: 'כינור דוד (ליירה)' }, family: 'harp', region: 'middle-east',
    tunings: [{ id: 'diatonic', name: '10 strings, diatonic from D4', notes: scaleRun('D4', 10, MAJOR_STEPS, 2), uncertain: 'Modern reconstruction; ancient tunings are unknown.' }],
    fretting: OPEN, retune: 'scale', sound: 'lyre', gm: 46, articulation: { technique: 'pluck' },
  },
  {
    id: 'kora', name: { en: 'Kora', he: 'קורה' }, family: 'harp', region: 'africa',
    tunings: [{ id: 'tomora', name: '21 strings, F major (tomora)', notes: scaleRun('F2', 21, MAJOR_STEPS, 5), uncertain: 'Strings listed in pitch order (real kora alternates hands); tomora-style F major approximation.' }],
    fretting: OPEN, retune: 'scale', sound: 'lyre', gm: 46, articulation: { technique: 'pluck' },
  },
  {
    id: 'kantele', name: { en: 'Kantele (5-string)', he: 'קנטלה' }, family: 'zither', region: 'eastern-europe',
    tunings: [{ id: 'dminor', name: 'D E F G A', notes: t('D4 E4 F4 G4 A4') }],
    tonic: 2, fretting: OPEN, retune: 'transpose', sound: 'lyre', gm: 46, articulation: { technique: 'pluck' },
  },
  {
    id: 'autoharp', name: { en: 'Autoharp (36 strings)', he: 'אוטוהרפ' }, family: 'zither', region: 'western',
    tunings: [{ id: 'chromatic', name: 'Chromatic F2–C6', notes: t('F2 G2 C3 D3 E3 F3 F#3 G3 A3 A#3 B3 C4 C#4 D4 D#4 E4 F4 F#4 G4 G#4 A4 A#4 B4 C5 C#5 D5 D#5 E5 F5 F#5 G5 G#5 A5 A#5 B5 C6'), uncertain: 'Common 36-string chromatic layout; makers differ in the bass.' }],
    fretting: OPEN, sound: 'autoharp', gm: 46, articulation: { technique: 'strum' },
    note: 'Chord mode works like the chord bars: only the chord\'s strings sound.',
  },
  {
    id: 'zither', name: { en: 'Concert zither', he: 'ציתר' }, family: 'zither', region: 'western',
    tunings: [{ id: 'munich', name: 'Munich (c g d\' a\' a\')', notes: t('C3 G3 D4 A4 A4') }],
    fretting: FRETS_CHROMATIC(29), sound: 'zither', gm: 15, articulation: { technique: 'pluck' },
    note: 'Only the five fretted melody strings; the open accompaniment strings are not modelled.',
  },
  {
    id: 'dulcimer-mountain', name: { en: 'Mountain dulcimer', he: 'דולצימר הררי' }, family: 'zither', region: 'western',
    tunings: [
      { id: 'daa', name: 'Ionian (D A A)', notes: t('D3 A3 A3') },
      { id: 'dad', name: 'Mixolydian (D A D)', notes: t('D3 A3 D4') },
    ],
    fretting: { kind: 'fretted', frets: DULCIMER_FRETS.length - 1, fretSemitones: DULCIMER_FRETS },
    sound: 'zither', gm: 25, articulation: { technique: 'strum' },
    note: 'Diatonic fretboard (with the 6½ fret): touch-neck fret numbers are dulcimer frets.',
  },
  {
    id: 'dulcimer-hammered', name: { en: 'Hammered dulcimer', he: 'סנטור (דולצימר פטישים)' }, family: 'zither', region: 'western',
    tunings: [{ id: '12-11', name: '12/11 (G and D major), D3–', notes: scaleRun('D3', 24, MAJOR_STEPS, 7), uncertain: 'The bridge layout (in fifths) is flattened into one G-major run; real 12/11 boards have a few chromatic notes.' }],
    courses: Array.from({ length: 24 }, () => [0]),
    fretting: OPEN, sound: 'hammered', samples: 'dulcimer', gm: 15, articulation: { technique: 'hammer' },
  },
  {
    id: 'psaltery', name: { en: 'Bowed psaltery', he: 'פסנתרין קשת' }, family: 'zither', region: 'western',
    tunings: [{ id: 'chromatic', name: 'Chromatic G3–C6', notes: Array.from({ length: 30 }, (_, i) => 55 + i), uncertain: 'Ranges differ by maker (25–32 strings).' }],
    fretting: OPEN, sound: 'psaltery', gm: 45, articulation: { technique: 'bow' },
  },
  {
    id: 'chapman-stick', name: { en: 'Chapman Stick (10-string)', he: 'צ׳פמן סטיק' }, family: 'other', region: 'western',
    tunings: [{ id: 'classic', name: 'Classic (bass in 5ths | melody in 4ths)', notes: t('C2 G2 D3 A3 E4 D3 G3 C4 F4 Bb4'), uncertain: 'Classic tuning as commonly cited; strings listed bass group then melody group (on the instrument both groups start low in the middle).' }],
    fretting: FRETS_CHROMATIC(24), defaultRegister: 4, sound: 'electric', gm: 27, articulation: { technique: 'hammer' },
    note: '10 strings on 6 physical strings: the register buttons slide the window between the bass and melody groups.',
  },
  {
    id: 'lute', name: { en: 'Renaissance lute (6-course)', he: 'לאוטה' }, family: 'long-neck', region: 'western',
    tunings: [{ id: 'g', name: 'G C F A D G', notes: t('G2 C3 F3 A3 D4 G4') }],
    // Bass courses with octave strings, unison 3rd/2nd course, single chanterelle.
    courses: [[12], [12], [12], [0], [0], []], fretting: FRETS_CHROMATIC(8),
    sound: 'lute', gm: 24, articulation: { technique: 'pluck' },
  },
  {
    id: 'theorbo', name: { en: 'Theorbo (14-course)', he: 'תאורבו' }, family: 'long-neck', region: 'western',
    // Diapasons (8 open bass courses) then the 6 fretted courses, whose 1st and 2nd are an octave lower (re-entrant).
    tunings: [{ id: 'a', name: 'A (G F E D C B A G | A d g b e a)', notes: t('G1 A1 B1 C2 D2 E2 F2 G2 A2 D3 G3 B3 E3 A3') }],
    openOnly: [0, 1, 2, 3, 4, 5, 6, 7], defaultRegister: 8, fretting: FRETS_CHROMATIC(8),
    sound: 'lute', gm: 24, articulation: { technique: 'pluck' },
    note: 'The window starts on the 6 fretted courses; move it down to reach the diapasons.',
  },
  {
    id: 'vihuela', name: { en: 'Vihuela de mano', he: 'ויוואלה' }, family: 'guitar', region: 'western',
    tunings: [{ id: 'g', name: 'G C F A D G', notes: t('G2 C3 F3 A3 D4 G4') }],
    courses: [[0], [0], [0], [0], [0], [0]], fretting: FRETS_CHROMATIC(10),
    sound: 'lute', gm: 24, articulation: { technique: 'pluck' },
  },
];

const BY_ID = new Map(INSTRUMENTS.map((i) => [i.id, i]));

export const DEFAULT_INSTRUMENT = 'guitar-steel';

export function getInstrument(id: string): InstrumentDef {
  return BY_ID.get(id) ?? BY_ID.get(DEFAULT_INSTRUMENT)!;
}

export const FAMILY_NAMES: Record<InstrumentDef['family'], { en: string; he: string }> = {
  guitar: { en: 'Guitars', he: 'גיטרות' },
  bass: { en: 'Basses', he: 'בסים' },
  'small-plucked': { en: 'Small plucked', he: 'כלי פריטה קטנים' },
  'long-neck': { en: 'Lutes & long necks', he: 'עוּדים וצוואר ארוך' },
  bowed: { en: 'Bowed', he: 'כלי קשת' },
  zither: { en: 'Zithers & dulcimers', he: 'ציתרים ודולצימרים' },
  harp: { en: 'Harps & lyres', he: 'נבלים וליירות' },
  drone: { en: 'Drone', he: 'בורדון' },
  other: { en: 'Other', he: 'אחר' },
};

export const REGION_NAMES: Record<InstrumentDef['region'], { en: string; he: string }> = {
  western: { en: 'Western', he: 'מערבי' },
  latin: { en: 'Latin America', he: 'אמריקה הלטינית' },
  'eastern-europe': { en: 'Eastern Europe', he: 'מזרח אירופה' },
  'middle-east': { en: 'Middle East', he: 'מזרח תיכון' },
  'south-asia': { en: 'India', he: 'הודו' },
  'east-asia': { en: 'East Asia', he: 'מזרח אסיה' },
  'southeast-asia': { en: 'Southeast Asia', he: 'דרום-מזרח אסיה' },
  africa: { en: 'Africa', he: 'אפריקה' },
};

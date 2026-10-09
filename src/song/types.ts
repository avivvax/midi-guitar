/** One chord held for a number of beats. `chord` is a chord symbol, e.g. "Am7", "G/B". */
export interface SongChord {
  chord: string;
  beats: number;
}

export interface SongSection {
  name: string;
  chords: SongChord[];
}

/**
 * Chord-progression-only song. Chords are the shapes you play; if `capo` is
 * set, it is the capo position the shapes assume (shown as a suggestion).
 */
export interface Song {
  id: string;
  title: string;
  artist: string;
  key: string;
  tempo: number;
  capo?: number;
  /** Strums per chord in strum-count mode (default 4). */
  strumsPerChord?: number;
  sections: SongSection[];
  /** true for songs created through the Import screen. */
  user?: boolean;
  /** Set for songs opened from the Chordonomicon index. */
  source?: 'chordonomicon';
  year?: number;
  genre?: string;
}

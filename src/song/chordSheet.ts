import { isChordSymbol, parseChordSymbol } from './chordSymbol';
import type { SongChord, SongSection } from './types';

/**
 * Extracts the chord progression from a pasted chord sheet and throws the
 * lyrics away. Supports:
 *  - ChordPro: inline [Am] chords, {title}/{artist}/{key}/{tempo}/{capo},
 *    {start_of_chorus}/{soc}, {start_of_verse: label}, {comment: Verse 2} …
 *  - Plain text with chords on their own line above the lyrics, section
 *    headers like "[Chorus]", "Verse 1:", "פזמון", and "Intro: Am G C".
 *  - Bars: "| Am G | F |" splits a bar's 4 beats between its chords;
 *    repeats: "x2", "(x3)", "×2" repeat the line's chords.
 */
export interface ParsedSheet {
  title?: string;
  artist?: string;
  key?: string;
  tempo?: number;
  capo?: number;
  sections: SongSection[];
  /** Tokens on chord lines that were not understood. */
  unknown: string[];
  /** Number of lyric lines that were discarded. */
  lyricLines: number;
}

export const BEATS_PER_BAR = 4;

const SECTION_WORDS: [RegExp, string][] = [
  [/^(intro|פתיחה|הקדמה|פתיח)/i, 'Intro'],
  [/^(pre[- ]?chorus|טרום[- ]?פזמון|קדם[- ]?פזמון)/i, 'Pre-Chorus'],
  [/^(chorus|refrain|פזמון)/i, 'Chorus'],
  [/^(verse|בית)/i, 'Verse'],
  [/^(bridge|גשר|מעבר)/i, 'Bridge'],
  [/^(outro|ending|coda|סיום|סיומת)/i, 'Outro'],
  [/^(solo|סולו)/i, 'Solo'],
  [/^(interlude|instrumental|אינטרלוד|נגינה)/i, 'Interlude'],
  [/^(hook)/i, 'Hook'],
];

/** "Verse 2:" / "[Chorus]" / "פזמון:" → canonical section name (keeps a trailing number). */
export function sectionName(label: string): string | null {
  const t = label.trim().replace(/^[[(]+|[\])]+$/g, '').replace(/:$/, '').trim();
  if (!t || t.length > 30) return null;
  for (const [re, name] of SECTION_WORDS) {
    const m = re.exec(t);
    if (!m) continue;
    const rest = t.slice(m[0].length).trim();
    if (!rest || /^[(]?[x×]\d+[)]?$/i.test(rest)) return name; // "Chorus x2"
    if (!/^\d+$/.test(rest)) return null; // "Chorus of angels sang" is a lyric
    return `${name} ${rest}`;
  }
  return null;
}

const REPEAT_RE = /^[(]?[x×*](\d+)[)]?$|^[(]?(\d+)[x×][)]?$/i;
const IGNORABLE = new Set(['|', '||', '|:', ':|', '/', '-', '–', '.', '..', '...', '%', 'n.c.', 'nc', 'n.c', '(', ')', '||:', ':||']);

interface LineChords {
  chords: SongChord[];
  repeat: number;
  unknown: string[];
}

function tokenize(line: string): string[] {
  return line
    .replace(/\|/g, ' | ')
    .split(/\s+/)
    .filter(Boolean);
}

/** If every token of a line is a chord / bar / repeat marker, return its chords. */
function chordLine(line: string): LineChords | null {
  const tokens = tokenize(line);
  if (!tokens.length) return null;
  const hasBars = tokens.includes('|');
  let repeat = 1;
  const bars: string[][] = [[]];
  let anyChord = false;
  for (const tok of tokens) {
    const low = tok.toLowerCase();
    const rep = REPEAT_RE.exec(tok);
    if (rep) {
      repeat = Number(rep[1] ?? rep[2]) || 1;
      continue;
    }
    if (tok === '|') {
      bars.push([]);
      continue;
    }
    if (IGNORABLE.has(low) || /^[.\-–|:]+$/.test(tok)) continue;
    const clean = tok.replace(/^[([]+|[)\],]+$/g, '');
    if (isChordSymbol(clean)) {
      bars[bars.length - 1].push(clean);
      anyChord = true;
    } else {
      return null;
    }
  }
  if (!anyChord) return null;
  const chords: SongChord[] = [];
  for (const bar of bars) {
    if (!bar.length) continue;
    if (hasBars) {
      // Split the bar evenly; leftovers go to the first chord.
      const each = Math.max(1, Math.floor(BEATS_PER_BAR / bar.length));
      bar.forEach((c, i) => chords.push({ chord: c, beats: i === 0 ? BEATS_PER_BAR - each * (bar.length - 1) : each }));
    } else {
      for (const c of bar) chords.push({ chord: c, beats: BEATS_PER_BAR });
    }
  }
  return { chords, repeat, unknown: [] };
}

/** ChordPro directive {name: value}. */
function directive(line: string): { name: string; value: string } | null {
  const m = /^\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}$/i.exec(line.trim());
  return m ? { name: m[1].toLowerCase(), value: (m[2] ?? '').trim() } : null;
}

function isChordPro(text: string): boolean {
  return /\{\s*(title|t|soc|start_of_chorus|sov|start_of_verse|artist|subtitle|st|c|comment)\s*[:}]/i.test(text) ||
    /\[[A-G][^\]\s]{0,10}\][^\n]*\S/.test(text);
}

class Builder {
  sections: SongSection[] = [];
  private counts = new Map<string, number>();
  /** True while the first section was created implicitly (chords before any header). */
  private implicitFirst = false;

  start(name: string): void {
    const cur = this.sections[this.sections.length - 1];
    if (cur && cur.chords.length === 0) {
      cur.name = this.label(name);
      return;
    }
    this.sections.push({ name: this.label(name), chords: [] });
  }

  /** Repeated section names get numbered: Verse, Verse 2, … unless already numbered. */
  private label(name: string): string {
    if (/\d$/.test(name)) return name;
    const n = (this.counts.get(name) ?? 0) + 1;
    this.counts.set(name, n);
    return n === 1 ? name : `${name} ${n}`;
  }

  add(chords: SongChord[]): void {
    if (!chords.length) return;
    if (!this.sections.length) {
      this.sections.push({ name: 'Intro', chords: [] });
      this.implicitFirst = true;
    }
    this.sections[this.sections.length - 1].chords.push(...chords.map((c) => ({ ...c })));
  }

  result(): SongSection[] {
    const out = this.sections.filter((s) => s.chords.length > 0);
    // A sheet without any section headers is one section, not an "Intro".
    if (this.implicitFirst && out.length === 1) out[0].name = 'Song';
    return out;
  }
}

function parseChordPro(text: string, out: ParsedSheet): void {
  const b = new Builder();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const d = directive(line);
    if (d) {
      switch (d.name) {
        case 'title':
        case 't':
          out.title = d.value;
          break;
        case 'artist':
        case 'subtitle':
        case 'st':
          out.artist ??= d.value;
          break;
        case 'key':
          out.key = d.value;
          break;
        case 'tempo':
          out.tempo = Number.parseFloat(d.value) || undefined;
          break;
        case 'capo':
          out.capo = Number.parseInt(d.value, 10) || undefined;
          break;
        case 'soc':
        case 'start_of_chorus':
          b.start(d.value || 'Chorus');
          break;
        case 'sov':
        case 'start_of_verse':
          b.start(d.value || 'Verse');
          break;
        case 'sob':
        case 'start_of_bridge':
          b.start(d.value || 'Bridge');
          break;
        case 'start_of_tab':
        case 'sot':
          b.start(d.value || 'Solo');
          break;
        case 'c':
        case 'comment':
        case 'ci':
        case 'comment_italic': {
          const name = sectionName(d.value);
          if (name) b.start(name);
          break;
        }
        default:
          // end_of_* and unknown directives carry no chords.
          break;
      }
      continue;
    }
    // Plain-text section header inside ChordPro.
    const header = sectionName(line);
    if (header) {
      b.start(header);
      continue;
    }
    const inline = [...line.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim());
    const lyrics = line.replace(/\[[^\]]*\]/g, '').trim();
    if (inline.length) {
      const chords: SongChord[] = [];
      for (const c of inline) {
        if (isChordSymbol(c)) chords.push({ chord: c, beats: BEATS_PER_BAR });
        else if (!IGNORABLE.has(c.toLowerCase())) out.unknown.push(c);
      }
      b.add(chords);
      if (lyrics) out.lyricLines++;
      continue;
    }
    // A bare chord line (e.g. an instrumental bar line).
    const cl = chordLine(line);
    if (cl) {
      for (let r = 0; r < cl.repeat; r++) b.add(cl.chords);
    } else {
      out.lyricLines++;
    }
  }
  out.sections = b.result();
}

function parsePlain(text: string, out: ParsedSheet): void {
  const b = new Builder();
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // Metadata lines such as "Key: G", "Capo 2", "Tempo: 96".
    const meta = /^(key|סולם|capo|קאפו|tempo|bpm|טמפו)\s*[:=]?\s*(.+)$/i.exec(line);
    if (meta) {
      const k = meta[1].toLowerCase();
      if ((k === 'key' || k === 'סולם') && /^[A-G]/.test(meta[2])) out.key = meta[2].trim();
      else if (k === 'capo' || k === 'קאפו') out.capo = Number.parseInt(meta[2], 10) || undefined;
      else out.tempo = Number.parseFloat(meta[2]) || undefined;
      continue;
    }
    // "Intro: Am G C" / "[Chorus] F G" – header followed by chords.
    const hm = /^(\[[^\]]+\]|[^:]{1,30}:)\s*(.*)$/.exec(line);
    if (hm) {
      const name = sectionName(hm[1]);
      if (name) {
        b.start(name);
        const cl = hm[2] ? chordLine(hm[2]) : null;
        if (cl) for (let r = 0; r < cl.repeat; r++) b.add(cl.chords);
        else if (hm[2]) out.lyricLines++;
        continue;
      }
    }
    const header = sectionName(line);
    if (header) {
      b.start(header);
      continue;
    }
    const cl = chordLine(line);
    if (cl) {
      for (let r = 0; r < cl.repeat; r++) b.add(cl.chords);
      continue;
    }
    // Inline [Am] chords in otherwise plain text.
    const inline = [...line.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim()).filter(isChordSymbol);
    if (inline.length) b.add(inline.map((c) => ({ chord: c, beats: BEATS_PER_BAR })));
    out.lyricLines++;
  }
  out.sections = b.result();
}

export function parseChordSheet(text: string): ParsedSheet {
  const out: ParsedSheet = { sections: [], unknown: [], lyricLines: 0 };
  if (isChordPro(text)) parseChordPro(text, out);
  else parsePlain(text, out);
  if (!out.key) out.key = guessKey(out.sections);
  return out;
}

/** Guess the key from the first chord (falls back to the last one). */
export function guessKey(sections: SongSection[]): string | undefined {
  const all = sections.flatMap((s) => s.chords);
  const c = all[0] ?? all[all.length - 1];
  if (!c) return undefined;
  const p = parseChordSymbol(c.chord);
  if (!p) return undefined;
  return p.rootName + (p.type === 'min' || p.type === 'm7' ? 'm' : '');
}

import type { Song, SongSection } from './types';

/**
 * Client for the static Chordonomicon index (built by tools/chord_index,
 * served under <base>/cx/). Search loads one title shard and one artist
 * shard for the query's most specific word and filters locally; opening a
 * song loads one body shard. Every shard URL carries the build id, so a
 * rebuilt index never mixes with cached shards from an older build.
 */
export interface IndexManifest {
  version: number;
  built: string;
  songs: number;
  artists: number;
  perBody: number;
  minPrefix: number;
  depth: { t: Record<string, number>; a: Record<string, number> };
  license: string;
  attribution: string;
  citation: string;
}

/** [num, title, artist, key] */
export type IndexRow = [number, string, string, string];

interface Body {
  p: string[];
  s: [string, number][];
  k: string;
  y?: number;
  g?: string;
}

// Must match tools/chord_index/common.py
export const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'of', 'de', 'la', 'el', 'le', 'feat', 'ft', 'you', 'me', 'my', 'your',
  'in', 'on', 'to', 'is', 'it', 'i', 'im', 'for', 'with', 'be', 'we', 'all',
]);

/** Search normalisation – must match normalize() in tools/chord_index/common.py. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/['’"`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function prefixFile(prefix: string): string {
  return [...new TextEncoder().encode(prefix)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The query word used to pick shards: the longest non-stopword with ≥ 2 characters. */
export function pickWord(query: string): string | null {
  const words = normalize(query)
    .split(' ')
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
  if (!words.length) return null;
  return words.reduce((a, b) => (b.length > a.length ? b : a));
}

/** Shard prefix for a word, following the builder's split depths. */
export function shardPrefix(word: string, depth: Record<string, number>, min = 2): string {
  let d = min;
  while (word.length > d && depth[word.slice(0, d)] === d + 1) d++;
  return word.slice(0, d);
}

/** Every query word must be a prefix of some word in title+artist. */
export function matches(row: IndexRow, queryWords: string[]): boolean {
  const hay = normalize(`${row[1]} ${row[2]}`).split(' ');
  return queryWords.every((q) => hay.some((w) => w.startsWith(q)));
}

export function rank(rows: IndexRow[], query: string): IndexRow[] {
  const q = normalize(query);
  const qWords = q.split(' ').filter(Boolean);
  const score = (r: IndexRow) => {
    const t = normalize(r[1]);
    if (t === q) return 0;
    if (t.startsWith(q)) return 1;
    if (qWords.every((w) => t.split(' ').some((x) => x.startsWith(w)))) return 2;
    return 3;
  };
  return rows
    .filter((r) => matches(r, qWords))
    .map((r) => [score(r), r] as const)
    .sort((a, b) => a[0] - b[0] || a[1][1].length - b[1][1].length || a[1][1].localeCompare(b[1][1]))
    .map(([, r]) => r);
}

/** Stable local id from title + artist (FNV-1a), independent of index build numbering. */
export function stableId(title: string, artist: string): string {
  let h = 0x811c9dc5;
  for (const ch of `${normalize(title)}|${normalize(artist)}`) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `cx-${h.toString(36)}`;
}

export function bodyToSong(row: IndexRow, body: Body): Song {
  const sections: SongSection[] = body.s.map(([name, idx]) => ({
    name,
    chords: (body.p[idx] ?? '')
      .split(' ')
      .filter(Boolean)
      .map((chord) => ({ chord, beats: 4 })),
  }));
  return {
    id: stableId(row[1], row[2]),
    title: row[1],
    artist: row[2],
    key: body.k || row[3],
    tempo: 100,
    sections: sections.filter((s) => s.chords.length),
    source: 'chordonomicon',
    ...(body.y ? { year: body.y } : {}),
    ...(body.g ? { genre: body.g } : {}),
  };
}

// ---------------------------------------------------------------------------
const BASE = `${import.meta.env.BASE_URL}cx/`;
let manifestP: Promise<IndexManifest | null> | null = null;
const shardCache = new Map<string, Promise<unknown>>();

async function getJson<T>(url: string): Promise<T | null> {
  const r = await fetch(url);
  if (!r.ok) return null;
  const type = r.headers.get('content-type') ?? '';
  // The SPA fallback serves index.html for missing files on some hosts.
  if (!type.includes('json')) return null;
  return (await r.json()) as T;
}

export function loadManifest(): Promise<IndexManifest | null> {
  manifestP ??= getJson<IndexManifest>(`${BASE}manifest.json`).catch(() => null);
  return manifestP;
}

function shard<T>(path: string, m: IndexManifest): Promise<T | null> {
  const url = `${BASE}${path}?v=${encodeURIComponent(m.built)}`;
  let p = shardCache.get(url) as Promise<T | null> | undefined;
  if (!p) {
    p = getJson<T>(url).catch(() => null);
    shardCache.set(url, p);
  }
  return p;
}

export interface SearchResult {
  rows: IndexRow[];
  /** The query had no searchable word (too short or only stopwords). */
  needMore: boolean;
}

export async function searchIndex(query: string, limit = 80): Promise<SearchResult> {
  const m = await loadManifest();
  const word = pickWord(query);
  if (!m || !word) return { rows: [], needMore: !word };
  const [t, a] = await Promise.all([
    shard<IndexRow[]>(`t/${prefixFile(shardPrefix(word, m.depth.t, m.minPrefix))}.json`, m),
    shard<IndexRow[]>(`a/${prefixFile(shardPrefix(word, m.depth.a, m.minPrefix))}.json`, m),
  ]);
  const seen = new Set<number>();
  const merged: IndexRow[] = [];
  for (const r of [...(t ?? []), ...(a ?? [])]) {
    if (!seen.has(r[0])) {
      seen.add(r[0]);
      merged.push(r);
    }
  }
  return { rows: rank(merged, query).slice(0, limit), needMore: false };
}

export async function loadIndexSong(row: IndexRow): Promise<Song | null> {
  const m = await loadManifest();
  if (!m) return null;
  const bodies = await shard<Body[]>(`c/${Math.floor(row[0] / m.perBody)}.json`, m);
  const body = bodies?.[row[0] % m.perBody];
  return body ? bodyToSong(row, body) : null;
}

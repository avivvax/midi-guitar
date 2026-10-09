#!/usr/bin/env python3
"""Build the static, sharded Chordonomicon index served from GitHub Pages.

Inputs: the dataset CSV and the resolver's names.jsonl (kept out of git).
Output (under --out, e.g. dist/cx):
  manifest.json            counts, shard layout, attribution
  c/<n>.json               song bodies, PER_BODY songs per file, by song number
  t/<hex prefix>.json      title-word prefix shards: [[num, title, artist, key], ...]
  a/<hex prefix>.json      artist-word prefix shards, same row format
  ATTRIBUTION.txt
Only songs whose title and artist both resolved are included.
Spotify IDs are not published.
"""
import argparse
import collections
import datetime
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import clean_title, estimate_key, index_words, iter_rows, normalize, parse_progression, prefix_file  # noqa: E402

PER_BODY = 400
SPLIT_AT = 2500  # entries in a prefix shard before it is split one character deeper
MIN_CHORDS = 4

ATTRIBUTION = (
    "Chord progressions: Chordonomicon (Kantarelis et al., 2024), CC BY-NC 4.0, "
    "https://huggingface.co/datasets/ailsntua/Chordonomicon. "
    "Converted to this app's chord names and sharded; song/artist names resolved via Spotify oEmbed. "
    "Non-commercial use only."
)
CITATION = (
    "Kantarelis, S., Thomas, K., Lyberatos, V., Dervakos, E., & Stamou, G. (2024). "
    "CHORDONOMICON: A Dataset of 666,000 Songs and their Chord Progressions. arXiv:2410.22046."
)


def load_names(path):
    artists, songs = {}, {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            try:
                r = json.loads(line)
            except ValueError:
                continue
            if r.get("n"):
                (artists if r["t"] == "a" else songs)[r["id"]] = r["n"].strip()
    return artists, songs


def pack_sections(sections):
    """Store each distinct chord pattern once: {"p": [...patterns], "s": [[name, idx], ...]}."""
    patterns, index, form = [], {}, []
    for name, chords in sections:
        pat = " ".join(chords)
        if pat not in index:
            index[pat] = len(patterns)
            patterns.append(pat)
        form.append([name, index[pat]])
    return {"p": patterns, "s": form}


def shard_prefixes(entries_by_word, split_at):
    """Group words by prefix; split crowded prefixes one character deeper (recursively)."""
    shards = {}
    depth = {}

    def place(words, d):
        groups = collections.defaultdict(list)
        for w in words:
            groups[w[:d]].append(w)
        for p, ws in groups.items():
            n = len({e[0] for w in ws for e in entries_by_word[w]})
            longer = [w for w in ws if len(w) > d]
            if n > split_at and longer and d < 6:
                depth[p] = d + 1
                # Words exactly equal to the prefix stay in this shard.
                short = [w for w in ws if len(w) == d]
                if short:
                    shards[p] = short
                place(longer, d + 1)
            else:
                shards[p] = ws

    place(list(entries_by_word), 2)
    return shards, depth


def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", required=True)
    ap.add_argument("--names", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    artists, songs = load_names(args.names)
    print(f"names: {len(artists)} artists, {len(songs)} songs", flush=True)

    best = {}  # spotify song id -> record (longest transcription wins)
    for row in iter_rows(args.csv):
        sid, aid = row["spotify_song_id"], row["spotify_artist_id"]
        if sid not in songs or aid not in artists:
            continue
        sections = parse_progression(row["chords"])
        n = sum(len(c) for _, c in sections)
        if n < MIN_CHORDS or (sid in best and best[sid]["n"] <= n):
            continue
        year = (row["release_date"] or "")[:4]
        genre = row["main_genre"] or (row["genres"].split("' '")[0].strip("'") if row["genres"] else "")
        best[sid] = {"title": clean_title(songs[sid]), "artist": artists[aid], "sections": sections, "n": n,
                     "y": int(year) if year.isdigit() else None, "g": genre}

    # One entry per (title, artist): remasters and re-releases collapse to the fullest transcription.
    dedup = {}
    for rec in best.values():
        k = (normalize(rec["title"]), normalize(rec["artist"]))
        if k not in dedup or dedup[k]["n"] < rec["n"]:
            dedup[k] = rec
    recs = sorted(dedup.values(), key=lambda r: (normalize(r["artist"]), normalize(r["title"])))
    print(f"songs in index: {len(recs)}", flush=True)

    out = args.out
    bodies = []
    t_words = collections.defaultdict(list)
    a_words = collections.defaultdict(list)
    for num, rec in enumerate(recs):
        chords = [c for _, cs in rec["sections"] for c in cs]
        key = estimate_key(chords)
        body = pack_sections(rec["sections"])
        body["k"] = key
        if rec["y"]:
            body["y"] = rec["y"]
        if rec["g"]:
            body["g"] = rec["g"]
        bodies.append(body)
        row = [num, rec["title"], rec["artist"], key]
        for w in index_words(rec["title"]):
            t_words[w].append(row)
        for w in index_words(rec["artist"]):
            a_words[w].append(row)

    for i in range(0, len(bodies), PER_BODY):
        write_json(f"{out}/c/{i // PER_BODY}.json", bodies[i : i + PER_BODY])

    layout = {}
    for kind, words in (("t", t_words), ("a", a_words)):
        shards, depth = shard_prefixes(words, SPLIT_AT)
        sizes = []
        for p, ws in shards.items():
            seen, rows = set(), []
            for w in ws:
                for r in words[w]:
                    if r[0] not in seen:
                        seen.add(r[0])
                        rows.append(r)
            write_json(f"{out}/{kind}/{prefix_file(p)}.json", rows)
            sizes.append(len(rows))
        layout[kind] = {"depth": depth, "shards": len(shards), "maxRows": max(sizes, default=0)}
        print(f"{kind}: {len(shards)} shards, max {max(sizes, default=0)} rows, split prefixes {len(depth)}", flush=True)

    manifest = {
        "version": 1,
        "built": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "songs": len(recs),
        "artists": len({normalize(r["artist"]) for r in recs}),
        "perBody": PER_BODY,
        "minPrefix": 2,
        "depth": {"t": layout["t"]["depth"], "a": layout["a"]["depth"]},
        "license": "CC BY-NC 4.0",
        "attribution": ATTRIBUTION,
        "citation": CITATION,
    }
    write_json(f"{out}/manifest.json", manifest)
    with open(f"{out}/ATTRIBUTION.txt", "w", encoding="utf-8") as f:
        f.write(ATTRIBUTION + "\n\nCitation:\n" + CITATION + "\n")
    print(json.dumps({k: v for k, v in manifest.items() if k != "depth"}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()

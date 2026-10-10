#!/usr/bin/env python3
"""Build the built-in Hebrew library from "ספר האקורדים הישראלי" (Oren Mustaki).

Input:  source/hebrew_chords_raw.json – chords only (no lyrics), one entry per
        song: page, title, artist, sections (chord lines in playing order).
Output: public/he/ (served statically, lazy-loaded by the app)
  manifest.json   version, counts, source/credit/license
  index.json      [[num, title, artist, key, page], ...] for search and browse
  s/<n>.json      song bodies, PER_SHARD per file: {"p": [patterns], "s": [[label, idx]], "k": key}
  report.json     build report: unparsed / approximated chord tokens, duplicate titles, fixes
Usage: python3 tools/hebrew_library/build_hebrew.py
"""
import collections
import hashlib
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "chord_index"))
from common import estimate_key, normalize  # noqa: E402

SRC = os.path.join(HERE, "source", "hebrew_chords_raw.json")
OUT = os.path.join(HERE, "..", "..", "public", "he")
PER_SHARD = 100

SOURCE = "ספר האקורדים הישראלי (אורן מוסטקי)"
CREDIT = "אקורדים מתוך \"ספר האקורדים הישראלי\" מאת אורן מוסטקי. לשימוש לא מסחרי בלבד."

# Israeli chord-book notation -> standard suffixes the app's parser accepts.
SUFFIX = {
    "4": "sus4", "2": "sus2", "47": "7sus4", "74": "7sus4", "34": "sus4", "94": "9sus4", "sus7": "7sus4",
    "7+": "7#5", "5+": "+", "M7": "maj7", "M9": "maj9", "°": "dim", "79": "9", "dim6": "dim7", "min7": "m7",
    "maj": "", "m2": "madd9",
}
# Rare symbols without an exact equivalent in the voicing engine: nearest playable chord (reported).
APPROX = {
    "m6+": "m6", "m79+": "m9", "madd11": "m", "m74": "m11", "m4": "m", "5-": "", "6add11": "6", "7add11": "11",
}
_CHORD = re.compile(r"^([A-G][#b]?)([^/]*)(?:/([A-G][#b]?))?$")

# Suffixes accepted by src/song/chordSymbol.ts (QUALITY table); a TS test re-checks every output chord.
KNOWN = {
    "", "m", "7", "m7", "maj7", "sus4", "sus2", "dim", "dim7", "m6", "6", "9", "5", "m9", "add9", "+", "aug",
    "m7b5", "add4", "m11", "madd9", "11", "sus", "add11", "13", "maj9", "7sus4", "9sus4", "7#5", "69", "m13",
    "7b9", "maj13",
}


def convert_chord(tok, approx, unparsed):
    m = _CHORD.match(tok)
    if not m:
        unparsed[tok] += 1
        return None
    root, suffix, bass = m.groups()
    if suffix in APPROX:
        approx[f"{tok} → {root}{APPROX[suffix]}{'/' + bass if bass else ''}"] += 1
        suffix = APPROX[suffix]
    suffix = SUFFIX.get(suffix, suffix)
    if suffix not in KNOWN:
        unparsed[tok] += 1
        return None
    return root + suffix + ("/" + bass if bass else "")


def clean_text(s):
    s = s.replace("‏", "").replace("‎", "")
    s = re.sub(r"\s+,", ",", s)          # "X  ,Y" -> "X,Y"
    s = re.sub(r",(?=\S)", ", ", s)      # -> "X, Y"
    s = re.sub(r"^[.\s]+|[.\s]+$", "", s)  # leading "..." / trailing dots and spaces
    return re.sub(r"\s+", " ", s).strip()


def split_merged(title, artist):
    """'' + 'Let love inכנסיית השכל' -> ('Let love in', 'כנסיית השכל')."""
    if title:
        return title, artist
    m = re.match(r"^([^֐-׿]+?)\s*([֐-׿].*)$", artist)
    if m:
        return m.group(1).strip(), m.group(2).strip()
    return title, artist


def artist_key(a):
    return normalize(a.replace("-", " "))


def label_sections(blocks):
    """Name blocks in playing order: the most repeated block is פזמון, others בית 1, בית 2, …
    Identical blocks get the same name. A single-block song is "שיר"."""
    if len(blocks) == 1:
        return ["שיר"]
    counts = collections.Counter(blocks)
    first = {b: i for i, b in reversed(list(enumerate(blocks)))}
    repeated = [b for b, c in counts.items() if c > 1]
    chorus = None
    if repeated:
        # Most repetitions; on a tie, the later-appearing block (songs usually open with a verse).
        chorus = max(repeated, key=lambda b: (counts[b], first[b]))
    names, verse = {}, 0
    out = []
    for b in blocks:
        if b not in names:
            if b == chorus:
                names[b] = "פזמון"
            else:
                verse += 1
                names[b] = f"בית {verse}"
        out.append(names[b])
    return out


def build(raw):
    approx, unparsed = collections.Counter(), collections.Counter()
    fixes = []
    songs = []
    for e in raw:
        title, artist = clean_text(e["title"]), clean_text(e["artist"])
        t2, a2 = split_merged(title, artist)
        if (t2, a2) != (title, artist):
            fixes.append(f"page {e['page']}: title/artist split → '{t2}' / '{a2}'")
            title, artist = t2, a2
        blocks = []
        for sec in e["sections"]:
            chords = [c for line in sec for tok in line.split() if (c := convert_chord(tok, approx, unparsed))]
            if chords:
                blocks.append(" ".join(chords))
        if not blocks or not title:
            fixes.append(f"page {e['page']}: skipped (no title or no chords)")
            continue
        songs.append({"page": e["page"], "title": title, "artist": artist, "blocks": blocks})

    # Unify artist spelling variants ("שם-טוב לוי" / "שם טוב לוי"): most common form wins.
    forms = collections.defaultdict(collections.Counter)
    for s in songs:
        forms[artist_key(s["artist"])][s["artist"]] += 1
    canon = {k: max(c.items(), key=lambda kv: (kv[1], len(kv[0])))[0] for k, c in forms.items()}
    for k, c in forms.items():
        if len(c) > 1:
            fixes.append(f"artist variants {sorted(c)} → '{canon[k]}'")
    for s in songs:
        s["artist"] = canon[artist_key(s["artist"])]

    songs.sort(key=lambda s: s["page"])
    by_title = collections.defaultdict(list)
    for s in songs:
        by_title[normalize(s["title"])].append(f"{s['title']} – {s['artist']} (p.{s['page']})")
    duplicates = [v for v in by_title.values() if len(v) > 1]
    return songs, approx, unparsed, fixes, duplicates


def write(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))


def main():
    raw = json.load(open(SRC, encoding="utf-8"))
    songs, approx, unparsed, fixes, duplicates = build(raw)
    index, bodies = [], []
    for num, s in enumerate(songs):
        labels = label_sections(s["blocks"])
        patterns, idx, form = [], {}, []
        for label, b in zip(labels, s["blocks"]):
            if b not in idx:
                idx[b] = len(patterns)
                patterns.append(b)
            form.append([label, idx[b]])
        key = estimate_key(" ".join(s["blocks"]).split())
        bodies.append({"p": patterns, "s": form, "k": key})
        index.append([num, s["title"], s["artist"], key, s["page"]])

    payload = json.dumps([index, bodies], ensure_ascii=False, sort_keys=True).encode()
    version = hashlib.sha1(payload).hexdigest()[:10]
    out = os.path.abspath(OUT)
    for f in (os.path.join(out, "s"),):
        if os.path.isdir(f):
            for name in os.listdir(f):
                os.remove(os.path.join(f, name))
    write(os.path.join(out, "index.json"), index)
    for i in range(0, len(bodies), PER_SHARD):
        write(os.path.join(out, "s", f"{i // PER_SHARD}.json"), bodies[i : i + PER_SHARD])
    artists = collections.Counter(a.strip() for s in songs for a in s["artist"].split(", "))
    write(os.path.join(out, "manifest.json"), {
        "version": version, "songs": len(songs), "artists": len(artists), "perShard": PER_SHARD,
        "source": SOURCE, "credit": CREDIT, "license": "non-commercial; author permission pending",
    })
    report = {
        "songsIn": len(raw), "songsLoaded": len(songs),
        "unparsedTokens": dict(unparsed.most_common()),
        "approximated": dict(approx.most_common()),
        "duplicateTitles": duplicates, "fixes": fixes,
    }
    with open(os.path.join(HERE, "build_report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    print(f"loaded {len(songs)}/{len(raw)} songs, {len(artists)} artists, version {version}")
    print(f"unparsed tokens: {sum(unparsed.values())} ({len(unparsed)} distinct) {dict(unparsed)}")
    print(f"approximated: {dict(approx)}")
    print(f"duplicate titles: {len(duplicates)}; fixes: {len(fixes)}")
    for f in fixes:
        print("  fix:", f)


if __name__ == "__main__":
    main()

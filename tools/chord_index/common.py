"""Shared helpers for the Chordonomicon index tools (stdlib only)."""
import csv
import re
import sys
import unicodedata

csv.field_size_limit(sys.maxsize)

DATASET_URL = "https://huggingface.co/datasets/ailsntua/Chordonomicon/resolve/main/chordonomicon_v2.csv"

# Chordonomicon quality suffix -> chord-name suffix the app's parser understands.
QUALITY = {
    "": "", "min": "m", "7": "7", "min7": "m7", "no3d": "5", "maj7": "maj7", "sus4": "sus4", "sus2": "sus2",
    "add9": "add9", "add13": "6", "9": "9", "7sus4": "7sus4", "dim": "dim", "add11": "add11", "min9": "m9",
    "minadd13": "m6", "dim7": "dim7", "maj9": "maj9", "aug": "aug", "13": "13", "min11": "m11", "11": "11",
    "7sus2": "7sus2", "minadd9": "madd9", "minmaj7": "m(maj7)", "7b9": "7b9", "maj7sus2": "maj7", "augmaj7": "aug",
    "majs9": "maj9", "minadd11": "madd9", "maj13": "maj13", "maj911s": "maj7#11", "min13": "m13", "13b": "13",
    "maj7sus4": "maj7", "maj11": "maj9", "augmaj9": "aug", "majs911s": "maj7#11", "dimb7": "dim7", "dim9": "dim",
    "13b9": "7b9", "minmaj9": "m(maj7)", "11s": "7#11", "minb9": "m7", "maj1311s": "maj7#11", "11b9": "7b9",
    "dimadd13": "dim7", "dim13b9": "dim7", "dimb9": "dim7", "minmaj11": "m(maj7)", "minmaj13": "m(maj7)",
    "min1113b": "m11", "dimadd11": "dim", "dim11b9": "dim", "augmaj11": "aug", "dim11": "dim",
}

# 's' is sharp, except where it starts "sus" (Csus4 = C sus4, Cssus4 = C# sus4).
_CHORD = re.compile(r"^([A-G])(s(?!us)|b)?(.*)$")
_NOTE = re.compile(r"^([A-G])(s|b)?$")
_ACC = {"s": "#", "b": "b", None: ""}

SECTION = {
    "verse": "Verse", "chorus": "Chorus", "intro": "Intro", "bridge": "Bridge", "outro": "Outro",
    "instrumental": "Instrumental", "interlude": "Interlude", "solo": "Solo", "intro_riff": "Intro",
}
_TAG = re.compile(r"^<([a-z_]+?)(?:_(\d+))?>$")


def convert_chord(tok):
    """'Fsmin7/Cs' -> 'F#m7/C#'; None if not understood."""
    main, _, bass = tok.partition("/")
    m = _CHORD.match(main)
    if not m or m.group(3) not in QUALITY:
        return None
    out = m.group(1) + _ACC[m.group(2)] + QUALITY[m.group(3)]
    if bass:
        b = _NOTE.match(bass)
        if b:
            out += "/" + b.group(1) + _ACC[b.group(2)]
    return out


def section_name(tag):
    m = _TAG.match(tag)
    if not m:
        return None
    name = SECTION.get(m.group(1), m.group(1).replace("_", " ").title())
    n = m.group(2)
    return f"{name} {n}" if n and n != "1" else name


def parse_progression(text):
    """Chordonomicon chords column -> [(section name, [chord, ...]), ...]."""
    sections = []
    cur = None
    for tok in text.split():
        if tok.startswith("<"):
            name = section_name(tok)
            if name:
                cur = (name, [])
                sections.append(cur)
            continue
        c = convert_chord(tok)
        if c is None:
            continue
        if cur is None:
            cur = ("Song", [])
            sections.append(cur)
        cur[1].append(c)
    return [s for s in sections if s[1]]


def normalize(s):
    """Search normalisation – must match normalize() in src/song/chordIndex.ts."""
    s = unicodedata.normalize("NFKD", s.lower())
    s = "".join(ch for ch in s if not unicodedata.category(ch).startswith("M"))
    s = re.sub(r"['’\"`]", "", s)
    return " ".join("".join(ch if ch.isalnum() else " " for ch in s).split())


STOPWORDS = {"the", "a", "an", "and", "of", "de", "la", "el", "le", "feat", "ft", "you", "me", "my", "your", "in", "on", "to", "is", "it", "i", "im", "for", "with", "be", "we", "all"}


_SUFFIX = re.compile(
    r"\s+[-–]\s+(?=[^-–]*\b(remaster|remastered|live|version|mono|stereo|edit|mix|remix|demo|acoustic|bonus|"
    r"deluxe|single|from|recorded|session|take|instrumental|anniversary|unplugged|\d{4})\b).*$",
    re.IGNORECASE,
)
_PAREN = re.compile(
    r"\s*[(\[][^)\]]*\b(remaster|remastered|live|mono|stereo|demo|bonus|deluxe|\d{4} version)\b[^)\]]*[)\]]\s*$",
    re.IGNORECASE,
)


def clean_title(title):
    """'Let It Be - Remastered 2009' -> 'Let It Be'; keeps meaningful subtitles."""
    t = title.strip()
    for _ in range(2):
        t2 = _PAREN.sub("", _SUFFIX.sub("", t)).strip()
        if t2 == t or not t2:
            break
        t = t2
    return t or title.strip()


def index_words(s):
    return [w for w in dict.fromkeys(normalize(s).split()) if len(w) >= 2 and w not in STOPWORDS]


def prefix_file(prefix):
    """Shard file stem for a prefix: hex of its UTF-8 bytes (safe on any host)."""
    return prefix.encode("utf-8").hex()


# --- key estimation (Krumhansl-Kessler profiles over chord tones) -----------
_MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
_MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
_PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
_CH = re.compile(r"^([A-G])([#b]?)(.*?)(?:/.*)?$")


def _tones(chord):
    m = _CH.match(chord)
    if not m:
        return []
    root = (_PC[m.group(1)] + (1 if m.group(2) == "#" else -1 if m.group(2) == "b" else 0)) % 12
    q = m.group(3)
    if q == "5":
        third = None
    elif "sus2" in q:
        third = 2
    elif "sus" in q:
        third = 5
    elif q.startswith("dim") or (q.startswith("m") and not q.startswith("maj")):
        third = 3
    else:
        third = 4
    fifth = 6 if q.startswith("dim") else 8 if q.startswith("aug") else 7
    return [root] + ([(root + third) % 12] if third is not None else []) + [(root + fifth) % 12]


def estimate_key(chords):
    hist = [0.0] * 12
    for c in chords:
        for i, pc in enumerate(_tones(c)):
            hist[pc] += 1.5 if i == 0 else 1.0
    if not any(hist):
        return "C"
    mean_h = sum(hist) / 12

    def corr(profile, shift):
        p = [profile[(i - shift) % 12] for i in range(12)]
        mp = sum(p) / 12
        num = sum((h - mean_h) * (q - mp) for h, q in zip(hist, p))
        den = (sum((h - mean_h) ** 2 for h in hist) * sum((q - mp) ** 2 for q in p)) ** 0.5
        return num / den if den else 0

    best = max(((corr(_MAJ, k), k, "") for k in range(12)), key=lambda x: x[0])
    bestm = max(((corr(_MIN, k), k, "m") for k in range(12)), key=lambda x: x[0])
    _, k, suffix = best if best[0] >= bestm[0] else bestm
    return _NAMES[k] + suffix


def iter_rows(csv_path):
    with open(csv_path, newline="", encoding="utf-8") as f:
        yield from csv.DictReader(f)

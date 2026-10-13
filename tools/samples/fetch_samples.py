#!/usr/bin/env python3
"""Fetch the instrument sample sets listed in src/instruments/sampleSets.json.

Source: FluidR3_GM (Frank Wen) as rendered per note by gleitz/midi-js-soundfonts
(CC BY 3.0, https://github.com/gleitz/midi-js-soundfonts). For every set, one
note every `step` semitones from `lo` to `hi` is downloaded and re-encoded with
ffmpeg to mono 64 kb/s MP3, trimmed (4 s for sustained sets, 3 s otherwise)
with a short fade-out, into public/samples/<set>/<midi>.mp3.

Usage: python3 tools/samples/fetch_samples.py [set ...]   (needs ffmpeg)
Already present files are skipped, so it is safe to re-run.
"""
import json
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONFIG = ROOT / 'src' / 'instruments' / 'sampleSets.json'
OUT = ROOT / 'public' / 'samples'
BASE = 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM'
NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']


def note_name(midi: int) -> str:
    return f'{NAMES[midi % 12]}{midi // 12 - 1}'


def fetch(url: str) -> bytes:
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                return r.read()
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)
    raise RuntimeError('unreachable')


def main() -> None:
    cfg = json.loads(CONFIG.read_text())
    step = cfg['step']
    only = set(sys.argv[1:])
    total = 0
    for set_id, s in cfg['sets'].items():
        if only and set_id not in only:
            continue
        dest = OUT / set_id
        dest.mkdir(parents=True, exist_ok=True)
        length = 4.0 if s.get('sustained') else 3.0
        for midi in range(s['lo'], s['hi'] + 1, step):
            out = dest / f'{midi}.mp3'
            if out.exists():
                continue
            data = fetch(f"{BASE}/{s['gm']}-mp3/{note_name(midi)}.mp3")
            with tempfile.NamedTemporaryFile(suffix='.mp3') as tmp:
                tmp.write(data)
                tmp.flush()
                subprocess.run(
                    ['ffmpeg', '-v', 'error', '-y', '-i', tmp.name, '-ac', '1', '-ar', '44100', '-t', str(length),
                     '-af', f'afade=t=out:st={length - 0.4}:d=0.4', '-b:a', '64k', str(out)],
                    check=True,
                )
            total += 1
        print(f'{set_id}: {len(list(dest.glob("*.mp3")))} files')
    print(f'{total} new files')


if __name__ == '__main__':
    main()

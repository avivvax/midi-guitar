#!/usr/bin/env python3
"""Resolve Chordonomicon Spotify IDs to names via Spotify oEmbed – politely and resumably.

Appends one JSON line per resolved ID to the state file:
  {"t": "a"|"s", "id": "...", "n": "name" | null}
(null = Spotify returned 404/400 – removed or invalid, never retried).
Re-running skips everything already in the file. Work is ordered by artist
size (artists with the most songs first), each artist followed by its songs.

Usage: resolve_names.py --csv chordonomicon_v2.csv --state names.jsonl --budget-minutes 330
"""
import argparse
import collections
import json
import os
import random
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import iter_rows  # noqa: E402

OEMBED = "https://open.spotify.com/oembed?url="
UA = "midi-guitar-chord-index/1.0 (+https://github.com/avivvax/midi-guitar; non-commercial)"


class Limiter:
    """Shared token bucket with adaptive rate and a global pause on throttling."""

    def __init__(self, rate, floor=0.5):
        self.target = rate
        self.rate = rate
        self.floor = floor
        self.next_at = time.monotonic()
        self.pause_until = 0.0
        self.ok_streak = 0
        self.lock = threading.Lock()

    def acquire(self):
        while True:
            with self.lock:
                now = time.monotonic()
                start = max(now, self.next_at, self.pause_until)
                self.next_at = start + 1.0 / self.rate
                delay = start - now
            if delay > 0:
                time.sleep(delay)
            return

    def throttled(self, retry_after):
        with self.lock:
            self.pause_until = max(self.pause_until, time.monotonic() + retry_after)
            self.rate = max(self.floor, self.rate * 0.6)
            self.ok_streak = 0

    def success(self):
        with self.lock:
            self.ok_streak += 1
            if self.ok_streak >= 300 and self.rate < self.target:
                self.rate = min(self.target, self.rate * 1.2)
                self.ok_streak = 0


class Stats:
    def __init__(self):
        self.c = collections.Counter()
        self.lock = threading.Lock()

    def inc(self, k, n=1):
        with self.lock:
            self.c[k] += n


def fetch(kind, sid, limiter, stats, max_tries=6):
    url = OEMBED + urllib.parse.quote(f"https://open.spotify.com/{'artist' if kind == 'a' else 'track'}/{sid}", safe="")
    for attempt in range(max_tries):
        limiter.acquire()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=20) as r:
                title = json.load(r).get("title")
                limiter.success()
                stats.inc("ok")
                return title if title else None
        except urllib.error.HTTPError as e:
            if e.code in (400, 404):
                stats.inc("gone")
                return None
            if e.code == 429 or e.code >= 500:
                ra = e.headers.get("Retry-After")
                wait_s = float(ra) if ra and ra.replace(".", "", 1).isdigit() else min(300, 5 * 2 ** attempt)
                stats.inc("throttled" if e.code == 429 else "server_error")
                limiter.throttled(wait_s + random.random())
                continue
            stats.inc(f"http_{e.code}")
            time.sleep(2 ** attempt)
        except Exception:  # timeouts, resets
            stats.inc("net_error")
            time.sleep(min(60, 2 ** attempt + random.random()))
    stats.inc("gave_up")
    return ...  # Ellipsis = unresolved this run; retried next run


def load_state(path):
    done = set()
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            for line in f:
                try:
                    r = json.loads(line)
                    done.add((r["t"], r["id"]))
                except (ValueError, KeyError):
                    pass  # a truncated last line from an interrupted run
    return done


def work_items(csv_path):
    songs_by_artist = collections.defaultdict(list)
    seen = set()
    for row in iter_rows(csv_path):
        sid, aid = row["spotify_song_id"], row["spotify_artist_id"]
        if sid and aid and sid not in seen:
            seen.add(sid)
            songs_by_artist[aid].append(sid)
    for aid, sids in sorted(songs_by_artist.items(), key=lambda kv: -len(kv[1])):
        yield ("a", aid)
        for sid in sids:
            yield ("s", sid)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", required=True)
    ap.add_argument("--state", required=True)
    ap.add_argument("--budget-minutes", type=float, default=330)
    ap.add_argument("--rate", type=float, default=6.0, help="target requests/second")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--limit", type=int, default=0, help="stop after N new lookups (testing)")
    args = ap.parse_args()

    deadline = time.monotonic() + args.budget_minutes * 60
    done = load_state(args.state)
    todo = [w for w in work_items(args.csv) if w not in done]
    total = len(todo) + len(done)
    print(f"already resolved {len(done)}, remaining {len(todo)} of {total}", flush=True)
    if args.limit:
        todo = todo[: args.limit]

    limiter = Limiter(args.rate)
    stats = Stats()
    out = open(args.state, "a", encoding="utf-8")
    wlock = threading.Lock()
    written = 0
    t0 = time.monotonic()

    def task(item):
        return item, fetch(item[0], item[1], limiter, stats)

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        it = iter(todo)
        pending = set()
        stop = False
        while True:
            while not stop and len(pending) < args.workers * 4:
                if time.monotonic() > deadline:
                    stop = True
                    break
                item = next(it, None)
                if item is None:
                    stop = True
                    break
                pending.add(pool.submit(task, item))
            if not pending:
                break
            finished, pending = wait(pending, return_when=FIRST_COMPLETED)
            for fut in finished:
                (kind, sid), name = fut.result()
                if name is ...:
                    continue
                with wlock:
                    out.write(json.dumps({"t": kind, "id": sid, "n": name}, ensure_ascii=False) + "\n")
                    written += 1
                    if written % 500 == 0:
                        out.flush()
                        el = time.monotonic() - t0
                        print(f"{written} new ({written / el:.1f}/s, rate {limiter.rate:.1f}) {dict(stats.c)}", flush=True)
    out.close()
    remaining = len(todo) - written
    summary = (
        f"resolved {written} new in {(time.monotonic() - t0) / 60:.1f} min; "
        f"total {len(done) + written}/{total}; remaining ~{max(0, total - len(done) - written)}; {dict(stats.c)}"
    )
    print(summary, flush=True)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as f:
            f.write(f"### Name resolution\n\n{summary}\n")
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as f:
            f.write(f"remaining={max(0, total - len(done) - written)}\n")
    return 0 if remaining >= 0 else 1


if __name__ == "__main__":
    sys.exit(main())

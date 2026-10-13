# MIDI Guitar – PWA

**Live app:** https://avivvax.github.io/midi-guitar/ · **Firmware:** [`firmware/`](firmware/) ([הוראות בעברית](firmware/SETUP.md))

A mobile-first Progressive Web App that turns a DIY 6-string MIDI guitar into a playable instrument in the browser. The guitar is an ESP32-S3 with one piezo per string on the body and a capacitive fretboard.

- No backend and no running cost. Everything (strum detection, music logic, synthesis) runs in the browser.
- Runs in Chrome for Android and desktop Chrome. Web Bluetooth and Web Serial need **HTTPS** or `localhost`.
- The UI is in Hebrew (RTL). Note and chord names are in English.

## Run locally

```bash
npm ci
npm run dev          # http://localhost:5173 (localhost counts as a secure context)
npm test             # unit tests: strum detector, BLE-MIDI parser, voicings, Karplus-Strong, chord-sheet parser, song advance logic, seed songs
npm run build        # typecheck + production build into dist/ (with service worker)
npm run preview      # serve dist/ on http://localhost:4173
```

To test on a phone from the dev server, use `npm run dev -- --host` and open it through an HTTPS tunnel. Plain `http://<lan-ip>` is not a secure context, so Bluetooth and Serial are disabled there.

## Screens

| Screen | Purpose |
| --- | --- |
| **חיבור / Connect** | Pick a transport. Shows the connection status and a live 6-bar signal meter. |
| **נגינה / Play** | 8-slot chord palette (thumb zone), current chord with its diagram, capo −/+, chord/free mode, the instrument picker (82 string instruments, see "String instruments"), register ◀ ▶ for instruments with more than 6 strings, tremolo where the instrument has it, and 6 animated strings. Tap a string to pluck it, or drag across the strings to strum. |
| **שירים / Songs** | Song library, player (tempo / strum-count / manual advance) and chord-sheet import. See "Song mode" below. |
| **הגדרות / Settings** | Instrument and its tunings (plus a custom per-string editor), what the extra physical strings do on instruments with fewer than 6, key, chord editor (filter to chords in the key), volume, reverb, MIDI out, and **כיול מיתרים** (string calibration, below). |
| **דיבאג / Debug** | Scope of the per-string signals with the threshold line, live-tunable detector parameters, strum→sound latency, and an event log. |

Settings are saved in `localStorage`.

## Song mode (שירים)

The **שירים / Songs** tab is a library of chord progressions (no lyrics) that you play along with.

- **Library:** search by title or artist, mark favorites with ★, filter by All / Favorites / Mine. Songs you imported can be deleted.
- **Player:** the current chord in large type with its diagram, the next chord smaller, the section name, and section chips to jump between sections. It also has transpose ±, loop section and restart. The large **הבא** (next) button sits at the bottom, in the thumb zone.
- **Advance modes,** switchable while playing:
  - **טמפו / Tempo:** a metronome on the audio clock, with an optional click (accented every 4 beats). The song advances by each chord's `beats`. You can adjust the BPM per song.
  - **פריטות / Strum count:** the song advances after N strums (default 4, settable per song, or set in the song file with `strumsPerChord`). String hits less than 90 ms apart count as one strum. The strum after the N-th one switches the chord, so a strum never changes chord halfway through.
  - **ידני / Manual:** tap the chord area or the **הבא** button.
- **Playing a song:** while a song is open, strums from any input play the current song chord's voicing. The capo and tuning settings apply, the same as in chord mode. Song chords are the *shapes* you play. If a song has a `capo` value, the player suggests applying it.
- **Import:** paste a chord sheet, either ChordPro (`[Am]` inline chords and `{title}` / `{soc}` / `{comment: Verse}` directives) or plain text with chords above the lyrics (`[Chorus]`, `Verse 2:`, `פזמון`, `Intro: Am G C`, `| Am G |` bars, `x2` repeats). The parser keeps the chords and section names. **Lyrics are discarded and never stored.** You name the song and save it; it is stored in `localStorage`.

### Auto-strum: "השמע דוגמה" and "נגן איתי"

The playback box in the song player plays the song's chord sequence through the audio engine, starting from the current chord.

- **השמע דוגמה** (play demo) plays the song at full volume.
- **נגן איתי** (play along) plays it as a quiet guide (30% volume) while your own strums sound on top at full level.
- One button switches between the two modes without stopping, and the same button stops playback.
- **Patterns:**
  - `D-DU-UDU`, `D-D-D-D`, `D-DU-D-DU`: on eighth notes. Down strokes go low → high across every sounding string; up strokes hit the top 3–4 strings, lighter.
  - **ארפג׳ו** (arpeggio): one string per eighth, starting on the bass.
  - Every stroke gets human variation: velocity spread, a harder bar downbeat, a stroke speed that follows velocity, and a few ms of timing jitter.
- **Changing things while it plays:**
  - pattern, instrument (picker in the same box), BPM and transpose
  - the section loop
  - jumping with prev / next / section chips: playback continues from the new chord
- **Display sync:** the chord and the beat dots move exactly when each chord sounds. While auto-strum runs it controls the song position, so your strums don't advance the song; they play the chord being shown.
- **Live latency is untouched.** Auto-strum uses its own set of 6 voices, with its own volume and the same instrument effects, and schedules notes up to 120 ms ahead on the audio clock. Your strums keep their own voices and their exact code path.
  - Measured in headless Chrome: 0.3 ms median from key press to audio start, the same with and without play-along running.

### Song files

Seed songs are `songs/*.json`, one file per song, and the file name is the song id. They are bundled at build time:

```json
{
  "title": "Let It Be", "artist": "The Beatles", "key": "C", "tempo": 72,
  "capo": 0, "strumsPerChord": 4,
  "sections": [ { "name": "Verse", "chords": [ { "chord": "C", "beats": 4 }, { "chord": "G", "beats": 4 } ] } ]
}
```

`capo` and `strumsPerChord` are optional. A chord can be any common symbol (`Am7`, `G/B`, `Dsus4`, `Bm7b5`, `D6/9`, …). Extensions map to the nearest voicing the engine knows, and the bass note of a slash chord is not voiced. `npm test` checks that every seed song is valid and that all of its chords parse.

The seeds are simplified, common-practice progressions written from memory, not transcriptions. The Hebrew seeds are traditional and folk songs. Correct a file or import your own version if a progression differs from what you play.

## Transports

All transports implement the same interface:

```ts
interface GuitarInput { connect(): Promise<void>; disconnect(): void; onEvent(cb: (e: GuitarEvent) => void): void }
type GuitarEvent =
  | { type: 'strum'; string: 0..5; velocity: 0..1 }
  | { type: 'fret';  string: 0..5; fret: 0..12 | null }
  | { type: 'raw';   values: number[] };
```

**String index 0 is the low E (6th string). Index 5 is the high e.**

### 1. USB Serial (dev/debug, works with the current firmware)
1. Connect the ESP32-S3 over USB. On Android you need an OTG cable and a Chrome version that supports Web Serial on Android.
2. Connect → **USB Serial** → pick the port. The baud rate is 115200.
3. The firmware prints one line every ~2 ms: 6 space-separated ADC values, one per piezo, with an optional 7th value for the body reference piezo.
4. Strum detection runs in the browser (`src/input/strumDetector.ts`, ported from `guitar_studio.py`):
   - per-string baseline (EMA), frozen while a hit is in progress
   - threshold plus rising-edge detection, then a short peak-tracking window
   - refractory window (default 60 ms)
   - crosstalk rejection: drops the hit if the reference piezo is louder than `refRatio × peak` (body knock), or if a neighbouring string's peak is much larger (`neighbourRatio`)
   - velocity = normalised peak above the baseline, shaped by a curve
5. Tune every parameter live in **Debug**. Rejected hits appear in red in the event log.

### 2. Bluetooth MIDI (target)
Connect → **Bluetooth MIDI**. The device picker filters on the standard BLE-MIDI service. The app parses full BLE-MIDI packets: header, timestamps, running status, several messages per packet, and SysEx (which it skips).

### 3. Web MIDI
Use this when the OS already pairs the guitar as a MIDI device (for example, Android's MIDI BLE pairing, or USB-MIDI firmware). The app listens to every connected MIDI input and uses the same mapping as BLE.

### 4. Keyboard (no hardware)
- `1`–`6`: strum strings 1–6 (1 = low E).
- `Shift`: hard strum.
- `Space`: down-strum all strings. `Shift+Space`: up-strum.

## BLE-MIDI mapping (for the firmware)

| Item | Value |
| --- | --- |
| Service UUID | `03B80E5A-EDE8-4B33-A751-6CE34EC4C700` |
| Characteristic UUID | `7772E5DB-3868-4112-A1A9-F2669D106BF3` (notify; the app also writes to it, without response, for calibration) |
| Advertised name | anything. The picker filters by service, not by name. |

| Message | Meaning |
| --- | --- |
| MIDI channel 1–6 | string 0–5 (channel 1 = low E, channel 6 = high e) |
| **Note On**, velocity 1–127 | **strum** on that string, velocity = v/127. The note number is ignored because the app decides the pitch. The firmware in `firmware/` sends note 60. |
| Note On velocity 0 / Note Off | **ignored**: a plucked string sustains until it decays naturally or is plucked again. The firmware still sends Note Off 50 ms after each Note On; that is harmless. |
| **CC 20**, value 0–12 | **fret** pressed on that string (0 = open / nothing touched) |
| **CC 20**, value 127 | string **damped/muted** (`fret: null`). Stops the ringing string at once (and sends Note Off on MIDI Out); a strum while muted plays a percussive click. This is the only way to cut a note short. |

Recommendations:
- Send CC 20 when the fret changes, **before** the Note On of a strum that uses it.
- Several messages per BLE packet, with running status, are fine.
- Send fret updates for every string, even in chord mode. The app ignores them there.

Example packet: strum string 3 (channel 3) with velocity 100, after reporting fret 5:
```
80 80 B2 14 05   80 92 32 64
hdr ts CC20=5    ts NoteOn ch3 note 50 vel 100
```

### Calibration protocol (MIDI channel 16)

Settings → **כיול מיתרים** tunes the guitar's own strum detector over BLE. It works only on a Bluetooth MIDI connection; over USB Serial the detector runs in the app and its parameters are on the Debug screen, as before. Both directions use Control Change on channel 16 (status `0xBF`), so they never collide with the string channels 1–6. The mappings are mirrored in `src/input/configProtocol.ts` and `firmware/midi_guitar/ConfigProtocol.h`.

| CC | Value | Meaning |
| --- | --- | --- |
| 20–25 | 0–127 | trigger threshold for strings 1–6, quadratic: `10 + (v/127)² · 2000` ADC counts above the baseline |
| 26 | 0–127 | release ratio `0.05 + v/127 · 0.95`: the signal must fall below `threshold × ratio` before the string can trigger again (1.0 = old behaviour) |
| 27 | 0–127 | neighbour-rejection ratio `v / 63.5` (64 ≈ 1.0, 0 = off) |
| 28 | 0–127 | gain `2^((v − 64) / 32)` (0.25–4, 64 = ×1) for the string chosen by CC 29 |
| 29 | 1–6 | selects the string for CC 28 (send it in the same packet, just before CC 28) |
| 30 | 127 | save the current settings to flash (NVS) |
| 31 | 127 | factory defaults (not saved until CC 30) |
| 32 | 127 / 0 | calibration monitor on / off (extension, see below) |

Changes apply live. Settings are only persisted on CC 30.

**Extension (firmware → app).** To draw the live peak meters, the app sends CC 32 = 127 when the calibration screen opens and 0 when it closes. While the monitor is on, the firmware:
- replies at once with a **settings dump**: CC 20–27, then a CC 29/CC 28 pair per string, in the same encoding;
- every 50 ms sends **CC 40–45**: the peak signal of strings 1–6 since the last report, on the same quadratic scale as the threshold, so the meter and the threshold marker line up.

The firmware also sends a dump after a reset (CC 31). If no dump arrives within 2.5 s, the screen says the firmware needs updating.

**Velocity floor (app only).** Strums whose velocity is below the "סף עוצמה מינימלי" slider (default 0.08, saved in the app) are dropped and logged as `reject` on the Debug screen. This applies to every transport.

## Music engine

- **Instruments and tunings:** every instrument in the registry has its own standard tuning(s) and a custom per-string editor (see "String instruments"). The guitars keep Standard, Drop D, DADGAD, Open G, Open D and half-step down.
- **Software capo** 0–7. Like a real capo, it transposes the *shape*: the palette chord "C" with capo 2 sounds as D, and the Play screen shows "sounds D". On every instrument the chord names the shape and the capo transposes the sound.
- **Chords:** maj, m, 7, maj7, m7, sus2, sus4, dim, aug, 5 (power).
  - Guitar tunings that are standard (or standard shifted) use hand-written open shapes, then movable E- and A-shape barres. Ukulele-family tunings use a table of standard ukulele shapes.
  - Everything else uses a search over playable fingerings on the instrument's own tuning, for any number of courses: ≤4-fret span (wider where the instrument allows), ≤4 fingers (a barre only when needed), all required tones, open-only strings respected. The bass note must be the root on guitar-like instruments; on 3–4 course and re-entrant instruments (ukulele, mandolin, violin …) it is a preference. If a tuning can't voice a chord fully, the fifth becomes optional, then the hand stretches, then root + fifth.
- **Key selector:** "only chords in the key" filters the editor to chords whose notes are all in the scale. "מלא פלטה מהסולם" (fill palette from key) fills the 8 slots. Harps, qanun, the pentatonic zithers and the Indian instruments also re-tune to the key.
- **Chord mode:** strumming physical string *i* plays what that string has in the selected chord (see "String instruments" for how strings map). Fret events are ignored.
- **Free mode:** pitch per string = tuning + capo + the last fret reported by the neck.
- Strumming a muted string (`x` in the voicing, or `fret: null`) plays a percussive click. A physical string with no course behind it is silent.

## String instruments

The instrument registry is data: `src/instruments/registry.ts` (types in `types.ts`). **82 instruments**: guitars (steel, nylon, 12-string, baritone, 7-string, electric clean/overdrive/distortion, lap steel, resonator, synth lead), basses (4/5/6-string, fretless, guitarrón), small plucked (4 ukuleles, banjolele, cavaquinho, charango, two cuatros, tiple, tres, bandurria, 5-string and tenor banjo, mandolin family, three bouzoukis, balalaika, domra), Middle East (Arabic and Turkish oud, saz, tanbur, cümbüş, tar, setar, kemenche, qanun), Asia (sitar, sarod, tanpura, veena, pipa, ruan, sanxian, shamisen, guzheng, koto, gayageum, đàn tranh, erhu), bowed (violin, viola, cello, double bass, hardanger fiddle, nyckelharpa, hurdy-gurdy) and others (lever and pedal harp, lyre/kinnor, kora, kantele, autoharp, zither, mountain and hammered dulcimer, bowed psaltery, Chapman Stick, lute, theorbo, vihuela).

Each entry has: English and Hebrew name, family, region, one or more named tunings (MIDI notes, written as note names), course doubling (`[0]` unison pair, `[12]` octave pair, `[-12]` octave below), fretting (chromatic frets, a diatonic fret map for the mountain dulcimer, fretless, or open strings), chord style, a synth preset, an optional sample set, a General MIDI program (sent as Program Change to MIDI Out) and articulation (technique, tremolo, sympathetic strings, drone).

**Physical strings → courses** (`src/instruments/mapping.ts`):
- **6 courses:** one to one.
- **Fewer than 6** (ukulele, mandolin, violin, erhu …): the courses sit in the middle of the 6 physical strings (4 courses → physical strings 2–5). The outer strings either **double** the nearest course (default) or stay **silent** (Settings → "מיתרים פיזיים עודפים").
- **More than 6** (7-string, theorbo, sitar, Chapman Stick, harps, qanun, zithers): a **register window** of 6 consecutive courses is active. Move it with the ◀ ▶ buttons on the Play screen or the `[` / `]` keys. Fretted instruments move one course per step, open-string instruments about an octave. On open-string instruments, which have no use for frets, the **touch-neck fret zone** also selects the register (fret 1 = lowest window, fret 12 = highest).
- **Open-string instruments in chord mode** (harps, qanun, zithers, autoharp): the physical strings play the strings that are chord tones, in order, starting at the first root in the window. That is what an autoharp's chord bars do, and it gives a harp-like arpeggio.

**Chord styles:** `chord` (fingering search), `bass` (root + fifth: basses, double bass, guitarrón), `slide` (one straight bar: lap steel, dobro), `arpeggio` (melody instruments, chord tones ascending: erhu, hurdy-gurdy), `drone` (tanpura plays its tuning whatever the chord).

**Re-tuning for the key:** pedal and lever harp, kinnor, kora and qanun snap their strings to the key's scale (levers, pedals, mandals). Guzheng, gayageum, đàn tranh, koto and kantele transpose their pentatonic or modal tuning to the key, or its relative major/minor. Sitar, sarod, tanpura and veena put Sa on the key root.

**Sound:**
- **Samples** (27 instruments, lazy-loaded per instrument, about 400–700 KB each; see `LICENSES.md`) from FluidR3_GM: guitars, electrics, basses, violin family, harps, sitar, banjos, shamisen, koto, hammered dulcimer. Guitarrón and hardanger fiddle use samples of a related instrument. Until a set is loaded, or if it fails, the synth preset plays.
- **Synth presets** (`src/instruments/sounds.ts`) for every instrument:
  - Karplus-Strong variants with body filters.
  - A bridge **buzz** (sitar jawari, tanpura, shamisen sawari, saz).
  - **Hammer** excitation (hammered dulcimer).
  - A **bowed** wavetable model for violin family, fiddles, kemenche, erhu, hurdy-gurdy and psaltery. Strum velocity sets the bow pressure: loudness, brightness and how long the bow stroke lasts.
- **Course doubling** is rendered into the note: unison strings slightly detuned, octave strings quieter.
- **Tremolo** (Play → טרמולו, on mandolin, bouzoukis, balalaika, domra, pipa, oud, charango, bandurria, tenor banjo …) re-picks at about 12 Hz. Harder strums tremolo longer.
- **Sympathetic strings** ring softly when a played note matches them: sitar and sarod taraf (tuned to the key's scale), hardanger understrings, nyckelharpa.
- The hurdy-gurdy adds a **drone** on the key's root and fifth while you play.

**Uncertain tunings.** These are marked `uncertain` in the registry and show "כוונון משוער" (approximate tuning) in the picker and Settings: cavaquinho (Portuguese), Puerto Rican cuatro, tiple, tres cubano, Turkish oud, saz, tanbur, cümbüş, tar, setar, sitar, sarod, veena, sanxian, koto (octave), gayageum, đàn tranh, kinnor, kora, autoharp, hammered dulcimer, bowed psaltery, Chapman Stick. Notes on approximations are also shown in the picker: oud and other fretless instruments play semitones (no quarter tones), lever harp levers follow any key, and zither accompaniment strings and veena side strings are not modelled.

**Adding an instrument:** add an entry to `INSTRUMENTS` (use `t('E2 A2 …')` for tunings, `scaleRun()` for long diatonic or pentatonic string sets) and pick a `sound` from `SOUNDS`. Optionally add a sample set to `src/instruments/sampleSets.json` and run `python3 tools/samples/fetch_samples.py <set>` (needs ffmpeg). `src/instruments/instruments.test.ts` checks every instrument: tunings, that chord mode only plays chord tones, and sample coverage.

**Firmware:** unchanged. The instrument lives only in the app, and the BLE-MIDI protocol is the same.

## Audio engine

- `AudioContext({ latencyHint: 'interactive' })` is created and resumed on the first tap or key press.
- One pre-allocated voice per physical string (filter + gain), plus a separate set for auto-strum. A retrigger fades the previous note out over 12 ms (80 ms for bowed notes), which works as a clean note-off.
- Every note is a single `AudioBufferSourceNode` start:
  - either a sample, pitched from the nearest file at most 1–2 semitones away, starting after the file's leading silence;
  - or a buffer rendered offline from the instrument's synth preset (extended Karplus-Strong, or the bowed wavetable model; see "String instruments"). These are cached (LRU), and the current chord's notes are pre-rendered when it is selected.
- Instrument bus: the preset's body filters, then its chain:
  - clean;
  - electric (lowpass and light chorus);
  - overdrive / distortion (tanh waveshaper with 4× oversampling, and a cabinet filter);
  - bass;
  - hurdy (light buzz).
- **Synth lead:** two detuned saws through a resonant lowpass with a filter envelope.
- Velocity controls gain and brightness (the per-voice lowpass cutoff); on bowed instruments it also controls the length of the bow stroke.
- Master volume and a limiter. The reverb send uses a convolver with a generated impulse response.
- **MIDI out (optional):** Settings → MIDI Out mirrors notes to a Web MIDI output, with channel = string + 1, and sends the instrument's General MIDI program, so a DAW can record them.

## Latency

Debug → "השהיה" (latency) shows:
- **JS processing:** from the moment the input event arrives (serial chunk, BLE notification, MIDI message or key) until the audio source is started.
- **Audio output:** `baseLatency + outputLatency` reported by the browser.
- **Total (est.):** the sum of the two. It does not include the BLE connection interval or the serial peak window (6 ms by default).

## Built-in Hebrew library (ספר האקורדים הישראלי)

The Songs tab includes **1,394 Hebrew songs** from **"ספר האקורדים הישראלי" by Oren Mustaki (אורן מוסטקי)**. Only the chord progressions are included, no lyrics.

> **Non-commercial use only.** These chord charts come from Oren Mustaki's book and are included for this free, non-commercial prototype. **The author's permission is still pending.** The library must be removed (`public/he/` and `tools/hebrew_library/source/`), or permission obtained, before any commercial use or wider distribution. The credit appears under the "עברית" section and in the player for every song from the book, together with its page number.

**In the app:**
- Hebrew songs show up in the normal Songs search, mixed into the local results.
- A "עברית" (Hebrew) browse section has two tabs: **אמנים א–ת** (artists A–ת) and **אמנים פופולריים** (popular artists, the 40 with the most songs in the book).
- A song credited to several performers ("מתי כספי, שלמה גרוניך") is listed under each of them.
- Nothing loads until you search or open the section: first `he/index.json` (about 80 KB), then one 100-song file when you open a song. Opened songs are kept on the device, so favorites work offline.

**Data pipeline:** `tools/hebrew_library/build_hebrew.py` reads `source/hebrew_chords_raw.json` and writes `public/he/`. CI rebuilds it and fails if the committed output is out of date.

The build:
- **Cleans titles and artists.** It fixes broken comma spacing in multi-artist names, strips leading dots, splits the one merged entry ("Let love in" / כנסיית השכל), and unifies artist spelling variants (שם-טוב לוי → שם טוב לוי).
- **Converts Israeli chord-book notation** to standard symbols:
  - `G4` → `Gsus4`, `D2` → `Dsus2`, `G47` → `G7sus4`, `D94` → `D9sus4`
  - `C7+` → `C7#5`, `D5+` → `D+`, `M7` → `maj7`, `°` → `dim`
  - A few rare symbols map to their nearest playable chord: `Am6+` → `Am6`, `F#m74` → `F#m11`, `Am4` → `Am`, `Em79+` → `Em9`, `C5-` → `C`.
  - Every conversion is listed in `tools/hebrew_library/build_report.json`.
- **Labels sections by playing order.** The most repeated block is **פזמון**, and the other blocks are **בית 1, בית 2…**. Identical blocks share a name, and a song with a single block is **שיר**.
- **Gives every chord 4 beats.** The book has no timing, so strum-count or manual mode fits best.

## Chordonomicon song index

The Songs tab also searches about **430,000 chord progressions** from the [Chordonomicon](https://huggingface.co/datasets/ailsntua/Chordonomicon) dataset. The index is static, sharded JSON served from GitHub Pages; there is no backend.

> **License: CC BY-NC 4.0 (non-commercial).** The Chordonomicon data may only be used non-commercially and with attribution. **The Chordonomicon index must be replaced before any commercial use of this app.** That means removing `dist/cx` from the deploy and dropping the resolver workflow, or swapping in a commercially licensed source. The app code itself is unaffected.
>
> Kantarelis, S., Thomas, K., Lyberatos, V., Dervakos, E., & Stamou, G. (2024). *CHORDONOMICON: A Dataset of 666,000 Songs and their Chord Progressions.* arXiv:2410.22046. https://doi.org/10.48550/arXiv.2410.22046

The attribution also appears in the app, under the song library and in the player for dataset songs, and in `cx/ATTRIBUTION.txt` on the deployed site.

**In the app:** typing 2 or more letters in the Songs search shows a "מהמאגר" (from the index) list under the local results.
- Search downloads one title file and one artist file for the most specific word in the query. Matching is by word prefix on title and artist.
- Opening a song downloads one file of song bodies. The song is then kept on the device, so favorites work offline.
- Dataset songs open in **strum-count** mode by default; each dataset song remembers its own mode.
- The dataset has no chord durations, so every chord counts as 4 beats. The key is estimated from the chords.

**Browse (no search needed):** under the local songs, the Songs tab has a **דפדוף במאגר** (browse the index) section. The "דפדוף במאגר ↓" chip jumps to it. It has three tabs:
- **Artists A–Z:** letter chips. "The" is ignored, so The Beatles is under B. Tap a letter for its artists with song counts, then an artist for their songs.
- **Genre and decade:** chips for 12 genres and for decades (before 1950, then 1950s–2020s). Pick either or both. Songs come 200 at a time, artists with the most songs first, with a "more" button for the next page. Songs without a dataset `main_genre` get one inferred from their detailed genre tags where they clearly match; the rest appear only under decades.
- **Popular:** the 200 artists with the most songs in the index.

Local songs and favorites stay at the top of the tab. Nothing is pre-loaded: each list is one small static file, fetched only when you open it.

**How the index is produced** (`tools/chord_index/`, Python standard library only):

| Step | Where | What |
| --- | --- | --- |
| Name resolution | `.github/workflows/chord-names.yml` → `resolve_names.py` | The dataset has Spotify IDs but no names. Every 6 hours, a run resolves IDs to titles and artist names via Spotify oEmbed, politely: about 6 requests/second, 4 in parallel, backing off and slowing down on throttling, with retries. Progress is kept in the **GitHub Actions cache** (`chord-names-*`); the name list is never committed. Artists with the most songs are resolved first. |
| Index build | `pages.yml` → `build_index.py` | On every deploy (and after every resolver run), the dataset CSV (pinned revision, cached) and the latest name list produce `dist/cx/`. |

The build:
- converts chords (`Fsmin` → `F#m`, `no3d` → `5`, `add13` → `6`, and `Cssus4` → `C#sus4`, where `s` means sharp but not inside "sus") and sections (`<verse_2>` → "Verse 2")
- strips release suffixes from titles ("– Remastered 2009")
- keeps one transcription per title and artist (the longest)
- stores each repeated section pattern once
- does **not** publish Spotify IDs

Layout of `dist/cx/`:
- `manifest.json`: counts, the build stamp, and how deep busy prefixes are split
- `c/<n>.json`: song bodies, 400 per file (about 15 KB gzipped each)
- `b/`: browse files
  - `al/<hex letter>.json`: the artists for one letter
  - `ar/<n>.json`: song lists, 50 artists per file
  - `popular.json`: the top 200 artists
  - `facets.json`: genre and decade counts
  - `f/<hex "genre|decade">/<page>.json`: 200 songs per page, about 3 KB gzipped
  - In total about 60 MB at full coverage.
- `t/<hex prefix>.json`, `a/<hex prefix>.json`: search files keyed by the first letters of each word in titles and artists. Busy prefixes are split deeper. Typical files are about 1 KB gzipped; the largest ("love") is about 200 KB. Common words such as "the" and "you" are not indexed.
- In total about 220 MB at full coverage, within the GitHub Pages limits.

Shard URLs carry `?v=<build>`. The service worker caches the files that have been used (manifest network-first, shards cache-first) and never pre-loads the whole index.

Run it locally:

```bash
curl -L -o data/chordonomicon_v2.csv https://huggingface.co/datasets/ailsntua/Chordonomicon/resolve/main/chordonomicon_v2.csv
python3 tools/chord_index/resolve_names.py --csv data/chordonomicon_v2.csv --state data/names.jsonl --limit 500
npm run build && python3 tools/chord_index/build_index.py --csv data/chordonomicon_v2.csv --names data/names.jsonl --out dist/cx
npm run preview
python3 -m unittest tools/chord_index/test_common.py
```

(`data/` is git-ignored.)

## Deploy to GitHub Pages (default)

The workflow `.github/workflows/pages.yml` runs on every push to `main`, except pushes that only change `firmware/` or Markdown files. You can also start it by hand from the Actions tab. It runs `npm ci`, `npm test` and `npm run build`, then publishes `dist/` to GitHub Pages.

**URL:** https://avivvax.github.io/midi-guitar/

Production builds use Vite `base: '/midi-guitar/'`, so the following all resolve under the repo sub-path:
- assets
- the PWA manifest (`start_url` and `scope` = `/midi-guitar/`)
- the service worker (scope `/midi-guitar/`)

`npm run dev` still serves from `/`. `npm run preview` serves the build at http://localhost:4173/midi-guitar/.

If you rename the repo, update `PAGES_BASE` in `vite.config.ts`.

One-time repo setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

Pages serves over HTTPS, which Web Bluetooth and Web Serial require. Open the URL in Chrome on Android and choose **Install app** / **Add to Home screen**.

## Deploy to Firebase Hosting (alternative)

`firebase.json` is still set up: it serves `dist/` with an SPA rewrite, `sw.js` with no-cache, and immutable cached assets. Firebase serves from the domain root, so this path builds with `--base /`.

```bash
npm install -g firebase-tools     # once
firebase login
firebase use --add                # pick or create the Firebase project; this writes .firebaserc
npm run deploy:firebase           # = vite build --base / && firebase deploy --only hosting
```

## Project layout

```
firmware/  ESP32-S3 BLE-MIDI firmware (Arduino) – see firmware/README.md and firmware/SETUP.md (Hebrew)
src/
  input/   types, strumDetector (+tests), serial, bleMidi, webMidi, keyboard, midiMapping (+tests), configProtocol (+tests)
  instruments/  registry (82 instruments as data), mapping (physical strings → courses, chord styles, key re-tuning), shapes, sounds (synth presets), samples (+tests)
  music/   theory: notes, tunings, chords, voicings, keys (+tests)
  song/    chord symbols, chord-sheet parser, advance logic, library, session/metronome, auto-strum patterns + scheduler, Chordonomicon index client (+tests)
tools/chord_index/  name resolver + static index builder for the Chordonomicon dataset (Python, stdlib)
tools/hebrew_library/  builder for the built-in Hebrew library (source JSON → public/he/)
tools/samples/  fetch_samples.py – downloads and re-encodes the instrument samples (public/samples/, see LICENSES.md)
  audio/   engine (voices, presets, samples, tremolo, sympathetic strings, drone, reverb), karplus, bowed, sampleBank, midiOut
  state/   zustand store (persisted settings)
  ui/      Connect, Play, Settings (+ Calibration), InstrumentPicker, Debug, SignalMeter, StringsView, ChordDiagram
  controller.ts   glue: transports → music → audio, live meters, log, latency
```

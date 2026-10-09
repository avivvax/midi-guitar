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
npm test             # unit tests: strum detector, BLE-MIDI parser, voicings, Karplus-Strong
npm run build        # typecheck + production build into dist/ (with service worker)
npm run preview      # serve dist/ on http://localhost:4173
```

To test on a phone from the dev server, use `npm run dev -- --host` and open it through an HTTPS tunnel. Plain `http://<lan-ip>` is not a secure context, so Bluetooth and Serial are disabled there.

## Screens

| Screen | Purpose |
| --- | --- |
| **חיבור / Connect** | Pick a transport. Shows the connection status and a live 6-bar signal meter. |
| **נגינה / Play** | 8-slot chord palette (thumb zone), current chord with its diagram, capo −/+, chord/free mode, instrument, and 6 animated strings. Tap a string to pluck it, or drag across the strings to strum. |
| **הגדרות / Settings** | Tuning (presets plus a custom per-string editor), key, chord editor (filter to chords in the key), volume, reverb, MIDI out. |
| **דיבאג / Debug** | Scope of the per-string signals with the threshold line, live-tunable detector parameters, strum→sound latency, and an event log. |

Settings are saved in `localStorage`.

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
| Characteristic UUID | `7772E5DB-3868-4112-A1A9-F2669D106BF3` (notify) |
| Advertised name | anything. The picker filters by service, not by name. |

| Message | Meaning |
| --- | --- |
| MIDI channel 1–6 | string 0–5 (channel 1 = low E, channel 6 = high e) |
| **Note On**, velocity 1–127 | **strum** on that string, velocity = v/127. The note number is ignored because the app decides the pitch. The firmware in `firmware/` sends note 60. |
| Note On velocity 0 / Note Off | ignored (the strings ring out naturally). The firmware sends Note Off 50 ms after each Note On. |
| **CC 20**, value 0–12 | **fret** pressed on that string (0 = open / nothing touched) |
| **CC 20**, value 127 | string **damped/muted** (`fret: null`). A strum then plays a percussive click. |

Recommendations:
- Send CC 20 when the fret changes, **before** the Note On of a strum that uses it.
- Several messages per BLE packet, with running status, are fine.
- Send fret updates for every string, even in chord mode. The app ignores them there.

Example packet: strum string 3 (channel 3) with velocity 100, after reporting fret 5:
```
80 80 B2 14 05   80 92 32 64
hdr ts CC20=5    ts NoteOn ch3 note 50 vel 100
```

## Music engine

- **Tunings:** Standard, Drop D, DADGAD, Open G, half-step down, and a custom per-string editor.
- **Software capo** 0–7. Like a real capo, it transposes the *shape*: the palette chord "C" with capo 2 sounds as D, and the Play screen shows "sounds D".
- **Chords:** maj, m, 7, maj7, m7, sus2, sus4, dim, aug, 5 (power).
  - Standard tuning uses hand-written open shapes, then movable E- and A-shape barres.
  - Other tunings use a search over playable voicings: ≤4-fret span, ≤4 fingers (barre aware), bass note = root, all required tones, and muted strings respected.
- **Key selector:** "only chords in the key" filters the editor to chords whose notes are all in the scale. "מלא פלטה מהסולם" (fill palette from key) fills the 8 slots.
- **Chord mode:** strumming string *i* plays string *i*'s note in the selected chord. Fret events are ignored.
- **Free mode:** pitch per string = tuning + capo + the last fret reported by the neck.
- Strumming a muted string (`x` in the voicing, or `fret: null`) plays a percussive click.

## Audio engine

- `AudioContext({ latencyHint: 'interactive' })` is created and resumed on the first tap or key press.
- One pre-allocated voice per string (filter + gain). A retrigger fades the previous note out over 12 ms, which works as a clean note-off.
- **Acoustic / Clean electric / Bass / Distorted** use extended Karplus-Strong: pick position, stretch, fractional-delay all-pass tuning, and velocity-dependent excitation. Buffers are rendered offline and cached (LRU), and the current chord's notes are pre-rendered when it is selected.
  - Electric adds a lowpass and a light chorus.
  - Bass plays one octave down.
  - Distorted adds a tanh waveshaper (4× oversampling) and a cabinet-style filter.
- **Synth lead:** two detuned saws through a resonant lowpass with a filter envelope.
- Velocity controls both gain and brightness (the per-voice lowpass cutoff).
- Master volume and a limiter. The reverb send uses a convolver with a generated impulse response.
- **MIDI out (optional):** Settings → MIDI Out mirrors notes to a Web MIDI output, with channel = string + 1, so a DAW can record them.

## Latency

Debug → "השהיה" (latency) shows:
- **JS processing:** from the moment the input event arrives (serial chunk, BLE notification, MIDI message or key) until the audio source is started.
- **Audio output:** `baseLatency + outputLatency` reported by the browser.
- **Total (est.):** the sum of the two. It does not include the BLE connection interval or the serial peak window (6 ms by default).

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
  input/   types, strumDetector (+tests), serial, bleMidi, webMidi, keyboard, midiMapping (+tests)
  music/   theory: notes, tunings, chords, voicings, keys (+tests)
  audio/   engine (voices, instruments, reverb), karplus (+tests), midiOut
  state/   zustand store (persisted settings)
  ui/      Connect, Play, Settings, Debug, SignalMeter, StringsView, ChordDiagram
  controller.ts   glue: transports → music → audio, live meters, log, latency
```

# Licenses and attribution

Third-party content shipped with the app. The app's own code (including every
synthesised instrument sound) is original to this repository.

## Instrument samples – `public/samples/`

| | |
| --- | --- |
| Source | **FluidR3_GM** General MIDI SoundFont by **Frank Wen** (Fluid Release 3) |
| Rendering used | Per-note MP3 renders from [gleitz/midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts) (`FluidR3_GM/`) |
| License | **Creative Commons Attribution 3.0** ([CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)), as stated for the renders by midi-js-soundfonts. The original FluidR3_GM.sf2 is distributed under the MIT license (e.g. Debian `fluid-soundfont`). |
| Changes | Every 3rd semitone only, downmixed to mono, re-encoded to 64 kb/s MP3, trimmed to 3 s (4 s for bowed sets) with a fade-out – `tools/samples/fetch_samples.py`. |
| Attribution in the app | Settings → Audio ("דגימות: FluidR3_GM …") and this file. |

Sets and the instruments that use them (`src/instruments/sampleSets.json`, `src/instruments/registry.ts`):

| Set | GM instrument | Used by |
| --- | --- | --- |
| steel | acoustic_guitar_steel | acoustic, 12-string, baritone guitar |
| nylon | acoustic_guitar_nylon | classical guitar |
| eclean | electric_guitar_clean | electric clean, 7-string |
| eod | overdriven_guitar | electric overdrive |
| edist | distortion_guitar | electric distortion |
| bass-finger | electric_bass_finger | bass 4/5/6 |
| bass-fretless | fretless_bass | fretless bass |
| bass-ac | acoustic_bass | guitarrón (approximation) |
| violin / viola / cello / contrabass | same names | violin, viola, cello, double bass |
| fiddle | fiddle | hardanger fiddle (approximation) |
| harp | orchestral_harp | lever harp, pedal harp |
| sitar | sitar | sitar |
| banjo | banjo | 5-string banjo, tenor banjo, banjolele |
| shamisen | shamisen | shamisen |
| koto | koto | koto |
| dulcimer | dulcimer | hammered dulcimer |

All other instruments use synthesised presets (`src/instruments/sounds.ts`) and
need no license.

## Other data

- **Chordonomicon** song index – CC BY-NC 4.0, non-commercial only. See README → "Chordonomicon song index".
- **"ספר האקורדים הישראלי"** (Oren Mustaki) – non-commercial prototype use, permission pending. See README → "Built-in Hebrew library".

## Code dependencies

npm packages (React, Zustand, Vite, vite-plugin-pwa, Vitest …) are under their own
licenses (MIT unless noted in `node_modules/<package>/LICENSE`); they are bundled
into the build output.

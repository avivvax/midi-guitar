# MIDI Guitar firmware (ESP32-S3)

Turns the 6-piezo guitar into a standard **BLE-MIDI** device called **"MIDI Guitar"**. There is no fretboard yet, so it only sends strums. The protocol matches the "BLE-MIDI mapping" section of the app README.

Instructions in Hebrew for building and flashing in Arduino IDE: **[SETUP.md](SETUP.md)**.

## Build

| Setting | Value |
| --- | --- |
| Board package | **esp32 by Espressif Systems**, 3.x (tested to compile with 3.3.12) |
| Board | **ESP32S3 Dev Module** |
| USB CDC On Boot | **Enabled** if you use the board's native USB port (recommended), otherwise Disabled |
| PSRAM | the module's type if it has PSRAM (N16R8 → OPI PSRAM, N8R2 → QSPI PSRAM), otherwise Disabled. The firmware doesn't need PSRAM. |
| Library | **NimBLE-Arduino** by h2zero, 2.x (tested with 2.5.1) |

Why not lathoub's BLE-MIDI library? Its NimBLE transport (v2.2) uses the NimBLE-Arduino 1.x callback signatures, so with the current NimBLE 2.x the connect callbacks never fire. It also hides the connection handle that's needed to request a 7.5 ms connection interval. BLE-MIDI is small, so `midi_guitar.ino` implements it directly: one service, one characteristic, and timestamped packets.

CI (`.github/workflows/firmware.yml`) runs the detector unit tests on the host and compiles the sketch with arduino-cli. To run the tests locally:

```bash
g++ -std=c++17 -Ifirmware/midi_guitar firmware/test/test_detector.cpp -o t && ./t
```

## Pins (edit `config.h`)

| Signal | Default GPIO |
| --- | --- |
| String 1 (low E) … string 6 (high e) piezos | 1, 2, 3, 4, 5, 6 |
| Reference piezo (body), optional | 7 (`REF_PIN = -1` to disable) |

All pins must be ADC1 pins (GPIO 1–10 on the S3), because ADC2 is unavailable while Bluetooth is on. Wire each piezo with its + lead to the pin and − to GND, a 1 MΩ resistor from pin to GND, and a clamp diode from pin to 3.3 V.

## Behaviour

- **Sampling:** all piezos at 2 kHz. Scheduling uses `micros()` in `loop()`, with no `delay()`.
- **Detection (`StrumDetector.h`, defaults in `config.h`), per string:**
  - a slow baseline EMA, frozen while a hit is in progress; the signal is the piezo minus its baseline, times the string's `gain` (default 1)
  - a rising edge through the trigger threshold (`TRIGGER` = 0.12 of the ADC range = 491 counts) opens a 2 ms peak-hold window (`PEAK_HOLD_MS`)
  - during the window it tracks the string's own peak and the loudest neighbouring string or reference piezo
  - the hit is rejected if a neighbour (× `nb`) or the reference (× `ref`) peaked higher
  - otherwise velocity = `1 + 126 · ((peak − th) / (fs − th))^curve`, always 1–127 (never 0, which would be a Note Off)
  - for 50 ms after a hit (`REFRACTORY_MS`) every reading on that string is ignored, which stops piezo rebound and crosstalk from triggering twice
  - after that, the string re-arms only once the signal falls below `th × rel` (`REARM_RATIO`, default 0.5)
  - a low reading never stops a note; it only re-arms the string
  - every trigger is logged on Serial: `# hit string 3 peak 1210 (0.30) vel 64`
  - **Saved settings reset after updating to this version** (NVS magic `MGD3`), so the new defaults take effect.
- **MIDI:** Note On on channel = string number (1 = low E), note 60. **The piezo only starts notes:** the Note Off is sent by a timer, `NOTE_OFF_MS` (default 50 ms), or just before a new strike on the same string. A falling reading never ends a note, because a piezo gives an impact spike and then rings and decays. Strums detected in the same sample go out in one BLE notification. The web app **ignores Note Off**, so strings sustain there until they decay or are re-plucked; the Note Off is harmless and keeps other MIDI hosts from hanging notes. Only CC 20 = 127 (mute) cuts a note in the app.
- **Calibration over BLE:** the app writes Control Changes on MIDI channel 16 to the BLE-MIDI characteristic: thresholds, release, neighbour ratio, per-string gain, save, reset, and a monitor switch that makes the firmware stream peak levels (CC 40–45 every 50 ms) and dump its settings. The full table is in the main `README.md` ("Calibration protocol"); the code is `ConfigProtocol.h`, and the BLE-MIDI parser is `BleMidiParse.h`. Writes are queued from the BLE task into `loop()`, and changes apply live. They are saved to NVS only on CC 30 = 127 ("שמור לגיטרה" in the app). Notifications are capped at the negotiated MTU − 3 bytes.
- **BLE:**
  - advertises the BLE-MIDI service `03B80E5A-EDE8-4B33-A751-6CE34EC4C700`, with the name in the scan response
  - on connect, requests a 7.5 ms connection interval (min = max = 6 × 1.25 ms, latency 0). `stats` shows what the phone granted.
  - re-advertises after a disconnect
- **Serial:**
  - one line per sample: `v1 v2 v3 v4 v5 v6 [ref]`, space-separated raw 12-bit ADC values, reference last. The web app's USB Serial mode and Debug screen read these lines.
  - lines are dropped rather than blocking if the port can't keep up. The native USB port keeps up easily; a USB-UART bridge at 115200 may drop lines during loud passages.
  - command replies start with `#`, so the app ignores them.

## Serial commands

| Command | Meaning |
| --- | --- |
| `help` | list commands |
| `show` | print settings |
| `th <1-6\|all> <n>` | trigger threshold in ADC counts above the baseline, e.g. `th 3 450` (default `TRIGGER` 0.12 × 4095 = 491) |
| `fs <n>` | peak that maps to velocity 127 (default 2500) |
| `curve <x>` | velocity curve exponent (default 0.7; <1 = more sensitive) |
| `refr <ms>` | refractory time: the string is completely ignored this long after a strike (default `REFRACTORY_MS` 50) |
| `win <ms>` | peak-hold and crosstalk window after the crossing (default `PEAK_HOLD_MS` 2) |
| `nb <x>` | neighbour rejection ratio (default 1.0; 0 = off; lower = more permissive) |
| `ref <x>` | reference rejection ratio (default 1.0; 0 = off) |
| `alpha <x>` | baseline tracking speed (default 0.002) |
| `rel <x>` | re-arm ratio 0.05–1: the string re-arms below threshold × x (default `REARM_RATIO` 0.5; lower = fewer double triggers) |
| `gain <1-6\|all> <x>` | per-string signal gain 0.25–4 (default 1) |
| `raw <n>` | raw stream every n samples (default 1; 0 = off, which prints `# hit` / `# reject` lines instead) |
| `test <1-6\|all>` | send a test strum over BLE |
| `stats` | achieved sample rate, worst-case processing time, dropped lines, BLE interval |
| `base` | current baselines |
| `reset` | factory defaults |

Every serial change is saved to NVS straight away and survives power cycles. Changes from the app are saved only when you press "שמור לגיטרה".

**Settings reset after updating to this version.** The saved-settings layout gained `rel` and the per-string gains, so the NVS magic changed to `MGD2`. The first boot after flashing ignores the old saved settings and starts from the defaults. Re-tune once, from the app or the serial monitor.

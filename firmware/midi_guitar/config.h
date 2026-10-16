// ============================================================================
//  MIDI Guitar – hardware configuration. This is the only file you normally edit.
// ============================================================================
#pragma once
#include <stdint.h>

// Piezo inputs, string 1 (low E) .. string 6 (high e).
// Must be ADC1 pins (on the ESP32-S3: GPIO 1–10). ADC2 does not work while
// Bluetooth is on.
static const uint8_t PIEZO_PINS[6] = {1, 2, 3, 4, 5, 6};

// Optional reference piezo glued to the guitar body (crosstalk / knock
// rejection). Set to -1 if not fitted.
static const int8_t REF_PIN = 7;

// Bluetooth name shown in the phone / Chrome device picker.
#define DEVICE_NAME "MIDI Guitar"

// Sampling rate of all piezos together.
#define SAMPLE_HZ 2000

// MIDI note sent with every strum (the app ignores it and picks the pitch).
#define STRUM_NOTE 60

// ---- Strum detection ---------------------------------------------------------
// Rule: the piezo only STARTS notes. A note ends on the NOTE_LEN_MS timer (or
// when the same string is struck again), never because the reading dropped.
// These are the defaults; "th" / "refr" / "rel" over Serial and the app's
// calibration screen change them live.

// Full scale of the ADC (12-bit). TRIGGER is a fraction of it.
#define ADC_MAX 4095
// Reading (0..1 of ADC_MAX, above the resting level) that starts a note.
// Higher = needs a harder strike, fewer false/crosstalk notes.
#define TRIGGER 0.12f
// After crossing TRIGGER, keep reading this long and use the highest value as
// the strike strength (velocity 1..127).
#define PEAK_HOLD_MS 2
// After a trigger, ignore the string completely this long (piezo rebound,
// crosstalk). Raise it if one strike plays twice.
#define REFRACTORY_MS 50
// The string re-arms only once the reading falls below TRIGGER × this.
#define REARM_RATIO 0.5f
// How long after the Note On the Note Off is sent (a new strike on the same
// string sends it sooner). Raise it if notes cut off in your MIDI app.
#define NOTE_LEN_MS 2000

// Requested BLE connection interval in units of 1.25 ms (6 = 7.5 ms, the
// minimum the spec allows). The phone may grant a longer one.
#define BLE_CONN_INTERVAL 6

// Serial Monitor speed. The native USB port ignores it, but set the Serial
// Monitor to the same value anyway.
#define SERIAL_BAUD 115200

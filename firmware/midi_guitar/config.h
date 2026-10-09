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

// How long after the Note On the Note Off is sent.
#define NOTE_OFF_MS 50

// Requested BLE connection interval in units of 1.25 ms (6 = 7.5 ms, the
// minimum the spec allows). The phone may grant a longer one.
#define BLE_CONN_INTERVAL 6

// Serial Monitor speed. The native USB port ignores it, but set the Serial
// Monitor to the same value anyway.
#define SERIAL_BAUD 115200

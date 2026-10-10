// Minimal BLE-MIDI packet parser (incoming writes from the app) – plain C++ for host tests.
// Handles the header/timestamp bytes, running status and several messages per packet;
// SysEx is skipped. Calls onMessage(status, d1, d2) for every channel message.
#pragma once
#include <stddef.h>
#include <stdint.h>

inline int bleMidiDataLength(uint8_t status) {
  switch (status & 0xF0) {
    case 0xC0:
    case 0xD0:
      return 1;
    case 0xF0:
      return 0;
    default:
      return 2;
  }
}

template <typename F>
void parseBleMidi(const uint8_t* d, size_t n, F onMessage) {
  if (n < 2 || !(d[0] & 0x80)) return;
  uint8_t running = 0;
  size_t i = 1;
  while (i < n) {
    uint8_t b = d[i];
    if (b & 0x80) {  // timestamp-low byte
      if (++i >= n) break;
      b = d[i];
      if (b & 0x80) {  // status byte
        i++;
        if (b == 0xF0) {  // SysEx: skip to "timestamp F7"
          while (i < n && !((d[i] & 0x80) && i + 1 < n && d[i + 1] == 0xF7)) i++;
          i += 2;
          running = 0;
          continue;
        }
        if (b >= 0xF8) continue;  // real-time: no data, running status unchanged
        running = b < 0xF0 ? b : 0;
        if (b >= 0xF0) continue;
      } else if (!running) {
        break;
      }
    } else if (!running) {
      break;
    }
    int len = bleMidiDataLength(running);
    if (i + len > n) break;
    uint8_t d1 = d[i], d2 = len > 1 ? d[i + 1] : 0;
    if ((d1 & 0x80) || (len > 1 && (d2 & 0x80))) break;
    onMessage(running, d1, d2);
    i += len;
  }
}

// Remote configuration over BLE-MIDI – plain C++ (no Arduino dependencies) so it
// can be unit tested on a PC. The app sends Control Change messages on MIDI
// channel 16; the firmware applies them live and replies on the same channel.
//
//   CC 20–25  threshold, strings 1–6      value 0–127 → raw ADC counts (thresholdFromCC)
//   CC 26     release (re-arm) ratio      0–127 → 0.05–1.00
//   CC 27     neighbour-rejection ratio   0–127 → 0.00–2.00 (64 ≈ 1.0)
//   CC 28     per-string gain             0–127 → 0.25–4.0 (64 = 1.0), for the string chosen by CC 29
//   CC 29     select string for CC 28     1–6
//   CC 30     127 = save settings to flash (NVS)
//   CC 31     127 = reset to factory defaults
//   CC 32     127 = calibration monitor on, 0 = off
// Firmware → app (channel 16):
//   current settings as the CCs above (sent when the monitor turns on and after a reset)
//   CC 40–45  peak level per string since the last report, same scale as CC 20–25 (monitor on only)
#pragma once
#include <math.h>
#include <stdint.h>
#include "StrumDetector.h"

#define CFG_CHANNEL_STATUS 0xBF  // Control Change, MIDI channel 16

enum CfgCC : uint8_t {
  CC_THRESHOLD_FIRST = 20,  // ..25
  CC_RELEASE = 26,
  CC_NEIGHBOUR = 27,
  CC_GAIN = 28,
  CC_GAIN_SELECT = 29,
  CC_SAVE = 30,
  CC_RESET = 31,
  CC_MONITOR = 32,
  CC_PEAK_FIRST = 40,  // ..45
};

enum CfgAction : uint8_t { CFG_NONE = 0, CFG_CHANGED, CFG_SAVE, CFG_RESET, CFG_MONITOR_ON, CFG_MONITOR_OFF };

// Threshold scale: quadratic so the low end (where real thresholds live) gets fine steps.
static const float CFG_TH_MIN = 10.0f;
static const float CFG_TH_SPAN = 2000.0f;

inline uint16_t thresholdFromCC(uint8_t v) {
  float x = (v > 127 ? 127 : v) / 127.0f;
  return (uint16_t)lroundf(CFG_TH_MIN + x * x * CFG_TH_SPAN);
}
inline uint8_t ccFromLevel(float level) {
  if (level <= CFG_TH_MIN) return 0;
  float x = sqrtf((level - CFG_TH_MIN) / CFG_TH_SPAN);
  long v = lroundf(x * 127.0f);
  return (uint8_t)(v > 127 ? 127 : v);
}
inline float releaseFromCC(uint8_t v) { return 0.05f + (v > 127 ? 127 : v) / 127.0f * 0.95f; }
inline uint8_t ccFromRelease(float r) { return (uint8_t)lroundf(fminf(fmaxf((r - 0.05f) / 0.95f, 0), 1) * 127); }
inline float neighbourFromCC(uint8_t v) { return (v > 127 ? 127 : v) / 63.5f; }
inline uint8_t ccFromNeighbour(float n) { return (uint8_t)lroundf(fminf(fmaxf(n * 63.5f, 0), 127)); }
inline float gainFromCC(uint8_t v) { return powf(2.0f, ((v > 127 ? 127 : v) - 64) / 32.0f); }
inline uint8_t ccFromGain(float g) {
  long v = lroundf(64 + 32 * log2f(fmaxf(g, 0.01f)));
  return (uint8_t)(v < 0 ? 0 : v > 127 ? 127 : v);
}

struct CfgState {
  uint8_t gainString = 0;  // 0-based string selected by CC 29
};

/** Apply one CC (channel 16) to the parameters. Returns what the caller should do next. */
inline CfgAction applyConfigCC(DetectorParams& p, CfgState& st, uint8_t cc, uint8_t value) {
  if (cc >= CC_THRESHOLD_FIRST && cc < CC_THRESHOLD_FIRST + NUM_STRINGS) {
    p.threshold[cc - CC_THRESHOLD_FIRST] = thresholdFromCC(value);
    return CFG_CHANGED;
  }
  switch (cc) {
    case CC_RELEASE:
      p.releaseRatio = releaseFromCC(value);
      return CFG_CHANGED;
    case CC_NEIGHBOUR:
      p.neighbourRatio = neighbourFromCC(value);
      return CFG_CHANGED;
    case CC_GAIN_SELECT:
      if (value >= 1 && value <= NUM_STRINGS) st.gainString = value - 1;
      return CFG_NONE;
    case CC_GAIN:
      p.gain[st.gainString] = gainFromCC(value);
      return CFG_CHANGED;
    case CC_SAVE:
      return value == 127 ? CFG_SAVE : CFG_NONE;
    case CC_RESET:
      return value == 127 ? CFG_RESET : CFG_NONE;
    case CC_MONITOR:
      return value >= 64 ? CFG_MONITOR_ON : CFG_MONITOR_OFF;
    default:
      return CFG_NONE;
  }
}

/** The CC messages describing the current settings: pairs of (cc, value), returns count. */
inline int configDump(const DetectorParams& p, uint8_t* out, int max) {
  int n = 0;
  auto put = [&](uint8_t cc, uint8_t v) {
    if (n + 2 <= max) {
      out[n++] = cc;
      out[n++] = v;
    }
  };
  for (int i = 0; i < NUM_STRINGS; i++) put(CC_THRESHOLD_FIRST + i, ccFromLevel(p.threshold[i]));
  put(CC_RELEASE, ccFromRelease(p.releaseRatio));
  put(CC_NEIGHBOUR, ccFromNeighbour(p.neighbourRatio));
  for (int i = 0; i < NUM_STRINGS; i++) {
    put(CC_GAIN_SELECT, i + 1);
    put(CC_GAIN, ccFromGain(p.gain[i]));
  }
  return n / 2;
}

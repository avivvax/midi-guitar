// Host tests for ConfigProtocol.h, BleMidiParse.h and the detector's release/gain:
//   g++ -std=c++17 -Imidi_guitar test/test_config.cpp -o t && ./t
#include <cstdio>
#include <vector>
#include "BleMidiParse.h"
#include "ConfigProtocol.h"
#include "StrumDetector.h"

static int failures = 0;
#define CHECK(cond, msg)                                         \
  do {                                                           \
    if (!(cond)) {                                               \
      std::printf("FAIL %s:%d  %s\n", __FILE__, __LINE__, msg); \
      failures++;                                                \
    }                                                            \
  } while (0)

struct Msg { uint8_t s, a, b; };

static std::vector<Msg> parse(std::vector<uint8_t> pkt) {
  std::vector<Msg> out;
  parseBleMidi(pkt.data(), pkt.size(), [&](uint8_t s, uint8_t a, uint8_t b) { out.push_back({s, a, b}); });
  return out;
}

static int hits(StrumDetector& d, const DetectorParams& p, std::vector<int> shape, int string = 0) {
  int n = 0;
  for (int amp : shape) {
    uint16_t v[6] = {40, 40, 40, 40, 40, 40};
    v[string] = (uint16_t)(40 + amp);
    Hit h[6];
    Reject r[6];
    uint8_t nh, nr;
    d.process(p, v, -1, h, nh, r, nr);
    n += nh;
  }
  return n;
}

int main() {
  // --- mappings -----------------------------------------------------------
  CHECK(thresholdFromCC(0) == 10, "threshold min");
  CHECK(thresholdFromCC(127) == 2010, "threshold max");
  CHECK(thresholdFromCC(32) > 100 && thresholdFromCC(32) < 150, "quadratic low end");
  // Round trip is exact except at the very bottom, where whole ADC counts collide (10, 10, 10, 11…).
  for (int v = 0; v <= 127; v++) {
    int back = ccFromLevel(thresholdFromCC(v));
    CHECK(v < 8 ? (back >= v - 3 && back <= v + 3) : back == v, "threshold round trip");
  }
  CHECK(ccFromLevel(5000) == 127 && ccFromLevel(0) == 0, "level clamp");
  CHECK(gainFromCC(64) == 1.0f, "gain unity at 64");
  CHECK(gainFromCC(0) > 0.24f && gainFromCC(0) < 0.26f, "gain min 0.25");
  CHECK(gainFromCC(127) > 3.8f && gainFromCC(127) < 4.0f, "gain max ~3.9");
  for (int v = 0; v <= 127; v++) {
    CHECK(ccFromGain(gainFromCC(v)) == v, "gain round trip");
    CHECK(ccFromRelease(releaseFromCC(v)) == v, "release round trip");
    CHECK(ccFromNeighbour(neighbourFromCC(v)) == v, "neighbour round trip");
  }
  CHECK(releaseFromCC(127) == 1.0f, "release max 1.0");

  // --- applying CCs -------------------------------------------------------
  DetectorParams p = defaultParams();
  CfgState st;
  CHECK(applyConfigCC(p, st, 22, 64) == CFG_CHANGED && p.threshold[2] == thresholdFromCC(64), "CC22 = string 3");
  CHECK(applyConfigCC(p, st, 29, 5) == CFG_NONE && st.gainString == 4, "CC29 selects string 5");
  CHECK(applyConfigCC(p, st, 28, 96) == CFG_CHANGED && p.gain[4] > 1.9f && p.gain[0] == 1.0f, "CC28 sets selected gain");
  CHECK(applyConfigCC(p, st, 29, 9) == CFG_NONE && st.gainString == 4, "invalid string ignored");
  CHECK(applyConfigCC(p, st, 26, 0) == CFG_CHANGED && p.releaseRatio < 0.06f, "release");
  CHECK(applyConfigCC(p, st, 27, 127) == CFG_CHANGED && p.neighbourRatio == 2.0f, "neighbour");
  CHECK(applyConfigCC(p, st, 30, 127) == CFG_SAVE, "save");
  CHECK(applyConfigCC(p, st, 30, 1) == CFG_NONE, "save needs 127");
  CHECK(applyConfigCC(p, st, 31, 127) == CFG_RESET, "reset");
  CHECK(applyConfigCC(p, st, 32, 127) == CFG_MONITOR_ON && applyConfigCC(p, st, 32, 0) == CFG_MONITOR_OFF, "monitor");
  CHECK(applyConfigCC(p, st, 7, 100) == CFG_NONE, "other CCs ignored");

  uint8_t dump[64];
  int n = configDump(defaultParams(), dump, sizeof(dump));
  CHECK(n == 6 + 2 + 12, "dump size");
  CHECK(dump[0] == 20 && dump[1] == ccFromLevel(defaultParams().threshold[0]), "dump starts with thresholds");

  // --- BLE-MIDI parsing ---------------------------------------------------
  auto m = parse({0x80, 0x80, 0xBF, 20, 64, 0x81, 0xBF, 29, 3, 28, 80});
  CHECK(m.size() == 3, "three messages");
  CHECK(m.size() == 3 && m[0].s == 0xBF && m[0].a == 20 && m[0].b == 64, "first CC");
  CHECK(m.size() == 3 && m[2].s == 0xBF && m[2].a == 28 && m[2].b == 80, "running status without timestamp");
  m = parse({0x80, 0x80, 0xF0, 1, 2, 0x81, 0xF7, 0x82, 0xBF, 30, 127});
  CHECK(m.size() == 1 && m[0].a == 30, "sysex skipped");
  CHECK(parse({0x10, 0xBF, 20, 1}).empty(), "no header → ignored");
  CHECK(parse({0x80, 0x80, 0xBF, 20}).empty(), "truncated message ignored");

  // --- detector: release ratio and gain ---------------------------------
  {
    // Signal hovers just under the threshold after a hit, then rises again (no full decay).
    DetectorParams q = defaultParams();
    for (int i = 0; i < NUM_STRINGS; i++) q.threshold[i] = 120;
    q.windowMs = 5;
    q.releaseRatio = 1.0f;
    q.refractoryMs = 5;
    std::vector<int> shape(20, 0);
    std::vector<int> wobble = {300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 100, 100, 100, 100, 100, 100, 100, 100,
                               300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 0, 0, 0};
    shape.insert(shape.end(), wobble.begin(), wobble.end());
    StrumDetector a(2000);
    CHECK(hits(a, q, shape) == 2, "release 1.0: re-arms below threshold (as before)");
    q.releaseRatio = 0.3f;  // must fall under 36 before re-arming
    StrumDetector b(2000);
    CHECK(hits(b, q, shape) == 1, "release 0.3: no retrigger while still ringing");
  }
  {
    DetectorParams q = defaultParams();
    q.threshold[0] = 120;
    std::vector<int> soft(30, 0);
    soft.insert(soft.end(), {80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 0, 0});
    StrumDetector a(2000);
    CHECK(hits(a, q, soft) == 0, "soft pluck below threshold");
    q.gain[0] = 2.0f;
    StrumDetector b(2000);
    CHECK(hits(b, q, soft) == 1, "gain 2 lifts it over the threshold");
    CHECK(b.signal(0) == 0, "signal getter");
  }

  if (failures) {
    std::printf("%d failure(s)\n", failures);
    return 1;
  }
  std::printf("all config/protocol tests passed\n");
  return 0;
}

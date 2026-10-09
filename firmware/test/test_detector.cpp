// Host unit tests for StrumDetector.h:  g++ -std=c++17 -I../midi_guitar test_detector.cpp -o t && ./t
#include <cstdio>
#include <cstdlib>
#include <vector>
#include "StrumDetector.h"

static int failures = 0;
#define CHECK(cond, msg)                                         \
  do {                                                           \
    if (!(cond)) {                                               \
      std::printf("FAIL %s:%d  %s\n", __FILE__, __LINE__, msg); \
      failures++;                                                \
    }                                                            \
  } while (0)

static const uint32_t HZ = 2000;
static const uint16_t BASE = 40;

struct Run {
  std::vector<Hit> hits;
  std::vector<Reject> rejects;
};

// shape[k][s] = amplitude above BASE on string s at sample k; ref[k] likewise.
static Run feed(StrumDetector& d, const DetectorParams& p, const std::vector<std::vector<int>>& shape,
                const std::vector<int>& ref = {}, int tail = 40) {
  Run r;
  size_t n = shape.size() + tail;
  for (size_t k = 0; k < n; k++) {
    uint16_t v[6];
    for (int s = 0; s < 6; s++) v[s] = BASE + (k < shape.size() ? shape[k][s] : 0);
    int32_t rv = BASE + (k < ref.size() ? ref[k] : 0);
    Hit hits[6];
    Reject rej[6];
    uint8_t nh, nr;
    d.process(p, v, rv, hits, nh, rej, nr);
    for (int i = 0; i < nh; i++) r.hits.push_back(hits[i]);
    for (int i = 0; i < nr; i++) r.rejects.push_back(rej[i]);
  }
  return r;
}

static void settle(StrumDetector& d, const DetectorParams& p) { feed(d, p, {}, {}, 200); }

static std::vector<std::vector<int>> pulse(int s, std::vector<int> amps) {
  std::vector<std::vector<int>> out;
  for (int a : amps) {
    std::vector<int> f(6, 0);
    f[s] = a;
    out.push_back(f);
  }
  return out;
}

int main() {
  const DetectorParams p = defaultParams();

  {  // single hit, velocity from peak, reported after the window
    StrumDetector d(HZ);
    settle(d, p);
    Run r = feed(d, p, pulse(2, {300, 900, 1300, 800, 300}));
    CHECK(r.hits.size() == 1, "one hit");
    CHECK(r.hits.size() == 1 && r.hits[0].string == 2, "string 3");
    CHECK(r.hits.size() == 1 && r.hits[0].peak == 1300, "peak");
    CHECK(r.hits.size() == 1 && r.hits[0].velocity > 40 && r.hits[0].velocity < 127, "velocity mid range");
  }
  {  // velocity bounds and monotonic
    int last = 0;
    for (int amp : {130, 400, 1000, 2000, 3000}) {
      StrumDetector d(HZ);
      settle(d, p);
      Run r = feed(d, p, pulse(0, {amp, amp}));
      CHECK(r.hits.size() == 1, "hit at amp");
      if (r.hits.size() == 1) {
        CHECK(r.hits[0].velocity >= 1 && r.hits[0].velocity <= 127, "1..127");
        CHECK(r.hits[0].velocity >= last, "monotonic");
        last = r.hits[0].velocity;
      }
    }
    CHECK(last == 127, "full scale -> 127");
  }
  {  // refractory 60 ms: second crossing 20 ms later is ignored, 80 ms later counts
    StrumDetector d(HZ);
    settle(d, p);
    auto shape = pulse(1, {800, 800});
    for (int i = 0; i < 40; i++) shape.push_back(std::vector<int>(6, 0));  // 20 ms gap
    auto again = pulse(1, {800, 800});
    shape.insert(shape.end(), again.begin(), again.end());
    CHECK(feed(d, p, shape).hits.size() == 1, "refractory blocks 2nd hit");

    StrumDetector d2(HZ);
    settle(d2, p);
    auto shape2 = pulse(1, {800, 800});
    for (int i = 0; i < 160; i++) shape2.push_back(std::vector<int>(6, 0));  // 80 ms gap
    shape2.insert(shape2.end(), again.begin(), again.end());
    CHECK(feed(d2, p, shape2).hits.size() == 2, "hit after refractory");
  }
  {  // louder neighbour within 5 ms rejects the quieter string
    StrumDetector d(HZ);
    settle(d, p);
    std::vector<std::vector<int>> shape;
    for (int k = 0; k < 6; k++) {
      std::vector<int> f(6, 0);
      f[3] = 1500;
      f[4] = 300;  // crosstalk on string 5
      shape.push_back(f);
    }
    Run r = feed(d, p, shape);
    CHECK(r.hits.size() == 1 && r.hits[0].string == 3, "loud string kept");
    CHECK(r.rejects.size() == 1 && r.rejects[0].string == 4 && r.rejects[0].reason == REJECT_NEIGHBOUR,
          "quiet neighbour rejected");
  }
  {  // non-adjacent strings never reject each other
    StrumDetector d(HZ);
    settle(d, p);
    std::vector<std::vector<int>> shape(4, std::vector<int>(6, 0));
    for (auto& f : shape) {
      f[0] = 1500;
      f[2] = 400;
    }
    CHECK(feed(d, p, shape).hits.size() == 2, "strings 1 and 3 both kept");
  }
  {  // body knock: reference louder -> reject
    StrumDetector d(HZ);
    settle(d, p);
    Run r = feed(d, p, pulse(5, {400, 500, 400}), {900, 1200, 900});
    CHECK(r.hits.empty(), "no hit on knock");
    CHECK(r.rejects.size() == 1 && r.rejects[0].reason == REJECT_REFERENCE, "reference reject");
  }
  {  // reference rejection can be turned off
    DetectorParams q = p;
    q.refRatio = 0;
    StrumDetector d(HZ);
    settle(d, q);
    CHECK(feed(d, q, pulse(5, {400, 500, 400}), {900, 1200, 900}).hits.size() == 1, "ref off");
  }
  {  // slow drift is absorbed by the baseline, no false hits
    StrumDetector d(HZ);
    settle(d, p);
    std::vector<std::vector<int>> shape;
    for (int k = 0; k < 20000; k++) shape.push_back(std::vector<int>(6, k / 200));  // +100 over 10 s
    Run r = feed(d, p, shape);
    CHECK(r.hits.empty(), "no hits from drift");
  }
  {  // per-string threshold
    DetectorParams q = p;
    q.threshold[0] = 1000;
    StrumDetector d(HZ);
    settle(d, q);
    CHECK(feed(d, q, pulse(0, {600, 700})).hits.empty(), "below raised threshold");
    CHECK(feed(d, q, pulse(1, {600, 700})).hits.size() == 1, "other string unaffected");
  }

  if (failures) {
    std::printf("%d failure(s)\n", failures);
    return 1;
  }
  std::printf("all detector tests passed\n");
  return 0;
}

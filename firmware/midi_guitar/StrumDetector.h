// Strum detector – plain C++ (no Arduino dependencies) so it can be unit
// tested on a PC. Time is counted in samples.
#pragma once
#include <stdint.h>
#include <math.h>

#define NUM_STRINGS 6

struct DetectorParams {
  uint32_t magic;               // layout version for NVS
  uint16_t threshold[NUM_STRINGS]; // ADC counts above baseline that trigger a hit
  uint16_t fullScale;           // peak (above baseline) that gives velocity 127
  float curve;                  // velocity curve exponent: <1 more sensitive, >1 harder
  uint16_t refractoryMs;        // minimum time between two hits on one string
  uint16_t windowMs;            // peak / crosstalk comparison window after the crossing
  float neighbourRatio;         // reject if a neighbour peak * ratio > own peak (0 = off)
  float refRatio;               // reject if reference peak * ratio > own peak (0 = off)
  float baselineAlpha;          // baseline tracking speed per sample (slow EMA)
  uint16_t rawEvery;            // print raw values every N samples (0 = off)
};

static const uint32_t PARAMS_MAGIC = 0x4D474431; // "MGD1"

inline DetectorParams defaultParams() {
  DetectorParams p;
  p.magic = PARAMS_MAGIC;
  for (int i = 0; i < NUM_STRINGS; i++) p.threshold[i] = 120;
  p.fullScale = 2500;
  p.curve = 0.7f;
  p.refractoryMs = 60;
  p.windowMs = 5;
  p.neighbourRatio = 1.0f;
  p.refRatio = 1.0f;
  p.baselineAlpha = 0.002f;
  p.rawEvery = 1;
  return p;
}

struct Hit {
  uint8_t string;    // 0..5
  uint8_t velocity;  // 1..127
  uint16_t peak;
};

enum RejectReason : uint8_t { REJECT_NONE = 0, REJECT_NEIGHBOUR, REJECT_REFERENCE };

struct Reject {
  uint8_t string;
  RejectReason reason;
  uint16_t peak;
  uint16_t other;
};

class StrumDetector {
 public:
  explicit StrumDetector(uint32_t sampleHz) : sampleHz_(sampleHz) { reset(); }

  void reset() {
    for (int i = 0; i < NUM_STRINGS; i++) {
      baseline_[i] = -1;
      prev_[i] = 0;
      lastHit_[i] = -1000000;
      windowLeft_[i] = 0;
      peak_[i] = 0;
      otherPeak_[i] = 0;
      otherReason_[i] = REJECT_NONE;
    }
    refBaseline_ = -1;
    now_ = 0;
  }

  int32_t msToSamples(uint32_t ms) const { return (int32_t)((ms * sampleHz_ + 999) / 1000); }

  // Feed one frame. values[0..5] = strings, ref = reference piezo or -1.
  // Writes accepted hits into `hits` (max 6) and rejected ones into `rejects`.
  void process(const DetectorParams& p, const uint16_t* values, int32_t ref,
               Hit* hits, uint8_t& nHits, Reject* rejects, uint8_t& nRejects) {
    nHits = 0;
    nRejects = 0;
    now_++;
    float sig[NUM_STRINGS];
    for (int i = 0; i < NUM_STRINGS; i++) {
      float v = values[i];
      if (baseline_[i] < 0) baseline_[i] = v;
      float s = v - baseline_[i];
      if (s < 0) s = 0;
      sig[i] = s;
    }
    float refSig = 0;
    if (ref >= 0) {
      if (refBaseline_ < 0) refBaseline_ = (float)ref;
      refSig = (float)ref - refBaseline_;
      if (refSig < 0) refSig = 0;
      refBaseline_ += p.baselineAlpha * ((float)ref - refBaseline_);
    }

    for (int i = 0; i < NUM_STRINGS; i++) {
      const float th = p.threshold[i];
      if (windowLeft_[i] > 0) {
        // Inside the comparison window: track own peak and the loudest
        // competitor (neighbours / reference) over the same samples.
        if (sig[i] > peak_[i]) peak_[i] = sig[i];
        trackOthers(p, i, sig, refSig, ref >= 0);
        if (--windowLeft_[i] == 0) decide(p, i, hits, nHits, rejects, nRejects);
      } else {
        // Idle: baseline follows slow drift only while quiet.
        if (sig[i] < th) baseline_[i] += p.baselineAlpha * ((float)values[i] - baseline_[i]);
        bool rising = prev_[i] < th && sig[i] >= th;
        if (rising && now_ - lastHit_[i] >= msToSamples(p.refractoryMs)) {
          lastHit_[i] = now_;
          peak_[i] = sig[i];
          otherPeak_[i] = 0;
          otherReason_[i] = REJECT_NONE;
          trackOthers(p, i, sig, refSig, ref >= 0);
          int32_t w = msToSamples(p.windowMs);
          windowLeft_[i] = w < 1 ? 1 : w;
        }
      }
      prev_[i] = sig[i];
    }
  }

  float baseline(int i) const { return baseline_[i]; }

 private:
  void trackOthers(const DetectorParams& p, int i, const float* sig, float refSig, bool hasRef) {
    if (p.neighbourRatio > 0) {
      for (int j = i - 1; j <= i + 1; j += 2) {
        if (j < 0 || j >= NUM_STRINGS) continue;
        float o = sig[j] * p.neighbourRatio;
        if (o > otherPeak_[i]) {
          otherPeak_[i] = o;
          otherReason_[i] = REJECT_NEIGHBOUR;
        }
      }
    }
    if (hasRef && p.refRatio > 0) {
      float o = refSig * p.refRatio;
      if (o > otherPeak_[i]) {
        otherPeak_[i] = o;
        otherReason_[i] = REJECT_REFERENCE;
      }
    }
  }

  void decide(const DetectorParams& p, int i, Hit* hits, uint8_t& nHits, Reject* rejects, uint8_t& nRejects) {
    const float peak = peak_[i];
    if (otherReason_[i] != REJECT_NONE && otherPeak_[i] > peak) {
      rejects[nRejects++] = {(uint8_t)i, otherReason_[i], (uint16_t)peak, (uint16_t)otherPeak_[i]};
      return;
    }
    const float th = p.threshold[i];
    float span = (float)p.fullScale - th;
    if (span < 1) span = 1;
    float x = (peak - th) / span;
    if (x < 0) x = 0;
    if (x > 1) x = 1;
    int v = 1 + (int)lroundf(126.0f * powf(x, p.curve));
    if (v > 127) v = 127;
    hits[nHits++] = {(uint8_t)i, (uint8_t)v, (uint16_t)peak};
  }

  uint32_t sampleHz_;
  int32_t now_;
  float baseline_[NUM_STRINGS];
  float prev_[NUM_STRINGS];
  int32_t lastHit_[NUM_STRINGS];
  int32_t windowLeft_[NUM_STRINGS];
  float peak_[NUM_STRINGS];
  float otherPeak_[NUM_STRINGS];
  RejectReason otherReason_[NUM_STRINGS];
  float refBaseline_;
};

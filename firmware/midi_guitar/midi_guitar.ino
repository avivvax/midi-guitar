// ============================================================================
//  MIDI Guitar firmware – ESP32-S3, 6 piezos (+ optional reference piezo)
//
//  * Standard BLE-MIDI device ("MIDI Guitar"), implemented directly on
//    NimBLE-Arduino 2.x so we control the connection interval (7.5 ms).
//  * Strum on string N (1 = low E) -> Note On, MIDI channel N, note 60,
//    velocity 1..127; Note Off 50 ms later. (The app ignores Note Off – strings
//    ring until they decay or are re-plucked – but it keeps MIDI tools happy.)
//  * Remote calibration from the app: Control Change on MIDI channel 16
//    (see ConfigProtocol.h), applied live, saved to flash on request.
//  * Serial: one line per sample (~2 ms) of raw ADC values, space separated,
//    reference piezo last – used by the web app's USB Serial mode.
//    Lines starting with '#' are command replies / info.
//  * Tuning over Serial (type "help"), saved to flash (NVS) automatically.
//
//  Board: "ESP32S3 Dev Module". Library: "NimBLE-Arduino" by h2zero (2.x).
//  See SETUP.md (Hebrew) and README.md.
// ============================================================================
#include <Arduino.h>
#include <NimBLEDevice.h>
#include <Preferences.h>
#include "config.h"
#include "StrumDetector.h"
#include "ConfigProtocol.h"
#include "BleMidiParse.h"

#define MIDI_SERVICE_UUID "03B80E5A-EDE8-4B33-A751-6CE34EC4C700"
#define MIDI_CHAR_UUID    "7772E5DB-3868-4112-A1A9-F2669D106BF3"

static const uint32_t SAMPLE_PERIOD_US = 1000000UL / SAMPLE_HZ;

static DetectorParams params;
static StrumDetector detector(SAMPLE_HZ);
static Preferences prefs;

static NimBLEServer* bleServer = nullptr;
static NimBLECharacteristic* midiChar = nullptr;
static volatile bool bleConnected = false;
static volatile uint16_t bleConnHandle = 0xFFFF;
static volatile float bleIntervalMs = 0;
static volatile uint16_t bleMtu = 23;  // ATT MTU; notifications carry at most MTU − 3 bytes

// Config CCs written by the app arrive on the BLE task; they are queued and applied in loop().
static QueueHandle_t cfgQueue = nullptr;
static CfgState cfgState;
static bool monitorOn = false;
static uint32_t monitorLastMs = 0;
static float peakSince[NUM_STRINGS] = {0};
static const uint32_t MONITOR_PERIOD_MS = 50;

// Pending Note Offs, in micros() time; 0 = none.
static uint32_t noteOffAt[NUM_STRINGS] = {0};

// Stats.
static uint32_t statFrames = 0, statLate = 0, statRawDropped = 0, statHits = 0, statRejects = 0;
static uint32_t statWindowStart = 0;
static float statRateHz = 0;
static uint32_t statMaxProcessUs = 0;

// ---------------------------------------------------------------------------
// BLE-MIDI
// ---------------------------------------------------------------------------
// Packet being built during one sample period; sent once per period so a
// chord strummed within the same 0.5 ms goes out in a single notification
// (split into several when it would exceed the link's MTU).
static uint8_t pkt[64];
static uint8_t pktLen = 0;

static void midiFlush();

static void midiQueue(uint8_t status, uint8_t d1, uint8_t d2) {
  if (!bleConnected) return;
  const size_t maxLen = min((size_t)sizeof(pkt), (size_t)(bleMtu > 3 ? bleMtu - 3 : 20));
  if (pktLen && pktLen + 4 > maxLen) midiFlush();
  const uint16_t ts = millis() & 0x1FFF;  // 13-bit millisecond timestamp
  if (pktLen == 0) pkt[pktLen++] = 0x80 | ((ts >> 7) & 0x3F);  // header
  if (pktLen + 4 > maxLen) return;
  pkt[pktLen++] = 0x80 | (ts & 0x7F);  // timestamp
  pkt[pktLen++] = status;
  pkt[pktLen++] = d1 & 0x7F;
  pkt[pktLen++] = d2 & 0x7F;
}

static void midiFlush() {
  if (pktLen > 1 && bleConnected && midiChar) midiChar->notify(pkt, pktLen);
  pktLen = 0;
}

class ServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* server, NimBLEConnInfo& info) override {
    bleConnHandle = info.getConnHandle();
    bleIntervalMs = info.getConnInterval() * 1.25f;
    bleConnected = true;
    // Ask for the shortest interval: min = max = 7.5 ms, no slave latency,
    // 2 s supervision timeout (units of 10 ms).
    server->updateConnParams(info.getConnHandle(), BLE_CONN_INTERVAL, BLE_CONN_INTERVAL, 0, 200);
  }
  void onDisconnect(NimBLEServer*, NimBLEConnInfo&, int) override {
    bleConnected = false;
    bleConnHandle = 0xFFFF;
    bleIntervalMs = 0;
    bleMtu = 23;
    monitorOn = false;
    NimBLEDevice::startAdvertising();
  }
  void onConnParamsUpdate(NimBLEConnInfo& info) override { bleIntervalMs = info.getConnInterval() * 1.25f; }
  void onMTUChange(uint16_t mtu, NimBLEConnInfo&) override { bleMtu = mtu; }
};

// Writes from the app: BLE-MIDI packets. Only channel-16 Control Changes (config) are used.
class MidiCharCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* c, NimBLEConnInfo&) override {
    NimBLEAttValue v = c->getValue();
    parseBleMidi(v.data(), v.length(), [](uint8_t status, uint8_t cc, uint8_t value) {
      if (status != CFG_CHANNEL_STATUS || !cfgQueue) return;
      uint8_t msg[2] = {cc, value};
      xQueueSend(cfgQueue, msg, 0);  // never block the BLE task; drop if full
    });
  }
};

static void bleSetup() {
  NimBLEDevice::init(DEVICE_NAME);
  NimBLEDevice::setPower(9);  // dBm
  bleServer = NimBLEDevice::createServer();
  bleServer->setCallbacks(new ServerCallbacks());
  bleServer->advertiseOnDisconnect(true);

  NimBLEService* svc = bleServer->createService(MIDI_SERVICE_UUID);
  // BLE-MIDI spec: read (returns empty), write without response, notify.
  midiChar = svc->createCharacteristic(
      MIDI_CHAR_UUID, NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::WRITE_NR | NIMBLE_PROPERTY::NOTIFY);
  midiChar->setCallbacks(new MidiCharCallbacks());
  // (The GATT server starts automatically when advertising starts.)

  // The 128-bit service UUID fills most of the 31-byte advertisement, so the
  // name goes into the scan response.
  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  NimBLEAdvertisementData advData;
  advData.setFlags(BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP);
  advData.addServiceUUID(MIDI_SERVICE_UUID);
  NimBLEAdvertisementData scanData;
  scanData.setName(DEVICE_NAME);
  adv->setAdvertisementData(advData);
  adv->setScanResponseData(scanData);
  adv->start();
}

// ---------------------------------------------------------------------------
// Parameters (NVS)
// ---------------------------------------------------------------------------
static void saveParams() { prefs.putBytes("params", &params, sizeof(params)); }

static void loadParams() {
  params = defaultParams();
  DetectorParams stored;
  if (prefs.getBytesLength("params") == sizeof(stored) && prefs.getBytes("params", &stored, sizeof(stored)) == sizeof(stored) &&
      stored.magic == PARAMS_MAGIC) {
    params = stored;
  }
}

static void printParams() {
  Serial.print("# th");
  for (int i = 0; i < NUM_STRINGS; i++) {
    Serial.print(' ');
    Serial.print(params.threshold[i]);
  }
  Serial.printf(" | fs %u | curve %.2f | refr %u ms | win %u ms | nb %.2f | ref %.2f | alpha %.4f | rel %.2f | raw %u\n",
                params.fullScale, params.curve, params.refractoryMs, params.windowMs, params.neighbourRatio,
                params.refRatio, params.baselineAlpha, params.releaseRatio, params.rawEvery);
  Serial.print("# gain");
  for (int i = 0; i < NUM_STRINGS; i++) Serial.printf(" %.2f", params.gain[i]);
  Serial.println();
}

static void printHelp() {
  Serial.println("# Commands (string = 1..6, 1 = low E; 'all' = every string):");
  Serial.println("#   show                 current settings");
  Serial.println("#   th <string|all> <n>  trigger threshold, ADC counts above baseline (e.g. th 3 450)");
  Serial.println("#   fs <n>               peak that gives velocity 127");
  Serial.println("#   curve <x>            velocity curve, 0.3..3 (<1 = more sensitive)");
  Serial.println("#   refr <ms>            refractory time between hits on one string");
  Serial.println("#   win <ms>             crosstalk comparison window");
  Serial.println("#   nb <x>               neighbour rejection ratio (0 = off, 1 = reject if neighbour louder)");
  Serial.println("#   ref <x>              reference piezo rejection ratio (0 = off)");
  Serial.println("#   alpha <x>            baseline tracking speed (0.0005..0.05)");
  Serial.println("#   rel <x>              re-arm when signal < threshold × x (0.05..1, 1 = default)");
  Serial.println("#   gain <string|all> <x> per-string input gain (0.25..4, 1 = default)");
  Serial.println("#   raw <n>              print raw values every n samples (0 = off, 1 = every sample)");
  Serial.println("#   test <string>        send a test strum over Bluetooth");
  Serial.println("#   stats                sample rate, Bluetooth status, counters");
  Serial.println("#   base                 current baselines");
  Serial.println("#   reset                factory defaults");
  Serial.println("# Settings are saved automatically. The app can also change them over Bluetooth");
  Serial.println("# (Settings → כיול מיתרים); those are saved when you press Save in the app.");
}

static void printStats() {
  Serial.printf("# rate %.0f Hz | late %lu | max process %lu us | raw dropped %lu | hits %lu | rejects %lu\n", statRateHz,
                (unsigned long)statLate, (unsigned long)statMaxProcessUs, (unsigned long)statRawDropped,
                (unsigned long)statHits, (unsigned long)statRejects);
  if (bleConnected)
    Serial.printf("# BLE connected, interval %.2f ms\n", bleIntervalMs);
  else
    Serial.println("# BLE advertising as \"" DEVICE_NAME "\" (not connected)");
}

static void sendStrum(uint8_t string, uint8_t velocity) {
  const uint8_t ch = string;  // 0-based channel nibble: string 0 -> MIDI channel 1
  if (noteOffAt[string]) midiQueue(0x80 | ch, STRUM_NOTE, 0);  // still sounding: close it first
  midiQueue(0x90 | ch, STRUM_NOTE, velocity);
  uint32_t off = micros() + NOTE_OFF_MS * 1000UL;
  noteOffAt[string] = off ? off : 1;
}

// ---------------------------------------------------------------------------
// Serial commands (non-blocking line reader)
// ---------------------------------------------------------------------------
static char cmdBuf[48];
static uint8_t cmdLen = 0;

static bool parseString(const char* tok, int& first, int& last) {
  if (!tok) return false;
  if (!strcmp(tok, "all")) {
    first = 0;
    last = NUM_STRINGS - 1;
    return true;
  }
  int s = atoi(tok);
  if (s < 1 || s > NUM_STRINGS) return false;
  first = last = s - 1;
  return true;
}

static void handleCommand(char* line) {
  char* cmd = strtok(line, " \t");
  if (!cmd) return;
  char* a = strtok(nullptr, " \t");
  char* b = strtok(nullptr, " \t");
  bool changed = true;

  if (!strcmp(cmd, "help") || !strcmp(cmd, "?")) {
    printHelp();
    return;
  } else if (!strcmp(cmd, "show")) {
    printParams();
    return;
  } else if (!strcmp(cmd, "stats")) {
    printStats();
    return;
  } else if (!strcmp(cmd, "base")) {
    Serial.print("# baseline");
    for (int i = 0; i < NUM_STRINGS; i++) Serial.printf(" %.0f", detector.baseline(i));
    Serial.println();
    return;
  } else if (!strcmp(cmd, "test")) {
    int f, l;
    if (!parseString(a, f, l)) {
      Serial.println("# usage: test <1-6|all>");
      return;
    }
    for (int s = f; s <= l; s++) sendStrum(s, 100);
    Serial.println(bleConnected ? "# test strum sent" : "# not connected – nothing sent");
    return;
  } else if (!strcmp(cmd, "th")) {
    int f, l;
    if (!parseString(a, f, l) || !b) {
      Serial.println("# usage: th <1-6|all> <value>   e.g. th 3 450");
      return;
    }
    int v = constrain(atoi(b), 5, 4000);
    for (int s = f; s <= l; s++) params.threshold[s] = v;
  } else if (!strcmp(cmd, "fs") && a) {
    params.fullScale = constrain(atoi(a), 50, 4095);
  } else if (!strcmp(cmd, "curve") && a) {
    params.curve = constrain(atof(a), 0.2f, 4.0f);
  } else if (!strcmp(cmd, "refr") && a) {
    params.refractoryMs = constrain(atoi(a), 5, 500);
  } else if (!strcmp(cmd, "win") && a) {
    params.windowMs = constrain(atoi(a), 1, 30);
  } else if (!strcmp(cmd, "nb") && a) {
    params.neighbourRatio = constrain(atof(a), 0.0f, 5.0f);
  } else if (!strcmp(cmd, "ref") && a) {
    params.refRatio = constrain(atof(a), 0.0f, 5.0f);
  } else if (!strcmp(cmd, "alpha") && a) {
    params.baselineAlpha = constrain(atof(a), 0.0001f, 0.1f);
  } else if (!strcmp(cmd, "rel") && a) {
    params.releaseRatio = constrain(atof(a), 0.05f, 1.0f);
  } else if (!strcmp(cmd, "gain")) {
    int f, l;
    if (!parseString(a, f, l) || !b) {
      Serial.println("# usage: gain <1-6|all> <x>   e.g. gain 6 1.5");
      return;
    }
    for (int s = f; s <= l; s++) params.gain[s] = constrain(atof(b), 0.25f, 4.0f);
  } else if (!strcmp(cmd, "raw") && a) {
    params.rawEvery = constrain(atoi(a), 0, 1000);
  } else if (!strcmp(cmd, "reset")) {
    params = defaultParams();
    detector.reset();
  } else {
    changed = false;
    Serial.printf("# unknown command '%s' – type help\n", cmd);
  }
  if (changed) {
    saveParams();
    printParams();
  }
}

static void pollSerial() {
  // Bounded work per call so sampling is never delayed for long.
  for (int n = 0; n < 16 && Serial.available(); n++) {
    char c = (char)Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      cmdBuf[cmdLen] = 0;
      if (cmdLen) handleCommand(cmdBuf);
      cmdLen = 0;
    } else if (cmdLen < sizeof(cmdBuf) - 1) {
      cmdBuf[cmdLen++] = (char)tolower((unsigned char)c);
    }
  }
}

// ---------------------------------------------------------------------------
// Remote calibration (channel-16 CCs from the app)
// ---------------------------------------------------------------------------
static void sendConfigDump() {
  uint8_t d[64];
  int n = configDump(params, d, sizeof(d));
  for (int i = 0; i < n; i++) midiQueue(CFG_CHANNEL_STATUS, d[2 * i], d[2 * i + 1]);
  midiFlush();
}

static void pollConfig() {
  uint8_t msg[2];
  while (cfgQueue && xQueueReceive(cfgQueue, msg, 0) == pdTRUE) {
    switch (applyConfigCC(params, cfgState, msg[0], msg[1])) {
      case CFG_SAVE:
        saveParams();
        Serial.println("# settings saved (from app)");
        printParams();
        break;
      case CFG_RESET:
        params = defaultParams();
        detector.reset();
        Serial.println("# factory defaults (from app) – not saved until Save");
        sendConfigDump();
        break;
      case CFG_MONITOR_ON:
        monitorOn = true;
        for (int i = 0; i < NUM_STRINGS; i++) peakSince[i] = 0;
        sendConfigDump();
        break;
      case CFG_MONITOR_OFF:
        monitorOn = false;
        break;
      default:
        break;  // CHANGED: already live – the detector reads params every sample
    }
  }
}

/** While the app's calibration screen is open: per-string peak levels every 50 ms. */
static void reportPeaks() {
  for (int i = 0; i < NUM_STRINGS; i++) peakSince[i] = max(peakSince[i], detector.signal(i));
  if (!monitorOn || !bleConnected || millis() - monitorLastMs < MONITOR_PERIOD_MS) return;
  monitorLastMs = millis();
  for (int i = 0; i < NUM_STRINGS; i++) {
    midiQueue(CFG_CHANNEL_STATUS, CC_PEAK_FIRST + i, ccFromLevel(peakSince[i]));
    peakSince[i] = 0;
  }
}

// ---------------------------------------------------------------------------
// Sampling
// ---------------------------------------------------------------------------
static uint32_t nextSampleUs = 0;
static uint32_t rawCounter = 0;

static void printRaw(const uint16_t* v, int32_t ref) {
  if (params.rawEvery == 0 || ++rawCounter < params.rawEvery) return;
  rawCounter = 0;
  char line[48];
  int len = snprintf(line, sizeof(line), "%u %u %u %u %u %u", v[0], v[1], v[2], v[3], v[4], v[5]);
  if (ref >= 0) len += snprintf(line + len, sizeof(line) - len, " %ld", (long)ref);
  line[len++] = '\n';
  // Never block: if the USB/UART buffer is full, drop this line.
  if (Serial.availableForWrite() >= len)
    Serial.write((const uint8_t*)line, len);
  else
    statRawDropped++;
}

static void sampleOnce() {
  const uint32_t t0 = micros();
  uint16_t v[NUM_STRINGS];
  for (int i = 0; i < NUM_STRINGS; i++) v[i] = analogRead(PIEZO_PINS[i]);
  const int32_t ref = REF_PIN >= 0 ? (int32_t)analogRead(REF_PIN) : -1;

  Hit hits[NUM_STRINGS];
  Reject rejects[NUM_STRINGS];
  uint8_t nHits, nRejects;
  detector.process(params, v, ref, hits, nHits, rejects, nRejects);

  for (uint8_t k = 0; k < nHits; k++) sendStrum(hits[k].string, hits[k].velocity);
  statHits += nHits;
  statRejects += nRejects;

  // Due Note Offs.
  const uint32_t now = micros();
  for (int s = 0; s < NUM_STRINGS; s++) {
    if (noteOffAt[s] && (int32_t)(now - noteOffAt[s]) >= 0) {
      midiQueue(0x80 | s, STRUM_NOTE, 0);
      noteOffAt[s] = 0;
    }
  }
  reportPeaks();
  midiFlush();

  printRaw(v, ref);
  // Hits/rejects are reported only when the raw stream is off, so the web
  // app's Serial parser never sees a non-numeric line mixed into the stream.
  if (params.rawEvery == 0) {
    for (uint8_t k = 0; k < nHits; k++)
      Serial.printf("# hit string %u vel %u peak %u\n", hits[k].string + 1, hits[k].velocity, hits[k].peak);
    for (uint8_t k = 0; k < nRejects; k++)
      Serial.printf("# reject string %u (%s louder: %u > %u)\n", rejects[k].string + 1,
                    rejects[k].reason == REJECT_REFERENCE ? "body" : "neighbour", rejects[k].other, rejects[k].peak);
  }

  const uint32_t took = micros() - t0;
  if (took > statMaxProcessUs) statMaxProcessUs = took;
  statFrames++;
}

// ---------------------------------------------------------------------------
void setup() {
  Serial.setTxBufferSize(1024);  // absorbs bursts; printRaw() drops lines rather than block
  Serial.begin(SERIAL_BAUD);
#if ARDUINO_USB_CDC_ON_BOOT
  Serial.setTxTimeoutMs(0);  // native USB: never wait for a host that isn't reading
#endif

  analogReadResolution(12);
  for (int i = 0; i < NUM_STRINGS; i++) analogSetPinAttenuation(PIEZO_PINS[i], ADC_11db);
  if (REF_PIN >= 0) analogSetPinAttenuation(REF_PIN, ADC_11db);

  prefs.begin("midiguitar", false);
  loadParams();

  cfgQueue = xQueueCreate(64, 2);
  bleSetup();

  Serial.println("# MIDI Guitar ready – type help");
  printParams();
  nextSampleUs = micros();
  statWindowStart = millis();
}

void loop() {
  const uint32_t now = micros();
  if ((int32_t)(now - nextSampleUs) >= 0) {
    nextSampleUs += SAMPLE_PERIOD_US;
    // Fell far behind (e.g. flash write): resync instead of bursting.
    if ((int32_t)(now - nextSampleUs) > (int32_t)(4 * SAMPLE_PERIOD_US)) {
      nextSampleUs = now + SAMPLE_PERIOD_US;
      statLate++;
    }
    sampleOnce();
  } else {
    pollSerial();
    pollConfig();
  }

  if (millis() - statWindowStart >= 1000) {
    statRateHz = statFrames * 1000.0f / (millis() - statWindowStart);
    statFrames = 0;
    statWindowStart = millis();
  }
}

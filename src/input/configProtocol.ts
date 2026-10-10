/**
 * Remote calibration protocol (app ↔ firmware) on MIDI channel 16 – mirrors
 * firmware/midi_guitar/ConfigProtocol.h (same mappings, same CC numbers).
 *
 *   CC 20–25  threshold strings 1–6 (0–127, quadratic → 10–2010 raw ADC counts)
 *   CC 26     release (re-arm) ratio 0.05–1.00
 *   CC 27     neighbour-rejection ratio 0–2 (64 ≈ 1.0)
 *   CC 28     gain 0.25–4 (64 = 1.0) for the string selected by CC 29 (1–6)
 *   CC 30=127 save to flash · CC 31=127 factory reset · CC 32 monitor on (127) / off (0)
 *   firmware → app: the CCs above as a settings dump; CC 40–45 = peak per string (threshold scale)
 */
export const CFG_STATUS = 0xbf; // Control Change, channel 16
export const CC = {
  threshold: 20,
  release: 26,
  neighbour: 27,
  gain: 28,
  gainSelect: 29,
  save: 30,
  reset: 31,
  monitor: 32,
  peak: 40,
} as const;

const TH_MIN = 10;
const TH_SPAN = 2000;
const clamp7 = (v: number) => Math.max(0, Math.min(127, Math.round(v)));

export const thresholdFromCC = (v: number): number => Math.round(TH_MIN + (clamp7(v) / 127) ** 2 * TH_SPAN);
export const ccFromLevel = (level: number): number =>
  level <= TH_MIN ? 0 : clamp7(Math.sqrt((level - TH_MIN) / TH_SPAN) * 127);
export const releaseFromCC = (v: number): number => 0.05 + (clamp7(v) / 127) * 0.95;
export const neighbourFromCC = (v: number): number => clamp7(v) / 63.5;
export const gainFromCC = (v: number): number => 2 ** ((clamp7(v) - 64) / 32);

export interface DeviceConfig {
  /** CC values 0–127 as last reported by / sent to the guitar. */
  threshold: number[];
  release: number;
  neighbour: number;
  gain: number[];
}

/** One BLE-MIDI packet with Control Changes (header, then timestamp + full status per message). */
export function buildBleMidiPacket(messages: [number, number][], status = CFG_STATUS, timeMs = performance.now()): Uint8Array<ArrayBuffer> {
  const ts = Math.floor(timeMs) & 0x1fff;
  const out = [0x80 | ((ts >> 7) & 0x3f)];
  for (const [cc, value] of messages) out.push(0x80 | (ts & 0x7f), status, cc & 0x7f, clamp7(value));
  return new Uint8Array(out);
}

/**
 * Applies a channel-16 CC coming from the guitar to the app's view of its settings.
 * Returns the new config (or null if `cc` is not a settings message) and the
 * gain-select state, which persists across messages like on the firmware.
 */
export function applyDeviceCC(
  cfg: DeviceConfig,
  sel: { gainString: number },
  cc: number,
  value: number,
): DeviceConfig | null {
  if (cc >= CC.threshold && cc < CC.threshold + 6) {
    const threshold = cfg.threshold.slice();
    threshold[cc - CC.threshold] = value;
    return { ...cfg, threshold };
  }
  if (cc === CC.release) return { ...cfg, release: value };
  if (cc === CC.neighbour) return { ...cfg, neighbour: value };
  if (cc === CC.gainSelect) {
    if (value >= 1 && value <= 6) sel.gainString = value - 1;
    return null;
  }
  if (cc === CC.gain) {
    const gain = cfg.gain.slice();
    gain[sel.gainString] = value;
    return { ...cfg, gain };
  }
  return null;
}

export const emptyDeviceConfig = (): DeviceConfig => ({
  threshold: [0, 0, 0, 0, 0, 0],
  release: 127,
  neighbour: 64,
  gain: [64, 64, 64, 64, 64, 64],
});

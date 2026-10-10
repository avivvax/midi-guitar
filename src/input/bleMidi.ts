import { Emitter, type GuitarInput } from './types';
import { mapMidiMessage, parseBleMidiPacket } from './midiMapping';
import { CC, CFG_STATUS, buildBleMidiPacket } from './configProtocol';

export const BLE_MIDI_SERVICE = '03b80e5a-ede8-4b33-a751-6ce34ec4c700';
export const BLE_MIDI_CHARACTERISTIC = '7772e5db-3868-4112-a1a9-f2669d106bf3';

export class BleMidiInput extends Emitter implements GuitarInput {
  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  onDisconnected: (() => void) | null = null;
  /** Channel-16 calibration CCs from the guitar (settings dump, peak meter). */
  onConfig: ((cc: number, value: number) => void) | null = null;
  /** Latest value per outgoing CC key, written one packet at a time (slider drags coalesce). */
  private outbox = new Map<string, [number, number][]>();
  private writing = false;
  deviceName = '';

  static get supported(): boolean {
    return 'bluetooth' in navigator;
  }

  async connect(): Promise<void> {
    if (!BleMidiInput.supported) throw new Error('Web Bluetooth לא נתמך בדפדפן הזה');
    const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [BLE_MIDI_SERVICE] }] });
    this.device = device;
    this.deviceName = device.name ?? 'BLE-MIDI';
    device.addEventListener('gattserverdisconnected', this.handleDisconnect);
    const server = await device.gatt!.connect();
    const service = await server.getPrimaryService(BLE_MIDI_SERVICE);
    const ch = await service.getCharacteristic(BLE_MIDI_CHARACTERISTIC);
    ch.addEventListener('characteristicvaluechanged', this.handleValue);
    await ch.startNotifications();
    this.characteristic = ch;
  }

  private handleValue = (ev: Event) => {
    const t = performance.now();
    const dv = (ev.target as BluetoothRemoteGATTCharacteristic).value;
    if (!dv) return;
    const bytes = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
    for (const msg of parseBleMidiPacket(bytes)) {
      if (msg.status === CFG_STATUS) {
        this.onConfig?.(msg.data[0] ?? 0, msg.data[1] ?? 0);
        continue;
      }
      const e = mapMidiMessage(msg, t);
      if (e) this.emit(e);
    }
  };

  get connected(): boolean {
    return this.characteristic !== null;
  }

  /**
   * Queue channel-16 CCs for the guitar. Messages sharing a `key` replace each
   * other while waiting, so dragging a slider sends only the latest value;
   * each key's messages go out together in one packet (e.g. gain select + gain).
   */
  sendConfig(key: string, messages: [number, number][]): void {
    if (!this.characteristic) return;
    this.outbox.delete(key); // re-insert at the end: keeps send order for one-shot commands
    this.outbox.set(key, messages);
    void this.flush();
  }

  private async flush(): Promise<void> {
    if (this.writing) return;
    this.writing = true;
    try {
      while (this.outbox.size && this.characteristic) {
        const [key, messages] = this.outbox.entries().next().value!;
        this.outbox.delete(key);
        const ch = this.characteristic;
        await ch.writeValueWithoutResponse(buildBleMidiPacket(messages));
      }
    } catch {
      // A failed write (link dropping) is reported by the disconnect handler.
      this.outbox.clear();
    } finally {
      this.writing = false;
    }
  }

  setMonitor(on: boolean): void {
    this.sendConfig('monitor', [[CC.monitor, on ? 127 : 0]]);
  }

  private handleDisconnect = () => {
    this.outbox.clear();
    this.characteristic = null;
    this.onDisconnected?.();
  };

  disconnect(): void {
    this.outbox.clear();
    this.characteristic?.removeEventListener('characteristicvaluechanged', this.handleValue);
    this.device?.removeEventListener('gattserverdisconnected', this.handleDisconnect);
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
    this.characteristic = null;
    this.device = null;
  }
}

import { Emitter, type GuitarInput } from './types';
import { mapMidiMessage, parseBleMidiPacket } from './midiMapping';

export const BLE_MIDI_SERVICE = '03b80e5a-ede8-4b33-a751-6ce34ec4c700';
export const BLE_MIDI_CHARACTERISTIC = '7772e5db-3868-4112-a1a9-f2669d106bf3';

export class BleMidiInput extends Emitter implements GuitarInput {
  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  onDisconnected: (() => void) | null = null;
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
      const e = mapMidiMessage(msg, t);
      if (e) this.emit(e);
    }
  };

  private handleDisconnect = () => {
    this.characteristic = null;
    this.onDisconnected?.();
  };

  disconnect(): void {
    this.characteristic?.removeEventListener('characteristicvaluechanged', this.handleValue);
    this.device?.removeEventListener('gattserverdisconnected', this.handleDisconnect);
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
    this.characteristic = null;
    this.device = null;
  }
}

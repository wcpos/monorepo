/**
 * The GATT service/characteristic pairs generic BLE receipt printers expose, and the write
 * pacing that works across them. Shared by the browser lane (`ble-gatt.ts`, Web Bluetooth) and
 * the phone lane (`ble-native-adapter.ts`, react-native-ble-plx) so both probe the same printers
 * in the same order — read off a Netum NT-1809 over BLE (README lessons, 2026-09-05).
 */
export const PRINT_PROFILES = [
	['000018f0-0000-1000-8000-00805f9b34fb', '00002af1-0000-1000-8000-00805f9b34fb'],
	['0000ff00-0000-1000-8000-00805f9b34fb', '0000ff02-0000-1000-8000-00805f9b34fb'],
	['49535343-fe7d-4ae5-8fa9-9fafd205e455', '49535343-8841-43f4-a8d4-ecbe34729bb3'],
	['e7810a71-73ae-499d-8c15-faa9aef0c3f2', 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f'],
] as const;

export const BLE_PRINT_SERVICE_UUIDS = PRINT_PROFILES.map(([service]) => service);

/**
 * The characteristic a print service notifies its `DLE EOT` status byte on. Read off a Netum
 * NT-1809: the 18F0 service answers on 2AF0 while `GS I` is ignored (roadmap#136 catalogue). No
 * status channel has been observed on the other profiles, so those lanes cannot ask (audit D4).
 */
const STATUS_NOTIFY_BY_SERVICE: Record<string, string> = {
	'000018f0-0000-1000-8000-00805f9b34fb': '00002af0-0000-1000-8000-00805f9b34fb',
};

export function statusNotifyCharacteristic(service: string): string | undefined {
	return STATUS_NOTIFY_BY_SERVICE[service.toLowerCase()];
}

// 20 bytes is the BLE default-MTU floor that every printer accepts.
export const DEFAULT_CHUNK_SIZE = 20;
export const CHUNK_PAUSE_MS = 20;
// Write-without-response gives no delivery confirmation, and disconnecting right after the last
// chunk dropped the tail of receipts on the Netum NT-1809 (roadmap#136 #38). The last chunk goes
// as an acknowledged write and the link stays up briefly so the printer drains its buffer.
export const TAIL_SETTLE_MS = 300;
// A BLE printer that is connected stops advertising, and a reconnect then fails until it is
// power-cycled. Keep the link alive between jobs rather than requiring a fresh advertisement.
export const BLE_KEEP_ALIVE_MS = 60_000;

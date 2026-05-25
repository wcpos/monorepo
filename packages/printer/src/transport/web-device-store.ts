import type { PosConnectedDevice } from '../types/point-of-sale-connectors';

interface KeyValueStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

function defaultStorage(): KeyValueStorage | null {
	return typeof localStorage !== 'undefined' ? localStorage : null;
}

const key = (profileId: string) => `wcpos.webdevice.${profileId}`;

// Keyed by the device key that persists into the PrinterProfile (profile.address),
// NOT the transient discovered id — so reconnect works after the printer is added.
export function saveWebDevice(
	deviceKey: string,
	device: PosConnectedDevice,
	storage: KeyValueStorage | null = defaultStorage()
): void {
	try {
		storage?.setItem(key(deviceKey), JSON.stringify(device));
	} catch {
		// Ignore storage failures (quota, privacy mode, unavailable backend).
	}
}

export function loadWebDevice(
	deviceKey: string,
	storage: KeyValueStorage | null = defaultStorage()
): PosConnectedDevice | null {
	try {
		const raw = storage?.getItem(key(deviceKey));
		return raw ? (JSON.parse(raw) as PosConnectedDevice) : null;
	} catch {
		return null;
	}
}

import type { ScanHub } from '@wcpos/scanner';

export interface UseBleScanResult {
	available: boolean;
	connect: () => Promise<void>;
	disconnect: () => Promise<void>;
	connected: boolean;
	/**
	 * deviceKey of the scanner this source currently holds open, or null. Lets
	 * the settings list say which SAVED profile is live rather than showing a
	 * status derived from "some source of this type is connected" — a proxy that
	 * lies as soon as a till has two scanners of one kind.
	 */
	connectedDeviceKey: string | null;
}

/** BLE barcode scanning is iOS-only in v1. */
export const useBleScan = (_hub: ScanHub): UseBleScanResult => ({
	available: false,
	connect: async () => undefined,
	disconnect: async () => undefined,
	connected: false,
	connectedDeviceKey: null,
});

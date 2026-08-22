import type { ScanHub } from '@wcpos/scanner';

export interface UseBleScanResult {
	available: boolean;
	connect: () => Promise<void>;
	disconnect: () => Promise<void>;
	connected: boolean;
}

/** BLE barcode scanning is iOS-only in v1. */
export const useBleScan = (_hub: ScanHub): UseBleScanResult => ({
	available: false,
	connect: async () => undefined,
	disconnect: async () => undefined,
	connected: false,
});

import type { ScanBus } from '@wcpos/scanner';

/**
 * WebHID (HID POS) barcode source. Direct connections only exist on
 * Chromium/Electron via WebHID, so the base (native / jest) build is inert.
 */
export interface UseHidScanResult {
	available: boolean;
	/** Open the browser HID-device chooser (must run inside a click gesture). */
	connect: () => Promise<void>;
	disconnect: () => Promise<void>;
	connected: boolean;
}

export const useHidScan = (emit: ScanBus['emit']): UseHidScanResult => ({
	available: false,
	connect: async () => undefined,
	disconnect: async () => undefined,
	connected: false,
});

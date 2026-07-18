import type { ScannerProfileDocument } from '@wcpos/database';

/**
 * WebHID (HID POS) barcode source. Direct connections only exist on
 * Chromium/Electron via WebHID, so the base (native / jest) build is inert.
 */
export interface UseHidScanResult {
	available: boolean;
	/** Open the browser HID-device chooser (must run inside a click gesture). */
	connect: () => Promise<void>;
	/** Re-open a previously granted device matching a saved profile. */
	reconnect: (profile: ScannerProfileDocument) => Promise<void>;
	disconnect: () => Promise<void>;
	connected: boolean;
}

export const useHidScan = (): UseHidScanResult => ({
	available: false,
	connect: async () => undefined,
	reconnect: async () => undefined,
	disconnect: async () => undefined,
	connected: false,
});

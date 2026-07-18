import type { ScannerProfileDocument } from '@wcpos/database';

/**
 * Web Serial barcode source. Direct connections only exist on Chromium/Electron
 * via the Web Serial API, so the base (native / jest) build is inert.
 */
export interface UseSerialScanResult {
	available: boolean;
	/** Open the browser serial-port chooser (must run inside a click gesture). */
	connect: () => Promise<void>;
	/** Re-open a previously granted port matching a saved profile. */
	reconnect: (profile: ScannerProfileDocument) => Promise<void>;
	disconnect: () => Promise<void>;
	connected: boolean;
}

export const useSerialScan = (): UseSerialScanResult => ({
	available: false,
	connect: async () => undefined,
	reconnect: async () => undefined,
	disconnect: async () => undefined,
	connected: false,
});

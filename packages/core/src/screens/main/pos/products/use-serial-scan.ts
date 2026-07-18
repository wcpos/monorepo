import type { ScanBus } from '@wcpos/scanner';

/**
 * Web Serial barcode source. Direct connections only exist on Chromium/Electron
 * via the Web Serial API, so the base (native / jest) build is inert.
 */
export interface UseSerialScanResult {
	available: boolean;
	/** Open the browser serial-port chooser (must run inside a click gesture). */
	connect: () => Promise<void>;
	disconnect: () => Promise<void>;
	connected: boolean;
}

export const useSerialScan = (emit: ScanBus['emit']): UseSerialScanResult => ({
	available: false,
	connect: async () => undefined,
	disconnect: async () => undefined,
	connected: false,
});

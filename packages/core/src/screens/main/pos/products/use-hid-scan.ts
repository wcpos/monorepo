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
	/**
	 * deviceKey of the scanner this source currently holds open, or null. Lets
	 * the settings list say which SAVED profile is live rather than showing a
	 * status derived from "some source of this type is connected" — a proxy that
	 * lies as soon as a till has two scanners of one kind.
	 */
	connectedDeviceKey: string | null;
}

export const useHidScan = (emit: ScanBus['emit']): UseHidScanResult => ({
	available: false,
	connect: async () => undefined,
	disconnect: async () => undefined,
	connected: false,
	connectedDeviceKey: null,
});

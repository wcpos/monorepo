import * as React from 'react';

import { EMPTY, type Observable } from 'rxjs';

import { createScanBus, type ScanEvent } from '@wcpos/scanner';

import { useHidScan, type UseHidScanResult } from '../../pos/products/use-hid-scan';
import { useSerialScan, type UseSerialScanResult } from '../../pos/products/use-serial-scan';

interface DeviceScanContextValue {
	events$: Observable<ScanEvent>;
	serial: UseSerialScanResult;
	hid: UseHidScanResult;
}

const inertSerial: UseSerialScanResult = {
	available: false,
	connect: async () => undefined,
	disconnect: async () => undefined,
	connected: false,
};
const inertHid: UseHidScanResult = {
	available: false,
	connect: async () => undefined,
	disconnect: async () => undefined,
	connected: false,
};

// Default: no direct-connection sources wired. `events$` is EMPTY so merging it
// is a no-op, letting useBarcodeDetection run without a provider (e.g. the
// settings test panel outside the app shell).
const noopContext: DeviceScanContextValue = {
	events$: EMPTY,
	serial: inertSerial,
	hid: inertHid,
};

const DeviceScanContext = React.createContext<DeviceScanContextValue>(noopContext);

/**
 * Owns the direct-connection scanner lifecycle for the whole authenticated app
 * so a connection persists across screens: the Settings UI triggers connect,
 * and scans reach the POS cart wherever useBarcodeDetection is mounted below.
 * Mounted once above the drawer. The single scan bus is deliberately
 * consumer-scoped (the camera has its own).
 */
export function DeviceScanProvider({ children }: { children: React.ReactNode }) {
	// Lazy initializer keeps one bus for the provider's lifetime (no ref writes
	// during render). The Web Serial/WebHID sources auto-reconnect granted
	// devices on mount and emit onto this bus.
	const [bus] = React.useState(() => createScanBus());
	const serial = useSerialScan(bus.emit);
	const hid = useHidScan(bus.emit);

	const value = React.useMemo<DeviceScanContextValue>(
		() => ({ events$: bus.events$, serial, hid }),
		[bus, serial, hid]
	);
	return <DeviceScanContext.Provider value={value}>{children}</DeviceScanContext.Provider>;
}

/** Scan stream for useBarcodeDetection to merge into scanEvents$. */
export function useDeviceScanBus(): { events$: Observable<ScanEvent> } {
	return { events$: React.useContext(DeviceScanContext).events$ };
}

/** Connect controls for the Settings Input-sources UI. */
export function useDeviceScanControls(): { serial: UseSerialScanResult; hid: UseHidScanResult } {
	const { serial, hid } = React.useContext(DeviceScanContext);
	return { serial, hid };
}

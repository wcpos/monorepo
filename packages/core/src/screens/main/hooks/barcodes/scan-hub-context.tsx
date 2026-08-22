import * as React from 'react';

import { createScanHub, inertScanHub, type ScanHub } from '@wcpos/scanner';

import { useBleScan, type UseBleScanResult } from '../../pos/products/use-ble-scan';
import { useHidScan, type UseHidScanResult } from '../../pos/products/use-hid-scan';
import { useSerialScan, type UseSerialScanResult } from '../../pos/products/use-serial-scan';

interface DeviceScanControls {
	serial: UseSerialScanResult;
	hid: UseHidScanResult;
	ble: UseBleScanResult;
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
const inertBle: UseBleScanResult = {
	available: false,
	connect: async () => undefined,
	disconnect: async () => undefined,
	connected: false,
};
const inertControls: DeviceScanControls = { serial: inertSerial, hid: inertHid, ble: inertBle };

const ScanHubContext = React.createContext<ScanHub>(inertScanHub);
const DeviceScanControlsContext = React.createContext<DeviceScanControls>(inertControls);

/**
 * Owns the app-scoped scan hub and direct scanner connections. Mounting this
 * above navigation keeps Serial and HID connections alive between screens.
 */
export function ScanHubProvider({ children }: { children: React.ReactNode }) {
	const [hub] = React.useState(() => createScanHub());
	const serial = useSerialScan(hub.emit);
	const hid = useHidScan(hub.emit);
	const ble = useBleScan(hub);
	const controls = React.useMemo<DeviceScanControls>(
		() => ({ serial, hid, ble }),
		[serial, hid, ble]
	);

	return (
		<ScanHubContext.Provider value={hub}>
			<DeviceScanControlsContext.Provider value={controls}>
				{children}
			</DeviceScanControlsContext.Provider>
		</ScanHubContext.Provider>
	);
}

export function useScanHub(): ScanHub {
	return React.useContext(ScanHubContext);
}

/** Connect controls for the Settings input-sources UI. */
export function useDeviceScanControls(): DeviceScanControls {
	return React.useContext(DeviceScanControlsContext);
}

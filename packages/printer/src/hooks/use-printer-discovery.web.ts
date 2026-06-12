/// <reference path="../types/point-of-sale-connectors.d.ts" />
import * as React from 'react';

import WebBluetoothReceiptPrinter from '@point-of-sale/webbluetooth-receipt-printer';
import WebUSBReceiptPrinter from '@point-of-sale/webusb-receipt-printer';

import { mapWebDeviceToDiscoveredPrinter } from '../discovery/map-web-device';
import { saveWebDevice } from '../transport/web-device-store';

import type { DiscoveredPrinter, DiscoveryError } from '../types';

interface UsePrinterDiscoveryResult {
	printers: DiscoveredPrinter[];
	isScanning: boolean;
	scanCandidates: string[];
	/** Live HTTP-sweep progress; reset to {0,0} at each scan start and on stop. */
	scanProgress: { tested: number; total: number };
	startScan: () => void;
	stopScan: () => void;
	addManualPrinter: (
		name: string,
		address: string,
		port?: number,
		vendor?: 'epson' | 'star' | 'generic'
	) => void;
	removeDiscoveredPrinter: (id: string) => void;
	/** Web only — open the browser USB chooser and add the chosen printer. */
	connectUsbDevice?: () => void;
	/** Web only — open the browser Bluetooth chooser and add the chosen printer. */
	connectBluetoothDevice?: () => void;
	isUsbScanning?: boolean;
	isBluetoothScanning?: boolean;
	bluetoothCandidates?: { id: string; name: string }[];
	selectBluetoothCandidate?: (id: string) => void;
	cancelBluetoothScan?: () => void;
	/** Electron — list OS-paired Bluetooth Classic printers via serial device paths. */
	connectSerialDevice?: () => void;
	/** True while the serial-discovery IPC round trip is pending. */
	isSerialScanning?: boolean;
	error: DiscoveryError | null;
}

function mergePrinters(
	existing: DiscoveredPrinter[],
	discovered: DiscoveredPrinter[]
): DiscoveredPrinter[] {
	const ids = new Set(existing.map((p) => p.id));
	const merged = [...existing];
	for (const p of discovered) {
		if (!ids.has(p.id)) {
			merged.push(p);
			ids.add(p.id);
		}
	}
	return merged;
}

/**
 * Web variant — best-effort network discovery via an HTTP sweep over probeVendor.
 * Bounded by browser reality (mixed-content / self-signed TLS on https origins); finds
 * the dev virtual printer on localhost with no special flag.
 */
export function usePrinterDiscovery(): UsePrinterDiscoveryResult {
	const [printers, setPrinters] = React.useState<DiscoveredPrinter[]>([]);
	const [isScanning, setIsScanning] = React.useState(false);
	const [scanCandidates, setScanCandidates] = React.useState<string[]>([]);
	const [scanProgress, setScanProgress] = React.useState<{ tested: number; total: number }>({
		tested: 0,
		total: 0,
	});
	const [error, setError] = React.useState<DiscoveryError | null>(null);
	const abortRef = React.useRef<AbortController | null>(null);

	const addManualPrinter = React.useCallback(
		(
			name: string,
			address: string,
			port: number = 9100,
			vendor: 'epson' | 'star' | 'generic' = 'generic'
		) => {
			const normalizedAddress = address.trim().toLowerCase();
			setPrinters((prev) => [
				...prev.filter((p) => !(p.address === normalizedAddress && p.port === port)),
				{
					id: `${normalizedAddress}:${port}`,
					name,
					connectionType: 'network' as const,
					address: normalizedAddress,
					port,
					vendor,
				},
			]);
		},
		[]
	);

	const removeDiscoveredPrinter = React.useCallback((id: string) => {
		setPrinters((prev) => prev.filter((p) => p.id !== id));
	}, []);

	const startScan = React.useCallback(async () => {
		abortRef.current?.abort();
		const controller = new AbortController();
		abortRef.current = controller;
		setIsScanning(true);
		setError(null);

		try {
			const { probeVendorEndpoint } = await import('../utils/probe-vendor');
			const { buildSweepCandidates, sweepForPrinters } = await import('../discovery/network-sweep');
			const hosts = buildSweepCandidates();
			setScanCandidates(hosts);
			setScanProgress({ tested: 0, total: hosts.length });
			const discovered = await sweepForPrinters({
				hosts,
				probe: probeVendorEndpoint,
				signal: controller.signal,
				onProgress: (tested, total) => {
					if (abortRef.current === controller) setScanProgress({ tested, total });
				},
			});
			if (abortRef.current !== controller || controller.signal.aborted) return;
			setPrinters((prev) => mergePrinters(prev, discovered));
			if (discovered.length === 0) {
				setError({ code: 'network-none-found' });
			}
		} catch (err) {
			if (abortRef.current !== controller || controller.signal.aborted) return;
			setError({
				code: 'discovery-failed',
				detail: err instanceof Error ? err.message : String(err),
			});
		} finally {
			if (abortRef.current === controller) {
				abortRef.current = null;
				setIsScanning(false);
			}
		}
	}, []);

	const stopScan = React.useCallback(() => {
		abortRef.current?.abort();
		setIsScanning(false);
		setScanProgress({ tested: 0, total: 0 });
	}, []);

	const connectUsbDevice = React.useCallback(() => {
		setError(null);
		try {
			const printer = new WebUSBReceiptPrinter();
			printer.addEventListener('connected', (device) => {
				const discovered = mapWebDeviceToDiscoveredPrinter(device);
				saveWebDevice(discovered.address, device);
				setPrinters((prev) => mergePrinters(prev, [discovered]));
			});
			printer.connect(); // runs synchronously in the click gesture
		} catch (err) {
			setError({
				code: 'discovery-failed',
				detail: err instanceof Error ? err.message : String(err),
			});
		}
	}, []);

	const connectBluetoothDevice = React.useCallback(() => {
		setError(null);
		try {
			const printer = new WebBluetoothReceiptPrinter();
			printer.addEventListener('connected', (device) => {
				const discovered = mapWebDeviceToDiscoveredPrinter(device);
				saveWebDevice(discovered.address, device);
				setPrinters((prev) => mergePrinters(prev, [discovered]));
			});
			printer.connect(); // runs synchronously in the click gesture
		} catch (err) {
			setError({
				code: 'discovery-failed',
				detail: err instanceof Error ? err.message : String(err),
			});
		}
	}, []);

	return {
		printers,
		isScanning,
		scanCandidates,
		scanProgress,
		startScan,
		stopScan,
		addManualPrinter,
		removeDiscoveredPrinter,
		connectUsbDevice,
		connectBluetoothDevice,
		error,
	};
}

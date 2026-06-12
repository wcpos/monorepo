import * as React from 'react';

import {
	classifyDiscoveryFailure,
	formatDiscoveryFailureMessage,
} from '../discovery/discovery-errors';

import type { DiscoveredPrinter, DiscoveryError } from '../types';

interface UsePrinterDiscoveryResult {
	/** Currently discovered/added printers */
	printers: DiscoveredPrinter[];
	/** Whether an auto-scan is running */
	isScanning: boolean;
	scanCandidates: string[];
	/** Scan progress; always {0,0} on native (no HTTP sweep). */
	scanProgress: { tested: number; total: number };
	/** Start auto-discovery scan */
	startScan: () => void;
	/** Stop auto-discovery scan */
	stopScan: () => void;
	/** Manually add a printer by IP address and port */
	addManualPrinter: (
		name: string,
		address: string,
		port?: number,
		vendor?: 'epson' | 'star' | 'generic'
	) => void;
	/** Remove a discovered printer by id */
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
	/** Structured error if scanning fails */
	error: DiscoveryError | null;
}

/**
 * Merge newly discovered printers into the existing list, avoiding duplicates.
 */
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
 * React Native variant — attempts native SDK discovery for Epson and Star printers.
 *
 * Uses dynamic imports so the native SDKs are only loaded if installed as
 * peer dependencies. If neither SDK is installed, startScan is a no-op.
 */
export function usePrinterDiscovery(): UsePrinterDiscoveryResult {
	const [printers, setPrinters] = React.useState<DiscoveredPrinter[]>([]);
	const [isScanning, setIsScanning] = React.useState(false);
	const [error, setError] = React.useState<DiscoveryError | null>(null);

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
		setIsScanning(true);
		setError(null);

		try {
			let sdkAvailable = false;
			let foundAny = false;
			const failures = [] as ReturnType<typeof classifyDiscoveryFailure>[];

			const discoveryTasks = [
				{
					vendor: 'epson' as const,
					promise: import('../discovery/epson-native-discovery').then(({ discover }) => discover()),
				},
				{
					vendor: 'star' as const,
					promise: import('../discovery/star-native-discovery').then(({ discover }) => discover()),
				},
			];
			const discoveryResults = await Promise.all(
				discoveryTasks.map(async ({ vendor, promise }) => ({
					vendor,
					result: await promise.then(
						(value) => ({ status: 'fulfilled' as const, value }),
						(reason) => ({ status: 'rejected' as const, reason })
					),
				}))
			);

			for (const { vendor, result } of discoveryResults) {
				if (result.status === 'fulfilled') {
					sdkAvailable = true;

					if (result.value.length > 0) {
						foundAny = true;
						setPrinters((prev) => mergePrinters(prev, result.value));
					}
				} else {
					failures.push(classifyDiscoveryFailure(vendor, result.reason));
				}
			}

			const failureMessage = formatDiscoveryFailureMessage(failures);
			if (!foundAny && failureMessage) {
				setError({ code: 'discovery-failed', detail: failureMessage });
			} else if (!sdkAvailable) {
				setError({
					code: 'discovery-failed',
					detail:
						'No printer SDKs available. Install react-native-esc-pos-printer or react-native-star-io10 for automatic discovery.',
				});
			} else if (!foundAny) {
				setError({ code: 'network-none-found' });
			}
		} finally {
			setIsScanning(false);
		}
	}, []);

	const stopScan = React.useCallback(() => {
		setIsScanning(false);
	}, []);

	return {
		printers,
		isScanning,
		scanCandidates: [],
		scanProgress: { tested: 0, total: 0 },
		startScan,
		stopScan,
		addManualPrinter,
		removeDiscoveredPrinter,
		error,
	};
}

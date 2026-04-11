import * as React from 'react';

import type { DiscoveredPrinter } from '../types';

interface UsePrinterDiscoveryResult {
	/** Currently discovered/added printers */
	printers: DiscoveredPrinter[];
	/** Whether an auto-scan is running */
	isScanning: boolean;
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
	/** Error message if scanning fails */
	error: string | null;
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
	const [error, setError] = React.useState<string | null>(null);

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

		let foundAny = false;

		// Try Epson native discovery
		try {
			const { discover } = await import('../discovery/epson-native-discovery');
			const epsonPrinters = await discover();
			if (epsonPrinters.length > 0) {
				foundAny = true;
				setPrinters((prev) => mergePrinters(prev, epsonPrinters));
			}
		} catch {
			// react-native-esc-pos-printer not installed — skip
		}

		// Try Star native discovery
		try {
			const { discover } = await import('../discovery/star-native-discovery');
			const starPrinters = await discover();
			if (starPrinters.length > 0) {
				foundAny = true;
				setPrinters((prev) => mergePrinters(prev, starPrinters));
			}
		} catch {
			// react-native-star-io10 not installed — skip
		}

		if (!foundAny) {
			setError(
				'No printer SDKs available. Install react-native-esc-pos-printer or react-native-star-io10 for automatic discovery.'
			);
		}

		setIsScanning(false);
	}, []);

	const stopScan = React.useCallback(() => {
		setIsScanning(false);
	}, []);

	return {
		printers,
		isScanning,
		startScan,
		stopScan,
		addManualPrinter,
		removeDiscoveredPrinter,
		error,
	};
}

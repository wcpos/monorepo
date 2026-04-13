import * as React from 'react';

import type { DiscoveredPrinter } from '../types';

interface UsePrinterDiscoveryResult {
	printers: DiscoveredPrinter[];
	isScanning: boolean;
	startScan: () => void;
	stopScan: () => void;
	addManualPrinter: (
		name: string,
		address: string,
		port?: number,
		vendor?: 'epson' | 'star' | 'generic'
	) => void;
	removeDiscoveredPrinter: (id: string) => void;
	error: string | null;
}

/**
 * Web variant — network scanning is not available in browsers.
 */
export function usePrinterDiscovery(): UsePrinterDiscoveryResult {
	const [printers, setPrinters] = React.useState<DiscoveredPrinter[]>([]);
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

	const startScan = React.useCallback(() => {
		setError(
			'Network scanning is not available in web browsers. Enter the printer IP address manually.'
		);
	}, []);

	const stopScan = React.useCallback(() => {
		// no-op
	}, []);

	return {
		printers,
		isScanning: false,
		startScan,
		stopScan,
		addManualPrinter,
		removeDiscoveredPrinter,
		error,
	};
}

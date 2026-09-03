import * as React from 'react';

import {
	classifyDiscoveryFailure,
	formatDiscoveryFailureMessage,
} from '../discovery/discovery-errors';
import { identifyDiscoveredPrinters } from '../discovery/identify';
import { createIdentifyProbes } from '../discovery/identify-probes';
import { mergePrinters } from '../discovery/merge-printers';

import type { DiscoveredPrinter, DiscoveryError, PrinterDiscovery } from '../types';

/**
 * React Native variant — attempts native SDK discovery for Epson and Star printers.
 *
 * Uses dynamic imports so the native SDKs are only loaded if installed as
 * peer dependencies. If neither SDK is installed, startScan is a no-op.
 */
export function usePrinterDiscovery(): PrinterDiscovery {
	const [printers, setPrinters] = React.useState<DiscoveredPrinter[]>([]);
	const [isScanning, setIsScanning] = React.useState(false);
	const [error, setError] = React.useState<DiscoveryError | null>(null);
	// Bumped by stopScan and by every startScan: SDK discovery and identification cannot be
	// cancelled, so a pass that finishes after a stop must not merge into state.
	const scanGenerationRef = React.useRef(0);

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
		const generation = ++scanGenerationRef.current;
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
			if (scanGenerationRef.current !== generation) return;

			for (const { vendor, result } of discoveryResults) {
				if (result.status === 'fulfilled') {
					sdkAvailable = true;

					if (result.value.length > 0) {
						foundAny = true;
						const identified = await identifyDiscoveredPrinters(
							result.value,
							createIdentifyProbes()
						);
						if (scanGenerationRef.current !== generation) return;
						setPrinters((prev) => mergePrinters(prev, identified));
					}
				} else {
					failures.push(classifyDiscoveryFailure(vendor, result.reason));
				}
			}

			if (scanGenerationRef.current !== generation) return;
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
			if (scanGenerationRef.current === generation) setIsScanning(false);
		}
	}, []);

	const stopScan = React.useCallback(() => {
		scanGenerationRef.current += 1;
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

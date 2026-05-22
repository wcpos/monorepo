import * as React from 'react';

import type { DiscoveredPrinter } from '../types';

interface UsePrinterDiscoveryResult {
	printers: DiscoveredPrinter[];
	isScanning: boolean;
	scanCandidates: string[];
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
	const [error, setError] = React.useState<string | null>(null);
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
			const { probeVendor } = await import('../utils/probe-vendor');
			const { buildSweepCandidates, sweepForPrinters } = await import('../discovery/network-sweep');
			const hosts = buildSweepCandidates();
			setScanCandidates(hosts);
			const discovered = await sweepForPrinters({
				hosts,
				probe: probeVendor,
				signal: controller.signal,
			});
			if (abortRef.current !== controller || controller.signal.aborted) return;
			setPrinters((prev) => mergePrinters(prev, discovered));
			if (discovered.length === 0) {
				setError(
					'No network printers found. Make sure the printer is on the same network, or enter its IP address manually.'
				);
			}
		} catch (err) {
			if (abortRef.current !== controller || controller.signal.aborted) return;
			setError(err instanceof Error ? err.message : String(err));
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
	}, []);

	return {
		printers,
		isScanning,
		scanCandidates,
		startScan,
		stopScan,
		addManualPrinter,
		removeDiscoveredPrinter,
		error,
	};
}

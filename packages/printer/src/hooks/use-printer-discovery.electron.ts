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

function getIpcRenderer(): { invoke: (channel: string, data: unknown) => Promise<unknown> } | null {
	const w = window as {
		electronAPI?: {
			ipcRenderer?: { invoke: (channel: string, data: unknown) => Promise<unknown> };
		};
	};
	return w.electronAPI?.ipcRenderer ?? null;
}

/**
 * Electron-specific printer discovery using mDNS via the main process.
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
		const ipc = getIpcRenderer();
		if (!ipc) {
			setError('IPC not available');
			return;
		}

		setIsScanning(true);
		setError(null);

		try {
			const result = (await ipc.invoke('printer-discovery', {
				action: 'start',
			})) as DiscoveredPrinter[];
			setPrinters((prev) => {
				// Keep manually-added printers (id format: "address:port")
				// Discovered printers use prefixed ids like "mdns-host" or "epson-addr"
				const manualPrinters = prev.filter((p) => p.id.includes(':'));
				const merged = [...manualPrinters];
				for (const discovered of result) {
					if (!merged.some((p) => p.id === discovered.id)) {
						merged.push(discovered);
					}
				}
				return merged;
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setIsScanning(false);
		}
	}, []);

	const stopScan = React.useCallback(async () => {
		const ipc = getIpcRenderer();
		if (ipc) {
			try {
				await ipc.invoke('printer-discovery', { action: 'stop' });
			} catch {
				// ignore
			}
		}
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

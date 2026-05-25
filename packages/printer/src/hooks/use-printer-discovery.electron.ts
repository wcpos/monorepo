/// <reference path="../types/point-of-sale-connectors.d.ts" />
import * as React from 'react';

import WebBluetoothReceiptPrinter from '@point-of-sale/webbluetooth-receipt-printer';

import { mapWebDeviceToDiscoveredPrinter } from '../discovery/map-web-device';
import { saveWebDevice } from '../transport/web-device-store';

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
	/** Electron/Web — discover or choose a USB printer and add it. */
	connectUsbDevice?: () => void;
	/** Electron/Web — open the Bluetooth chooser and add the chosen printer. */
	connectBluetoothDevice?: () => void;
	error: string | null;
}

function getIpcRenderer(): { invoke: (channel: string, data: unknown) => Promise<unknown> } | null {
	const w = window as {
		ipcRenderer?: { invoke: (channel: string, data: unknown) => Promise<unknown> };
		electronAPI?: {
			ipcRenderer?: { invoke: (channel: string, data: unknown) => Promise<unknown> };
		};
	};
	return w.ipcRenderer ?? w.electronAPI?.ipcRenderer ?? null;
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

	const connectUsbDevice = React.useCallback(async () => {
		const ipc = getIpcRenderer();
		if (!ipc) {
			setError('IPC not available');
			return;
		}
		setError(null);
		try {
			const devices = (await ipc.invoke('usb-discovery', {})) as {
				id: string;
				name: string;
			}[];
			setPrinters((prev) =>
				mergePrinters(
					prev,
					devices.map((d) => ({
						id: d.id,
						name: d.name,
						connectionType: 'usb' as const,
						address: d.id,
						vendor: 'generic' as const,
					}))
				)
			);
			if (devices.length === 0) setError('No USB printers found.');
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
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
			printer.connect(); // synchronous within the click gesture → select-bluetooth-device in main
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
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
		scanCandidates: [],
		startScan,
		stopScan,
		addManualPrinter,
		removeDiscoveredPrinter,
		connectUsbDevice,
		connectBluetoothDevice,
		error,
	};
}

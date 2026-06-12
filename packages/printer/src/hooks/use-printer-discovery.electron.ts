/// <reference path="../types/point-of-sale-connectors.d.ts" />
import * as React from 'react';

import WebBluetoothReceiptPrinter from '@point-of-sale/webbluetooth-receipt-printer';

import {
	type BluetoothScanSession,
	createBluetoothScanSession,
} from '../discovery/bluetooth-scan-session';
import { mapWebDeviceToDiscoveredPrinter } from '../discovery/map-web-device';
import { saveWebDevice } from '../transport/web-device-store';

import type { BluetoothCandidate, DiscoveredPrinter, DiscoveryError } from '../types';

interface UsePrinterDiscoveryResult {
	printers: DiscoveredPrinter[];
	isScanning: boolean;
	scanCandidates: string[];
	/** Scan progress; always {0,0} on electron (mDNS, no HTTP sweep). */
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
	/** Electron — list installed/USB printers via the main process. */
	connectUsbDevice?: () => void;
	/** True while the usb-discovery IPC round trip is pending. */
	isUsbScanning?: boolean;
	/** Electron — open a managed Web Bluetooth chooser session. */
	connectBluetoothDevice?: () => void;
	/** True while a Bluetooth chooser session is active. */
	isBluetoothScanning?: boolean;
	/** Chooser candidates forwarded from the main process during a session. */
	bluetoothCandidates?: BluetoothCandidate[];
	/** Pick a chooser candidate by id. */
	selectBluetoothCandidate?: (id: string) => void;
	/** End the active chooser session. */
	cancelBluetoothScan?: () => void;
	/** Electron — list OS-paired Bluetooth Classic printers via serial device paths. */
	connectSerialDevice?: () => void;
	/** True while the serial-discovery IPC round trip is pending. */
	isSerialScanning?: boolean;
	error: DiscoveryError | null;
}

interface ElectronIpc {
	invoke: (channel: string, data: unknown) => Promise<unknown>;
	send: (channel: string, args: unknown) => void;
	on: (channel: string, cb: (...args: unknown[]) => void) => () => void;
}

function getIpcRenderer(): ElectronIpc | null {
	const w = window as {
		ipcRenderer?: ElectronIpc;
		electronAPI?: { ipcRenderer?: ElectronIpc };
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
 * Electron-specific printer discovery: mDNS via the main process, installed/USB printers
 * via usb-discovery, and a managed Web Bluetooth chooser session (BLE only).
 */
export function usePrinterDiscovery(): UsePrinterDiscoveryResult {
	const [printers, setPrinters] = React.useState<DiscoveredPrinter[]>([]);
	const [isScanning, setIsScanning] = React.useState(false);
	const [isUsbScanning, setIsUsbScanning] = React.useState(false);
	const [isBluetoothScanning, setIsBluetoothScanning] = React.useState(false);
	const [isSerialScanning, setIsSerialScanning] = React.useState(false);
	const [bluetoothCandidates, setBluetoothCandidates] = React.useState<BluetoothCandidate[]>([]);
	const [error, setError] = React.useState<DiscoveryError | null>(null);
	const sessionRef = React.useRef<BluetoothScanSession | null>(null);

	// useEffect required: subscribes to an external IPC event source (chooser candidates
	// pushed by the main process) and must tear down both the subscription and any
	// in-flight chooser session on unmount — not derivable from render.
	React.useEffect(() => {
		const ipc = getIpcRenderer();
		if (!ipc?.on) return;
		const unsubscribe = ipc.on('bluetooth-devices', (...args) => {
			setBluetoothCandidates((args[0] as BluetoothCandidate[]) ?? []);
		});
		return () => {
			unsubscribe();
			// End any chooser session on unmount so the main process isn't left pending.
			sessionRef.current?.cancel();
		};
	}, []);

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
			setError({ code: 'ipc-unavailable' });
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
			setError({
				code: 'discovery-failed',
				detail: err instanceof Error ? err.message : String(err),
			});
		} finally {
			setIsScanning(false);
		}
	}, []);

	const connectUsbDevice = React.useCallback(async () => {
		const ipc = getIpcRenderer();
		if (!ipc) {
			setError({ code: 'ipc-unavailable' });
			return;
		}
		setError(null);
		setIsUsbScanning(true);
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
			if (devices.length === 0) setError({ code: 'usb-none-found' });
		} catch (err) {
			setError({
				code: 'discovery-failed',
				detail: err instanceof Error ? err.message : String(err),
			});
		} finally {
			setIsUsbScanning(false);
		}
	}, []);

	const connectSerialDevice = React.useCallback(async () => {
		const ipc = getIpcRenderer();
		if (!ipc) {
			setError({ code: 'ipc-unavailable' });
			return;
		}
		setError(null);
		setIsSerialScanning(true);
		try {
			const devices = (await ipc.invoke('serial-discovery', {})) as {
				id: string;
				name: string;
			}[];
			setPrinters((prev) =>
				mergePrinters(
					prev,
					devices.map((d) => ({
						id: d.id,
						name: d.name,
						connectionType: 'bluetooth' as const,
						address: d.id,
						vendor: 'generic' as const,
					}))
				)
			);
			// No error on empty result — the paired-printers section renders its own empty state.
		} catch (err) {
			setError({
				code: 'discovery-failed',
				detail: err instanceof Error ? err.message : String(err),
			});
		} finally {
			setIsSerialScanning(false);
		}
	}, []);

	const connectBluetoothDevice = React.useCallback(() => {
		if (sessionRef.current?.isActive()) return;
		const ipc = getIpcRenderer();
		if (!ipc) {
			setError({ code: 'ipc-unavailable' });
			return;
		}
		const session = createBluetoothScanSession(
			{
				sendSelection: (deviceId) => ipc.send('bluetooth-device-selected', deviceId),
				startChooser: (onConnected) => {
					const printer = new WebBluetoothReceiptPrinter();
					printer.addEventListener('connected', onConnected);
					printer.connect(); // synchronous within the click gesture → select-bluetooth-device in main
				},
			},
			{
				onScanningChange: (scanning) => {
					setIsBluetoothScanning(scanning);
					// Clear on every transition: a late IPC push after session end could have
					// repopulated candidates, and a new session must not show the old list.
					setBluetoothCandidates([]);
				},
				onError: setError,
				onConnected: (device) => {
					const discovered = mapWebDeviceToDiscoveredPrinter(device);
					saveWebDevice(discovered.address, device);
					setPrinters((prev) => mergePrinters(prev, [discovered]));
				},
			}
		);
		sessionRef.current = session;
		session.start();
	}, []);

	const selectBluetoothCandidate = React.useCallback((deviceId: string) => {
		sessionRef.current?.select(deviceId);
	}, []);

	const cancelBluetoothScan = React.useCallback(() => {
		sessionRef.current?.cancel();
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
		scanProgress: { tested: 0, total: 0 },
		startScan,
		stopScan,
		addManualPrinter,
		removeDiscoveredPrinter,
		connectUsbDevice,
		isUsbScanning,
		connectBluetoothDevice,
		isBluetoothScanning,
		bluetoothCandidates,
		selectBluetoothCandidate,
		cancelBluetoothScan,
		connectSerialDevice,
		isSerialScanning,
		error,
	};
}

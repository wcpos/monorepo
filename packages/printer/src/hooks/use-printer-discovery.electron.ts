/// <reference path="../types/point-of-sale-connectors.d.ts" />
import * as React from 'react';

import {
	type BluetoothScanSession,
	createBluetoothScanSession,
	getIpcRenderer,
} from '../discovery/bluetooth-scan-session';
import { identifyDiscoveredPrinters } from '../discovery/identify';
import { createIdentifyProbes } from '../discovery/identify-probes.electron';
import { mapWebDeviceToDiscoveredPrinter } from '../discovery/map-web-device';
import { mergePrinters } from '../discovery/merge-printers';
import { rememberBleDevice } from '../transport/ble-device-registry';
import { BLE_PRINT_SERVICE_UUIDS, type WebBluetoothNavigator } from '../transport/ble-gatt';
import { saveWebDevice } from '../transport/web-device-store';

import type {
	BluetoothCandidate,
	DiscoveredPrinter,
	DiscoveryError,
	PrinterDiscovery,
} from '../types';

/**
 * Electron-specific printer discovery: mDNS via the main process, installed/USB printers
 * via usb-discovery, and a managed Web Bluetooth chooser session (BLE only).
 */
export function usePrinterDiscovery(): PrinterDiscovery {
	const [printers, setPrinters] = React.useState<DiscoveredPrinter[]>([]);
	const [isScanning, setIsScanning] = React.useState(false);
	const [isUsbScanning, setIsUsbScanning] = React.useState(false);
	const [isBluetoothScanning, setIsBluetoothScanning] = React.useState(false);
	const [isSerialScanning, setIsSerialScanning] = React.useState(false);
	const [bluetoothCandidates, setBluetoothCandidates] = React.useState<BluetoothCandidate[]>([]);
	const [error, setError] = React.useState<DiscoveryError | null>(null);
	const sessionRef = React.useRef<BluetoothScanSession | null>(null);
	// Bumped by stopScan and by every startScan: identification keeps running after the IPC
	// stop, and a finished pass must not merge into a scan the user has already stopped.
	const scanGenerationRef = React.useRef(0);

	// useEffect required: subscribes to an external IPC event source (chooser candidates
	// pushed by the main process) and must tear down both the subscription and any
	// in-flight chooser session on unmount — not derivable from render.
	React.useEffect(() => {
		const ipc = getIpcRenderer();
		if (!ipc?.on) return;
		const unsubscribe = ipc.on('bluetooth-devices', (candidates) => {
			setBluetoothCandidates(candidates ?? []);
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

		const generation = ++scanGenerationRef.current;
		setIsScanning(true);
		setError(null);

		try {
			const result = await ipc.invoke('printer-discovery', {
				action: 'start',
			});
			if (scanGenerationRef.current !== generation) return;
			const identified = await identifyDiscoveredPrinters(result, createIdentifyProbes());
			if (scanGenerationRef.current !== generation) return;
			setPrinters((prev) => {
				// Keep manually-added printers (id format: "address:port")
				// Discovered printers use prefixed ids like "mdns-host" or "epson-addr"
				const manualPrinters = prev.filter((p) => p.id.includes(':'));
				const merged = [...manualPrinters];
				for (const discovered of identified) {
					if (!merged.some((p) => p.id === discovered.id)) {
						merged.push(discovered);
					}
				}
				return merged;
			});
		} catch (err) {
			if (scanGenerationRef.current !== generation) return;
			setError({
				code: 'discovery-failed',
				detail: err instanceof Error ? err.message : String(err),
			});
		} finally {
			if (scanGenerationRef.current === generation) setIsScanning(false);
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
			const devices = await ipc.invoke('usb-discovery', {});
			setPrinters((prev) => mergePrinters(prev, devices));
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
			const devices = await ipc.invoke('serial-discovery', {});
			setPrinters((prev) => mergePrinters(prev, devices));
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
					// First async call stays inside the click gesture so Electron opens its chooser.
					return (navigator as WebBluetoothNavigator)
						.bluetooth!.requestDevice({
							acceptAllDevices: true,
							optionalServices: BLE_PRINT_SERVICE_UUIDS,
						})
						.then((device) => {
							rememberBleDevice('webbluetooth:' + device.id, device);
							onConnected({
								type: 'bluetooth',
								name: device.name ?? 'Bluetooth printer',
								id: device.id,
								language: 'esc-pos',
							});
						});
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
		scanGenerationRef.current += 1;
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

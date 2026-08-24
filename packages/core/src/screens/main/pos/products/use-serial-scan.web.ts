import * as React from 'react';

import type { ScannerProfileDocument } from '@wcpos/database';
import {
	createScanSession,
	createSerialLineDecoder,
	isWebSerialSupported,
	normalizeUuid,
	type ScanBus,
	scannerDeviceKey,
	type ScannerIdentity,
	type ScanSession,
	type SerialLineDecoder,
} from '@wcpos/scanner';
import { getLogger } from '@wcpos/utils/logger';
import { useDocField } from '@wcpos/query';

import { useAppState } from '../../../../contexts/app-state';
import { useCollection } from '../../hooks/use-collection';

import type { UseSerialScanResult } from './use-serial-scan';

const serialLogger = getLogger(['wcpos', 'barcode', 'serial']);
const DEFAULT_BAUD_RATE = 9600;

// Chromium's chooser only lists unmapped Bluetooth RFCOMM ports whose service
// class is the standard Serial Port Profile (0x1101); any other UUID must be
// named in `allowedBluetoothServiceClassIds` or the device is silently absent
// (https://developer.chrome.com/blog/serial-over-bluetooth). Scanners with a
// vendor-specific RFCOMM service go here as we learn their UUIDs; saved
// profiles' UUIDs are added at request time. Known limitation (PR #1257): a
// FIRST-TIME scanner with a vendor UUID not yet in this list cannot appear in
// the chooser at all — manual UUID entry is planned for the setup wizard.
const STANDARD_SPP_SERVICE_CLASS_ID = '00001101-0000-1000-8000-00805f9b34fb';
const KNOWN_SCANNER_BLUETOOTH_SERVICE_CLASS_IDS: string[] = [STANDARD_SPP_SERVICE_CLASS_ID];

// Minimal Web Serial typings (not in the RN/TS lib).
interface SerialPortInfoLike {
	usbVendorId?: number;
	usbProductId?: number;
	/** Service class UUID for Bluetooth RFCOMM ports (no USB ids on those). */
	bluetoothServiceClassId?: string;
}
interface SerialPortRequestOptionsLike {
	allowedBluetoothServiceClassIds?: string[];
}
interface SerialPortLike {
	open: (options: { baudRate: number }) => Promise<void>;
	close: () => Promise<void>;
	readable: ReadableStream<Uint8Array> | null;
	getInfo: () => SerialPortInfoLike;
}
interface SerialLike {
	requestPort: (options?: SerialPortRequestOptionsLike) => Promise<SerialPortLike>;
	getPorts: () => Promise<SerialPortLike[]>;
}

function getSerial(): SerialLike | undefined {
	return (navigator as unknown as { serial?: SerialLike }).serial;
}

/**
 * A Web Serial port is either a USB-CDC device (USB ids, no service class) or a
 * Bluetooth RFCOMM port (service class, no USB ids). One place decides which,
 * so the connect path and the silent-reconnect path can never disagree about a
 * port's identity — they used to, and the Bluetooth branch compared UUIDs
 * case-sensitively on read while writing them lowercased.
 */
function serialPortIdentity(info: SerialPortInfoLike): ScannerIdentity | null {
	if (info.usbVendorId !== undefined && info.usbProductId !== undefined) {
		return {
			connectionType: 'usb-serial',
			vendorId: info.usbVendorId,
			productId: info.usbProductId,
		};
	}
	if (info.bluetoothServiceClassId !== undefined) {
		return { connectionType: 'bluetooth-spp', serviceUuid: info.bluetoothServiceClassId };
	}
	return null;
}

/**
 * Web Serial (USB-CDC / Bluetooth-SPP) barcode source. Reads the port's byte
 * stream, frames it into barcodes with the shared serial-line decoder, dedups
 * via the scan-session, and emits `serial` ScanEvents onto the device scan bus
 * (merged into scanEvents$ by useBarcodeDetection).
 */
export const useSerialScan = (emit: ScanBus['emit']): UseSerialScanResult => {
	const { store } = useAppState();
	const { collection } = useCollection('scanner_profiles');
	const minChars = useDocField(store, (value) => value.barcode_scanning_min_chars) as number;
	const prefix = useDocField(store, (value) => value.barcode_scanning_prefix) as string;
	const suffix = useDocField(store, (value) => value.barcode_scanning_suffix) as string;

	const [connected, setConnected] = React.useState(false);
	const [connectedDeviceKey, setConnectedDeviceKey] = React.useState<string | null>(null);

	const emitRef = React.useRef(emit);
	const settingsRef = React.useRef({ prefix, suffix, minChars: Number(minChars) });
	React.useEffect(() => {
		emitRef.current = emit;
	}, [emit]);
	React.useEffect(() => {
		settingsRef.current = { prefix, suffix, minChars: Number(minChars) };
	}, [prefix, suffix, minChars]);

	const portRef = React.useRef<SerialPortLike | null>(null);
	const sessionRef = React.useRef<ScanSession | null>(null);
	const decoderRef = React.useRef<SerialLineDecoder | null>(null);
	const readerRef = React.useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
	const closingRef = React.useRef(false);
	const attachRequestRef = React.useRef(0);
	const lifecycleQueueRef = React.useRef<Promise<void>>(Promise.resolve());
	const mountedRef = React.useRef(true);

	const getSession = React.useCallback((): ScanSession => {
		if (!sessionRef.current) {
			sessionRef.current = createScanSession({
				onAccept: (code) => {
					if (code.length < settingsRef.current.minChars) {
						return;
					}
					emitRef.current({
						code,
						source: { kind: 'serial' },
						timestamp: Date.now(),
					});
				},
			});
		}
		return sessionRef.current;
	}, []);

	const getDecoder = React.useCallback((): SerialLineDecoder => {
		if (!decoderRef.current) {
			decoderRef.current = createSerialLineDecoder({
				getSettings: () => ({
					prefix: settingsRef.current.prefix,
					suffix: settingsRef.current.suffix,
				}),
				onScan: (code) => getSession().offer(code),
			});
		}
		return decoderRef.current;
	}, [getSession]);

	const readLoop = React.useCallback(
		async (port: SerialPortLike) => {
			const decoder = getDecoder();
			const textDecoder = new TextDecoder();
			try {
				while (port.readable && !closingRef.current) {
					const reader = port.readable.getReader();
					readerRef.current = reader;
					try {
						for (let result = await reader.read(); !result.done; result = await reader.read()) {
							decoder.push(textDecoder.decode(result.value, { stream: true }));
						}
					} catch {
						// A read error usually means the port was cancelled/closed.
						break;
					} finally {
						reader.releaseLock();
						if (readerRef.current === reader) {
							readerRef.current = null;
						}
					}
					break;
				}
			} finally {
				if (portRef.current === port) {
					setConnected(false);
					setConnectedDeviceKey(null);
				}
			}
		},
		[getDecoder]
	);

	const teardown = React.useCallback(async () => {
		const reader = readerRef.current;
		const port = portRef.current;
		readerRef.current = null;
		portRef.current = null;
		setConnected(false);
		setConnectedDeviceKey(null);
		closingRef.current = true;
		try {
			await reader?.cancel().catch(() => undefined);
			if (port) {
				await port.close().catch(() => undefined);
			}
		} finally {
			closingRef.current = false;
		}
	}, []);

	const attachPort = React.useCallback(
		async (port: SerialPortLike, save: boolean) => {
			const request = ++attachRequestRef.current;
			let attached = false;
			const pending = lifecycleQueueRef.current.then(async () => {
				if (!mountedRef.current || request !== attachRequestRef.current) {
					return;
				}
				await teardown();
				if (!mountedRef.current || request !== attachRequestRef.current) {
					return;
				}
				await port.open({ baudRate: DEFAULT_BAUD_RATE });
				if (!mountedRef.current || request !== attachRequestRef.current) {
					await port.close().catch(() => undefined);
					return;
				}
				portRef.current = port;
				setConnected(true);
				const openedIdentity = serialPortIdentity(port.getInfo());
				setConnectedDeviceKey(openedIdentity ? scannerDeviceKey(openedIdentity) : null);
				decoderRef.current?.reset();
				sessionRef.current?.reset();
				// The read loop runs for the port's lifetime; failures are logged.
				void readLoop(port);
				attached = true;
			});
			lifecycleQueueRef.current = pending.catch(() => undefined);
			await pending;
			if (attached && save) {
				const info = port.getInfo();
				const identity = serialPortIdentity(info);
				if (identity) {
					// deviceKey is the primary key, so a re-registration of the same
					// scanner is an upsert rather than a duplicate row — no read-then-
					// insert dup check, and no race between two rapid Connect presses.
					await collection.upsert({
						deviceKey: scannerDeviceKey(identity),
						name: '',
						connectionType: identity.connectionType,
						// Web Serial reports no product name for either transport, so
						// there is nothing to record. An invented English label here
						// would freeze one language into the document and shadow the
						// type label the row derives from connectionType.
						deviceName: '',
						vendorId: info.usbVendorId,
						productId: info.usbProductId,
						serviceUuid: info.bluetoothServiceClassId
							? normalizeUuid(info.bluetoothServiceClassId)
							: undefined,
						createdAt: new Date().toISOString(),
					});
				}
			}
		},
		[collection, readLoop, teardown]
	);

	const connect = React.useCallback(async () => {
		const serial = getSerial();
		if (!serial) {
			return;
		}
		try {
			// A previously saved scanner may use a vendor-specific RFCOMM service
			// class; include saved UUIDs so it stays visible in the chooser.
			const profiles = await collection
				.find({ selector: { connectionType: 'bluetooth-spp' } })
				.exec();
			const allowedBluetoothServiceClassIds = Array.from(
				new Set([
					...KNOWN_SCANNER_BLUETOOTH_SERVICE_CLASS_IDS,
					...profiles
						.map((profile: ScannerProfileDocument) => profile.serviceUuid)
						.filter((id): id is string => typeof id === 'string' && id.length > 0),
				])
			);
			const port = await serial.requestPort({ allowedBluetoothServiceClassIds });
			await attachPort(port, true);
		} catch (error) {
			serialLogger.warn('serial connect cancelled or failed', {
				context: { error: String(error) },
			});
		}
	}, [attachPort, collection]);

	// On mount, silently re-open any already-granted port that matches a saved
	// serial profile (the browser remembers granted devices across reloads).
	React.useEffect(() => {
		const serial = getSerial();
		if (!serial) {
			return;
		}
		let cancelled = false;
		(async () => {
			const [ports, profiles] = await Promise.all([
				serial.getPorts(),
				collection
					.find({ selector: { connectionType: { $in: ['usb-serial', 'bluetooth-spp'] } } })
					.exec(),
			]);
			if (cancelled) {
				return;
			}
			// Accepted contract (PR #1257 author ruling): a key identifies a service
			// or model, not a physical unit — the same ceiling as vid:pid for two
			// identical USB scanners. A single unambiguous match reconnects silently;
			// ambiguity waits for an explicit chooser pick.
			const savedKeys = new Set(
				profiles.map((profile: ScannerProfileDocument) => profile.deviceKey)
			);
			const matches = ports.filter((port) => {
				const identity = serialPortIdentity(port.getInfo());
				return identity !== null && savedKeys.has(scannerDeviceKey(identity));
			});
			if (matches.length === 1 && !cancelled) {
				await attachPort(matches[0], false);
			}
		})().catch((error) => {
			serialLogger.warn('Failed to reopen saved serial scanner', {
				context: { error: String(error) },
			});
		});
		return () => {
			cancelled = true;
		};
	}, [collection, attachPort]);

	const disconnect = React.useCallback(async () => {
		attachRequestRef.current += 1;
		const pending = lifecycleQueueRef.current.then(teardown);
		lifecycleQueueRef.current = pending.catch(() => undefined);
		await pending;
		setConnected(false);
		setConnectedDeviceKey(null);
	}, [teardown]);

	// Release the port + read loop when the provider unmounts (logout / teardown).
	React.useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			attachRequestRef.current += 1;
			const pending = lifecycleQueueRef.current.then(teardown);
			lifecycleQueueRef.current = pending.catch(() => undefined);
		};
	}, [teardown]);

	return {
		available: isWebSerialSupported(),
		connect,
		disconnect,
		connected,
		connectedDeviceKey,
	};
};

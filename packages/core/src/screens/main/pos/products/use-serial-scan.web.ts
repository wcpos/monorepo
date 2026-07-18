import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { v4 as uuidv4 } from 'uuid';

import type { ScannerProfileDocument } from '@wcpos/database';
import {
	createScanSession,
	createSerialLineDecoder,
	isWebSerialSupported,
	type ScanSession,
	type SerialLineDecoder,
} from '@wcpos/scanner';
import { getLogger } from '@wcpos/utils/logger';

import { useAppState } from '../../../../contexts/app-state';
import { useDeviceScanBus } from '../../hooks/barcodes/device-scan-context';
import { useCollection } from '../../hooks/use-collection';

import type { UseSerialScanResult } from './use-serial-scan';

const serialLogger = getLogger(['wcpos', 'barcode', 'serial']);
const DEFAULT_BAUD_RATE = 9600;

// Minimal Web Serial typings (not in the RN/TS lib).
interface SerialPortInfoLike {
	usbVendorId?: number;
	usbProductId?: number;
}
interface SerialPortLike {
	open: (options: { baudRate: number }) => Promise<void>;
	close: () => Promise<void>;
	readable: ReadableStream<Uint8Array> | null;
	getInfo: () => SerialPortInfoLike;
}
interface SerialLike {
	requestPort: () => Promise<SerialPortLike>;
	getPorts: () => Promise<SerialPortLike[]>;
}

function getSerial(): SerialLike | undefined {
	return (navigator as unknown as { serial?: SerialLike }).serial;
}

/**
 * Web Serial (USB-CDC / Bluetooth-SPP) barcode source. Reads the port's byte
 * stream, frames it into barcodes with the shared serial-line decoder, dedups
 * via the scan-session, and emits `serial` ScanEvents onto the device scan bus
 * (merged into scanEvents$ by useBarcodeDetection).
 */
export const useSerialScan = (): UseSerialScanResult => {
	const { emit } = useDeviceScanBus();
	const { store } = useAppState();
	const { collection } = useCollection('scanner_profiles');
	const minChars = useObservableEagerState(store.barcode_scanning_min_chars$) as number;
	const prefix = useObservableEagerState(store.barcode_scanning_prefix$) as string;
	const suffix = useObservableEagerState(store.barcode_scanning_suffix$) as string;

	const [connected, setConnected] = React.useState(false);

	const emitRef = React.useRef(emit);
	const settingsRef = React.useRef({ prefix, suffix, minChars: Number(minChars) });
	React.useEffect(() => {
		emitRef.current = emit;
	}, [emit]);
	React.useEffect(() => {
		settingsRef.current = { prefix, suffix, minChars: Number(minChars) };
	}, [prefix, suffix, minChars]);

	const portRef = React.useRef<SerialPortLike | null>(null);
	const abortRef = React.useRef<AbortController | null>(null);
	const sessionRef = React.useRef<ScanSession | null>(null);
	const decoderRef = React.useRef<SerialLineDecoder | null>(null);

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
			while (port.readable) {
				const reader = port.readable.getReader();
				try {
					for (let result = await reader.read(); !result.done; result = await reader.read()) {
						decoder.push(textDecoder.decode(result.value, { stream: true }));
					}
				} catch (error) {
					serialLogger.error('serial read error', { context: { error: String(error) } });
					break;
				} finally {
					reader.releaseLock();
				}
			}
		},
		[getDecoder]
	);

	const attachPort = React.useCallback(
		async (port: SerialPortLike, save: boolean) => {
			await port.open({ baudRate: DEFAULT_BAUD_RATE });
			portRef.current = port;
			abortRef.current = new AbortController();
			setConnected(true);
			decoderRef.current?.reset();
			sessionRef.current?.reset();
			if (save) {
				const info = port.getInfo();
				await collection.insert({
					id: uuidv4(),
					label: '',
					connectionType: 'serial',
					deviceName: `Serial ${info.usbVendorId ?? ''}:${info.usbProductId ?? ''}`.trim(),
					vendorId: info.usbVendorId,
					productId: info.usbProductId,
					createdAt: new Date().toISOString(),
				});
			}
			// The read loop runs for the port's lifetime; failures are logged.
			void readLoop(port);
		},
		[collection, readLoop]
	);

	const connect = React.useCallback(async () => {
		const serial = getSerial();
		if (!serial) {
			return;
		}
		try {
			const port = await serial.requestPort();
			await attachPort(port, true);
		} catch (error) {
			serialLogger.warn('serial connect cancelled or failed', {
				context: { error: String(error) },
			});
		}
	}, [attachPort]);

	const reconnect = React.useCallback(
		async (profile: ScannerProfileDocument) => {
			const serial = getSerial();
			if (!serial) {
				return;
			}
			const ports = await serial.getPorts();
			const match = ports.find((port) => {
				const info = port.getInfo();
				return info.usbVendorId === profile.vendorId && info.usbProductId === profile.productId;
			});
			if (match) {
				await attachPort(match, false);
			}
		},
		[attachPort]
	);

	const disconnect = React.useCallback(async () => {
		abortRef.current?.abort();
		if (portRef.current) {
			await portRef.current.close().catch(() => undefined);
			portRef.current = null;
		}
		setConnected(false);
	}, []);

	return {
		available: isWebSerialSupported(),
		connect,
		reconnect,
		disconnect,
		connected,
	};
};

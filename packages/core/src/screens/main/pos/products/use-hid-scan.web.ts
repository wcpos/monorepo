import * as React from 'react';

import {
	readScannerProfiles,
	saveScannerProfile,
	type ScannerProfile,
} from '@wcpos/query/store-local';
import {
	createScanSession,
	decodeHidPosReport,
	isWebHidSupported,
	type ScanBus,
	scannerDeviceKey,
	type ScanSession,
} from '@wcpos/scanner';
import { getLogger } from '@wcpos/utils/logger';
import { useDocField } from '@wcpos/query';

import { useAppState } from '../../../../contexts/app-state';
import { isChooserCancel } from './chooser-cancel';

import type { UseHidScanResult } from './use-hid-scan';

const hidLogger = getLogger(['wcpos', 'barcode', 'hid']);
// USB HID Point-of-Sale usage page — the structured barcode-scanner mode.
const HID_POS_USAGE_PAGE = 0x8c;

// Minimal WebHID typings (not in the RN/TS lib).
interface HIDInputReportEventLike {
	data: DataView;
	reportId: number;
}
interface HIDDeviceLike {
	productName?: string;
	vendorId: number;
	productId: number;
	collections?: { usagePage?: number }[];
	open: () => Promise<void>;
	close: () => Promise<void>;
	addEventListener: (
		type: 'inputreport',
		listener: (event: HIDInputReportEventLike) => void
	) => void;
	removeEventListener: (
		type: 'inputreport',
		listener: (event: HIDInputReportEventLike) => void
	) => void;
}
interface HIDLike {
	requestDevice: (options: { filters: { usagePage?: number }[] }) => Promise<HIDDeviceLike[]>;
	getDevices: () => Promise<HIDDeviceLike[]>;
}

function getHid(): HIDLike | undefined {
	return (navigator as unknown as { hid?: HIDLike }).hid;
}

function dataViewToBytes(view: DataView): number[] {
	const bytes: number[] = [];
	for (let i = 0; i < view.byteLength; i += 1) {
		bytes.push(view.getUint8(i));
	}
	return bytes;
}

/**
 * WebHID (USB HID POS, usage page 0x8C) barcode source. Each input report
 * carries a complete decoded barcode; decode it, dedup via the scan-session,
 * and emit `hid-pos` ScanEvents onto the device scan bus.
 */
export const useHidScan = (emit: ScanBus['emit']): UseHidScanResult => {
	const { store, storeDB } = useAppState();
	const minChars = useDocField(store, (value) => value.barcode_scanning_min_chars) as number;

	const [connected, setConnected] = React.useState(false);
	const [connectedDeviceKey, setConnectedDeviceKey] = React.useState<string | null>(null);

	const emitRef = React.useRef(emit);
	const minCharsRef = React.useRef(Number(minChars));
	React.useEffect(() => {
		emitRef.current = emit;
	}, [emit]);
	React.useEffect(() => {
		minCharsRef.current = Number(minChars);
	}, [minChars]);

	const deviceRef = React.useRef<HIDDeviceLike | null>(null);
	const listenerRef = React.useRef<((event: HIDInputReportEventLike) => void) | null>(null);
	const sessionRef = React.useRef<ScanSession | null>(null);
	const attachRequestRef = React.useRef(0);
	const lifecycleQueueRef = React.useRef<Promise<void>>(Promise.resolve());
	const mountedRef = React.useRef(true);

	const getSession = React.useCallback((): ScanSession => {
		if (!sessionRef.current) {
			sessionRef.current = createScanSession({
				onAccept: (code, symbology) => {
					if (code.length < minCharsRef.current) {
						return;
					}
					emitRef.current({
						code,
						symbology,
						source: { kind: 'hid-pos' },
						timestamp: Date.now(),
					});
				},
			});
		}
		return sessionRef.current;
	}, []);

	const detach = React.useCallback(async () => {
		const previous = deviceRef.current;
		const listener = listenerRef.current;
		deviceRef.current = null;
		listenerRef.current = null;
		setConnected(false);
		setConnectedDeviceKey(null);
		if (previous) {
			if (listener) {
				previous.removeEventListener('inputreport', listener);
			}
			await previous.close().catch(() => undefined);
		}
	}, []);

	const attachDevice = React.useCallback(
		async (device: HIDDeviceLike, save: boolean) => {
			if (!device.open) {
				return;
			}
			const request = ++attachRequestRef.current;
			let attached = false;
			const pending = lifecycleQueueRef.current.then(async () => {
				if (!mountedRef.current || request !== attachRequestRef.current) {
					return;
				}
				await detach();
				if (!mountedRef.current || request !== attachRequestRef.current) {
					return;
				}
				await device.open();
				if (!mountedRef.current || request !== attachRequestRef.current) {
					await device.close().catch(() => undefined);
					return;
				}
				const session = getSession();
				const listener = (event: HIDInputReportEventLike) => {
					// WebHID delivers event.data as the report body *without* the report id
					// (it is carried separately as event.reportId), so decode it directly.
					const decoded = decodeHidPosReport(dataViewToBytes(event.data));
					if (decoded) {
						session.offer(decoded.code, decoded.symbology);
					}
				};
				device.addEventListener('inputreport', listener);
				deviceRef.current = device;
				listenerRef.current = listener;
				sessionRef.current?.reset();
				setConnected(true);
				setConnectedDeviceKey(
					scannerDeviceKey({
						connectionType: 'hid-pos',
						vendorId: device.vendorId,
						productId: device.productId,
					})
				);
				attached = true;
			});
			lifecycleQueueRef.current = pending.catch(() => undefined);
			await pending;
			if (attached && save) {
				// Upsert on the canonical key: re-connecting an already-registered
				// scanner refreshes it instead of adding a second row.
				await saveScannerProfile(storeDB, {
					deviceKey: scannerDeviceKey({
						connectionType: 'hid-pos',
						vendorId: device.vendorId,
						productId: device.productId,
					}),
					name: '',
					connectionType: 'hid-pos',
					deviceName: device.productName || '',
					vendorId: device.vendorId,
					productId: device.productId,
					createdAt: new Date().toISOString(),
				});
			}
		},
		[storeDB, getSession, detach]
	);

	const connect = React.useCallback(async () => {
		const hid = getHid();
		if (!hid) {
			return;
		}
		try {
			const devices = await hid.requestDevice({ filters: [{ usagePage: HID_POS_USAGE_PAGE }] });
			if (devices[0]) {
				await attachDevice(devices[0], true);
			}
		} catch (error) {
			// Closing the browser's device chooser is a cancel, not a fault.
			const cancelled = isChooserCancel(error);
			hidLogger[cancelled ? 'debug' : 'warn'](
				cancelled ? 'hid connect cancelled' : 'hid connect failed',
				{ context: { error: String(error) } }
			);
		}
	}, [attachDevice]);

	// On mount, silently re-open any already-granted HID device matching a saved
	// hid-pos profile (the browser remembers granted devices across reloads).
	React.useEffect(() => {
		const hid = getHid();
		if (!hid) {
			return;
		}
		let cancelled = false;
		(async () => {
			const [devices, profiles] = await Promise.all([
				hid.getDevices(),
				readScannerProfiles(storeDB, ['hid-pos']),
			]);
			if (cancelled) {
				return;
			}
			const savedKeys = new Set(profiles.map((profile: ScannerProfile) => profile.deviceKey));
			const match = devices.find((device) =>
				savedKeys.has(
					scannerDeviceKey({
						connectionType: 'hid-pos',
						vendorId: device.vendorId,
						productId: device.productId,
					})
				)
			);
			if (match && !cancelled) {
				await attachDevice(match, false);
			}
		})().catch((error) => {
			// A silent best-effort reopen on mount (another tab may hold the device).
			hidLogger.debug('Failed to reopen saved HID scanner', { context: { error: String(error) } });
		});
		return () => {
			cancelled = true;
		};
	}, [storeDB, attachDevice]);

	const disconnect = React.useCallback(async () => {
		attachRequestRef.current += 1;
		const pending = lifecycleQueueRef.current.then(detach);
		lifecycleQueueRef.current = pending.catch(() => undefined);
		await pending;
		setConnected(false);
		setConnectedDeviceKey(null);
	}, [detach]);

	// Release the device when the provider unmounts (logout / app teardown).
	React.useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			attachRequestRef.current += 1;
			const pending = lifecycleQueueRef.current.then(detach);
			lifecycleQueueRef.current = pending.catch(() => undefined);
		};
	}, [detach]);

	return {
		available: isWebHidSupported(),
		connect,
		disconnect,
		connected,
		connectedDeviceKey,
	};
};

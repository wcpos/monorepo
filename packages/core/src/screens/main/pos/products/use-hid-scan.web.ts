import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { v4 as uuidv4 } from 'uuid';

import type { ScannerProfileDocument } from '@wcpos/database';
import {
	createScanSession,
	decodeHidPosReport,
	isWebHidSupported,
	type ScanBus,
	type ScanSession,
} from '@wcpos/scanner';
import { getLogger } from '@wcpos/utils/logger';

import { useAppState } from '../../../../contexts/app-state';
import { useCollection } from '../../hooks/use-collection';

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
	const { store } = useAppState();
	const { collection } = useCollection('scanner_profiles');
	const minChars = useObservableEagerState(store.barcode_scanning_min_chars$) as number;

	const [connected, setConnected] = React.useState(false);

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
		if (previous && listenerRef.current) {
			previous.removeEventListener('inputreport', listenerRef.current);
			await previous.close().catch(() => undefined);
		}
		deviceRef.current = null;
		listenerRef.current = null;
	}, []);

	const attachDevice = React.useCallback(
		async (device: HIDDeviceLike, save: boolean) => {
			if (!device.open) {
				return;
			}
			// Never keep two devices/listeners live at once.
			await detach();
			await device.open();
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
			if (save) {
				await collection.insert({
					id: uuidv4(),
					label: '',
					connectionType: 'hid-pos',
					deviceName: device.productName || `HID ${device.vendorId}:${device.productId}`,
					vendorId: device.vendorId,
					productId: device.productId,
					hidUsagePage: HID_POS_USAGE_PAGE,
					createdAt: new Date().toISOString(),
				});
			}
		},
		[collection, getSession, detach]
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
			hidLogger.warn('hid connect cancelled or failed', { context: { error: String(error) } });
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
				collection.find({ selector: { connectionType: 'hid-pos' } }).exec(),
			]);
			if (cancelled) {
				return;
			}
			const match = devices.find((device) =>
				profiles.some(
					(profile: ScannerProfileDocument) =>
						profile.vendorId === device.vendorId && profile.productId === device.productId
				)
			);
			if (match && !cancelled) {
				await attachDevice(match, false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [collection, attachDevice]);

	const disconnect = React.useCallback(async () => {
		await detach();
		setConnected(false);
	}, [detach]);

	// Release the device when the provider unmounts (logout / app teardown).
	React.useEffect(() => () => void detach(), [detach]);

	return {
		available: isWebHidSupported(),
		connect,
		disconnect,
		connected,
	};
};

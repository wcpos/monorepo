import * as React from 'react';
import { NativeModules, Platform } from 'react-native';

import { Subject } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

import type { ScannerProfileDocument } from '@wcpos/database';
import {
	createScanSession,
	createSerialLineDecoder,
	type ScanEvent,
	type ScanHub,
	type ScanSession,
	type SerialLineDecoder,
} from '@wcpos/scanner';
import { useDocField } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';

import { useAppState } from '../../../../contexts/app-state';
import { useCollection } from '../../hooks/use-collection';

import type { BleManager, Characteristic, Device, Subscription } from 'react-native-ble-plx';
import type { UseBleScanResult } from './use-ble-scan';

const bleLogger = getLogger(['wcpos', 'barcode', 'ble']);

function warn(message: string, error: unknown) {
	bleLogger.warn(message, { context: { error: String(error) } });
}

interface BleGattFamily {
	serviceUuid: string;
	knownNotifyUuids: string[];
}

// Netum SDK/manual module families. UUIDs vary even within one vendor line,
// so new verified vendor families append here rather than replacing the list.
const BLE_GATT_FAMILIES: BleGattFamily[] = [
	// Netum BT825: service FFF0, notify FFF1, write FFF2.
	{
		serviceUuid: '0000fff0-0000-1000-8000-00805f9b34fb',
		knownNotifyUuids: ['0000fff1-0000-1000-8000-00805f9b34fb'],
	},
	// Netum BT246: service 18F0; notification characteristic is discovered.
	{
		serviceUuid: '000018f0-0000-1000-8000-00805f9b34fb',
		knownNotifyUuids: [],
	},
	// Netum iOS demo family: service FF00, notify FF01, write FF02.
	{
		serviceUuid: '0000ff00-0000-1000-8000-00805f9b34fb',
		knownNotifyUuids: ['0000ff01-0000-1000-8000-00805f9b34fb'],
	},
];
const BLE_SERVICE_UUIDS = BLE_GATT_FAMILIES.map((family) => family.serviceUuid);

type BlePlxModule = Pick<typeof import('react-native-ble-plx'), 'BleManager'>;

function findFamily(serviceUuids: string[] | null | undefined): BleGattFamily | undefined {
	const advertised = new Set(serviceUuids?.map((uuid) => uuid.toLowerCase()));
	return BLE_GATT_FAMILIES.find((family) => advertised.has(family.serviceUuid));
}

function findNotifyCharacteristic(
	family: BleGattFamily,
	characteristics: Characteristic[]
): Characteristic | undefined {
	const known = new Set(family.knownNotifyUuids);
	return (
		characteristics.find(
			(characteristic) =>
				characteristic.isNotifiable && known.has(characteristic.uuid.toLowerCase())
		) ?? characteristics.find((characteristic) => characteristic.isNotifiable)
	);
}

/** Streaming base64 -> bytes -> UTF-8 decoder for split BLE notifications. */
function createBleUtf8Decoder() {
	let pending: number[] = [];
	return {
		push(value: string): string {
			const binary = atob(value);
			const bytes = [...pending, ...Array.from(binary, (char) => char.charCodeAt(0))];
			let lead = bytes.length - 1;
			while (lead >= 0 && (bytes[lead] & 0xc0) === 0x80) {
				lead -= 1;
			}
			const leadByte = bytes[lead];
			const expected = leadByte >= 0xf0 ? 4 : leadByte >= 0xe0 ? 3 : leadByte >= 0xc0 ? 2 : 1;
			const completeLength = lead >= 0 && bytes.length - lead < expected ? lead : bytes.length;
			pending = bytes.slice(completeLength);
			const escaped = bytes
				.slice(0, completeLength)
				.map((byte) => `%${byte.toString(16).padStart(2, '0')}`)
				.join('');
			return escaped ? decodeURIComponent(escaped) : '';
		},
		reset() {
			pending = [];
		},
	};
}

/** iOS vendor-GATT BLE barcode source. */
export const useBleScan = (hub: ScanHub): UseBleScanResult => {
	const { store } = useAppState();
	const { collection } = useCollection('scanner_profiles');
	const minChars = useDocField(store, (value) => value.barcode_scanning_min_chars) as number;
	const prefix = useDocField(store, (value) => value.barcode_scanning_prefix) as string;
	const suffix = useDocField(store, (value) => value.barcode_scanning_suffix) as string;

	const [available, setAvailable] = React.useState(false);
	const [connected, setConnected] = React.useState(false);
	const settingsRef = React.useRef({ prefix, suffix, minChars: Number(minChars) });
	const hubRef = React.useRef(hub);
	// The native callback outlives renders, so it reads the latest hub/settings.
	React.useEffect(() => {
		settingsRef.current = { prefix, suffix, minChars: Number(minChars) };
		hubRef.current = hub;
	}, [hub, prefix, suffix, minChars]);

	const mountedRef = React.useRef(false);
	const attachRequestRef = React.useRef(0);
	const modulePromiseRef = React.useRef<Promise<BlePlxModule | null> | null>(null);
	const managerRef = React.useRef<BleManager | null>(null);
	const scanningRef = React.useRef(false);
	const deviceIdRef = React.useRef<string | null>(null);
	const monitorRef = React.useRef<Subscription | null>(null);
	const unregisterRef = React.useRef<(() => void) | null>(null);
	const decoderRef = React.useRef<SerialLineDecoder | null>(null);
	const sessionRef = React.useRef<ScanSession | null>(null);
	const utf8DecoderRef = React.useRef(createBleUtf8Decoder());

	const loadModule = React.useCallback(async (): Promise<BlePlxModule | null> => {
		if (Platform.OS !== 'ios' || !NativeModules.BlePlx) {
			return null;
		}
		if (!modulePromiseRef.current) {
			modulePromiseRef.current = import('react-native-ble-plx').catch((error) => {
				warn('BLE native module is unavailable', error);
				return null;
			});
		}
		return modulePromiseRef.current;
	}, []);

	const getManager = React.useCallback(async (): Promise<BleManager | null> => {
		if (managerRef.current) {
			return managerRef.current;
		}
		const bleModule = await loadModule();
		if (!bleModule) {
			if (mountedRef.current) setAvailable(false);
			return null;
		}
		try {
			managerRef.current = new bleModule.BleManager();
			return managerRef.current;
		} catch (error) {
			if (mountedRef.current) setAvailable(false);
			warn('Failed to initialize BLE manager', error);
			return null;
		}
	}, [loadModule]);

	const teardown = React.useCallback(async () => {
		const manager = managerRef.current;
		const deviceId = deviceIdRef.current;
		deviceIdRef.current = null;
		if (scanningRef.current) {
			scanningRef.current = false;
			await manager?.stopDeviceScan().catch((error) => {
				warn('Failed to stop BLE scanner discovery', error);
			});
		}
		const monitor = monitorRef.current;
		monitorRef.current = null;
		monitor?.remove();
		const unregister = unregisterRef.current;
		unregisterRef.current = null;
		unregister?.();
		decoderRef.current?.reset();
		sessionRef.current?.reset();
		utf8DecoderRef.current.reset();
		if (deviceId) {
			await manager?.cancelDeviceConnection(deviceId).catch((error) => {
				warn('Failed to cancel BLE scanner connection', error);
			});
		}
		if (mountedRef.current) setConnected(false);
	}, []);

	const attachDevice = React.useCallback(
		async (
			device: Device,
			family: BleGattFamily,
			request: number,
			savedProfile?: ScannerProfileDocument
		) => {
			if (!mountedRef.current || request !== attachRequestRef.current) return;
			await teardown();
			if (!mountedRef.current || request !== attachRequestRef.current) return;

			deviceIdRef.current = device.id;
			const discovered = await device.discoverAllServicesAndCharacteristics();
			if (!mountedRef.current || request !== attachRequestRef.current) return;
			const characteristics = await discovered.characteristicsForService(family.serviceUuid);
			const notify = findNotifyCharacteristic(family, characteristics);
			if (!notify) {
				throw new Error(`No notifiable characteristic for BLE service ${family.serviceUuid}`);
			}

			const profiles = savedProfile
				? [savedProfile]
				: await collection.find({ selector: { connectionType: 'ble' } }).exec();
			const existing = profiles.find(
				(profile: ScannerProfileDocument) => profile.blePeripheralId === device.id
			);
			const profileId = existing?.id ?? uuidv4();
			const deviceName = device.name || device.localName || 'bluetooth-le';
			const source = new Subject<ScanEvent>();
			unregisterRef.current = hubRef.current.registerSource(source.asObservable());
			sessionRef.current = createScanSession({
				onAccept: (code) => {
					if (code.length < settingsRef.current.minChars) return;
					source.next({
						code,
						source: { kind: 'ble', profileId, deviceName },
						timestamp: Date.now(),
					});
				},
			});
			decoderRef.current = createSerialLineDecoder({
				getSettings: () => ({
					prefix: settingsRef.current.prefix,
					suffix: settingsRef.current.suffix,
				}),
				onScan: (code) => sessionRef.current?.offer(code),
			});
			monitorRef.current = discovered.monitorCharacteristicForService(
				family.serviceUuid,
				notify.uuid,
				(error, characteristic) => {
					if (request !== attachRequestRef.current) return;
					if (error) {
						source.error(error);
						warn('BLE scanner monitor failed', error);
						attachRequestRef.current += 1;
						void teardown();
						return;
					}
					if (!characteristic?.value) return;
					try {
						decoderRef.current?.push(utf8DecoderRef.current.push(characteristic.value));
					} catch (decodeError) {
						utf8DecoderRef.current.reset();
						decoderRef.current?.reset();
						warn('Failed to decode BLE scanner notification', decodeError);
					}
				}
			);
			if (mountedRef.current && request === attachRequestRef.current) setConnected(true);

			if (!existing) {
				try {
					await collection.insert({
						id: profileId,
						label: '',
						connectionType: 'ble',
						deviceName,
						blePeripheralId: device.id,
						bleServiceUuid: family.serviceUuid,
						createdAt: new Date().toISOString(),
					});
				} catch (error) {
					warn('Failed to save BLE scanner profile', error);
				}
			}
		},
		[collection, teardown]
	);

	const connect = React.useCallback(async () => {
		const manager = await getManager();
		if (!manager) return;
		const request = ++attachRequestRef.current;
		try {
			await teardown();
			if (!mountedRef.current || request !== attachRequestRef.current) return;
			await new Promise<void>((resolve, reject) => {
				let claimed = false;
				const fail = (error: unknown) => {
					if (claimed) return;
					claimed = true;
					reject(error);
				};
				scanningRef.current = true;
				void manager
					.startDeviceScan(BLE_SERVICE_UUIDS, null, (error, discovered) => {
						if (error) {
							fail(error);
							return;
						}
						const family = findFamily(discovered?.serviceUUIDs);
						if (!discovered || !family || claimed) return;
						// V1 deliberately connects the first allowlisted scanner; a
						// multi-scanner chooser is out of scope for the settings action.
						claimed = true;
						void (async () => {
							scanningRef.current = false;
							await manager.stopDeviceScan();
							const connectedDevice = await discovered.connect();
							await attachDevice(connectedDevice, family, request);
						})().then(resolve, reject);
					})
					.catch(fail);
			});
		} catch (error) {
			warn('BLE scanner connect cancelled or failed', error);
			if (request === attachRequestRef.current) {
				attachRequestRef.current += 1;
				await teardown();
			}
		}
	}, [attachDevice, getManager, teardown]);

	const disconnect = React.useCallback(async () => {
		attachRequestRef.current += 1;
		await teardown();
	}, [teardown]);

	const startup = React.useEffectEvent(async () => {
		const bleModule = await loadModule();
		if (!mountedRef.current) return;
		setAvailable(Boolean(bleModule));
		if (!bleModule) return;
		const profiles = await collection.find({ selector: { connectionType: 'ble' } }).exec();
		if (profiles.length !== 1) return;
		const profile = profiles[0] as ScannerProfileDocument;
		const family = BLE_GATT_FAMILIES.find(
			(item) => item.serviceUuid === profile.bleServiceUuid?.toLowerCase()
		);
		if (!profile.blePeripheralId || !family) return;
		const manager = await getManager();
		if (!manager || !mountedRef.current) return;
		const request = ++attachRequestRef.current;
		try {
			await manager.devices([profile.blePeripheralId]);
			const device = await manager.connectToDevice(profile.blePeripheralId);
			await attachDevice(device, family, request, profile);
		} catch (error) {
			warn('Failed to reconnect saved BLE scanner', error);
			if (request === attachRequestRef.current) {
				attachRequestRef.current += 1;
				await teardown();
			}
		}
	});
	const unmount = React.useEffectEvent(async () => {
		await teardown();
		const manager = managerRef.current;
		managerRef.current = null;
		await manager?.destroy().catch((error) => {
			warn('Failed to destroy BLE manager', error);
		});
	});

	// Load the optional module and attempt one unambiguous saved-profile reconnect.
	React.useEffect(() => {
		mountedRef.current = true;
		void startup().catch((error) => warn('Failed to reconnect saved BLE scanner', error));
		return () => {
			mountedRef.current = false;
			attachRequestRef.current += 1;
			void unmount();
		};
	}, []);

	return { available, connect, disconnect, connected };
};

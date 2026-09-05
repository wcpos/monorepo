import { printerLogger } from '../logger';
import {
	BLE_KEEP_ALIVE_MS,
	CHUNK_PAUSE_MS,
	DEFAULT_CHUNK_SIZE,
	PRINT_PROFILES,
	TAIL_SETTLE_MS,
} from './ble-profiles';
import { BLE_PREFIX } from './device-key';
import { logPrintJob } from './log-print-job';

import type { PrinterTransport } from '../types';

type BlePlx = typeof import('react-native-ble-plx');
type BleManager = InstanceType<BlePlx['BleManager']>;
type BleDevice = Awaited<ReturnType<BleManager['connectToDevice']>>;

// Android connects at the 23-byte ATT default; 240 is what the Netum NT-1809 granted and stays
// under the 247-byte cap. Android-only option — iOS negotiates the MTU itself and ignores it.
const ANDROID_MTU = 240;
const NOT_RESPONDING =
	'Bluetooth printer is not responding. Turn it off and on again, then try again.';
const BLUETOOTH_UNAVAILABLE = 'Bluetooth is off or not allowed for this app.';
// ble-plx wording for an adapter that is off, unauthorised or missing the runtime permission.
const UNAVAILABLE_PATTERN =
	/permission|unauthoriz|not authorized|powered ?off|bluetooth (is )?(off|disabled|unsupported)|blemanager is destroyed/i;

let manager: BleManager | undefined;

/** One BleManager per app: a second instance fights the first for the Android adapter. */
export async function getBleManager(): Promise<BleManager> {
	if (!manager) {
		const plx = await import('react-native-ble-plx');
		manager = new plx.BleManager();
	}
	return manager;
}

export function deviceIdFromAddress(address: string): string {
	return address.startsWith(BLE_PREFIX) ? address.slice(BLE_PREFIX.length) : address;
}

interface BleConnection {
	device: BleDevice;
	service: string;
	characteristic: string;
	withoutResponse: boolean;
	timer?: ReturnType<typeof setTimeout>;
	lastWriteAt: number;
	clear(): void;
}
const connections = new Map<string, BleConnection>();

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function toBase64(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

/**
 * The SDK's own message is a wall of text on a till screen, and every failure on this lane is one
 * of two things a cashier can act on: the printer is not there, or Bluetooth is not ours to use.
 */
function toPrinterError(cause: unknown): Error {
	const message = cause instanceof Error ? cause.message : String(cause);
	printerLogger.warn('BLE native printer operation failed', { context: { cause: message } });
	return new Error(UNAVAILABLE_PATTERN.test(message) ? BLUETOOTH_UNAVAILABLE : NOT_RESPONDING);
}

async function findPrintCharacteristic(device: BleDevice) {
	const services = await device.services();
	const uuids = new Set(services.map((service) => service.uuid.toLowerCase()));
	for (const [service, characteristic] of PRINT_PROFILES) {
		if (!uuids.has(service)) continue;
		const found = (await device.characteristicsForService(service)).find(
			(candidate) =>
				candidate.uuid.toLowerCase() === characteristic &&
				(candidate.isWritableWithResponse || candidate.isWritableWithoutResponse)
		);
		if (found) {
			return { service, characteristic, withoutResponse: found.isWritableWithoutResponse };
		}
	}
	return undefined;
}

async function openConnection(deviceId: string): Promise<BleConnection> {
	const cached = connections.get(deviceId);
	if (cached) {
		clearTimeout(cached.timer);
		return cached;
	}
	const bleManager = await getBleManager();
	const device = await bleManager.connectToDevice(deviceId, { requestMTU: ANDROID_MTU });
	await device.discoverAllServicesAndCharacteristics();
	const match = await findPrintCharacteristic(device);
	if (!match) throw new Error(`No supported print service on ${device.name ?? deviceId}`);
	const connection: BleConnection = {
		device,
		...match,
		lastWriteAt: Date.now(),
		clear: () => undefined,
	};
	const subscription = bleManager.onDeviceDisconnected(deviceId, () => connection.clear());
	connection.clear = () => {
		clearTimeout(connection.timer);
		subscription.remove();
		if (connections.get(deviceId) === connection) connections.delete(deviceId);
	};
	connections.set(deviceId, connection);
	printerLogger.info('BLE native print profile matched', {
		context: { profile: match.service, characteristic: match.characteristic },
	});
	return connection;
}

async function writeJob(connection: BleConnection, data: Uint8Array): Promise<number> {
	const { device, service, characteristic } = connection;
	let chunks = 0;
	for (let offset = 0; offset < data.byteLength; offset += DEFAULT_CHUNK_SIZE) {
		const value = toBase64(data.subarray(offset, offset + DEFAULT_CHUNK_SIZE));
		const last = offset + DEFAULT_CHUNK_SIZE >= data.byteLength;
		if (connection.withoutResponse && !last) {
			await device.writeCharacteristicWithoutResponseForService(service, characteristic, value);
		} else {
			await device.writeCharacteristicWithResponseForService(service, characteristic, value);
		}
		connection.lastWriteAt = Date.now();
		chunks += 1;
		if (!last) await pause(CHUNK_PAUSE_MS);
	}
	await pause(TAIL_SETTLE_MS);
	return chunks;
}

function scheduleIdleDisconnect(connection: BleConnection): void {
	clearTimeout(connection.timer);
	connection.timer = setTimeout(
		() => {
			connection.clear();
			connection.device.cancelConnection().catch(() => {
				// Deferred cleanup has no caller, and a link the printer already dropped is fine.
			});
		},
		Math.max(0, BLE_KEEP_ALIVE_MS - (Date.now() - connection.lastWriteAt))
	);
}

/**
 * Generic BLE receipt printers on iOS/Android, over react-native-ble-plx — the phone counterpart
 * of the browser's Web Bluetooth lane, printing through the same GATT profiles. Bluetooth Classic
 * (SPP) printers are not reachable this way; they need a native module of their own.
 *
 * Loaded through a dynamic import, so the peer dependency only has to exist in the dev client.
 */
export class BleNativeAdapter implements PrinterTransport {
	readonly name = 'ble-native';
	private readonly deviceId: string;

	constructor(private address: string) {
		this.deviceId = deviceIdFromAddress(address);
	}

	async printRaw(data: Uint8Array): Promise<void> {
		await logPrintJob(
			'Native',
			{ transport: this.name, target: this.address, bytes: data.byteLength },
			async () => {
				let connection: BleConnection | undefined;
				try {
					connection = await openConnection(this.deviceId);
					const chunks = await writeJob(connection, data);
					printerLogger.info('BLE native print job written', {
						context: { bytes: data.byteLength, chunks },
					});
				} catch (cause) {
					connection?.clear();
					throw toPrinterError(cause);
				}
				scheduleIdleDisconnect(connection);
			}
		);
	}

	async printHtml(_html: string): Promise<void> {
		throw new Error('BleNativeAdapter does not support HTML printing. Use printRaw instead.');
	}

	async disconnect(): Promise<void> {
		const connection = connections.get(this.deviceId);
		if (!connection) return;
		connection.clear();
		await connection.device.cancelConnection().catch(() => {
			// Already gone is the outcome we wanted.
		});
	}
}

import { printerLogger } from '../logger';
import {
	BLE_KEEP_ALIVE_MS,
	CHUNK_PAUSE_MS,
	DEFAULT_CHUNK_SIZE,
	PRINT_PROFILES,
	TAIL_SETTLE_MS,
} from './ble-profiles';

export { BLE_KEEP_ALIVE_MS, BLE_PRINT_SERVICE_UUIDS } from './ble-profiles';

export interface BluetoothDevice extends Pick<
	EventTarget,
	'addEventListener' | 'removeEventListener'
> {
	readonly id: string;
	readonly name?: string | null;
	readonly gatt: BluetoothRemoteGATTServer;
}
export interface WebBluetoothNavigator {
	bluetooth?: {
		requestDevice(options: {
			acceptAllDevices: true;
			optionalServices: string[];
		}): Promise<BluetoothDevice>;
	};
}
interface BluetoothRemoteGATTServer {
	readonly connected: boolean;
	connect(): Promise<BluetoothRemoteGATTServer>;
	disconnect(): void;
	getPrimaryService(uuid: string): Promise<BluetoothRemoteGATTService>;
	getPrimaryServices(): Promise<BluetoothRemoteGATTService[]>;
}
interface BluetoothRemoteGATTService {
	readonly uuid: string;
	getCharacteristic(uuid: string): Promise<BluetoothRemoteGATTCharacteristic>;
}
interface BluetoothRemoteGATTCharacteristic {
	readonly properties: { readonly write: boolean; readonly writeWithoutResponse: boolean };
	writeValueWithResponse(value: ArrayBufferView): Promise<void>;
	writeValueWithoutResponse(value: ArrayBufferView): Promise<void>;
}
interface BleConnection {
	server: BluetoothRemoteGATTServer;
	timer?: ReturnType<typeof setTimeout>;
	clear(): void;
}
const connections = new Map<string, BleConnection>();

export function disconnectBleDevice(deviceId: string): void {
	const connection = connections.get(deviceId);
	if (!connection) return;
	connection.clear();
	try {
		connection.server.disconnect();
	} catch (cause) {
		warnFailure(cause);
		throw cause;
	}
}

const pause = () => new Promise<void>((resolve) => setTimeout(resolve, CHUNK_PAUSE_MS));

function warnFailure(cause: unknown): void {
	printerLogger.warn('BLE GATT printer operation failed', {
		context: { cause: cause instanceof Error ? cause.message : String(cause) },
	});
}

export async function connectBleReceiptPrinter(
	device: BluetoothDevice,
	options: { chunkSize?: number } = {}
): Promise<{
	profile: string;
	write(bytes: Uint8Array): Promise<void>;
	disconnect(): Promise<void>;
}> {
	printerLogger.debug('BLE GATT connect started', {
		context: { device: device.name ?? device.id },
	});

	let connection = connections.get(device.id);
	if (connection && !connection.server.connected) {
		connection.clear();
		connection = undefined;
	}
	clearTimeout(connection?.timer);
	let server: BluetoothRemoteGATTServer | undefined;
	try {
		server = connection?.server ?? (await device.gatt.connect());
		if (!connection) {
			const entry: BleConnection = {
				server,
				clear() {
					clearTimeout(entry.timer);
					connections.delete(device.id);
					device.removeEventListener('gattserverdisconnected', entry.clear);
				},
			};
			connection = entry;
			connections.set(device.id, entry);
			device.addEventListener('gattserverdisconnected', entry.clear);
		}
		let match:
			| {
					profile: string;
					characteristicUuid: string;
					characteristic: BluetoothRemoteGATTCharacteristic;
			  }
			| undefined;

		for (const [profile, characteristicUuid] of PRINT_PROFILES) {
			try {
				const service = await server.getPrimaryService(profile);
				const characteristic = await service.getCharacteristic(characteristicUuid);
				if (!characteristic.properties.write) continue;
				match = { profile, characteristicUuid, characteristic };
				break;
			} catch {
				// Try the next known receipt-printer profile.
			}
		}

		if (!match) {
			const uuids = (await server.getPrimaryServices()).map((service) => service.uuid);
			throw new Error(
				`No supported print service on ${device.name ?? device.id} (services: ${uuids.join(', ')})`
			);
		}

		const { profile, characteristicUuid, characteristic } = match;
		printerLogger.info('BLE GATT print profile matched', {
			context: { profile, characteristic: characteristicUuid },
		});
		const activeConnection = connection;
		let lastWriteAt = Date.now();

		return {
			profile,
			async write(bytes) {
				clearTimeout(activeConnection.timer);
				try {
					const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
					let chunks = 0;
					for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
						const chunk = bytes.slice(offset, offset + chunkSize);
						const last = offset + chunkSize >= bytes.byteLength;
						if (characteristic.properties.writeWithoutResponse && !last) {
							await characteristic.writeValueWithoutResponse(chunk);
						} else {
							await characteristic.writeValueWithResponse(chunk);
						}
						lastWriteAt = Date.now();
						chunks += 1;
						if (!last) await pause();
					}
					await new Promise<void>((resolve) => setTimeout(resolve, TAIL_SETTLE_MS));
					printerLogger.info('BLE GATT print job written', {
						context: { bytes: bytes.byteLength, chunks },
					});
				} catch (cause) {
					warnFailure(cause);
					throw cause;
				}
			},
			async disconnect() {
				if (connections.get(device.id) !== activeConnection) return;
				clearTimeout(activeConnection.timer);
				activeConnection.timer = setTimeout(
					() => {
						try {
							disconnectBleDevice(device.id);
						} catch {
							// Deferred cleanup has no caller; disconnectBleDevice already logged the failure.
						}
					},
					Math.max(0, BLE_KEEP_ALIVE_MS - (Date.now() - lastWriteAt))
				);
			},
		};
	} catch (cause) {
		connection?.clear();
		try {
			server?.disconnect();
		} catch {
			// Preserve the operation failure that triggered cleanup.
		}
		warnFailure(cause);
		throw cause;
	}
}

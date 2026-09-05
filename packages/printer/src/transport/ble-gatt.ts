import { printerLogger } from '../logger';

export interface BluetoothDevice {
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
	readonly properties: { readonly writeWithoutResponse: boolean };
	writeValue(value: ArrayBufferView): Promise<void>;
	writeValueWithoutResponse(value: ArrayBufferView): Promise<void>;
}
// 20 bytes is the BLE default-MTU floor that every printer accepts.
const DEFAULT_CHUNK_SIZE = 20;
const CHUNK_PAUSE_MS = 20;

const PRINT_PROFILES = [
	['000018f0-0000-1000-8000-00805f9b34fb', '00002af1-0000-1000-8000-00805f9b34fb'],
	['0000ff00-0000-1000-8000-00805f9b34fb', '0000ff02-0000-1000-8000-00805f9b34fb'],
	['49535343-fe7d-4ae5-8fa9-9fafd205e455', '49535343-8841-43f4-a8d4-ecbe34729bb3'],
	['e7810a71-73ae-499d-8c15-faa9aef0c3f2', 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f'],
] as const;

export const BLE_PRINT_SERVICE_UUIDS = PRINT_PROFILES.map(([service]) => service);

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

	try {
		const server = await device.gatt.connect();
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

		return {
			profile,
			async write(bytes) {
				try {
					const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
					let chunks = 0;
					for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
						const chunk = bytes.slice(offset, offset + chunkSize);
						if (characteristic.properties.writeWithoutResponse) {
							await characteristic.writeValueWithoutResponse(chunk);
						} else {
							await characteristic.writeValue(chunk);
						}
						chunks += 1;
						if (offset + chunkSize < bytes.byteLength) await pause();
					}
					printerLogger.info('BLE GATT print job written', {
						context: { bytes: bytes.byteLength, chunks },
					});
				} catch (cause) {
					warnFailure(cause);
					throw cause;
				}
			},
			async disconnect() {
				try {
					server.disconnect();
				} catch (cause) {
					warnFailure(cause);
					throw cause;
				}
			},
		};
	} catch (cause) {
		warnFailure(cause);
		throw cause;
	}
}

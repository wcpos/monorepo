import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BleNativeAdapter } from '../ble-native-adapter';
import { createDeviceTransport } from '../device-adapter';

const PROFILE_18F0 = [
	'000018f0-0000-1000-8000-00805f9b34fb',
	'00002af1-0000-1000-8000-00805f9b34fb',
];
const PROFILE_FF00 = [
	'0000ff00-0000-1000-8000-00805f9b34fb',
	'0000ff02-0000-1000-8000-00805f9b34fb',
];

const { manager, state } = vi.hoisted(() => {
	const state: { device: unknown; connectError?: Error } = { device: undefined };
	const manager = {
		connectToDevice: vi.fn(async () => {
			if (state.connectError) throw state.connectError;
			return state.device;
		}),
		onDeviceDisconnected: vi.fn(() => ({ remove: vi.fn() })),
	};
	return { manager, state };
});

vi.mock('react-native-ble-plx', () => ({
	BleManager: class {
		constructor() {
			return manager;
		}
	},
}));

function makeDevice(profiles: string[][], withoutResponse = true) {
	return {
		id: 'dev-1',
		name: 'Netum NT-1809',
		discoverAllServicesAndCharacteristics: vi.fn(async () => undefined),
		services: vi.fn(async () => profiles.map(([service]) => ({ uuid: service.toUpperCase() }))),
		characteristicsForService: vi.fn(async (service: string) => {
			const profile = profiles.find(([uuid]) => uuid === service);
			return profile
				? [
						{
							uuid: profile[1],
							isWritableWithResponse: true,
							isWritableWithoutResponse: withoutResponse,
						},
					]
				: [];
		}),
		writeCharacteristicWithResponseForService: vi.fn(
			async (_service: string, _characteristic: string, _value: string) => undefined
		),
		writeCharacteristicWithoutResponseForService: vi.fn(
			async (_service: string, _characteristic: string, _value: string) => undefined
		),
		cancelConnection: vi.fn(async () => undefined),
	};
}

let device: ReturnType<typeof makeDevice>;

beforeEach(() => {
	device = makeDevice([PROFILE_18F0]);
	state.device = device;
	state.connectError = undefined;
	manager.connectToDevice.mockClear();
});

afterEach(async () => {
	await new BleNativeAdapter('ble:dev-1').disconnect();
});

describe('BleNativeAdapter', () => {
	it('writes 20-byte chunks and acknowledges the last one', async () => {
		await new BleNativeAdapter('ble:dev-1').printRaw(new Uint8Array(50).fill(65));

		expect(manager.connectToDevice).toHaveBeenCalledWith('dev-1', { requestMTU: 240 });
		expect(device.writeCharacteristicWithoutResponseForService).toHaveBeenCalledTimes(2);
		expect(device.writeCharacteristicWithResponseForService).toHaveBeenCalledTimes(1);
		const [service, characteristic, value] =
			device.writeCharacteristicWithResponseForService.mock.calls[0];
		expect([service, characteristic]).toEqual(PROFILE_18F0);
		// The tail chunk is the 10 bytes left over after two full 20-byte chunks.
		expect(atob(value).length).toBe(10);
		expect(
			device.writeCharacteristicWithoutResponseForService.mock.calls.map(
				([, , chunk]) => atob(chunk).length
			)
		).toEqual([20, 20]);
	});

	it('reuses the connection for a second job inside the keep-alive window', async () => {
		const adapter = new BleNativeAdapter('ble:dev-1');
		await adapter.printRaw(new Uint8Array(4));
		await adapter.printRaw(new Uint8Array(4));

		expect(manager.connectToDevice).toHaveBeenCalledTimes(1);
		expect(device.cancelConnection).not.toHaveBeenCalled();
	});

	it('falls back to the next print profile when the first is absent', async () => {
		device = makeDevice([PROFILE_FF00]);
		state.device = device;

		await new BleNativeAdapter('ble:dev-1').printRaw(new Uint8Array(4));

		expect(device.writeCharacteristicWithResponseForService).toHaveBeenCalledWith(
			PROFILE_FF00[0],
			PROFILE_FF00[1],
			expect.any(String)
		);
	});

	it.each([
		[
			'Device dev-1 not found',
			'Bluetooth printer is not responding. Turn it off and on again, then try again.',
		],
		['BluetoothLE is powered off', 'Bluetooth is off or not allowed for this app.'],
	])('maps %s to a plain message', async (cause, message) => {
		state.connectError = new Error(cause);

		await expect(new BleNativeAdapter('ble:dev-1').printRaw(new Uint8Array(4))).rejects.toThrow(
			message
		);
	});

	it('routes a generic bluetooth profile on native to the BLE adapter', async () => {
		const transport = await createDeviceTransport({
			id: 'p1',
			name: 'Netum NT-1809',
			connectionType: 'bluetooth',
			vendor: 'generic',
			address: 'ble:dev-1',
			port: 0,
			language: 'esc-pos',
			columns: 32,
			fullReceiptRaster: false,
			autoCut: true,
			autoOpenDrawer: false,
			isDefault: false,
			isBuiltIn: false,
		});

		expect(transport).toBeInstanceOf(BleNativeAdapter);
		expect(transport.name).toBe('ble-native');
	});
});

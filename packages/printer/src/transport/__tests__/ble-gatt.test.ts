import { afterEach, describe, expect, it, vi } from 'vitest';

import { BLE_KEEP_ALIVE_MS, connectBleReceiptPrinter, disconnectBleDevice } from '../ble-gatt';

const PROFILE_18F0 = {
	service: '000018f0-0000-1000-8000-00805f9b34fb',
	characteristic: '00002af1-0000-1000-8000-00805f9b34fb',
};
const PROFILE_FF00 = {
	service: '0000ff00-0000-1000-8000-00805f9b34fb',
	characteristic: '0000ff02-0000-1000-8000-00805f9b34fb',
};

let events: EventTarget;
afterEach(() => {
	events?.dispatchEvent(new Event('gattserverdisconnected'));
	vi.useRealTimers();
});

function mockDevice(services: Record<string, string[]>, supportsAcknowledgedWrites = true) {
	const characteristics = new Map<
		string,
		{
			writeValueWithoutResponse: ReturnType<typeof vi.fn>;
			writeValueWithResponse: ReturnType<typeof vi.fn>;
		}
	>();
	const primaryServices = Object.entries(services).map(([serviceUuid, characteristicUuids]) => ({
		uuid: serviceUuid,
		getCharacteristic: vi.fn(async (characteristicUuid: string) => {
			if (!characteristicUuids.includes(characteristicUuid)) throw new Error('Not found');
			const characteristic = {
				uuid: characteristicUuid,
				properties: { writeWithoutResponse: true, write: supportsAcknowledgedWrites },
				writeValueWithoutResponse: vi.fn(async () => undefined),
				writeValueWithResponse: vi.fn(async () => undefined),
			};
			characteristics.set(`${serviceUuid}/${characteristicUuid}`, characteristic);
			return characteristic;
		}),
	}));
	events = new EventTarget();
	const server = {
		connected: true,
		getPrimaryService: vi.fn(async (uuid: string) => {
			const service = primaryServices.find((candidate) => candidate.uuid === uuid);
			if (!service) throw new Error('Not found');
			return service;
		}),
		getPrimaryServices: vi.fn(async () => primaryServices),
		disconnect: vi.fn(),
	};
	const device = {
		id: 'printer-id',
		name: 'Receipt Printer',
		addEventListener: events.addEventListener.bind(events),
		removeEventListener: events.removeEventListener.bind(events),
		gatt: { connect: vi.fn(async () => server) },
	} as unknown as Parameters<typeof connectBleReceiptPrinter>[0];
	return { device, server, characteristics };
}

describe('connectBleReceiptPrinter', () => {
	it('reuses the server and cancels the idle disconnect when a second job starts', async () => {
		vi.useFakeTimers();
		const { device, server } = mockDevice({
			[PROFILE_18F0.service]: [PROFILE_18F0.characteristic],
		});
		const first = await connectBleReceiptPrinter(device);
		const writing = first.write(Uint8Array.of(1));
		await vi.advanceTimersByTimeAsync(300);
		await writing;
		await first.disconnect();
		await vi.advanceTimersByTimeAsync(30_000);
		const second = await connectBleReceiptPrinter(device);
		await vi.advanceTimersByTimeAsync(BLE_KEEP_ALIVE_MS);
		expect(device.gatt.connect).toHaveBeenCalledOnce();
		expect(server.disconnect).not.toHaveBeenCalled();
		const secondWrite = second.write(Uint8Array.of(2));
		await vi.advanceTimersByTimeAsync(300);
		await secondWrite;
		await second.disconnect();
	});

	it('disconnects after the keep-alive window measured from the last write', async () => {
		vi.useFakeTimers();
		const { device, server } = mockDevice({
			[PROFILE_18F0.service]: [PROFILE_18F0.characteristic],
		});
		const printer = await connectBleReceiptPrinter(device);
		const writing = printer.write(Uint8Array.of(1));
		await vi.advanceTimersByTimeAsync(300);
		await writing;
		await printer.disconnect();
		await vi.advanceTimersByTimeAsync(BLE_KEEP_ALIVE_MS - 301);
		expect(server.disconnect).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(server.disconnect).toHaveBeenCalledOnce();
		await connectBleReceiptPrinter(device);
		expect(device.gatt.connect).toHaveBeenCalledTimes(2);
	});

	it('clears the cached server and idle timer on gattserverdisconnected', async () => {
		vi.useFakeTimers();
		const { device, server } = mockDevice({
			[PROFILE_18F0.service]: [PROFILE_18F0.characteristic],
		});
		const printer = await connectBleReceiptPrinter(device);
		await printer.disconnect();
		events.dispatchEvent(new Event('gattserverdisconnected'));
		await connectBleReceiptPrinter(device);
		await vi.advanceTimersByTimeAsync(BLE_KEEP_ALIVE_MS);
		expect(device.gatt.connect).toHaveBeenCalledTimes(2);
		expect(server.disconnect).not.toHaveBeenCalled();
	});

	it('disconnectBleDevice drops the link now and clears its idle timer and cache', async () => {
		vi.useFakeTimers();
		const { device, server } = mockDevice({
			[PROFILE_18F0.service]: [PROFILE_18F0.characteristic],
		});
		const printer = await connectBleReceiptPrinter(device);
		await printer.disconnect();
		disconnectBleDevice(device.id);
		expect(server.disconnect).toHaveBeenCalledOnce();
		await connectBleReceiptPrinter(device);
		await vi.advanceTimersByTimeAsync(BLE_KEEP_ALIVE_MS);
		expect(device.gatt.connect).toHaveBeenCalledTimes(2);
		expect(server.disconnect).toHaveBeenCalledOnce();
	});

	it('chooses the ff00/ff02 profile when it is the first available profile', async () => {
		const { device } = mockDevice({ [PROFILE_FF00.service]: [PROFILE_FF00.characteristic] });

		const connection = await connectBleReceiptPrinter(device);

		expect(connection.profile).toBe(PROFILE_FF00.service);
	});

	it('prefers the 18f0/2af1 profile when later profiles also exist', async () => {
		const { device, server } = mockDevice({
			[PROFILE_FF00.service]: [PROFILE_FF00.characteristic],
			[PROFILE_18F0.service]: [PROFILE_18F0.characteristic],
		});

		const connection = await connectBleReceiptPrinter(device);

		expect(connection.profile).toBe(PROFILE_18F0.service);
		expect(server.getPrimaryService).toHaveBeenCalledTimes(1);
	});

	it('names discovered services when no supported profile exists', async () => {
		const unknownService = '12345678-1234-1234-1234-123456789abc';
		const { device, server } = mockDevice({
			[unknownService]: ['87654321-4321-4321-4321-cba987654321'],
		});
		server.disconnect.mockImplementation(() => {
			throw new Error('Disconnect failed');
		});

		await expect(connectBleReceiptPrinter(device)).rejects.toThrow(
			`No supported print service on Receipt Printer (services: ${unknownService})`
		);
		expect(server.disconnect).toHaveBeenCalledOnce();
	});

	it('rejects a known profile without acknowledged-write support', async () => {
		const { device, server } = mockDevice(
			{ [PROFILE_18F0.service]: [PROFILE_18F0.characteristic] },
			false
		);

		await expect(connectBleReceiptPrinter(device)).rejects.toThrow(
			`No supported print service on Receipt Printer (services: ${PROFILE_18F0.service})`
		);
		expect(server.disconnect).toHaveBeenCalledOnce();
	});

	it('writes a 50-byte job in 20/20-byte chunks without response and the last 10 bytes acknowledged', async () => {
		const { device, characteristics } = mockDevice({
			[PROFILE_18F0.service]: [PROFILE_18F0.characteristic],
		});
		const connection = await connectBleReceiptPrinter(device, { chunkSize: 20 });

		await connection.write(Uint8Array.from({ length: 50 }, (_, index) => index));

		const characteristic = characteristics.get(
			`${PROFILE_18F0.service}/${PROFILE_18F0.characteristic}`
		)!;
		const writes = vi.mocked(characteristic.writeValueWithoutResponse).mock.calls;
		expect(writes.map(([chunk]) => chunk.byteLength)).toEqual([20, 20]);
		// The tail goes as an acknowledged write so the link is not dropped with bytes in flight.
		const acknowledged = vi.mocked(characteristic.writeValueWithResponse).mock.calls;
		expect(acknowledged.map(([chunk]) => chunk.byteLength)).toEqual([10]);
	});
});

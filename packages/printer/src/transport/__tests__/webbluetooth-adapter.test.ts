import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WebBluetoothAdapter } from '../webbluetooth-adapter';

const mocks = vi.hoisted(() => ({
	connectBleReceiptPrinter: vi.fn(),
	disconnect: vi.fn(),
	loadWebDevice: vi.fn(),
	print: vi.fn(),
	reconnect: vi.fn(),
	waitForWebPrinterReconnect: vi.fn(),
	write: vi.fn(),
}));

vi.mock('../ble-gatt', () => ({ connectBleReceiptPrinter: mocks.connectBleReceiptPrinter }));
vi.mock('../web-device-store', () => ({ loadWebDevice: mocks.loadWebDevice }));
vi.mock('../web-reconnect', () => ({
	waitForWebPrinterReconnect: mocks.waitForWebPrinterReconnect,
}));
vi.mock('@point-of-sale/webbluetooth-receipt-printer', () => ({
	default: class {
		print = mocks.print;
		reconnect = mocks.reconnect;
		addEventListener = vi.fn();
	},
}));
describe('WebBluetoothAdapter', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.connectBleReceiptPrinter.mockResolvedValue({
			profile: 'profile',
			write: mocks.write,
			disconnect: mocks.disconnect,
		});
	});

	it('uses the stored BluetoothDevice GATT connection directly', async () => {
		const device = { id: 'printer-id', gatt: { connect: vi.fn() } };
		const data = Uint8Array.of(1, 2, 3);
		mocks.loadWebDevice.mockReturnValue(device);

		await new WebBluetoothAdapter('profile-1').printRaw(data);

		expect(mocks.connectBleReceiptPrinter).toHaveBeenCalledWith(device);
		expect(mocks.write).toHaveBeenCalledWith(data);
		expect(mocks.disconnect).toHaveBeenCalledOnce();
		expect(mocks.waitForWebPrinterReconnect).not.toHaveBeenCalled();
	});

	it('keeps the library reconnect path for stored descriptors without GATT', async () => {
		const device = { id: 'printer-id', type: 'bluetooth', language: 'esc-pos' };
		const data = Uint8Array.of(1, 2, 3);
		mocks.loadWebDevice.mockReturnValue(device);

		await new WebBluetoothAdapter('profile-1').printRaw(data);

		expect(mocks.waitForWebPrinterReconnect).toHaveBeenCalledWith(
			expect.objectContaining({ reconnect: mocks.reconnect }),
			device,
			'Bluetooth'
		);
		expect(mocks.print).toHaveBeenCalledWith(data);
		expect(mocks.connectBleReceiptPrinter).not.toHaveBeenCalled();
	});
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { forgetBleDevice, getBleDevice, rememberBleDevice } from '../ble-device-registry';
import { BLE_PRINT_SERVICE_UUIDS } from '../ble-gatt';
import { BLE_RECONNECT_DELAY_MS, WebBluetoothAdapter } from '../webbluetooth-adapter';

const mocks = vi.hoisted(() => ({
	connectBleReceiptPrinter: vi.fn(),
	disconnect: vi.fn(),
	loadWebDevice: vi.fn(),
	print: vi.fn(),
	reconnect: vi.fn(),
	waitForWebPrinterReconnect: vi.fn(),
	write: vi.fn(),
}));

vi.mock('../ble-gatt', async (importOriginal) => ({
	...(await importOriginal<typeof import('../ble-gatt')>()),
	connectBleReceiptPrinter: mocks.connectBleReceiptPrinter,
}));
vi.mock('../../logger', () => ({ printerLogger: { debug: vi.fn() } }));
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
		vi.resetAllMocks();
		forgetBleDevice('profile-1');
		mocks.connectBleReceiptPrinter.mockResolvedValue({
			profile: 'profile',
			write: mocks.write,
			disconnect: mocks.disconnect,
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it('prefers the live BluetoothDevice even without a stored descriptor', async () => {
		const device = liveDevice();
		const data = Uint8Array.of(1, 2, 3);
		rememberBleDevice('profile-1', device);

		await new WebBluetoothAdapter('profile-1').printRaw(data);

		expect(mocks.connectBleReceiptPrinter).toHaveBeenCalledWith(device);
		expect(mocks.write).toHaveBeenCalledWith(data);
		expect(mocks.disconnect).toHaveBeenCalledOnce();
		expect(mocks.waitForWebPrinterReconnect).not.toHaveBeenCalled();
	});

	it.each(['disconnected', 'not connected', 'NetworkError'])(
		'retains a device after a write failure without replaying the job: %s',
		async (message) => {
			const device = liveDevice();
			rememberBleDevice('profile-1', device);
			mocks.write.mockRejectedValueOnce(new Error(message));
			await expect(new WebBluetoothAdapter('profile-1').printRaw(Uint8Array.of(1))).rejects.toThrow(
				message
			);
			expect(getBleDevice('profile-1')).toBe(device);
			expect(mocks.connectBleReceiptPrinter).toHaveBeenCalledOnce();
			expect(mocks.disconnect).toHaveBeenCalledOnce();
		}
	);

	it.each([false, true])(
		'retries a transient connection failure once, fails twice=%s',
		async (twice) => {
			vi.useFakeTimers();
			const device = liveDevice();
			rememberBleDevice('profile-1', device);
			mocks.connectBleReceiptPrinter.mockRejectedValueOnce(
				new Error('Bluetooth Device is no longer in range.')
			);
			if (twice)
				mocks.connectBleReceiptPrinter.mockRejectedValueOnce(
					new DOMException('Offline', 'NetworkError')
				);
			const data = Uint8Array.of(1, 2);
			const printing = new WebBluetoothAdapter('profile-1').printRaw(data);
			const outcome = printing.then(
				() => undefined,
				(error: unknown) => error
			);
			await vi.advanceTimersByTimeAsync(BLE_RECONNECT_DELAY_MS - 1);
			expect(mocks.connectBleReceiptPrinter).toHaveBeenCalledOnce();
			await vi.advanceTimersByTimeAsync(1);
			if (twice)
				expect(await outcome).toEqual(
					new Error(
						'Bluetooth printer is not responding. Turn it off and on again, then try again.'
					)
				);
			else expect(await outcome).toBeUndefined();
			expect(mocks.connectBleReceiptPrinter).toHaveBeenCalledTimes(2);
			expect(getBleDevice('profile-1')).toBe(device);
			if (twice) expect(mocks.write).not.toHaveBeenCalled();
			else expect(mocks.write).toHaveBeenCalledExactlyOnceWith(data);
			expect(mocks.waitForWebPrinterReconnect).not.toHaveBeenCalled();
		}
	);

	it('re-requests a descriptor and auto-selects its id from Electron candidates', async () => {
		const device = liveDevice();
		let candidates!: (devices: { id: string; name: string }[]) => void;
		let resolveDevice!: (device: ReturnType<typeof liveDevice>) => void;
		const unsubscribe = vi.fn();
		const send = vi.fn();
		vi.stubGlobal('window', {
			electronAPI: {
				ipcRenderer: {
					send,
					on: (_channel: string, listener: typeof candidates) => {
						candidates = listener;
						return unsubscribe;
					},
				},
			},
		});
		const requestDevice = vi.fn(
			() =>
				new Promise((resolve) => {
					resolveDevice = resolve;
				})
		);
		vi.stubGlobal('navigator', { bluetooth: { requestDevice } });
		mocks.loadWebDevice.mockReturnValue({ id: 'printer-id', type: 'bluetooth' });
		const data = Uint8Array.of(1, 2);
		const printing = new WebBluetoothAdapter('profile-1').printRaw(data);
		expect(requestDevice).toHaveBeenCalledWith({
			acceptAllDevices: true,
			optionalServices: BLE_PRINT_SERVICE_UUIDS,
		});
		candidates([{ id: 'other', name: 'Other' }]);
		expect(send).not.toHaveBeenCalled();
		candidates([{ id: 'printer-id', name: 'Printer' }]);
		candidates([{ id: 'printer-id', name: 'Printer' }]);
		expect(send).toHaveBeenCalledExactlyOnceWith('bluetooth-device-selected', 'printer-id');
		resolveDevice(device);
		await printing;
		expect(getBleDevice('profile-1')).toBe(device);
		expect(mocks.connectBleReceiptPrinter).toHaveBeenCalledWith(device);
		expect(mocks.write).toHaveBeenCalledWith(data);
		expect(unsubscribe).toHaveBeenCalledOnce();
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

function liveDevice() {
	return {
		id: 'printer-id',
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		gatt: {
			connected: false,
			connect: vi.fn(),
			disconnect: vi.fn(),
			getPrimaryService: vi.fn(),
			getPrimaryServices: vi.fn(),
		},
	};
}

it('registry remembers the live object and forgets only its key', () => {
	const device = liveDevice();
	rememberBleDevice('one', device);
	rememberBleDevice('two', device);
	expect(getBleDevice('one')).toBe(device);
	forgetBleDevice('one');
	expect(getBleDevice('one')).toBeUndefined();
	expect(getBleDevice('two')).toBe(device);
	forgetBleDevice('two');
});

import { afterEach, describe, expect, it, vi } from 'vitest';

import { isWebBluetoothSupported, isWebUsbSupported } from '../device-capabilities';

describe('device-capabilities', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('falls back to global navigator when no argument is passed', () => {
		vi.stubGlobal('navigator', { usb: {}, bluetooth: {} });
		expect(isWebUsbSupported()).toBe(true);
		expect(isWebBluetoothSupported()).toBe(true);
	});

	it('detects WebUSB from a navigator-like object', () => {
		expect(isWebUsbSupported({ usb: {} })).toBe(true);
		expect(isWebUsbSupported({})).toBe(false);
		expect(isWebUsbSupported(undefined)).toBe(false);
	});

	it('detects Web Bluetooth from a navigator-like object', () => {
		expect(isWebBluetoothSupported({ bluetooth: {} })).toBe(true);
		expect(isWebBluetoothSupported({})).toBe(false);
		expect(isWebBluetoothSupported(undefined)).toBe(false);
	});
});

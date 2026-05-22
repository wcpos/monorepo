import { describe, expect, it } from 'vitest';

import { isWebBluetoothSupported, isWebUsbSupported } from '../device-capabilities';

describe('device-capabilities', () => {
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

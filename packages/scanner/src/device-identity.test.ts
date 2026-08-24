import { describe, expect, it } from 'vitest';

import {
	isCanonicalUuid,
	normalizeUuid,
	SCANNER_DEVICE_KEY_MAX_LENGTH,
	scannerDeviceKey,
	scannerTransport,
} from './device-identity';

describe('scannerDeviceKey', () => {
	it('gives the same key for the same device however the platform cased its UUID', () => {
		// The bug this replaces: the write path lowercased a Bluetooth service
		// UUID, the silent-reconnect path compared it raw, so a scanner saved
		// from one and matched from the other never reconnected.
		const typedByMerchant = scannerDeviceKey({
			connectionType: 'bluetooth-spp',
			serviceUuid: '00001101-0000-1000-8000-00805F9B34FB',
		});
		const reportedByBrowser = scannerDeviceKey({
			connectionType: 'bluetooth-spp',
			serviceUuid: '00001101-0000-1000-8000-00805f9b34fb',
		});
		expect(typedByMerchant).toBe(reportedByBrowser);
	});

	it('trims surrounding whitespace from a pasted UUID', () => {
		expect(
			scannerDeviceKey({
				connectionType: 'bluetooth-le',
				peripheralId: '  A1B2C3D4-0000-1000-8000-00805F9B34FB \n',
			})
		).toBe(
			scannerDeviceKey({
				connectionType: 'bluetooth-le',
				peripheralId: 'a1b2c3d4-0000-1000-8000-00805f9b34fb',
			})
		);
	});

	it('separates the same USB ids reached over different connection types', () => {
		// A scanner registered over HID-POS and one registered over USB-CDC are
		// two profiles: they reconnect through different APIs and the merchant
		// should see both.
		const hid = scannerDeviceKey({ connectionType: 'hid-pos', vendorId: 7851, productId: 3330 });
		const serial = scannerDeviceKey({
			connectionType: 'usb-serial',
			vendorId: 7851,
			productId: 3330,
		});
		expect(hid).not.toBe(serial);
	});

	it('separates two keyboard scanners that share a vendor and product id', () => {
		const netum = scannerDeviceKey({
			connectionType: 'keyboard',
			vendorId: 0,
			productId: 0,
			deviceName: 'Netum NT-1228BC',
		});
		const virtualKeyboard = scannerDeviceKey({
			connectionType: 'keyboard',
			vendorId: 0,
			productId: 0,
			deviceName: 'Android Virtual Keyboard',
		});
		expect(netum).not.toBe(virtualKeyboard);
	});

	it('folds case and whitespace in a keyboard device name', () => {
		expect(
			scannerDeviceKey({
				connectionType: 'keyboard',
				vendorId: 1234,
				productId: 5678,
				deviceName: '  Netum   NT-1228BC  ',
			})
		).toBe(
			scannerDeviceKey({
				connectionType: 'keyboard',
				vendorId: 1234,
				productId: 5678,
				deviceName: 'netum nt-1228bc',
			})
		);
	});

	it('stays inside the primary-key length ceiling for an absurd device name', () => {
		const key = scannerDeviceKey({
			connectionType: 'keyboard',
			vendorId: 65535,
			productId: 65535,
			deviceName: 'x'.repeat(500),
		});
		expect(key.length).toBeLessThanOrEqual(SCANNER_DEVICE_KEY_MAX_LENGTH);
	});
});

describe('isCanonicalUuid', () => {
	it.each([
		['00001101-0000-1000-8000-00805f9b34fb', true],
		['00001101-0000-1000-8000-00805F9B34FB', true],
		['  00001101-0000-1000-8000-00805f9b34fb  ', true],
		['1101', false],
		['00001101-0000-1000-8000-00805f9b34f', false],
		['00001101_0000_1000_8000_00805f9b34fb', false],
		['', false],
	])('%s -> %s', (value, expected) => {
		expect(isCanonicalUuid(value)).toBe(expected);
	});
});

describe('normalizeUuid', () => {
	it('lowercases and trims', () => {
		expect(normalizeUuid('  ABCD-EF  ')).toBe('abcd-ef');
	});
});

describe('scannerTransport', () => {
	it('names the transport a merchant can see', () => {
		expect(scannerTransport('usb-serial')).toBe('usb');
		expect(scannerTransport('bluetooth-spp')).toBe('bluetooth');
		expect(scannerTransport('bluetooth-le')).toBe('bluetooth');
	});

	it('refuses to guess a bus WebHID does not report', () => {
		// Chromium can surface Bluetooth HID devices through WebHID, so calling
		// hid-pos "USB" would show a merchant a guess as a fact.
		expect(scannerTransport('hid-pos')).toBe('unknown');
	});

	it('refuses to guess a bus for a keyboard-mode scanner', () => {
		expect(scannerTransport('keyboard')).toBe('unknown');
	});
});

import { describe, expect, it } from 'vitest';

import { mapWebDeviceToDiscoveredPrinter } from '../map-web-device';

describe('mapWebDeviceToDiscoveredPrinter', () => {
	it('maps a USB device, deriving vendor from language', () => {
		expect(
			mapWebDeviceToDiscoveredPrinter({
				type: 'usb',
				language: 'star-prnt',
				serialNumber: 'SN123',
				productName: 'mC-Print3',
			})
		).toEqual({
			id: 'webusb:SN123',
			name: 'mC-Print3',
			connectionType: 'usb',
			address: 'webusb:SN123',
			vendor: 'star',
		});
	});

	it('maps a Bluetooth device using its id and name', () => {
		expect(
			mapWebDeviceToDiscoveredPrinter({
				type: 'bluetooth',
				language: 'esc-pos',
				id: 'BT9',
				name: 'TM-P20',
			})
		).toEqual({
			id: 'webbluetooth:BT9',
			name: 'TM-P20',
			connectionType: 'bluetooth',
			address: 'webbluetooth:BT9',
			vendor: 'epson',
		});
	});
});

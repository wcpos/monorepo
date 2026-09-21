import { describe, expect, it } from 'vitest';

import { identifyModel } from '../identify-models';
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

	it('uses a collision-resistant fallback when serial/id are missing', () => {
		const first = mapWebDeviceToDiscoveredPrinter({
			type: 'usb',
			language: 'esc-pos',
			productName: 'TM-m30III',
			vendorId: 1208,
			productId: 1,
		});
		const second = mapWebDeviceToDiscoveredPrinter({
			type: 'usb',
			language: 'esc-pos',
			productName: 'TM-m30III',
			vendorId: 1208,
			productId: 2,
		});

		expect(first.id).not.toBe(second.id);
		expect(first.address).toBe(first.id);
		expect(second.address).toBe(second.id);
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
	it('carries the USB product string as the name so the model table can read it', () => {
		const row = mapWebDeviceToDiscoveredPrinter({
			type: 'usb',
			language: 'esc-pos',
			serialNumber: 'SN999',
			manufacturerName: 'EPSON',
			name: 'USB printer',
			productName: 'TM-m30III',
		});

		expect(row.name).toBe('TM-m30III');
		expect(identifyModel(row.name)).toEqual({ model: 'TM-m30III', columns: 48 });
	});
});

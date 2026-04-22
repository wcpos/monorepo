import { describe, expect, it } from 'vitest';

import { mapEpsonDiscoveryDevice } from '../discovery/epson-native-discovery';
import { mapStarDiscoveryPrinter } from '../discovery/star-native-discovery';

describe('native printer discovery helpers', () => {
	it('maps Epson TCP discovery targets to network printers', () => {
		expect(
			mapEpsonDiscoveryDevice({
				target: 'TCP:192.168.1.50',
				deviceName: 'Epson TM-T88',
				ipAddress: '192.168.1.50',
				macAddress: '',
				bdAddress: '',
			})
		).toEqual({
			id: 'epson-192.168.1.50:9100',
			name: 'Epson TM-T88',
			connectionType: 'network',
			address: '192.168.1.50',
			port: 9100,
			vendor: 'epson',
		});
	});

	it('maps Epson Bluetooth discovery targets to bluetooth printers without stripping the target prefix', () => {
		expect(
			mapEpsonDiscoveryDevice({
				target: 'BT:TM-M30-III',
				deviceName: 'Epson TM-m30',
				ipAddress: '',
				macAddress: '',
				bdAddress: '01:23:45:67:89:AB',
			})
		).toEqual({
			id: 'epson-bt:01:23:45:67:89:ab',
			name: 'Epson TM-m30',
			connectionType: 'bluetooth',
			address: 'BT:TM-M30-III',
			port: undefined,
			vendor: 'epson',
		});
	});

	it('maps Star BluetoothLE discovery results without losing the native interface type', () => {
		expect(
			mapStarDiscoveryPrinter({
				connectionSettings: {
					identifier: '01:23:45:67:89:AB',
					interfaceType: 'BluetoothLE',
				},
				information: {
					model: {
						identifier: 'mC-Print3',
					},
				},
			})
		).toEqual({
			id: 'star-01:23:45:67:89:AB',
			name: 'mC-Print3',
			connectionType: 'bluetooth',
			address: '01:23:45:67:89:AB',
			port: undefined,
			vendor: 'star',
			nativeInterfaceType: 'BluetoothLE',
		});
	});

	it('maps Star USB discovery results to usb printers', () => {
		expect(
			mapStarDiscoveryPrinter({
				connectionSettings: {
					identifier: 'usb:star-printer-1',
					interfaceType: 'Usb',
				},
				information: {
					model: {
						identifier: 'mC-Print3',
					},
				},
			})
		).toEqual({
			id: 'star-usb:star-printer-1',
			name: 'mC-Print3',
			connectionType: 'usb',
			address: 'usb:star-printer-1',
			port: undefined,
			vendor: 'star',
			nativeInterfaceType: 'Usb',
		});
	});
});

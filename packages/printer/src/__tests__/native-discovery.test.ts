import { describe, expect, it } from 'vitest';

import { foldSecureTargets, mapEpsonDiscoveryDevice } from '../discovery/epson-native-discovery';
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

	it('keeps only TCPS printer targets and explicit Bluetooth targets', () => {
		const targets = [
			'TCPS:A4:D7:3C:B0:00:1C[local_printer]',
			'TCPS:A4:D7:3C:B0:00:1C[local_display]',
			'TCPS:A4:D7:3C:B0:00:1C[local_TSE]',
			'BLE:TM-m30III',
		];
		const rows = targets
			.map((target) => mapEpsonDiscoveryDevice({ target, deviceName: 'TM-m30III' }))
			.filter(Boolean);

		expect(rows).toEqual([
			{
				id: 'epson-tcps:tcps:a4:d7:3c:b0:00:1c[local_printer]',
				name: 'TM-m30III',
				connectionType: 'network',
				address: 'TCPS:A4:D7:3C:B0:00:1C[local_printer]',
				port: undefined,
				vendor: 'epson',
			},
			{
				id: 'epson-ble:tm-m30iii',
				name: 'TM-m30III',
				connectionType: 'bluetooth',
				address: 'BLE:TM-m30III',
				port: undefined,
				vendor: 'epson',
			},
		]);
	});

	it('maps Epson USB targets without treating unknown targets as Bluetooth', () => {
		expect(
			mapEpsonDiscoveryDevice({ target: 'USB:TM-m30III', deviceName: 'TM-m30III' })
		).toMatchObject({ connectionType: 'usb', address: 'USB:TM-m30III' });
		expect(
			mapEpsonDiscoveryDevice({ target: 'UNKNOWN:value', deviceName: 'Unknown' })
		).toBeUndefined();
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

	it('folds an Epson TCPS target into the TCP row of the same device', () => {
		const tcp = {
			target: 'TCP:192.168.1.131',
			deviceName: 'TM-m30III',
			ipAddress: '192.168.1.131',
			macAddress: 'A4:D7:3C:B0:00:1C',
		};
		const tcps = {
			target: 'TCPS:A4:D7:3C:B0:00:1C[local_printer]',
			deviceName: 'TM-m30III',
			ipAddress: '192.168.1.131',
			macAddress: 'A4:D7:3C:B0:00:1C',
		};
		const rows = foldSecureTargets(
			[tcp, tcps].map((device) => ({ printer: mapEpsonDiscoveryDevice(device)!, device }))
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			connectionType: 'network',
			address: '192.168.1.131',
			port: 9100,
			secureTarget: 'TCPS:A4:D7:3C:B0:00:1C[local_printer]',
		});
	});

	it('keeps a TCPS target as the network row when no TCP sibling was found', () => {
		const tcps = {
			target: 'TCPS:A4:D7:3C:B0:00:1C[local_printer]',
			deviceName: 'TM-m30III',
			macAddress: 'A4:D7:3C:B0:00:1C',
		};
		const rows = foldSecureTargets([{ printer: mapEpsonDiscoveryDevice(tcps)!, device: tcps }]);
		expect(rows).toEqual([
			expect.objectContaining({ connectionType: 'network', address: tcps.target }),
		]);
	});
});

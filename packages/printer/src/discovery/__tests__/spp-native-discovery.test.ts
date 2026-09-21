import { beforeEach, describe, expect, it, vi } from 'vitest';

import { discover, hideSppTwins } from '../spp-native-discovery';

import type { DiscoveredPrinter } from '../../types';

const { native, state } = vi.hoisted(() => {
	const state = { os: 'android', present: true, bonded: [] as unknown[] };
	const native = { bondedDevices: vi.fn(() => state.bonded) };
	return { native, state };
});

vi.mock('expo-modules-core', () => ({
	Platform: {
		get OS() {
			return state.os;
		},
	},
	requireOptionalNativeModule: () => (state.os === 'android' && state.present ? native : null),
}));

beforeEach(() => {
	state.os = 'android';
	state.present = true;
	state.bonded = [];
});

describe('Bluetooth SPP discovery', () => {
	it('lists paired printers by class or name and skips the rest', async () => {
		state.bonded = [
			{ address: 'AA:BB:CC:DD:EE:01', name: 'BlueTooth Printer', printerClass: false },
			{ address: 'AA:BB:CC:DD:EE:02', name: '', printerClass: true },
			{ address: 'AA:BB:CC:DD:EE:03', name: 'Pixel Buds', printerClass: false },
		];

		await expect(discover()).resolves.toEqual([
			{
				id: 'spp-AA:BB:CC:DD:EE:01',
				name: 'BlueTooth Printer',
				address: 'spp:AA:BB:CC:DD:EE:01',
				connectionType: 'bluetooth',
				vendor: 'generic',
			},
			{
				id: 'spp-AA:BB:CC:DD:EE:02',
				name: 'Bluetooth printer',
				address: 'spp:AA:BB:CC:DD:EE:02',
				connectionType: 'bluetooth',
				vendor: 'generic',
			},
		]);
	});

	it('is silent on iOS and loud on an Android build without the module', async () => {
		state.os = 'ios';
		await expect(discover()).resolves.toEqual([]);

		state.os = 'android';
		state.present = false;
		await expect(discover()).rejects.toThrow(/not registered in the native binary/);
	});

	it('hides an SPP row whose MAC the LE scan already found', () => {
		const le: DiscoveredPrinter = {
			id: 'ble-aa:bb:cc:dd:ee:01',
			name: 'NT-1809',
			address: 'ble:aa:bb:cc:dd:ee:01',
			connectionType: 'bluetooth',
			vendor: 'generic',
		};
		const twin: DiscoveredPrinter = { ...le, id: 'spp-x', address: 'spp:AA:BB:CC:DD:EE:01' };
		const other: DiscoveredPrinter = { ...le, id: 'spp-y', address: 'spp:AA:BB:CC:DD:EE:02' };

		expect(hideSppTwins([le, twin, other])).toEqual([le, other]);
	});
});

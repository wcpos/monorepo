import { beforeEach, describe, expect, it, vi } from 'vitest';

import { discover } from '../ble-native-discovery';

const { manager, state } = vi.hoisted(() => {
	const state: { filtered: unknown[]; unfiltered: unknown[] } = { filtered: [], unfiltered: [] };
	const manager = {
		startDeviceScan: vi.fn(
			async (
				uuids: string[] | null,
				_options: unknown,
				listener: (error: null, device: unknown) => void
			) => {
				for (const device of uuids ? state.filtered : state.unfiltered) listener(null, device);
			}
		),
		stopDeviceScan: vi.fn(async () => undefined),
	};
	return { manager, state };
});

vi.mock('react-native-ble-plx', () => ({
	BleManager: class {
		constructor() {
			return manager;
		}
	},
}));

beforeEach(() => {
	state.filtered = [];
	state.unfiltered = [];
	manager.startDeviceScan.mockClear();
	manager.stopDeviceScan.mockClear();
});

describe('generic BLE discovery', () => {
	it('returns deduped bluetooth rows and stops the scan', async () => {
		state.filtered = [
			{ id: 'aa:11', name: 'NT-1809' },
			{ id: 'aa:11', name: 'NT-1809' },
			{ id: 'bb:22', name: null, localName: 'Beacon' },
		];

		await expect(discover({ timeoutMs: 20 })).resolves.toEqual([
			{
				id: 'ble-aa:11',
				name: 'NT-1809',
				address: 'ble:aa:11',
				connectionType: 'bluetooth',
				vendor: 'generic',
			},
			{
				id: 'ble-bb:22',
				name: 'Beacon',
				address: 'ble:bb:22',
				connectionType: 'bluetooth',
				vendor: 'generic',
			},
		]);
		// One filtered pass only: the name-matched fallback is skipped once a printer answers.
		expect(manager.startDeviceScan).toHaveBeenCalledTimes(1);
		expect(manager.stopDeviceScan).toHaveBeenCalledTimes(1);
	});

	it('falls back to a name-matched unfiltered scan when nothing advertises a print service', async () => {
		state.unfiltered = [
			{ id: 'cc:33', name: "Paul's iPhone" },
			{ id: 'dd:44', name: 'Netum NT-1809' },
		];

		const rows = await discover({ timeoutMs: 20 });

		expect(rows.map((row) => row.address)).toEqual(['ble:dd:44']);
		expect(manager.startDeviceScan).toHaveBeenCalledTimes(2);
		expect(manager.startDeviceScan.mock.calls[1][0]).toBeNull();
		expect(manager.stopDeviceScan).toHaveBeenCalledTimes(2);
	});
});

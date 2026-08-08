/**
 * @jest-environment jsdom
 */
import { renderHook, waitFor } from '@testing-library/react';

import type { StorageFootprint } from '@wcpos/database/measure-storage-types';

import { useStorageFootprint } from './use-storage-footprint';

const mockMeasureAppStorage = jest.fn<Promise<StorageFootprint | null>, []>();
const mockSiteHashFor = jest.fn((site: string) =>
	site.includes('/wp-json') ? 'aaaaaaaaaaaa' : 'bbbbbbbbbbbb'
);
const mockSitesExec = jest.fn();
let mockActiveScopeId = 'scope-a';

const mockEngine = {
	active: jest.fn(() => ({ database: { name: 'pos_v6_aaaaaaaaaaaa_s1_c1' } })),
	ready: Promise.resolve({ database: { name: 'pos_v6_aaaaaaaaaaaa_s1_c1' } }),
};
const mockUserDB = {
	name: 'wcposusers_v6',
	sites: { find: () => ({ exec: mockSitesExec }) },
};
const mockStoreDB = { name: 'store_v6_active' };
const mockFastStoreDB = { name: 'fast_store_v6_active' };

jest.mock('@wcpos/database', () => ({
	measureAppStorage: () => mockMeasureAppStorage(),
}));
jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => ({ engine: mockEngine }),
}));
jest.mock('@wcpos/sync-core', () => ({
	siteHashFor: (site: string) => mockSiteHashFor(site),
}));
jest.mock('../../../contexts/app-state', () => ({
	useAppState: () => ({
		userDB: mockUserDB,
		storeDB: mockStoreDB,
		fastStoreDB: mockFastStoreDB,
	}),
}));
jest.mock('../hooks/use-engine-monitor', () => ({
	useEngineStatus: () => ({ activeScopeId: mockActiveScopeId }),
}));

const emptyFootprint = (): StorageFootprint => ({ entries: [], estimateBytes: null });

describe('useStorageFootprint', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockActiveScopeId = 'scope-a';
		mockSitesExec.mockResolvedValue([
			{
				url: 'https://shop.example.test',
				wp_api_url: 'https://shop.example.test/wp-json/',
			},
		]);
	});

	it('classifies scopes using the same wp_api_url identity as the engine', async () => {
		mockMeasureAppStorage.mockResolvedValue({
			entries: [
				{
					name: 'rxdb-pos_v6_aaaaaaaaaaaa_s2_c1-orders-0',
					bytes: 25,
				},
			],
			estimateBytes: null,
		});

		const { result } = renderHook(() => useStorageFootprint());

		await waitFor(() => expect(result.current).not.toBeNull());
		expect(mockSiteHashFor).toHaveBeenCalledWith('https://shop.example.test/wp-json/');
		expect(result.current?.breakdown.otherStoresBytes).toBe(25);
		expect(result.current?.breakdown.orphanedBytes).toBe(0);
	});

	it('hides the previous footprint while a changed scope is being measured', async () => {
		let resolveNextMeasurement: ((value: StorageFootprint | null) => void) | undefined;
		const nextMeasurement = new Promise<StorageFootprint | null>((resolve) => {
			resolveNextMeasurement = resolve;
		});
		mockMeasureAppStorage
			.mockResolvedValueOnce(emptyFootprint())
			.mockReturnValueOnce(nextMeasurement);

		const { result, rerender, unmount } = renderHook(() => useStorageFootprint());
		await waitFor(() => expect(result.current).not.toBeNull());

		mockActiveScopeId = 'scope-b';
		rerender();

		expect(result.current).toBeNull();
		unmount();
		resolveNextMeasurement?.(emptyFootprint());
	});
});

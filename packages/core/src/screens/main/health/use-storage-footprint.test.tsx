/** @jest-environment jsdom */
import { renderHook, waitFor } from '@testing-library/react';

import type { StorageFootprintSummary } from '@wcpos/query';

import { useStorageFootprint } from './use-storage-footprint';

const mockMeasureStorageFootprint = jest.fn<Promise<StorageFootprintSummary | null>, unknown[]>();
let mockActiveScopeId = 'scope-a';
const mockEngine = {};
const mockUserDB = { name: 'wcposusers_v6' };
const mockStoreDB = { name: 'store_v6_active' };

jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => ({ engine: mockEngine }),
	measureStorageFootprint: (...args: unknown[]) => mockMeasureStorageFootprint(...args),
}));
jest.mock('../../../contexts/app-state', () => ({
	useAppState: () => ({ userDB: mockUserDB, storeDB: mockStoreDB }),
}));
jest.mock('../hooks/use-engine-monitor', () => ({
	useEngineStatus: () => ({ activeScopeId: mockActiveScopeId }),
}));

const emptySummary: StorageFootprintSummary = {
	breakdown: {
		activeDataBytes: 0,
		bookkeepingBytes: 0,
		otherCashiersBytes: 0,
		otherStoresBytes: 0,
		otherStoresCount: 0,
		orphanedBytes: 0,
		unknownBytes: 0,
		measuredTotalBytes: 0,
	},
	cachedImagesBytes: null,
	browserEstimateBytes: null,
	totalBytes: 0,
	unattributedBytes: 0,
};

describe('useStorageFootprint', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockActiveScopeId = 'scope-a';
	});
	it('hides the previous footprint while a changed scope is being measured', async () => {
		let resolveNextMeasurement: ((value: StorageFootprintSummary | null) => void) | undefined;
		const nextMeasurement = new Promise<StorageFootprintSummary | null>((resolve) => {
			resolveNextMeasurement = resolve;
		});
		mockMeasureStorageFootprint
			.mockResolvedValueOnce(emptySummary)
			.mockReturnValueOnce(nextMeasurement);

		const { result, rerender, unmount } = renderHook(() => useStorageFootprint());
		await waitFor(() => expect(result.current).not.toBeNull());

		mockActiveScopeId = 'scope-b';
		rerender();

		expect(result.current).toBeNull();
		unmount();
		resolveNextMeasurement?.(emptySummary);
	});
});

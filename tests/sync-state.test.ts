import { SyncStateManager } from '../src/sync-state';

describe('SyncStateManager', () => {
	let syncCollectionMock: any;
	let syncStateManager: SyncStateManager;

	beforeEach(() => {
		syncCollectionMock = {
			find: jest.fn().mockReturnThis(),
			exec: jest.fn(),
			bulkUpsert: jest.fn(),
			bulkInsert: jest.fn(),
		};
		syncStateManager = new SyncStateManager(syncCollectionMock, 'products');
	});

	it('retrieves unsynced remote IDs', async () => {
		const mockDocs = [{ id: 1 }, { id: 2 }];
		syncCollectionMock.exec.mockResolvedValue(mockDocs);

		const ids = await syncStateManager.getUnsyncedRemoteIDs();

		expect(syncCollectionMock.find).toHaveBeenCalledWith({
			selector: {
				id: { $exists: true },
				status: { $eq: 'PULL_NEW' },
				endpoint: { $eq: 'products' },
			},
		});
		expect(ids).toEqual([1, 2]);
	});

	// Additional tests for other methods...
});

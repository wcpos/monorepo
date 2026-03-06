import { QueryReplicationState } from '../src/query-replication-state';

const mockFetchRemoteByIDs = jest.fn();

jest.mock('../src/data-fetcher', () => ({
	DataFetcher: jest.fn().mockImplementation(() => ({
		fetchRemoteByIDs: mockFetchRemoteByIDs,
	})),
}));

describe('QueryReplicationState', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockFetchRemoteByIDs.mockResolvedValue({
			data: [{ id: 1, date_modified_gmt: '2026-03-06T00:00:00' }],
		});
	});

	it('does not restart collection replication when global pause is active mid-sync', async () => {
		const collectionReplication = {
			firstSync: Promise.resolve(),
			pause: jest.fn(),
			start: jest.fn(),
			sync: jest.fn(),
			bulkUpsertResponse: jest.fn().mockResolvedValue(undefined),
			syncStateManager: {
				getUnsyncedRemoteIDs: jest.fn().mockResolvedValue([1]),
				getSyncedRemoteIDs: jest.fn().mockResolvedValue([]),
			},
		};

		const replication = new QueryReplicationState({
			collection: { name: 'products' } as any,
			httpClient: {},
			collectionReplication: collectionReplication as any,
			endpoint: 'products',
			shouldRestartCollectionReplication: () => false,
		});

		replication.start();
		await replication.sync();

		expect(collectionReplication.pause).toHaveBeenCalled();
		expect(collectionReplication.start).not.toHaveBeenCalled();
	});
});

import { QueryReplicationState } from '../src/query-replication-state';

describe('QueryReplicationState', () => {
	const collectionReplication = {
		firstSync: Promise.resolve(),
		sync: jest.fn(),
		pause: jest.fn(),
		start: jest.fn(),
		bulkUpsertResponse: jest.fn(),
		syncStateManager: {
			getUnsyncedRemoteIDs: jest.fn(),
			getSyncedRemoteIDs: jest.fn(),
		},
	};

	const httpClient = {
		get: jest.fn(),
		post: jest.fn(),
	};

	let replicationState: QueryReplicationState<any>;

	beforeEach(() => {
		replicationState = new QueryReplicationState({
			collection: {} as any,
			httpClient,
			collectionReplication: collectionReplication as any,
			endpoint: 'products',
		});
	});

	afterEach(async () => {
		await replicationState.cancel();
		jest.restoreAllMocks();
	});

	it('returns a settled promise when nextPage sync fails', async () => {
		const error = new Error('sync failed');
		const runSpy = jest.spyOn(replicationState, 'run').mockRejectedValue(error);

		await expect(replicationState.nextPage()).resolves.toBeUndefined();
		expect(runSpy).toHaveBeenCalledTimes(1);
	});
});

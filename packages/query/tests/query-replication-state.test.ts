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

	it('resumes collection sync when sync-state lookup fails', async () => {
		const syncStateError = new Error('sync state failed');
		collectionReplication.syncStateManager.getUnsyncedRemoteIDs.mockRejectedValueOnce(
			syncStateError
		);
		replicationState.start();

		await expect(replicationState.sync()).resolves.toBe(0);

		expect(collectionReplication.pause).toHaveBeenCalledTimes(1);
		expect(collectionReplication.start).toHaveBeenCalledTimes(1);
		expect(replicationState.subjects.active.getValue()).toBe(false);
	});
});

describe('QueryReplicationState greedy progress', () => {
	function createGreedyState({
		unsyncedRemoteIDs,
		bulkProgress,
	}: {
		unsyncedRemoteIDs: number[][];
		bulkProgress: number[];
	}) {
		const collectionReplication = {
			firstSync: Promise.resolve(),
			sync: jest.fn(),
			pause: jest.fn(),
			start: jest.fn(),
			bulkUpsertResponse: jest.fn(async () => bulkProgress.shift() ?? 0),
			syncStateManager: {
				getUnsyncedRemoteIDs: jest.fn(async () => unsyncedRemoteIDs.shift() ?? []),
				getSyncedRemoteIDs: jest.fn(async () => []),
			},
		};
		const httpClient = {
			get: jest.fn(),
			post: jest.fn(async () => ({ data: [{ id: 1 }] })),
		};
		const replicationState = new QueryReplicationState({
			collection: {} as any,
			httpClient,
			collectionReplication: collectionReplication as any,
			endpoint: 'products/categories',
			greedy: true,
		});
		replicationState.cancelSub('polling');

		return { collectionReplication, httpClient, replicationState };
	}

	it('reruns a greedy query while each pass makes progress and unsynced ids remain', async () => {
		const { httpClient, replicationState } = createGreedyState({
			unsyncedRemoteIDs: [[1, 2, 3], [2, 3], [2, 3], [3], [3], []],
			bulkProgress: [1, 1, 1],
		});

		await replicationState.run({ force: true });

		expect(httpClient.post).toHaveBeenCalledTimes(3);
		await replicationState.cancel();
	});

	it('does not rerun a greedy query when a non-empty response makes no progress', async () => {
		const { httpClient, replicationState } = createGreedyState({
			unsyncedRemoteIDs: [
				[1, 2, 3],
				[1, 2, 3],
			],
			bulkProgress: [0],
		});

		await replicationState.run({ force: true });

		expect(httpClient.post).toHaveBeenCalledTimes(1);
		await replicationState.cancel();
	});

	it('keeps rerunning after progress even when unsynced ids do not shrink immediately', async () => {
		const { httpClient, replicationState } = createGreedyState({
			unsyncedRemoteIDs: [[1, 2, 3], [1, 2, 3], [1, 2, 3], []],
			bulkProgress: [1, 1],
		});

		await replicationState.run({ force: true });

		expect(httpClient.post).toHaveBeenCalledTimes(2);
		await replicationState.cancel();
	});

	it('stops a greedy query when the unsynced backlog never clears', async () => {
		// Models an endpoint that ignores include/exclude (the templates endpoint):
		// it re-returns the full set every fetch, so bulkUpsertResponse always reports
		// progress, while one id can never be cleared from the unsynced set. Without an
		// iteration budget the greedy loop would recurse forever and starve the event
		// loop (the symptom seen on device). This test must settle, not time out.
		const collectionReplication = {
			firstSync: Promise.resolve(),
			sync: jest.fn(),
			pause: jest.fn(),
			start: jest.fn(),
			bulkUpsertResponse: jest.fn(async () => 2), // always "made progress"
			syncStateManager: {
				getUnsyncedRemoteIDs: jest.fn(async () => [3]), // never clears
				getSyncedRemoteIDs: jest.fn(async () => [1, 2]),
			},
		};
		const httpClient = {
			get: jest.fn(),
			post: jest.fn(async () => ({ data: [{ id: 1 }, { id: 2 }] })),
		};
		const replicationState = new QueryReplicationState({
			collection: {} as any,
			httpClient,
			collectionReplication: collectionReplication as any,
			endpoint: 'templates',
			greedy: true,
		});
		replicationState.cancelSub('polling');

		await replicationState.run({ force: true });

		// Backlog is [3] (size 1) after the first fetch, so the budget allows exactly
		// one more pass before stopping — bounded, not infinite.
		expect(httpClient.post).toHaveBeenCalledTimes(2);
		await replicationState.cancel();
	});
});

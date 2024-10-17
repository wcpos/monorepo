import { httpClientMock } from './__mocks__/http';
import { createStoreDatabase, createSyncDatabase } from './helpers/db';
import { CollectionReplicationState } from '../src/collection-replication-state';

import type { RxDatabase } from 'rxdb';

describe('CollectionReplicationState', () => {
	let storeDatabase: RxDatabase;
	let syncDatabase: RxDatabase;

	beforeEach(async () => {
		storeDatabase = await createStoreDatabase();
		syncDatabase = await createSyncDatabase();
	});

	afterEach(() => {
		jest.clearAllMocks();
		storeDatabase.remove();
		syncDatabase.remove();
	});

	describe('fetchRemoteIDs', () => {
		it('fetches remote IDs successfully', async () => {
			const expectedIds = [1, 2, 3];
			httpClientMock.get.mockResolvedValue({ data: expectedIds.map((id) => ({ id })) });

			const replicationState = new CollectionReplicationState({
				collection: storeDatabase.collections.products,
				httpClient: httpClientMock,
			});

			await expect(replicationState.fetchRemoteIDs()).resolves.toEqual(expectedIds);
		});

		it('handles errors when response data is invalid', (done) => {
			httpClientMock.get.mockResolvedValue({ data: null });

			const replicationState = new CollectionReplicationState({
				collection: storeDatabase.collections.products,
				httpClient: httpClientMock,
			});

			replicationState.error$.subscribe((error) => {
				expect(error).toBeInstanceOf(Error);
				done();
			});

			replicationState.fetchRemoteIDs();
		});
	});
});

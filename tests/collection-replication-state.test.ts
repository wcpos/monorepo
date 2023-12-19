import httpClientMock from './__mocks__/http';
import { MockRxCollection } from './__mocks__/rxdb';
import { CollectionReplicationState } from '../src/collection-replication-state';

import type { RxCollection } from 'rxdb';

describe('CollectionReplicationState', () => {
	beforeEach(() => {});

	// it('should return the default endpoint', () => {
	// 	const mockCollection = new MockRxCollection({ name: 'testCollection' });
	// 	const replicationState = new CollectionReplicationState({
	// 		collection: mockCollection,
	// 		httpClient: {},
	// 	});

	// 	expect(replicationState.getEndpoint()).toBe('testCollection');
	// 	expect(replicationState.endpoint).toBe('testCollection');
	// });

	// it('should return a custom endpoint from preEndpoint hook', () => {
	// 	const mockCollection = new MockRxCollection({ name: 'testCollection' });
	// 	const customEndpoint = 'customEndpoint';
	// 	const hooks = {
	// 		preEndpoint: jest.fn().mockReturnValue(customEndpoint),
	// 	};
	// 	const replicationState = new CollectionReplicationState({
	// 		collection: mockCollection,
	// 		httpClient: {},
	// 		hooks,
	// 	});

	// 	expect(replicationState.getEndpoint()).toBe(customEndpoint);
	// 	expect(hooks.preEndpoint).toHaveBeenCalledWith(mockCollection);
	// });

	describe('fetchRemoteIDs', () => {
		it('fetches remote IDs successfully', async () => {
			const expectedIds = [1, 2, 3];
			httpClientMock.get.mockResolvedValue({ data: expectedIds.map((id) => ({ id })) });

			const replicationState = new CollectionReplicationState({
				collection: new MockRxCollection({}),
				httpClient: httpClientMock,
			});

			await expect(replicationState.fetchRemoteIDs()).resolves.toEqual(expectedIds);
		});

		it('handles errors when response data is invalid', (done) => {
			httpClientMock.get.mockResolvedValue({ data: null });

			const replicationState = new CollectionReplicationState({
				collection: new MockRxCollection({}),
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

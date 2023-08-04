import { RxCollection, RxDocument } from 'rxdb';
import { Observable, of } from 'rxjs';

import type { SortDirection } from '@wcpos/components/src/table';

import { Query, QueryState } from './';

interface CustomRxCollection extends RxCollection {
	search: (query: any) => Promise<any>;
}

// Mock the RxCollection for testing
const collectionMock: CustomRxCollection = {
	find: jest.fn().mockReturnThis(),
} as unknown as CustomRxCollection;

// Test object factory to quickly generate new Query instances for testing
const createTestQuery = (state: QueryState): Query<any> => {
	return new Query(state).collection(collectionMock);
};

describe('Query', () => {
	beforeEach(() => {
		jest.resetAllMocks();
	});

	describe('exec', () => {
		it('should throw error when collection is not set', async () => {
			const query = new Query<any>({});
			await expect(query.exec()).rejects.toThrow('Collection is not set');
		});

		// it('should return the result of collection.find().exec()', async () => {
		// 	const query = createTestQuery({});
		// 	const result = await query.exec();
		// 	expect(collectionMock.find).toHaveBeenCalled();
		// 	expect(result).toEqual([]);
		// });
	});

	describe('updateState', () => {
		it('should update the query state', () => {
			const query = createTestQuery({ search: 'old' });
			query.updateState({ search: 'new' });
			expect(query.currentState).toEqual({ search: 'new' });
		});
	});

	describe('sort', () => {
		it('should update sortBy and sortDirection when called with two parameters', () => {
			const query = createTestQuery({});
			query.sort('field', 'desc');
			expect(query.currentState).toEqual({ sortBy: 'field', sortDirection: 'desc' });
		});

		it('should update sortBy and sortDirection when called with an object', () => {
			const query = createTestQuery({});
			query.sort({ field1: 'asc', field2: 'desc' });
			expect(query.currentState).toEqual({ sortBy: 'field2', sortDirection: 'desc' });
		});
	});

	describe('where', () => {
		it('should add a new where clause and update the query state', () => {
			const query = createTestQuery({});
			query.where('field', 'value');
			expect(query.currentState).toEqual({ selector: { field: 'value' } });
		});
	});

	describe('search', () => {
		it('should update search field and selector of the query state', async () => {
			const query = createTestQuery({}).collection({
				...collectionMock,
				search: jest.fn().mockResolvedValue({ hits: [{ id: 1 }, { id: 2 }] }),
			} as unknown as RxCollection<any, object, object>);
			await query.search('searchTerm');
			expect(query.currentState).toEqual({
				search: 'searchTerm',
				selector: { uuid: { $in: [1, 2] } },
			});
		});
	});

	// describe('debouncedSearch', () => {
	// 	it('should debounce the search function', async () => {
	// 		const query = createTestQuery({}).collection(
	// 			collectionMock as unknown as RxCollection<any, object, object>
	// 		);
	// 		collectionMock.search.mockResolvedValueOnce({ hits: [{ id: '1' }] });
	// 		query.debouncedSearch('query');
	// 		expect(query.currentState?.search).toBeUndefined();
	// 		jest.runAllTimers();
	// 		expect(query.currentState?.search).toEqual('query');
	// 	});
	// });

	// describe('addHook', () => {
	// 	it('should add a new hook function', () => {
	// 		const query = createTestQuery({});
	// 		const hookFunction = jest.fn();
	// 		query.addHook('postQueryResult', hookFunction);
	// 		// Here we are assuming that the private _hooks field can be accessed for testing.
	// 		// You might need to add a getter or make other adjustments for accessing it.
	// 		expect(query._hooks.postQueryResult).toBe(hookFunction);
	// 	});
	// });

	describe('sort', () => {
		it('should update sortBy and sortDirection fields of the query state', () => {
			const query = createTestQuery({});
			query.sort('field', 'asc');
			expect(query.currentState).toEqual({ sortBy: 'field', sortDirection: 'asc' });
		});

		it('should update sortBy and sortDirection fields of the query state with an object', () => {
			const query = createTestQuery({});
			query.sort({ field1: 'asc', field2: 'desc' });
			expect(query.currentState).toEqual({ sortBy: 'field2', sortDirection: 'desc' });
		});
	});

	// describe('exec', () => {
	// 	it('should throw error when collection is not set', async () => {
	// 		const query = createTestQuery({});
	// 		await expect(query.exec()).rejects.toThrow('Collection is not set');
	// 	});

	// 	it('should execute the query', async () => {
	// 		const query = createTestQuery({}).collection(
	// 			collectionMock as unknown as RxCollection<any, object, object>
	// 		);
	// 		const result = await query.exec();
	// 		expect(result).toEqual([docMock]);
	// 	});
	// });

	describe('getApiQueryParams', () => {
		it('should return the query parameters', () => {
			const query = createTestQuery({});
			query.where('field', 'value');
			expect(query.getApiQueryParams()).toEqual({ field: 'value' });
		});
	});

	test('should create and update the query state correctly', () => {
		const query = new Query({
			selector: { id: { $in: [1, 2, 3] } },
			sortBy: 'id',
			sortDirection: 'asc',
		});

		// Test the initial state
		expect(query.currentState).toEqual({
			selector: { id: { $in: [1, 2, 3] } },
			sortBy: 'id',
			sortDirection: 'asc',
		});

		// Test the updated state
		query.where('featured', true);
		expect(query.currentState).toEqual({
			selector: {
				id: { $in: [1, 2, 3] },
				featured: true,
			},
			sortBy: 'id',
			sortDirection: 'asc',
		});

		// Test the final state
		query.search({ attributes: [{ name: 'Color', option: 'Blue' }] });
		expect(query.currentState).toEqual({
			search: { attributes: [{ name: 'Color', option: 'Blue' }] },
			selector: {
				id: { $in: [1, 2, 3] },
				featured: true,
			},
			sortBy: 'id',
			sortDirection: 'asc',
		});
	});
});

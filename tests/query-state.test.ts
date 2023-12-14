import { of, BehaviorSubject } from 'rxjs';

import { Query, QueryParams } from '../src/query-state'; // Adjust the import based on your file structure

import type { RxCollection, RxQuery, MangoQuery } from 'rxdb';

jest.mock('rxdb');

describe('Query', () => {
	let mockCollection: Partial<RxCollection>;
	let query: Query<RxCollection>;
	let mockDocuments: any[];

	beforeEach(() => {
		mockCollection = {
			find: jest.fn().mockImplementation(() => ({
				$: new BehaviorSubject(mockDocuments),
			})) as any,
		};
		mockDocuments = [
			{ id: 1, name: 'B' },
			{ id: 2, name: 'A' },
		];
		query = new Query({ collection: mockCollection as any });
	});

	it('query.getParams() should return the initialParams', () => {
		const initialParams = { search: 'test', limit: 10 };
		const query = new Query({ collection: mockCollection as RxCollection, initialParams });

		expect(query.getParams()).toEqual(initialParams);
	});

	it('query.result$ should have the results for collection.find(initialParams)', (done) => {
		const initialParams = { search: 'test', limit: 10 };
		const mockFindResults = [
			{ id: 1, name: 'Item 1' },
			{ id: 2, name: 'Item 2' },
		]; // Mock the find results

		// Create a minimal mock for RxQuery
		const mockRxQuery: Partial<RxQuery<any, any[]>> = {
			$: new BehaviorSubject(mockFindResults),
		};

		// Mock the find method of the collection
		mockCollection.find = jest.fn(() => mockRxQuery as RxQuery<any, any[]>);

		const query = new Query({ collection: mockCollection as RxCollection, initialParams });

		query.result$.subscribe((results) => {
			expect(results).toEqual(mockFindResults);
			done();
		});
	});

	describe('query.sort()', () => {
		it('updates the query params correctly when sort is called', () => {
			query.sort('name', 'asc');
			expect(query.getParams()).toEqual({ selector: {}, sortBy: 'name', sortDirection: 'asc' });
		});

		it('emits sorted results when sort is applied', (done) => {
			const initialParams: QueryParams = { sortBy: 'price', sortDirection: 'asc' };
			const mockFindResults = [
				{ id: 1, name: 'Item 1', price: '1.23' },
				{ id: 2, name: 'Item 2', price: '0.12' },
				{ id: 3, name: 'Item 3', price: '100.01' },
				{ id: 4, name: 'Item 4', price: '-9.50' },
				{ id: 5, name: 'Item 5', price: '4.00' },
			];

			// Create a minimal mock for RxQuery
			const mockRxQuery: Partial<RxQuery<any, any[]>> = {
				$: new BehaviorSubject(mockFindResults),
			};

			// Mock the find method of the collection
			mockCollection.find = jest.fn(() => mockRxQuery as RxQuery<any, any[]>);

			const query = new Query({ collection: mockCollection as RxCollection, initialParams });
			const results = [];

			const subscription = query.result$.subscribe((sortedResults) => {
				results.push(sortedResults);

				// It will emit twice, once for the initial results and once for the sorted results
				if (results.length === 1) {
					expect(results[0]).toEqual([
						{ id: 4, name: 'Item 4', price: '-9.50' }, // Assuming ascending order
						{ id: 2, name: 'Item 2', price: '0.12' },
						{ id: 1, name: 'Item 1', price: '1.23' },
						{ id: 5, name: 'Item 5', price: '4.00' },
						{ id: 3, name: 'Item 3', price: '100.01' },
					]);
				}

				// Check the length to ensure we are asserting after the sort operation
				if (results.length === 2) {
					expect(results[1]).toEqual([
						{ id: 3, name: 'Item 3', price: '100.01' },
						{ id: 5, name: 'Item 5', price: '4.00' },
						{ id: 1, name: 'Item 1', price: '1.23' },
						{ id: 2, name: 'Item 2', price: '0.12' },
						{ id: 4, name: 'Item 4', price: '-9.50' },
					]);
					subscription.unsubscribe();
					done();
				}
			});

			query.sort('price', 'desc');
		});
	});

	describe('query.sort()', () => {
		it('correctly sets a single where clause', () => {
			query.where('status', 'completed');
			expect(query.getParams()).toEqual({
				selector: { status: 'completed' },
			});
		});

		it('overwrites an existing where clause', () => {
			query.where('status', 'completed');
			query.where('status', 'pending');
			expect(query.getParams()).toEqual({
				selector: { status: 'pending' },
			});
		});

		it('removes a where clause when value is null', () => {
			query.where('status', 'completed');
			query.where('status', null);
			expect(query.getParams()).toEqual({
				selector: {},
			});
		});

		it('combines where and sort clauses correctly', () => {
			query.where('status', 'completed').sort('price', 'asc');
			expect(query.getParams()).toEqual({
				selector: { status: 'completed' },
				sortBy: 'price',
				sortDirection: 'asc',
			});
		});
	});
});

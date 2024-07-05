import { of, BehaviorSubject } from 'rxjs';

import { Query, QueryParams } from '../src/query-state'; // Adjust the import based on your file structure
import { createStoreDatabase, createSyncDatabase } from './helpers/db';

import type { RxCollection, RxQuery, MangoQuery } from 'rxdb';
import type { RxDatabase } from 'rxdb';

// Mock the logger module
jest.mock('@wcpos/utils/src/logger');

describe('Query', () => {
	let storeDatabase: RxDatabase;

	beforeEach(async () => {
		storeDatabase = await createStoreDatabase();
	});

	afterEach(async () => {
		/**
		 * Temporary fix for the async searchDB issue, ie: can't do collection.find$ because test has finished
		 */
		await new Promise(resolve => setTimeout(resolve, 100));

		await storeDatabase.destroy();
		jest.clearAllMocks();
	});

	/**
	 * 
	 */
	it('query.getParams() should return the initialParams', () => {
		const initialParams = {
			sortBy: 'name',
			sortDirection: 'asc',
		};
		const query = new Query({ collection: storeDatabase.collections.products, initialParams });

		expect(query.getParams()).toEqual(initialParams);
	});

	/**
	 * 
	 */
	it('query.result$ should init with empty result if no records', (done) => {
		const initialParams = {
			sortBy: 'name',
			sortDirection: 'asc',
		};

		const query = new Query({ collection: storeDatabase.collections.products, initialParams });

		query.result$.subscribe((result) => {
			expect(result).toEqual(expect.objectContaining({
				searchActive: false,
				hits: [],
				count: 0
			}));	
			done();
		});
	});

	/**
	 * 
	 */
	it('query.result$ should return all the results for initialParams: {}', async () => {
		const data = [
			{ uuid: '1', name: 'Item 1', price: '1.23' },
			{ uuid: '2', name: 'Item 2', price: '0.12' },
			{ uuid: '3', name: 'Item 3', price: '100.01' },
			{ uuid: '4', name: 'Item 4', price: '-9.50' },
			{ uuid: '5', name: 'Item 5', price: '4.00' },
		];

		await storeDatabase.collections.products.bulkInsert(data);

		const query = new Query({ collection: storeDatabase.collections.products, initialParams: {} });

		return new Promise((resolve) => {
			query.result$.subscribe((result) => {
				expect(result).toEqual(expect.objectContaining({
					elapsed: expect.any(Number),
					searchActive: false,
					count: 5,
					hits: expect.arrayContaining([
						expect.objectContaining({ id: '1', document: expect.any(Object) }),
						expect.objectContaining({ id: '2', document: expect.any(Object) }),
						expect.objectContaining({ id: '3', document: expect.any(Object) }),
						expect.objectContaining({ id: '4', document: expect.any(Object) }),
						expect.objectContaining({ id: '5', document: expect.any(Object) })
					])
				}));
				resolve();
			});
		});
	});

	/**
	 * 
	 */
	describe('query.sort()', () => {
		/**
		 * 
		 */
		it('updates the query params correctly when sort is called', () => {
			const query = new Query({ collection: storeDatabase.collections.products, initialParams: {} });
			query.sort('name', 'asc');
			expect(query.getParams()).toEqual({ selector: {}, sortBy: 'name', sortDirection: 'asc' });
		});

		/**
		 * 
		 */
		it('emits sorted results', async () => {
			const initialParams: QueryParams = { sortBy: 'price', sortDirection: 'asc' };
			const data = [
				{ uuid: '1', name: 'Item 1', price: '1.23' },
				{ uuid: '2', name: 'Item 2', price: '0.12' },
				{ uuid: '3', name: 'Item 3', price: '100.01' },
				{ uuid: '4', name: 'Item 4', price: '-9.50' },
				{ uuid: '5', name: 'Item 5', price: '4.00' },
			];
			await storeDatabase.collections.products.bulkInsert(data);

			const query = new Query({ collection: storeDatabase.collections.products, initialParams });

			let count = 0;

			// next sort
			const promise = new Promise((resolve) => {
				query.result$.subscribe((result) => {
					if(count === 0) {
						count++;
						expect(result).toEqual(expect.objectContaining({
							elapsed: expect.any(Number),
							searchActive: false,
							count: 5,
							hits: expect.arrayContaining([
								expect.objectContaining({ id: '4', document: expect.any(Object) }),
								expect.objectContaining({ id: '2', document: expect.any(Object) }),
								expect.objectContaining({ id: '1', document: expect.any(Object) }),
								expect.objectContaining({ id: '5', document: expect.any(Object) }),
								expect.objectContaining({ id: '3', document: expect.any(Object) })
							])
						}));

						// trigger next sort
						query.sort('price', 'desc');
					} else {
						expect(result).toEqual(expect.objectContaining({
							elapsed: expect.any(Number),
							searchActive: false,
							count: 5,
							hits: expect.arrayContaining([
								expect.objectContaining({ id: '3', document: expect.any(Object) }),
								expect.objectContaining({ id: '5', document: expect.any(Object) }),
								expect.objectContaining({ id: '1', document: expect.any(Object) }),
								expect.objectContaining({ id: '2', document: expect.any(Object) }),
								expect.objectContaining({ id: '4', document: expect.any(Object) })
							])
						}));
						resolve();
					}
				})
			});

			return promise;
		});
	});

	/**
	 * 
	 */
	describe('query.where()', () => {
		/**
		 * 
		 */
		it('correctly sets a single where clause', () => {
			const query = new Query({ collection: storeDatabase.collections.products, initialParams: {} });
			query.where('status', 'completed');
			expect(query.getParams()).toEqual({
				selector: { status: 'completed' },
			});
		});

		/**
		 * 
		 */
		it('overwrites an existing where clause', () => {
			const query = new Query({ collection: storeDatabase.collections.products, initialParams: {} });
			query.where('status', 'completed');
			query.where('status', 'pending');
			expect(query.getParams()).toEqual({
				selector: { status: 'pending' },
			});
		});

		/**
		 * 
		 */
		it('removes a where clause when value is null', () => {
			const query = new Query({ collection: storeDatabase.collections.products, initialParams: {} });
			query.where('status', 'completed');
			query.where('status', null);
			expect(query.getParams()).toEqual({
				selector: {},
			});
		});

		/**
		 * 
		 */
		it('combines where and sort clauses correctly', () => {
			const query = new Query({ collection: storeDatabase.collections.products, initialParams: {} });
			query.where('status', 'completed').sort('price', 'asc');
			expect(query.getParams()).toEqual({
				selector: { status: 'completed' },
				sortBy: 'price',
				sortDirection: 'asc',
			});
		});
	});
});

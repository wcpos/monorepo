import { of, BehaviorSubject } from 'rxjs';
import { skip } from 'rxjs/operators';

import { createStoreDatabase, createSyncDatabase } from './helpers/db';
import { Query, QueryParams } from '../src/query-state'; // Adjust the import based on your file structure

import type { RxCollection, RxQuery, MangoQuery, RxDatabase } from 'rxdb';

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
		await new Promise((resolve) => setTimeout(resolve, 100));

		await storeDatabase.destroy();
		expect(storeDatabase.destroyed).toBe(true);
		jest.clearAllMocks();
	});

	/**
	 *
	 */
	it('query.getParams() should return the initialParams', async () => {
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
			expect(result).toEqual(
				expect.objectContaining({
					searchActive: false,
					hits: [],
					count: 0,
				})
			);
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
		const { success } = await storeDatabase.collections.products.bulkInsert(data);
		expect(success.length).toBe(5);

		const query = new Query({ collection: storeDatabase.collections.products, initialParams: {} });

		return new Promise((resolve) => {
			query.result$.subscribe((result) => {
				expect(result).toEqual(
					expect.objectContaining({
						elapsed: expect.any(Number),
						searchActive: false,
						count: 5,
						hits: expect.arrayContaining([
							expect.objectContaining({ id: '1', document: expect.any(Object) }),
							expect.objectContaining({ id: '2', document: expect.any(Object) }),
							expect.objectContaining({ id: '3', document: expect.any(Object) }),
							expect.objectContaining({ id: '4', document: expect.any(Object) }),
							expect.objectContaining({ id: '5', document: expect.any(Object) }),
						]),
					})
				);
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
			const query = new Query({
				collection: storeDatabase.collections.products,
				initialParams: {},
			});
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
			const { success } = await storeDatabase.collections.products.bulkInsert(data);
			expect(success.length).toBe(5);

			const query = new Query({ collection: storeDatabase.collections.products, initialParams });

			let count = 0;

			// next sort
			const promise = new Promise((resolve) => {
				query.result$.subscribe((result) => {
					if (count === 0) {
						count++;
						expect(result).toEqual(
							expect.objectContaining({
								elapsed: expect.any(Number),
								searchActive: false,
								count: 5,
								hits: expect.arrayContaining([
									expect.objectContaining({ id: '4', document: expect.any(Object) }),
									expect.objectContaining({ id: '2', document: expect.any(Object) }),
									expect.objectContaining({ id: '1', document: expect.any(Object) }),
									expect.objectContaining({ id: '5', document: expect.any(Object) }),
									expect.objectContaining({ id: '3', document: expect.any(Object) }),
								]),
							})
						);

						// trigger next sort
						query.sort('price', 'desc');
					} else {
						expect(result).toEqual(
							expect.objectContaining({
								elapsed: expect.any(Number),
								searchActive: false,
								count: 5,
								hits: expect.arrayContaining([
									expect.objectContaining({ id: '3', document: expect.any(Object) }),
									expect.objectContaining({ id: '5', document: expect.any(Object) }),
									expect.objectContaining({ id: '1', document: expect.any(Object) }),
									expect.objectContaining({ id: '2', document: expect.any(Object) }),
									expect.objectContaining({ id: '4', document: expect.any(Object) }),
								]),
							})
						);
						resolve();
					}
				});
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
		it('sets a single where clause', async () => {
			const data = [
				{ uuid: '1', name: 'Item 1', stock_status: 'outofstock' },
				{ uuid: '2', name: 'Item 2', stock_status: 'instock' },
				{ uuid: '3', name: 'Item 3', stock_status: 'onbackorder' },
				{ uuid: '4', name: 'Item 4', stock_status: 'instock' },
				{ uuid: '5', name: 'Item 5', stock_status: 'lowstock' },
			];

			const { success } = await storeDatabase.collections.products.bulkInsert(data);
			expect(success.length).toBe(5);

			const query = new Query({
				collection: storeDatabase.collections.products,
				initialParams: {
					sortBy: 'name',
					sortDirection: 'asc',
				},
			});

			query.where('stock_status', 'instock');
			expect(query.getParams()).toEqual({
				selector: { $and: [{ stock_status: 'instock' }] },
				sortBy: 'name',
				sortDirection: 'asc',
			});

			return new Promise((resolve) => {
				query.result$.subscribe((result) => {
					expect(result).toEqual(
						expect.objectContaining({
							elapsed: expect.any(Number),
							searchActive: false,
							count: 2,
							hits: expect.arrayContaining([
								expect.objectContaining({ id: '2', document: expect.any(Object) }),
								expect.objectContaining({ id: '4', document: expect.any(Object) }),
							]),
						})
					);

					resolve();
				});
			});
		});

		/**
		 *
		 */
		it('overwrites an existing where clause', async () => {
			const data = [
				{ uuid: '1', name: 'Item 1', stock_status: 'outofstock' },
				{ uuid: '2', name: 'Item 2', stock_status: 'instock' },
				{ uuid: '3', name: 'Item 3', stock_status: 'onbackorder' },
				{ uuid: '4', name: 'Item 4', stock_status: 'instock' },
				{ uuid: '5', name: 'Item 5', stock_status: 'lowstock' },
			];

			const { success } = await storeDatabase.collections.products.bulkInsert(data);
			expect(success.length).toBe(5);

			const query = new Query({
				collection: storeDatabase.collections.products,
				initialParams: {
					sortBy: 'name',
					sortDirection: 'asc',
					selector: {
						stock_status: 'instock',
					},
				},
			});

			query.where('stock_status', 'outofstock');
			expect(query.getParams()).toEqual({
				selector: { $and: [{ stock_status: 'outofstock' }] },
				sortBy: 'name',
				sortDirection: 'asc',
			});

			return new Promise((resolve) => {
				query.result$.subscribe((result) => {
					expect(result).toEqual(
						expect.objectContaining({
							elapsed: expect.any(Number),
							searchActive: false,
							count: 1,
							hits: expect.arrayContaining([
								expect.objectContaining({ id: '1', document: expect.any(Object) }),
							]),
						})
					);

					resolve();
				});
			});
		});

		/**
		 *
		 */
		it('removes a where clause when value is null', async () => {
			const data = [
				{ uuid: '1', name: 'Item 1', stock_status: 'outofstock' },
				{ uuid: '2', name: 'Item 2', stock_status: 'instock' },
				{ uuid: '3', name: 'Item 3', stock_status: 'onbackorder' },
				{ uuid: '4', name: 'Item 4', stock_status: 'instock' },
				{ uuid: '5', name: 'Item 5', stock_status: 'lowstock' },
			];

			const { success } = await storeDatabase.collections.products.bulkInsert(data);
			expect(success.length).toBe(5);

			const query = new Query({
				collection: storeDatabase.collections.products,
				initialParams: {
					sortBy: 'name',
					sortDirection: 'asc',
					selector: {
						stock_status: 'instock',
					},
				},
			});

			let count = 0;

			// next sort
			const promise = new Promise((resolve) => {
				query.result$.subscribe((result) => {
					if (count === 0) {
						count++;
						expect(result).toEqual(
							expect.objectContaining({
								elapsed: expect.any(Number),
								searchActive: false,
								count: 2,
								hits: expect.arrayContaining([
									expect.objectContaining({ id: '2', document: expect.any(Object) }),
									expect.objectContaining({ id: '4', document: expect.any(Object) }),
								]),
							})
						);

						// remove selector
						query.where('stock_status', null);
					} else {
						expect(result).toEqual(
							expect.objectContaining({
								elapsed: expect.any(Number),
								searchActive: false,
								count: 5,
								hits: expect.arrayContaining([
									expect.objectContaining({ id: '1', document: expect.any(Object) }),
									expect.objectContaining({ id: '2', document: expect.any(Object) }),
									expect.objectContaining({ id: '3', document: expect.any(Object) }),
									expect.objectContaining({ id: '4', document: expect.any(Object) }),
									expect.objectContaining({ id: '5', document: expect.any(Object) }),
								]),
							})
						);
						resolve();
					}
				});
			});

			return promise;
		});

		/**
		 *
		 */
		it('finds a meta data element', async () => {
			const data = [
				{
					uuid: '1',
					name: 'Item 1',
					meta_data: [
						{ key: 'key', value: 'value' },
						{ key: '_pos_store', value: '64' },
					],
				},
				{ uuid: '2', name: 'Item 2', meta_data: [{ key: 'key', value: 'value' }] },
				{
					uuid: '3',
					name: 'Item 3',
					meta_data: [
						{ key: 'key', value: 'value' },
						{ key: '_pos_store', value: '40' },
					],
				},
				{ uuid: '4', name: 'Item 4', meta_data: [{ key: 'key', value: 'value' }] },
				{
					uuid: '5',
					name: 'Item 5',
					meta_data: [
						{ key: 'key', value: 'value' },
						{ key: '_pos_store', value: '64' },
					],
				},
			];

			const { success } = await storeDatabase.collections.products.bulkInsert(data);
			expect(success.length).toBe(5);

			const query = new Query({
				collection: storeDatabase.collections.products,
				initialParams: {
					sortBy: 'name',
					sortDirection: 'asc',
				},
			});

			query.where('meta_data', { $elemMatch: { key: '_pos_store', value: '64' } });
			expect(query.getParams()).toEqual({
				selector: { $and: [{ meta_data: { $elemMatch: { key: '_pos_store', value: '64' } } }] },
				sortBy: 'name',
				sortDirection: 'asc',
			});

			return new Promise((resolve) => {
				query.result$.subscribe((result) => {
					expect(result).toEqual(
						expect.objectContaining({
							elapsed: expect.any(Number),
							searchActive: false,
							count: 2,
							hits: expect.arrayContaining([
								expect.objectContaining({ id: '1', document: expect.any(Object) }),
								expect.objectContaining({ id: '5', document: expect.any(Object) }),
							]),
						})
					);

					resolve();
				});
			});
		});

		/**
		 *
		 */
		it('finds multiple meta data elements', async () => {
			const data = [
				{
					uuid: '1',
					name: 'Item 1',
					meta_data: [
						{ key: 'key', value: 'value' },
						{ key: '_pos_user', value: '5' },
						{ key: '_pos_store', value: '64' },
					],
				},
				{ uuid: '2', name: 'Item 2', meta_data: [] },
				{
					uuid: '3',
					name: 'Item 3',
					meta_data: [
						{ key: 'key', value: 'value' },
						{ key: '_pos_user', value: '3' },
						{ key: '_pos_store', value: '40' },
					],
				},
				{
					uuid: '4',
					name: 'Item 4',
					meta_data: [
						{ key: 'key', value: 'value' },
						{ key: '_pos_store', value: '40' },
					],
				},
				{
					uuid: '5',
					name: 'Item 5',
					meta_data: [
						{ key: 'key', value: 'value' },
						{ key: '_pos_user', value: '3' },
						{ key: '_pos_store', value: '64' },
					],
				},
			];

			const { success } = await storeDatabase.collections.products.bulkInsert(data);
			expect(success.length).toBe(5);

			const query = new Query({
				collection: storeDatabase.collections.products,
				initialParams: {
					sortBy: 'name',
					sortDirection: 'asc',
					selector: {
						meta_data: { $elemMatch: { key: '_pos_user', value: '3' } },
					},
				},
			});

			query.where('meta_data', { $elemMatch: { key: '_pos_store', value: '64' } });
			expect(query.getParams()).toEqual({
				selector: {
					$and: [
						{ meta_data: { $elemMatch: { key: '_pos_user', value: '3' } } },
						{ meta_data: { $elemMatch: { key: '_pos_store', value: '64' } } },
					],
				},
				sortBy: 'name',
				sortDirection: 'asc',
			});

			return new Promise((resolve) => {
				query.result$.subscribe((result) => {
					expect(result).toEqual(
						expect.objectContaining({
							elapsed: expect.any(Number),
							searchActive: false,
							count: 1,
							hits: expect.arrayContaining([
								expect.objectContaining({ id: '5', document: expect.any(Object) }),
							]),
						})
					);

					resolve();
				});
			});
		});

		/**
		 *
		 */
		it('overwrites an existing meta data selector', async () => {
			const data = [
				{
					uuid: '1',
					name: 'Item 1',
					meta_data: [
						{ key: 'key', value: 'value' },
						{ key: '_pos_user', value: '5' },
						{ key: '_pos_store', value: '64' },
					],
				},
				{ uuid: '2', name: 'Item 2', meta_data: [] },
				{
					uuid: '3',
					name: 'Item 3',
					meta_data: [
						{ key: 'key', value: 'value' },
						{ key: '_pos_user', value: '3' },
						{ key: '_pos_store', value: '40' },
					],
				},
				{
					uuid: '4',
					name: 'Item 4',
					meta_data: [
						{ key: 'key', value: 'value' },
						{ key: '_pos_store', value: '40' },
					],
				},
				{
					uuid: '5',
					name: 'Item 5',
					meta_data: [
						{ key: 'key', value: 'value' },
						{ key: '_pos_user', value: '3' },
						{ key: '_pos_store', value: '64' },
					],
				},
			];

			const { success } = await storeDatabase.collections.products.bulkInsert(data);
			expect(success.length).toBe(5);

			const query = new Query({
				collection: storeDatabase.collections.products,
				initialParams: {
					sortBy: 'name',
					sortDirection: 'asc',
					selector: {
						meta_data: { $elemMatch: { key: '_pos_user', value: '3' } },
					},
				},
			});

			query.where('meta_data', { $elemMatch: { key: '_pos_user', value: '5' } });
			expect(query.getParams()).toEqual({
				selector: {
					$and: [{ meta_data: { $elemMatch: { key: '_pos_user', value: '5' } } }],
				},
				sortBy: 'name',
				sortDirection: 'asc',
			});

			return new Promise((resolve) => {
				query.result$.subscribe((result) => {
					expect(result).toEqual(
						expect.objectContaining({
							elapsed: expect.any(Number),
							searchActive: false,
							count: 1,
							hits: expect.arrayContaining([
								expect.objectContaining({ id: '1', document: expect.any(Object) }),
							]),
						})
					);

					resolve();
				});
			});
		});

		/**
		 *
		 */
		it('removes a single meta data selector', async () => {
			const data = [
				{
					uuid: '1',
					name: 'Item 1',
					meta_data: [
						{ key: 'key', value: 'value' },
						{ key: '_pos_user', value: '5' },
						{ key: '_pos_store', value: '64' },
					],
				},
				{ uuid: '2', name: 'Item 2', meta_data: [] },
				{
					uuid: '3',
					name: 'Item 3',
					meta_data: [
						{ key: 'key', value: 'value' },
						{ key: '_pos_user', value: '3' },
						{ key: '_pos_store', value: '40' },
					],
				},
				{
					uuid: '4',
					name: 'Item 4',
					meta_data: [
						{ key: 'key', value: 'value' },
						{ key: '_pos_store', value: '40' },
					],
				},
				{
					uuid: '5',
					name: 'Item 5',
					meta_data: [
						{ key: 'key', value: 'value' },
						{ key: '_pos_user', value: '3' },
						{ key: '_pos_store', value: '64' },
					],
				},
			];

			const { success } = await storeDatabase.collections.products.bulkInsert(data);
			expect(success.length).toBe(5);

			const query = new Query({
				collection: storeDatabase.collections.products,
				initialParams: {
					sortBy: 'name',
					sortDirection: 'asc',
					selector: {
						meta_data: { $elemMatch: { key: '_pos_user', value: '3' } },
						meta_data: { $elemMatch: { key: '_pos_store', value: '64' } },
					},
				},
			});

			query.where('meta_data', { $elemMatch: { key: '_pos_user', value: null } });
			expect(query.getParams()).toEqual({
				selector: {
					$and: [{ meta_data: { $elemMatch: { key: '_pos_store', value: '64' } } }],
				},
				sortBy: 'name',
				sortDirection: 'asc',
			});

			return new Promise((resolve) => {
				query.result$.subscribe((result) => {
					expect(result).toEqual(
						expect.objectContaining({
							elapsed: expect.any(Number),
							searchActive: false,
							count: 2,
							hits: expect.arrayContaining([
								expect.objectContaining({ id: '1', document: expect.any(Object) }),
								expect.objectContaining({ id: '5', document: expect.any(Object) }),
							]),
						})
					);

					resolve();
				});
			});
		});

		/**
		 *
		 */
		it('removes all meta data selectors', async () => {
			const data = [
				{
					uuid: '1',
					name: 'Item 1',
					meta_data: [
						{ key: 'key', value: 'value' },
						{ key: '_pos_user', value: '5' },
						{ key: '_pos_store', value: '64' },
					],
				},
				{ uuid: '2', name: 'Item 2', meta_data: [] },
				{
					uuid: '3',
					name: 'Item 3',
					meta_data: [
						{ key: 'key', value: 'value' },
						{ key: '_pos_user', value: '3' },
						{ key: '_pos_store', value: '40' },
					],
				},
				{
					uuid: '4',
					name: 'Item 4',
					meta_data: [
						{ key: 'key', value: 'value' },
						{ key: '_pos_store', value: '40' },
					],
				},
				{
					uuid: '5',
					name: 'Item 5',
					meta_data: [
						{ key: 'key', value: 'value' },
						{ key: '_pos_user', value: '3' },
						{ key: '_pos_store', value: '64' },
					],
				},
			];

			const { success } = await storeDatabase.collections.products.bulkInsert(data);
			expect(success.length).toBe(5);

			const query = new Query({
				collection: storeDatabase.collections.products,
				initialParams: {
					sortBy: 'name',
					sortDirection: 'asc',
					selector: {
						meta_data: { $elemMatch: { key: '_pos_user', value: '3' } },
						meta_data: { $elemMatch: { key: '_pos_store', value: '64' } },
					},
				},
			});

			query.where('meta_data', null);
			expect(query.getParams()).toEqual({
				selector: {},
				sortBy: 'name',
				sortDirection: 'asc',
			});

			return new Promise((resolve) => {
				query.result$.subscribe((result) => {
					expect(result).toEqual(
						expect.objectContaining({
							elapsed: expect.any(Number),
							searchActive: false,
							count: 5,
							hits: expect.arrayContaining([
								expect.objectContaining({ id: '1', document: expect.any(Object) }),
								expect.objectContaining({ id: '2', document: expect.any(Object) }),
								expect.objectContaining({ id: '3', document: expect.any(Object) }),
								expect.objectContaining({ id: '4', document: expect.any(Object) }),
								expect.objectContaining({ id: '5', document: expect.any(Object) }),
							]),
						})
					);

					resolve();
				});
			});
		});

		/**
		 *
		 */
		it('finds an attributes element', async () => {
			const data = [
				{
					uuid: '1',
					name: 'Item 1',
					attributes: [
						{ name: 'name', option: 'option' },
						{ name: 'Color', option: 'Blue' },
					],
				},
				{ uuid: '2', name: 'Item 2', attributes: [{ name: 'name', option: 'option' }] },
				{
					uuid: '3',
					name: 'Item 3',
					attributes: [
						{ name: 'name', option: 'option' },
						{ name: 'Color', option: 'Red' },
					],
				},
				{ uuid: '4', name: 'Item 4', attributes: [{ name: 'name', option: 'option' }] },
				{
					uuid: '5',
					name: 'Item 5',
					attributes: [
						{ name: 'name', option: 'option' },
						{ name: 'Color', option: 'Blue' },
					],
				},
			];

			const { success } = await storeDatabase.collections.variations.bulkInsert(data);
			expect(success.length).toBe(5);

			const query = new Query({
				collection: storeDatabase.collections.variations,
				initialParams: {
					sortBy: 'name',
					sortDirection: 'asc',
				},
			});

			query.where('attributes', { $elemMatch: { name: 'Color', option: 'Blue' } });
			expect(query.getParams()).toEqual({
				selector: { $and: [{ attributes: { $elemMatch: { name: 'Color', option: 'Blue' } } }] },
				sortBy: 'name',
				sortDirection: 'asc',
			});

			return new Promise((resolve) => {
				query.result$.subscribe((result) => {
					expect(result).toEqual(
						expect.objectContaining({
							elapsed: expect.any(Number),
							searchActive: false,
							count: 2,
							hits: expect.arrayContaining([
								expect.objectContaining({ id: '1', document: expect.any(Object) }),
								expect.objectContaining({ id: '5', document: expect.any(Object) }),
							]),
						})
					);

					resolve();
				});
			});
		});

		/**
		 *
		 */
		it('finds a category by ID', async () => {
			const data = [
				{
					uuid: '1',
					name: 'Item 1',
					categories: [
						{
							id: 21,
							name: 'Music',
							slug: 'music',
						},
					],
				},
				{
					uuid: '2',
					name: 'Item 2',
					categories: [
						{
							id: 17,
							name: 'Clothing',
							slug: 'clothing',
						},
						{
							id: 21,
							name: 'Music',
							slug: 'music',
						},
					],
				},
				{
					uuid: '3',
					name: 'Item 3',
					categories: [
						{
							id: 17,
							name: 'Clothing',
							slug: 'clothing',
						},
					],
				},
				{
					uuid: '4',
					name: 'Item 4',
					categories: [
						{
							id: 21,
							name: 'Music',
							slug: 'music',
						},
					],
				},
				{
					uuid: '5',
					name: 'Item 5',
					categories: [
						{
							id: 17,
							name: 'Clothing',
							slug: 'clothing',
						},
						{
							id: 21,
							name: 'Music',
							slug: 'music',
						},
					],
				},
			];

			const { success } = await storeDatabase.collections.products.bulkInsert(data);
			expect(success.length).toBe(5);

			const query = new Query({
				collection: storeDatabase.collections.products,
				initialParams: {
					sortBy: 'name',
					sortDirection: 'asc',
				},
			});

			query.where('categories', { $elemMatch: { id: 17 } });
			expect(query.getParams()).toEqual({
				selector: { $and: [{ categories: { $elemMatch: { id: 17 } } }] },
				sortBy: 'name',
				sortDirection: 'asc',
			});

			return new Promise((resolve) => {
				query.result$.subscribe((result) => {
					expect(result).toEqual(
						expect.objectContaining({
							elapsed: expect.any(Number),
							searchActive: false,
							count: 3,
							hits: expect.arrayContaining([
								expect.objectContaining({ id: '2', document: expect.any(Object) }),
								expect.objectContaining({ id: '3', document: expect.any(Object) }),
								expect.objectContaining({ id: '5', document: expect.any(Object) }),
							]),
						})
					);

					resolve();
				});
			});
		});

		/**
		 *
		 */
		it('replaces a category selector by ID', async () => {
			const data = [
				{
					uuid: '1',
					name: 'Item 1',
					categories: [
						{
							id: 21,
							name: 'Music',
							slug: 'music',
						},
					],
				},
				{
					uuid: '2',
					name: 'Item 2',
					categories: [
						{
							id: 17,
							name: 'Clothing',
							slug: 'clothing',
						},
						{
							id: 21,
							name: 'Music',
							slug: 'music',
						},
					],
				},
				{
					uuid: '3',
					name: 'Item 3',
					categories: [
						{
							id: 17,
							name: 'Clothing',
							slug: 'clothing',
						},
					],
				},
				{
					uuid: '4',
					name: 'Item 4',
					categories: [
						{
							id: 21,
							name: 'Music',
							slug: 'music',
						},
					],
				},
				{
					uuid: '5',
					name: 'Item 5',
					categories: [
						{
							id: 17,
							name: 'Clothing',
							slug: 'clothing',
						},
						{
							id: 21,
							name: 'Music',
							slug: 'music',
						},
					],
				},
			];

			const { success } = await storeDatabase.collections.products.bulkInsert(data);
			expect(success.length).toBe(5);

			const query = new Query({
				collection: storeDatabase.collections.products,
				initialParams: {
					sortBy: 'name',
					sortDirection: 'asc',
					selector: {
						categories: { $elemMatch: { id: 21 } },
					},
				},
			});

			query.where('categories', { $elemMatch: { id: 17 } });
			expect(query.getParams()).toEqual({
				selector: { $and: [{ categories: { $elemMatch: { id: 17 } } }] },
				sortBy: 'name',
				sortDirection: 'asc',
			});

			return new Promise((resolve) => {
				query.result$.subscribe((result) => {
					expect(result).toEqual(
						expect.objectContaining({
							elapsed: expect.any(Number),
							searchActive: false,
							count: 3,
							hits: expect.arrayContaining([
								expect.objectContaining({ id: '2', document: expect.any(Object) }),
								expect.objectContaining({ id: '3', document: expect.any(Object) }),
								expect.objectContaining({ id: '5', document: expect.any(Object) }),
							]),
						})
					);

					resolve();
				});
			});
		});
	});
});

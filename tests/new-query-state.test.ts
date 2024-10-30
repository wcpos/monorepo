import { isRxQuery, type RxDatabase } from 'rxdb';
import { Subject } from 'rxjs';
import { map } from 'rxjs/operators';

import { createStoreDatabase } from './helpers/db';
import { Query, QueryParams } from '../src/query-state'; // Adjust the import based on your file structure

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

	it('query instance should emit the initial RxQuery and params', async () => {
		const initialParams = {
			sort: [{ name: 'asc' }],
		};
		const query = new Query({ collection: storeDatabase.collections.products, initialParams });

		query.rxQuery$.subscribe((rxQuery) => {
			expect(rxQuery).toBeDefined();
			expect(isRxQuery(rxQuery)).toBe(true);
		});
		query.params$.subscribe((params) => {
			expect(params).toEqual(initialParams);
		});

		expect(query.getParams()).toEqual(initialParams);
	});

	it('query.result$ should init with empty result if no records', () => {
		const initialParams = {
			sort: [{ name: 'asc' }],
		};

		const query = new Query({ collection: storeDatabase.collections.products, initialParams });

		query.result$.subscribe((result) => {
			expect(result).toEqual(
				expect.objectContaining({
					elapsed: expect.any(Number),
					searchActive: false,
					hits: [],
					count: 0,
				})
			);
		});
	});

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

		return new Promise<void>((resolve) => {
			query.result$.subscribe((result) => {
				console.log('Query result', result);
				expect(result).toEqual(
					expect.objectContaining({
						elapsed: expect.any(Number),
						searchActive: false,
						count: 5,
						hits: expect.arrayContaining([
							expect.objectContaining({ id: '1', document: success[0] }),
							expect.objectContaining({ id: '2', document: success[1] }),
							expect.objectContaining({ id: '3', document: success[2] }),
							expect.objectContaining({ id: '4', document: success[3] }),
							expect.objectContaining({ id: '5', document: success[4] }),
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
			query.sort({ name: 'asc' }).exec();

			expect(query.getParams()).toEqual({ selector: {}, sort: [{ name: 'asc' }] });

			const spy = jest.fn();
			query.params$.subscribe(spy);
			expect(spy).toHaveBeenCalledWith({ selector: {}, sort: [{ name: 'asc' }] });
		});

		/**
		 *
		 */
		it('emits sorted results', async () => {
			const initialParams: QueryParams = { sort: [{ price: 'asc' }] };
			const data = [
				{ uuid: '1', name: 'Item 1', price: 1.23 },
				{ uuid: '2', name: 'Item 2', price: 0.12 },
				{ uuid: '3', name: 'Item 3', price: 100.01 },
				{ uuid: '4', name: 'Item 4', price: -9.5 },
				{ uuid: '5', name: 'Item 5', price: 4.0 },
			];
			const { success } = await storeDatabase.collections.products.bulkInsert(data);
			expect(success.length).toBe(5);

			const query = new Query({ collection: storeDatabase.collections.products, initialParams });

			let count = 0;

			// next sort
			const promise = new Promise<void>((resolve) => {
				query.result$.subscribe((result) => {
					if (count === 0) {
						count++;
						expect(result).toEqual(
							expect.objectContaining({
								elapsed: expect.any(Number),
								searchActive: false,
								count: 5,
								hits: expect.arrayContaining([
									expect.objectContaining({ id: '4', document: success[3] }),
									expect.objectContaining({ id: '2', document: success[1] }),
									expect.objectContaining({ id: '1', document: success[0] }),
									expect.objectContaining({ id: '5', document: success[4] }),
									expect.objectContaining({ id: '3', document: success[2] }),
								]),
							})
						);

						// trigger next sort
						query.sort({ price: 'desc' }).exec();
					} else {
						expect(result).toEqual(
							expect.objectContaining({
								elapsed: expect.any(Number),
								searchActive: false,
								count: 5,
								hits: expect.arrayContaining([
									expect.objectContaining({ id: '3', document: success[2] }),
									expect.objectContaining({ id: '5', document: success[4] }),
									expect.objectContaining({ id: '1', document: success[0] }),
									expect.objectContaining({ id: '2', document: success[1] }),
									expect.objectContaining({ id: '4', document: success[3] }),
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
					sort: [{ name: 'asc' }],
				},
			});

			query.where('stock_status').equals('instock').exec();
			expect(query.getParams()).toEqual({
				selector: { stock_status: 'instock' },
				sort: [{ name: 'asc' }],
			});

			return new Promise<void>((resolve) => {
				query.result$.subscribe((result) => {
					expect(result).toEqual(
						expect.objectContaining({
							elapsed: expect.any(Number),
							searchActive: false,
							count: 2,
							hits: expect.arrayContaining([
								expect.objectContaining({ id: '2', document: success[1] }),
								expect.objectContaining({ id: '4', document: success[3] }),
							]),
						})
					);

					resolve();
				});
			});
		});

		it('has access to the current path', () => {
			const query = new Query({
				collection: storeDatabase.collections.products,
				initialParams: {},
			});

			query.where('stock_status');

			expect(query.currentRxQuery.other.queryBuilderPath).toBe('stock_status');
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
					sort: [{ name: 'asc' }],
					selector: {
						stock_status: 'instock',
					},
				},
			});

			query.where('stock_status').equals('outofstock').exec();
			expect(query.getParams()).toEqual({
				selector: { stock_status: 'outofstock' },
				sort: [{ name: 'asc' }],
			});

			return new Promise<void>((resolve) => {
				query.result$.subscribe((result) => {
					expect(result).toEqual(
						expect.objectContaining({
							elapsed: expect.any(Number),
							searchActive: false,
							count: 1,
							hits: expect.arrayContaining([
								expect.objectContaining({ id: '1', document: success[0] }),
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
					sort: [{ name: 'asc' }],
					selector: {
						stock_status: 'instock',
					},
				},
			});

			let count = 0;

			// next sort
			const promise = new Promise<void>((resolve) => {
				query.result$.subscribe((result) => {
					if (count === 0) {
						count++;
						expect(result).toEqual(
							expect.objectContaining({
								elapsed: expect.any(Number),
								searchActive: false,
								count: 2,
								hits: expect.arrayContaining([
									expect.objectContaining({ id: '2', document: success[1] }),
									expect.objectContaining({ id: '4', document: success[3] }),
								]),
							})
						);

						// remove selector
						query.removeWhere('stock_status').exec();
					} else {
						expect(result).toEqual(
							expect.objectContaining({
								elapsed: expect.any(Number),
								searchActive: false,
								count: 5,
								hits: expect.arrayContaining([
									expect.objectContaining({ id: '1', document: success[0] }),
									expect.objectContaining({ id: '2', document: success[1] }),
									expect.objectContaining({ id: '3', document: success[2] }),
									expect.objectContaining({ id: '4', document: success[3] }),
									expect.objectContaining({ id: '5', document: success[4] }),
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
					sort: [{ name: 'asc' }],
				},
			});

			query.where('meta_data').elemMatch({ key: '_pos_store', value: '64' }).exec();
			expect(query.getParams()).toEqual({
				selector: { meta_data: { $elemMatch: { key: '_pos_store', value: '64' } } },
				sort: [{ name: 'asc' }],
			});

			return new Promise<void>((resolve) => {
				query.result$.subscribe((result) => {
					expect(result).toEqual(
						expect.objectContaining({
							elapsed: expect.any(Number),
							searchActive: false,
							count: 2,
							hits: expect.arrayContaining([
								expect.objectContaining({ id: '1', document: success[0] }),
								expect.objectContaining({ id: '5', document: success[4] }),
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
					sort: [{ name: 'asc' }],
					selector: {
						$and: [{ meta_data: { $elemMatch: { key: '_pos_user', value: '3' } } }],
					},
				},
			});

			query.where('meta_data').multipleElemMatch({ key: '_pos_store', value: '64' }).exec();
			expect(query.getParams()).toEqual({
				selector: {
					$and: [
						{ meta_data: { $elemMatch: { key: '_pos_user', value: '3' } } },
						{ meta_data: { $elemMatch: { key: '_pos_store', value: '64' } } },
					],
				},
				sort: [{ name: 'asc' }],
			});

			return new Promise<void>((resolve) => {
				query.result$.subscribe((result) => {
					expect(result).toEqual(
						expect.objectContaining({
							elapsed: expect.any(Number),
							searchActive: false,
							count: 1,
							hits: expect.arrayContaining([
								expect.objectContaining({ id: '5', document: success[4] }),
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
					sort: [{ name: 'asc' }],
					selector: {
						meta_data: { $elemMatch: { key: '_pos_user', value: '3' } },
					},
				},
			});

			query.where('meta_data').elemMatch({ key: '_pos_user', value: '5' }).exec();
			expect(query.getParams()).toEqual({
				selector: {
					meta_data: { $elemMatch: { key: '_pos_user', value: '5' } },
				},
				sort: [{ name: 'asc' }],
			});

			return new Promise<void>((resolve) => {
				query.result$.subscribe((result) => {
					expect(result).toEqual(
						expect.objectContaining({
							elapsed: expect.any(Number),
							searchActive: false,
							count: 1,
							hits: expect.arrayContaining([
								expect.objectContaining({ id: '1', document: success[0] }),
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
					sort: [{ name: 'asc' }],
					selector: {
						$and: [
							{ meta_data: { $elemMatch: { key: '_pos_user', value: '3' } } },
							{ meta_data: { $elemMatch: { key: '_pos_store', value: '64' } } },
						],
					},
				},
			});

			query.where('meta_data').removeElemMatch('meta_data', { key: '_pos_user' }).exec();
			expect(query.getParams()).toEqual({
				selector: {
					meta_data: { $elemMatch: { key: '_pos_store', value: '64' } },
				},
				sort: [{ name: 'asc' }],
			});

			return new Promise<void>((resolve) => {
				query.result$.subscribe((result) => {
					expect(result).toEqual(
						expect.objectContaining({
							elapsed: expect.any(Number),
							searchActive: false,
							count: 2,
							hits: expect.arrayContaining([
								expect.objectContaining({ id: '1', document: success[0] }),
								expect.objectContaining({ id: '5', document: success[4] }),
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
					sort: [{ name: 'asc' }],
					selector: {
						$and: [
							{ meta_data: { $elemMatch: { key: '_pos_user', value: '3' } } },
							{ meta_data: { $elemMatch: { key: '_pos_store', value: '64' } } },
						],
					},
				},
			});

			query
				.where('meta_data')
				.removeElemMatch('meta_data', { key: '_pos_user' })
				.removeElemMatch('meta_data', { key: '_pos_store' })
				.exec();
			expect(query.getParams()).toEqual({
				selector: {},
				sort: [{ name: 'asc' }],
			});

			return new Promise<void>((resolve) => {
				query.result$.subscribe((result) => {
					expect(result).toEqual(
						expect.objectContaining({
							elapsed: expect.any(Number),
							searchActive: false,
							count: 5,
							hits: expect.arrayContaining([
								expect.objectContaining({ id: '1', document: success[0] }),
								expect.objectContaining({ id: '2', document: success[1] }),
								expect.objectContaining({ id: '3', document: success[2] }),
								expect.objectContaining({ id: '4', document: success[3] }),
								expect.objectContaining({ id: '5', document: success[4] }),
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
					sort: [{ name: 'asc' }],
				},
			});

			query.where('attributes').elemMatch({ name: 'Color', option: 'Blue' }).exec();
			expect(query.getParams()).toEqual({
				selector: {
					attributes: { $elemMatch: { name: 'Color', option: 'Blue' } },
				},
				sort: [{ name: 'asc' }],
			});

			return new Promise<void>((resolve) => {
				query.result$.subscribe((result) => {
					expect(result).toEqual(
						expect.objectContaining({
							elapsed: expect.any(Number),
							searchActive: false,
							count: 2,
							hits: expect.arrayContaining([
								expect.objectContaining({ id: '1', document: success[0] }),
								expect.objectContaining({ id: '5', document: success[4] }),
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
					sort: [{ name: 'asc' }],
				},
			});

			query.where('categories').elemMatch({ id: 17 }).exec();
			expect(query.getParams()).toEqual({
				selector: {
					categories: { $elemMatch: { id: 17 } },
				},
				sort: [{ name: 'asc' }],
			});

			return new Promise<void>((resolve) => {
				query.result$.subscribe((result) => {
					expect(result).toEqual(
						expect.objectContaining({
							elapsed: expect.any(Number),
							searchActive: false,
							count: 3,
							hits: expect.arrayContaining([
								expect.objectContaining({ id: '2', document: success[1] }),
								expect.objectContaining({ id: '3', document: success[2] }),
								expect.objectContaining({ id: '5', document: success[4] }),
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
					sort: [{ name: 'asc' }],
					selector: {
						categories: { $elemMatch: { id: 21 } },
					},
				},
			});

			query.where('categories').elemMatch({ id: 17 }).exec();
			expect(query.getParams()).toEqual({
				selector: {
					categories: { $elemMatch: { id: 17 } },
				},
				sort: [{ name: 'asc' }],
			});

			return new Promise<void>((resolve) => {
				query.result$.subscribe((result) => {
					expect(result).toEqual(
						expect.objectContaining({
							elapsed: expect.any(Number),
							searchActive: false,
							count: 3,
							hits: expect.arrayContaining([
								expect.objectContaining({ id: '2', document: success[1] }),
								expect.objectContaining({ id: '3', document: success[2] }),
								expect.objectContaining({ id: '5', document: success[4] }),
							]),
						})
					);

					resolve();
				});
			});
		});
	});
});

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
			selector: {
				stock_status: 'instock',
			},
			sort: [{ name: 'asc' }],
		};
		const query = new Query({ collection: storeDatabase.collections.products, initialParams });

		query.rxQuery$.subscribe((rxQuery) => {
			expect(rxQuery).toBeDefined();
			expect(isRxQuery(rxQuery)).toBe(true);
			expect(rxQuery?.mangoQuery).toEqual(initialParams);
		});
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
		it('updates the query correctly when sort is called', () => {
			const query = new Query({
				collection: storeDatabase.collections.products,
				initialParams: {},
			});
			query.sort([{ name: 'asc' }]).exec();

			const spy = jest.fn();
			query.rxQuery$.subscribe(spy);
			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({ mangoQuery: { sort: [{ name: 'asc' }] } })
			);
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
						query.sort([{ price: 'desc' }]).exec();
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

			const spy = jest.fn();
			query.rxQuery$.subscribe(spy);
			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					mangoQuery: { selector: { stock_status: 'instock' }, sort: [{ name: 'asc' }] },
				})
			);

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
			const spy = jest.fn();
			query.rxQuery$.subscribe(spy);
			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					mangoQuery: { selector: { stock_status: 'outofstock' }, sort: [{ name: 'asc' }] },
				})
			);

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
		it('removes a where clause', async () => {
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

		it('fails gracefully when removing a non-existent where clause', async () => {
			const query = new Query({
				collection: storeDatabase.collections.products,
				initialParams: {},
			});

			query.removeWhere('stock_status').exec();
			const spy = jest.fn();
			query.rxQuery$.subscribe(spy);
			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					mangoQuery: {},
				})
			);
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
			const spy = jest.fn();
			query.rxQuery$.subscribe(spy);
			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					mangoQuery: {
						selector: { meta_data: { $elemMatch: { key: '_pos_store', value: '64' } } },
						sort: [{ name: 'asc' }],
					},
				})
			);

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
			const spy = jest.fn();
			query.rxQuery$.subscribe(spy);
			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					mangoQuery: {
						selector: {
							$and: [
								{ meta_data: { $elemMatch: { key: '_pos_user', value: '3' } } },
								{ meta_data: { $elemMatch: { key: '_pos_store', value: '64' } } },
							],
						},
						sort: [{ name: 'asc' }],
					},
				})
			);

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
			const spy = jest.fn();
			query.rxQuery$.subscribe(spy);
			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					mangoQuery: {
						selector: {
							meta_data: { $elemMatch: { key: '_pos_user', value: '5' } },
						},
						sort: [{ name: 'asc' }],
					},
				})
			);

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
			const spy = jest.fn();
			query.rxQuery$.subscribe(spy);
			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					mangoQuery: {
						selector: {
							meta_data: { $elemMatch: { key: '_pos_store', value: '64' } },
						},
						sort: [{ name: 'asc' }],
					},
				})
			);

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

			query.where('meta_data').removeWhere('meta_data').exec();
			const spy = jest.fn();
			query.rxQuery$.subscribe(spy);
			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					mangoQuery: {
						selector: {},
						sort: [{ name: 'asc' }],
					},
				})
			);

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
			const spy = jest.fn();
			query.rxQuery$.subscribe(spy);
			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					mangoQuery: {
						selector: {
							attributes: { $elemMatch: { name: 'Color', option: 'Blue' } },
						},
						sort: [{ name: 'asc' }],
					},
				})
			);

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
			const spy = jest.fn();
			query.rxQuery$.subscribe(spy);
			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					mangoQuery: {
						selector: {
							categories: { $elemMatch: { id: 17 } },
						},
						sort: [{ name: 'asc' }],
					},
				})
			);

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
			const spy = jest.fn();
			query.rxQuery$.subscribe(spy);
			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					mangoQuery: {
						selector: {
							categories: { $elemMatch: { id: 17 } },
						},
						sort: [{ name: 'asc' }],
					},
				})
			);

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
		const spy = jest.fn();
		query.rxQuery$.subscribe(spy);
		expect(spy).toHaveBeenCalledWith(
			expect.objectContaining({
				mangoQuery: {
					selector: {
						attributes: { $elemMatch: { name: 'Color', option: 'Blue' } },
					},
					sort: [{ name: 'asc' }],
				},
			})
		);

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
	describe('special case for variations', () => {
		it('variationMatch adds an $or clause to find variations without the attribute (WooCommerce any attribute)', async () => {
			const query = new Query({
				collection: storeDatabase.collections.variations,
				initialParams: {
					selector: {
						id: { $in: ['1', '2', '3', '4', '5'] },
					},
					sort: [{ name: 'asc' }],
				},
			});

			query.variationMatch({ id: 1, name: 'Color', option: 'Green' }).exec();
			const spy1 = jest.fn();
			query.rxQuery$.subscribe(spy1);
			expect(spy1).toHaveBeenCalledWith(
				expect.objectContaining({
					mangoQuery: {
						selector: {
							id: { $in: ['1', '2', '3', '4', '5'] },
							$and: [
								{
									$or: [
										{
											attributes: {
												$not: {
													$elemMatch: {
														id: 1,
														name: 'Color',
													},
												},
											},
										},
										{
											attributes: {
												$elemMatch: {
													id: 1,
													name: 'Color',
													option: 'Green',
												},
											},
										},
									],
								},
							],
						},
						sort: [{ name: 'asc' }],
					},
				})
			);

			query.variationMatch({ id: 2, name: 'Size', option: 'Large' }).exec();
			query.variationMatch({ id: 2, name: 'Size', option: 'Medium' }).exec();

			const spy2 = jest.fn();
			query.rxQuery$.subscribe(spy2);
			expect(spy2).toHaveBeenCalledWith(
				expect.objectContaining({
					mangoQuery: {
						selector: {
							id: { $in: ['1', '2', '3', '4', '5'] },
							$and: [
								{
									$or: [
										{
											attributes: {
												$not: {
													$elemMatch: {
														id: 1,
														name: 'Color',
													},
												},
											},
										},
										{
											attributes: {
												$elemMatch: {
													id: 1,
													name: 'Color',
													option: 'Green',
												},
											},
										},
									],
								},
								{
									$or: [
										{
											attributes: {
												$not: {
													$elemMatch: {
														id: 2,
														name: 'Size',
													},
												},
											},
										},
										{
											attributes: {
												$elemMatch: {
													id: 2,
													name: 'Size',
													option: 'Medium',
												},
											},
										},
									],
								},
							],
						},
						sort: [{ name: 'asc' }],
					},
				})
			);
		});

		/**
		 *
		 */
		it('removeVariationMatch removes the $or clause', async () => {
			const query = new Query({
				collection: storeDatabase.collections.variations,
				initialParams: {
					sort: [{ name: 'asc' }],
					selector: {
						id: { $in: ['1', '2', '3', '4', '5'] },
						$and: [
							{
								$or: [
									{
										attributes: {
											$not: {
												$elemMatch: {
													id: 1,
													name: 'Color',
												},
											},
										},
									},
									{
										attributes: {
											$elemMatch: {
												id: 1,
												name: 'Color',
												option: 'Green',
											},
										},
									},
								],
							},
							{
								$or: [
									{
										attributes: {
											$not: {
												$elemMatch: {
													id: 0,
													name: 'Size',
												},
											},
										},
									},
									{
										attributes: {
											$elemMatch: {
												id: 0,
												name: 'Size',
												option: 'Large',
											},
										},
									},
								],
							},
						],
					},
				},
			});

			query.removeVariationMatch({ id: 0, name: 'Size' }).exec();

			const spy1 = jest.fn();
			query.rxQuery$.subscribe(spy1);
			expect(spy1).toHaveBeenCalledWith(
				expect.objectContaining({
					mangoQuery: {
						selector: {
							id: { $in: ['1', '2', '3', '4', '5'] },
							$and: [
								{
									$or: [
										{
											attributes: {
												$not: {
													$elemMatch: {
														id: 1,
														name: 'Color',
													},
												},
											},
										},
										{
											attributes: {
												$elemMatch: {
													id: 1,
													name: 'Color',
													option: 'Green',
												},
											},
										},
									],
								},
							],
						},
						sort: [{ name: 'asc' }],
					},
				})
			);

			query.variationMatch({ id: 0, name: 'Size', option: 'Medium' }).exec();
			query.removeVariationMatch({ id: 0, name: 'Size' }).exec();

			const spy2 = jest.fn();
			query.rxQuery$.subscribe(spy2);
			expect(spy2).toHaveBeenCalledWith(
				expect.objectContaining({
					mangoQuery: {
						selector: {
							id: { $in: ['1', '2', '3', '4', '5'] },
							$and: [
								{
									$or: [
										{
											attributes: {
												$not: {
													$elemMatch: {
														id: 1,
														name: 'Color',
													},
												},
											},
										},
										{
											attributes: {
												$elemMatch: {
													id: 1,
													name: 'Color',
													option: 'Green',
												},
											},
										},
									],
								},
							],
						},
						sort: [{ name: 'asc' }],
					},
				})
			);

			query.removeVariationMatch({ id: 1, name: 'Color' }).exec();

			const spy3 = jest.fn();
			query.rxQuery$.subscribe(spy3);
			expect(spy3).toHaveBeenCalledWith(
				expect.objectContaining({
					mangoQuery: {
						selector: {
							id: { $in: ['1', '2', '3', '4', '5'] },
						},
						sort: [{ name: 'asc' }],
					},
				})
			);
		});

		/**
		 *
		 */
		it('removeWhere removes all the attributes clause', async () => {
			const query = new Query({
				collection: storeDatabase.collections.variations,
				initialParams: {
					sort: [{ name: 'asc' }],
					selector: {
						id: { $in: ['1', '2', '3', '4', '5'] },
						$and: [
							{
								$or: [
									{
										attributes: {
											$not: {
												$elemMatch: {
													id: 1,
													name: 'Color',
												},
											},
										},
									},
									{
										attributes: {
											$elemMatch: {
												id: 1,
												name: 'Color',
												option: 'Green',
											},
										},
									},
								],
							},
							{
								$or: [
									{
										attributes: {
											$not: {
												$elemMatch: {
													id: 2,
													name: 'Size',
												},
											},
										},
									},
									{
										attributes: {
											$elemMatch: {
												id: 2,
												name: 'Size',
												option: 'Large',
											},
										},
									},
								],
							},
						],
					},
				},
			});

			query.removeWhere('attributes').exec();

			const spy = jest.fn();
			query.rxQuery$.subscribe(spy);
			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					mangoQuery: {
						selector: {
							id: { $in: ['1', '2', '3', '4', '5'] },
						},
						sort: [{ name: 'asc' }],
					},
				})
			);
		});

		it('getVariationMatches returns the correct variations', async () => {
			const query = new Query({
				collection: storeDatabase.collections.variations,
				initialParams: {
					sort: [{ name: 'asc' }],
					selector: {
						id: { $in: ['1', '2', '3', '4', '5'] },
						$and: [
							{
								$or: [
									{
										attributes: {
											$not: {
												$elemMatch: {
													id: 1,
													name: 'Color',
												},
											},
										},
									},
									{
										attributes: {
											$elemMatch: {
												id: 1,
												name: 'Color',
												option: 'Green',
											},
										},
									},
								],
							},
							{
								$or: [
									{
										attributes: {
											$not: {
												$elemMatch: {
													id: 2,
													name: 'Size',
												},
											},
										},
									},
									{
										attributes: {
											$elemMatch: {
												id: 2,
												name: 'Size',
												option: 'Large',
											},
										},
									},
								],
							},
						],
					},
				},
			});

			expect(query.getVariationMatches()).toEqual([
				{ id: 1, name: 'Color', option: 'Green' },
				{ id: 2, name: 'Size', option: 'Large' },
			]);
		});

		it('getVariationMatchOption returns the correct variation', async () => {
			const query = new Query({
				collection: storeDatabase.collections.variations,
				initialParams: {
					sort: [{ name: 'asc' }],
					selector: {
						id: { $in: ['1', '2', '3', '4', '5'] },
						$and: [
							{
								$or: [
									{
										attributes: {
											$not: {
												$elemMatch: {
													id: 1,
													name: 'Color',
												},
											},
										},
									},
									{
										attributes: {
											$elemMatch: {
												id: 1,
												name: 'Color',
												option: 'Green',
											},
										},
									},
								],
							},
							{
								$or: [
									{
										attributes: {
											$not: {
												$elemMatch: {
													id: 2,
													name: 'Size',
												},
											},
										},
									},
									{
										attributes: {
											$elemMatch: {
												id: 2,
												name: 'Size',
												option: 'Large',
											},
										},
									},
								],
							},
						],
					},
				},
			});

			expect(query.getVariationMatchOption({ id: 1, name: 'Color' })).toEqual('Green');
			expect(query.getVariationMatchOption({ id: 2, name: 'Size' })).toEqual('Large');
		});

		it('getVariationMatches returns stable references', () => {
			const query = new Query({
				id: 'test',
				collection: storeDatabase.collections.products,
				errorSubject: new Subject<Error>(),
			});

			query.variationMatch({ id: 1, name: 'Color', option: 'Green' });
			const firstSelector = query.getVariationMatches();

			let emittedSelector;
			query.rxQuery$.pipe(map(() => query.getVariationMatches())).subscribe((selector) => {
				emittedSelector = selector;
			});

			expect(firstSelector).toBe(emittedSelector);
		});
	});
});

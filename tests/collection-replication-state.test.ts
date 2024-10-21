import { Subject } from 'rxjs';

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
		jest.clearAllMocks();
	});

	afterEach(() => {
		storeDatabase.remove();
		syncDatabase.remove();
		httpClientMock.__resetMockResponses();
	});

	it('fetches and stores remote IDs in syncCollection', async () => {
		const data = [{ id: 1 }, { id: 2 }, { id: 3 }];
		httpClientMock.__setMockResponse('get', 'products', data, {
			params: { fields: ['id', 'date_modified_gmt'], posts_per_page: -1 },
		});

		const replicationState = new CollectionReplicationState({
			collection: storeDatabase.collections.products,
			syncCollection: syncDatabase.collections.products,
			httpClient: httpClientMock,
			endpoint: 'products',
			errorSubject: new Subject<Error>(),
		});

		replicationState.run();
		await replicationState.firstSync;

		expect(httpClientMock.get).toHaveBeenCalledWith(
			'products',
			expect.objectContaining({
				params: { fields: ['id', 'date_modified_gmt'], posts_per_page: -1 },
			})
		);

		const sync = await syncDatabase.collections.products.find().exec();

		expect(sync).toHaveLength(data.length);
		expect(sync.map((doc) => doc.id)).toEqual([1, 2, 3]);

		// sync will be all new because second http call is not set
		expect(sync.map((doc) => doc.status)).toEqual(['PULL_NEW', 'PULL_NEW', 'PULL_NEW']);
	});

	it('handles errors when response data is invalid', async () => {
		httpClientMock.__setMockResponse('get', 'products', null, {
			params: { fields: ['id', 'date_modified_gmt'], posts_per_page: -1 },
		});

		const replicationState = new CollectionReplicationState({
			collection: storeDatabase.collections.products,
			syncCollection: syncDatabase.collections.products,
			httpClient: httpClientMock,
			endpoint: 'products',
			errorSubject: new Subject<Error>(),
		});

		replicationState.start();
		await replicationState.firstSync;

		const log = await storeDatabase.collections.logs.find().exec();
		expect(log).toHaveLength(1);
		expect(log[0].message).toEqual('Invalid response fetching remote state');
	});

	it('will emit the number of remote IDs fetched', async () => {
		const data = [{ id: 1 }, { id: 2 }, { id: 3 }];
		httpClientMock.__setMockResponse('get', 'products', data, {
			params: { fields: ['id', 'date_modified_gmt'], posts_per_page: -1 },
		});

		const errorSubject = new Subject<Error>();
		const replicationState = new CollectionReplicationState({
			collection: storeDatabase.collections.products,
			syncCollection: syncDatabase.collections.products,
			httpClient: httpClientMock,
			endpoint: 'products',
			errorSubject,
		});

		const spy = jest.fn();
		replicationState.total$.subscribe(spy);

		replicationState.start();
		await replicationState.firstSync;

		expect(spy).toHaveBeenCalledWith(3);
	});

	it('will request the first page of records on the first sync', async () => {
		const data = [{ id: 1 }, { id: 2 }, { id: 3 }];
		httpClientMock.__setMockResponse('get', 'products', data, {
			params: { fields: ['id', 'date_modified_gmt'], posts_per_page: -1 },
		});
		httpClientMock.__setMockResponse('post', 'products', [{ id: 1 }, { id: 2 }], {
			data: { exclude: [] },
			params: { _method: 'GET' },
		});

		const replicationState = new CollectionReplicationState({
			collection: storeDatabase.collections.products,
			syncCollection: syncDatabase.collections.products,
			httpClient: httpClientMock,
			endpoint: 'products',
			errorSubject: new Subject<Error>(),
		});

		replicationState.start();
		await replicationState.firstSync;

		expect(httpClientMock.post).toHaveBeenCalledWith(
			'products',
			{ exclude: [] },
			expect.objectContaining({
				params: { _method: 'GET' },
			})
		);

		const sync = await syncDatabase.collections.products.find().exec();
		const records = await storeDatabase.collections.products.find().exec();

		expect(sync).toHaveLength(data.length);
		expect(records).toHaveLength(2);
		expect(sync.map((doc) => doc.id)).toEqual([1, 2, 3]);
		expect(sync.map((doc) => doc.status)).toEqual(['SYNCED', 'SYNCED', 'PULL_NEW']);
	});

	it('marks items SYNCED', async () => {
		const data = [
			{ id: 1, date_modified_gmt: '2024-10-17T17:54:59' },
			{ id: 2, date_modified_gmt: '2024-10-17T17:54:59' },
			{ id: 3, date_modified_gmt: '2024-10-17T17:54:59' },
		];
		httpClientMock.__setMockResponse('get', 'products', data, {
			params: { fields: ['id', 'date_modified_gmt'], posts_per_page: -1 },
		});
		httpClientMock.__setMockResponse(
			'post',
			'products',
			[
				{ id: 1, date_modified_gmt: '2024-10-17T17:54:59' },
				{ id: 2, date_modified_gmt: '2024-10-17T17:54:59' },
				{ id: 3, date_modified_gmt: '2024-10-17T17:54:59' },
			],
			{
				data: { exclude: [] },
				params: { _method: 'GET' },
			}
		);

		const replicationState = new CollectionReplicationState({
			collection: storeDatabase.collections.products,
			syncCollection: syncDatabase.collections.products,
			httpClient: httpClientMock,
			endpoint: 'products',
			errorSubject: new Subject<Error>(),
		});

		replicationState.start();
		await replicationState.firstSync;

		expect(httpClientMock.post).toHaveBeenCalledWith(
			'products',
			{ exclude: [] },
			expect.objectContaining({
				params: { _method: 'GET' },
			})
		);

		const sync = await syncDatabase.collections.products.find().exec();
		const records = await storeDatabase.collections.products.find().exec();

		expect(sync).toHaveLength(data.length);
		expect(records).toHaveLength(data.length);
		expect(sync.map((doc) => doc.status)).toEqual(['SYNCED', 'SYNCED', 'SYNCED']);
	});

	it('marks items as PULL_UPDATE', async () => {
		// populate the sync collection with some synced data
		syncDatabase.collections.products.bulkInsert([
			{
				id: 1,
				status: 'SYNCED',
				endpoint: 'products',
				date_modified_gmt: '2024-10-17T17:54:59',
			},
			{
				id: 2,
				status: 'SYNCED',
				endpoint: 'products',
				date_modified_gmt: '2024-10-17T17:54:59',
			},
			{
				id: 3,
				status: 'SYNCED',
				endpoint: 'products',
				date_modified_gmt: '2024-10-17T17:54:59',
			},
		]);

		// populate the store collection with some data
		storeDatabase.collections.products.bulkInsert([
			{
				id: 1,
				date_modified_gmt: '2024-10-17T17:54:59',
			},
			{
				id: 2,
				date_modified_gmt: '2024-10-17T17:54:59',
			},
			{
				id: 3,
				date_modified_gmt: '2024-10-17T17:54:59',
			},
		]);

		// set audit response data, 2 & 3 updated, 4 is new
		const data = [
			{ id: 1, date_modified_gmt: '2024-10-17T17:54:59' },
			{ id: 2, date_modified_gmt: '2024-10-18T17:54:59' },
			{ id: 3, date_modified_gmt: '2024-10-18T17:54:59' },
			{ id: 4, date_modified_gmt: '2024-10-17T17:54:59' },
		];
		httpClientMock.__setMockResponse('get', 'products', data, {
			params: { fields: ['id', 'date_modified_gmt'], posts_per_page: -1 },
		});

		const replicationState = new CollectionReplicationState({
			collection: storeDatabase.collections.products,
			syncCollection: syncDatabase.collections.products,
			httpClient: httpClientMock,
			endpoint: 'products',
			errorSubject: new Subject<Error>(),
		});

		replicationState.start();
		await replicationState.firstSync;

		const sync = await syncDatabase.collections.products.find().exec();

		expect(sync).toHaveLength(4);
		// 1 is synced, 2 & 3 are updated, 4 is new
		expect(sync.map((doc) => doc.status)).toEqual([
			'SYNCED',
			'PULL_UPDATE',
			'PULL_UPDATE',
			'PULL_NEW',
		]);
	});

	it('marks items as PULL_DELETE', async () => {
		// populate the sync collection with some synced data
		syncDatabase.collections.products.bulkInsert([
			{
				id: 1,
				status: 'SYNCED',
				endpoint: 'products',
			},
			{
				id: 2,
				status: 'SYNCED',
				endpoint: 'products',
			},
			{
				id: 3,
				status: 'SYNCED',
				endpoint: 'products',
			},
		]);

		// populate the store collection with some data
		storeDatabase.collections.products.bulkInsert([
			{
				id: 1,
			},
			{
				id: 2,
			},
			{
				id: 3,
			},
		]);

		// ids on server are missing 2 & 3, 4 is new
		const data = [{ id: 1 }, { id: 4 }];
		httpClientMock.__setMockResponse('get', 'products', data, {
			params: { fields: ['id', 'date_modified_gmt'], posts_per_page: -1 },
		});

		const replicationState = new CollectionReplicationState({
			collection: storeDatabase.collections.products,
			syncCollection: syncDatabase.collections.products,
			httpClient: httpClientMock,
			endpoint: 'products',
			errorSubject: new Subject<Error>(),
		});

		replicationState.start();
		await replicationState.firstSync;

		const sync = await syncDatabase.collections.products.find().exec();

		/**
		 * NOTE: the delete process runs, then the update process runs (and fails)
		 */
		expect(sync).toHaveLength(2);
		expect(sync.map((doc) => doc.status)).toEqual(['SYNCED', 'PULL_NEW']);

		const records = await storeDatabase.collections.products.find().exec();
		expect(records).toHaveLength(1);
		expect(records.map((doc) => doc.id)).toEqual([1]);
	});

	/**
	 * Variations are a bit more complex because there is a ReplicationState for:
	 * - full endpoint (products/variations) for searching
	 * - single endpoint (products/:id/variations) for fetching a single variable product's variations
	 */
	describe('variations', () => {});
});

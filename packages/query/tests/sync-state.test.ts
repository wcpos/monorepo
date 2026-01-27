import type { StoreDatabase, SyncDatabase } from '@wcpos/database';

import { SyncStateManager } from '../src/sync-state';
import { createStoreDatabase, createSyncDatabase } from './helpers/db';

describe('SyncStateManager', () => {
	let syncDB: SyncDatabase;
	let storeDB: StoreDatabase;
	let syncStateManager: SyncStateManager;

	beforeEach(async () => {
		syncDB = await createSyncDatabase();
		storeDB = await createStoreDatabase();
		syncStateManager = new SyncStateManager({
			syncCollection: syncDB.collections.products,
			collection: storeDB.collections.products,
			endpoint: 'products',
		});
	});

	afterEach(async () => {
		if (storeDB && !storeDB.destroyed) {
			await storeDB.remove();
		}
		if (syncDB && !syncDB.destroyed) {
			await syncDB.remove();
		}
		jest.clearAllMocks();
	});

	it('processes a full audit - first sync', async () => {
		const serverState = [
			{ id: 1, date_modified_gmt: '2024-10-17T17:54:59' },
			{ id: 2, date_modified_gmt: '2024-10-17T17:54:59' },
		];
		await syncStateManager.processFullAudit(serverState);

		const sync = await syncDB.collections.products.find().exec();
		expect(sync).toHaveLength(2);
		expect(sync.map((doc) => doc.status)).toEqual(['PULL_NEW', 'PULL_NEW']);
	});

	it('processes a full audit - detects deleted items', async () => {
		await storeDB.collections.products.bulkInsert([
			{ id: 1, date_modified_gmt: '2024-10-17T17:54:59' },
			{ id: 2, date_modified_gmt: '2024-10-17T17:54:59' },
		]);

		await syncDB.collections.products.bulkInsert([
			{ id: 1, endpoint: 'products', status: 'SYNCED' },
			{ id: 2, endpoint: 'products', status: 'SYNCED' },
		]);

		const serverState = [{ id: 1, date_modified_gmt: '2024-10-17T17:54:59' }];

		await syncStateManager.processFullAudit(serverState);

		const sync = await syncDB.collections.products.find().exec();
		expect(sync).toHaveLength(2);
		expect(sync.find((doc) => doc.id === 1)?.status).toBe('SYNCED');
		expect(sync.find((doc) => doc.id === 2)?.status).toBe('PULL_DELETE');
	});

	it('processes a full audit - detects modified items', async () => {
		await storeDB.collections.products.bulkInsert([
			{ id: 1, date_modified_gmt: '2024-10-17T17:54:59' },
			{ id: 2, date_modified_gmt: '2024-10-17T17:54:59' },
		]);

		await syncDB.collections.products.bulkInsert([
			{ id: 1, endpoint: 'products', status: 'SYNCED' },
			{ id: 2, endpoint: 'products', status: 'SYNCED' },
		]);

		const serverState = [
			{ id: 1, date_modified_gmt: '2024-10-17T17:54:59' },
			{ id: 2, date_modified_gmt: '2024-10-18T10:00:00' },
		];

		await syncStateManager.processFullAudit(serverState);

		const sync = await syncDB.collections.products.find().exec();
		expect(sync).toHaveLength(2);
		expect(sync.find((doc) => doc.id === 1)?.status).toBe('SYNCED');
		expect(sync.find((doc) => doc.id === 2)?.status).toBe('PULL_UPDATE');
	});

	it('processes a full audit - handles local changes', async () => {
		await storeDB.collections.products.bulkInsert([
			{ id: 1, date_modified_gmt: '2024-10-18T10:00:00' },
			{ id: 2, date_modified_gmt: '2024-10-17T17:54:59' },
		]);

		await syncDB.collections.products.bulkInsert([
			{ id: 1, endpoint: 'products', status: 'SYNCED' },
			{ id: 2, endpoint: 'products', status: 'SYNCED' },
		]);

		const serverState = [
			{ id: 1, date_modified_gmt: '2024-10-17T17:54:59' },
			{ id: 2, date_modified_gmt: '2024-10-17T17:54:59' },
		];

		await syncStateManager.processFullAudit(serverState);

		const sync = await syncDB.collections.products.find().exec();
		expect(sync).toHaveLength(2);
		expect(sync.find((doc) => doc.id === 1)?.status).toBe('PUSH_UPDATE');
		expect(sync.find((doc) => doc.id === 2)?.status).toBe('SYNCED');
	});

	it('processes a full audit - ignores records created locally', async () => {
		await storeDB.collections.products.bulkInsert([
			{ id: 1, date_modified_gmt: '2024-10-17T17:54:59' },
			{ date_modified_gmt: '2024-10-20T10:00:00' },
		]);

		const serverState = [{ id: 1, date_modified_gmt: '2024-10-17T17:54:59' }];

		await syncStateManager.processFullAudit(serverState);

		const sync = await syncDB.collections.products.find().exec();
		expect(sync).toHaveLength(1);
		expect(sync.find((doc) => doc.id === 1)?.status).toBe('SYNCED');

		const store = await storeDB.collections.products.find().exec();
		expect(store).toHaveLength(2);
	});

	it('processes modified after - detects modified items', async () => {
		await storeDB.collections.products.bulkInsert([
			{ id: 1, date_modified_gmt: '2024-10-17T17:54:59' },
			{ id: 2, date_modified_gmt: '2024-10-17T17:54:59' },
		]);

		await syncDB.collections.products.bulkInsert([
			{ id: 1, endpoint: 'products', status: 'SYNCED' },
			{ id: 2, endpoint: 'products', status: 'SYNCED' },
		]);

		const serverState = [{ id: 1, date_modified_gmt: '2024-10-18T10:00:00' }];

		await syncStateManager.processModifiedAfter(serverState);

		const sync = await syncDB.collections.products.find().exec();
		expect(sync).toHaveLength(2);
		expect(sync.find((doc) => doc.id === 1)?.status).toBe('PULL_UPDATE');
		expect(sync.find((doc) => doc.id === 2)?.status).toBe('SYNCED');
	});

	it('processes modified after - detects new items', async () => {
		await storeDB.collections.products.bulkInsert([
			{ id: 1, date_modified_gmt: '2024-10-17T17:54:59' },
		]);

		await syncDB.collections.products.bulkInsert([
			{ id: 1, endpoint: 'products', status: 'SYNCED' },
		]);

		const serverState = [{ id: 2, date_modified_gmt: '2024-10-18T10:00:00' }];

		await syncStateManager.processModifiedAfter(serverState);

		const sync = await syncDB.collections.products.find().exec();
		expect(sync).toHaveLength(2);
		expect(sync.find((doc) => doc.id === 1)?.status).toBe('SYNCED');
		expect(sync.find((doc) => doc.id === 2)?.status).toBe('PULL_NEW');
	});

	it('removes stale store records', async () => {
		await storeDB.collections.products.bulkInsert([
			{ id: 1, date_modified_gmt: '2024-10-17T17:54:59' },
			{ id: 2, date_modified_gmt: '2024-10-17T17:54:59' },
		]);

		await syncDB.collections.products.bulkInsert([
			{ id: 1, endpoint: 'products', status: 'PULL_DELETE' },
			{ id: 2, endpoint: 'products', status: 'SYNCED' },
			{ id: 3, endpoint: 'products', status: 'PULL_NEW' },
		]);

		await syncStateManager.removeStaleRecords();

		const sync = await syncDB.collections.products.find().exec();
		expect(sync).toHaveLength(2);
		expect(sync.map((doc) => doc.status)).toEqual(['SYNCED', 'PULL_NEW']);

		const store = await storeDB.collections.products.find().exec();
		expect(store).toHaveLength(1);
		expect(store.map((doc) => doc.id)).toEqual([2]);
	});

	it('removes stale sync records', async () => {
		await storeDB.collections.products.bulkInsert([
			{ id: 2, date_modified_gmt: '2024-10-17T17:54:59' },
		]);

		await syncDB.collections.products.bulkInsert([
			{ id: 1, endpoint: 'products', status: 'PULL_DELETE' },
			{ id: 2, endpoint: 'products', status: 'SYNCED' },
		]);

		await syncStateManager.removeStaleRecords();
	});
});

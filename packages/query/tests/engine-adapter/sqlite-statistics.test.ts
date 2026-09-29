/** @jest-environment node */
import { createRxDatabase } from 'rxdb';

import { engineSyncCollectionCreators } from '@wcpos/sync-engine/testing';

import { engineProduct } from '../../src/testing';
import { storages } from '../helpers/storages';

import type { RxStorageInstanceSQLite } from 'rxdb-premium/plugins/storage-sqlite';

it('PRAGMA optimize analyzes the seeded table and restores primary-key lookups', async () => {
	const database = await createRxDatabase({
		name: `statistics-${crypto.randomUUID()}`,
		storage: storages[1][1],
		multiInstance: false,
	});
	try {
		await database.addCollections({ products: engineSyncCollectionCreators().products });
		const inserted = await database.products.bulkInsert(
			Array.from({ length: 5000 }, (_, id) =>
				engineProduct({ uuid: `product-${id}`, id: id + 1, name: `Product ${id}` })
			)
		);
		expect(inserted.error).toEqual([]);
		const wrapped = database.products.storageInstance;
		const instance = (wrapped.originalStorageInstance ??
			wrapped) as unknown as RxStorageInstanceSQLite<Record<string, unknown>>;
		const connection = await instance.internals.databasePromise;
		await instance.internals.indexCreationPromise;
		const all = (query: string, params: string[] = []) =>
			instance.sqliteBasics.all(connection, {
				query,
				params,
				context: { method: 'statistics-test', data: {} },
			});
		const version = String((await all('SELECT sqlite_version() AS version'))[0].version)
			.split('.')
			.map(Number);
		expect(version[0] > 3 || (version[0] === 3 && version[1] >= 46)).toBe(true);
		const params = ['product-1', 'product-2500', 'product-4999'];
		const lookup = `SELECT data FROM "${instance.tableName}" WHERE id IN (?,?,?) AND deleted = 0`;
		expect(await all(lookup, params)).toHaveLength(3);
		await all('PRAGMA optimize');
		const statistics = await all('SELECT * FROM sqlite_stat1 WHERE tbl = ?', [instance.tableName]);
		expect(statistics.length).toBeGreaterThan(0);
		const plan = (await all(`EXPLAIN QUERY PLAN ${lookup}`, params)).map((row) =>
			String(row.detail)
		);
		expect(plan.join('\n')).toMatch(/USING PRIMARY KEY|USING INDEX sqlite_autoindex/);
		expect(plan.join('\n')).not.toContain('USING INDEX rxdb');
	} finally {
		await database.close();
	}
});

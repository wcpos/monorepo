import { normalizeMangoQuery } from 'rxdb';
import { prepareSQLiteQuery } from 'rxdb-premium/plugins/storage-sqlite';

import type { RxStorageInstanceSQLite } from 'rxdb-premium/plugins/storage-sqlite';
import type { MangoQuery, RxCollection } from 'rxdb';

export async function sqlitePlan(
	collection: RxCollection,
	query: MangoQuery<Record<string, unknown>>
) {
	const instance = (collection.storageInstance.originalStorageInstance ??
		collection.storageInstance) as unknown as RxStorageInstanceSQLite<Record<string, unknown>>;
	const db = await instance.internals.databasePromise;
	await instance.internals.indexCreationPromise;
	const prepared = prepareSQLiteQuery(
		instance,
		normalizeMangoQuery(instance.schema, {
			...query,
			selector: { ...query.selector, _deleted: false },
		})
	);
	expect(prepared.nonImplementedOperator).toBeUndefined();
	const rows = await instance.sqliteBasics.all(db, {
		...prepared.sqlQuery,
		query: `EXPLAIN QUERY PLAN SELECT data FROM "${instance.tableName}" ${prepared.sqlQuery.query}`,
	});
	return rows.map((row) => String(row.detail));
}

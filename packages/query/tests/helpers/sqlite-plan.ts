import { normalizeMangoQuery } from 'rxdb';
import * as sqlite from 'rxdb-premium/plugins/storage-sqlite';

import type {
	RxStorageInstanceSQLite,
	SQLitePreparedQuery,
} from 'rxdb-premium/plugins/storage-sqlite';
import type { FilledMangoQuery, MangoQuery, RxCollection } from 'rxdb';

// The database package's ambient fallback omits these installed Premium members.
export type SQLiteInstance = RxStorageInstanceSQLite<Record<string, unknown>> & {
	internals: { indexCreationPromise: Promise<void> };
};
const { prepareSQLiteQuery } = sqlite as unknown as {
	prepareSQLiteQuery(
		instance: SQLiteInstance,
		query: FilledMangoQuery<Record<string, unknown>>
	): SQLitePreparedQuery<Record<string, unknown>>;
};

export async function sqlitePlan(
	collection: RxCollection,
	query: MangoQuery<Record<string, unknown>>
) {
	const instance = (collection.storageInstance.originalStorageInstance ??
		collection.storageInstance) as unknown as SQLiteInstance;
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
	return rows.map((row) => String((row as unknown as { detail: string }).detail));
}

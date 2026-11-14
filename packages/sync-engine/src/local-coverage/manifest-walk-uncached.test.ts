// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { addRxPlugin, createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';

import { engineCollectionCreators } from '../collections/engine-collections';
import { memoryEngineStorage } from '../testing';
import { existenceManifestDocument } from './existence-manifest-schema';
import {
	type ManifestCollection,
	occupiedManifestBucketIndexes,
	readManifestRange,
} from './rx-existence-manifest-repository';

/**
 * #2502: the reconcile audit walks the existence manifest in keyset pages and then reads every
 * occupied bucket. Each page and each bucket is a distinct query string; left in RxDB's query
 * cache, together they pin the whole manifest, and under ~100 cached queries eviction never runs.
 */

addRxPlugin(RxDBMigrationSchemaPlugin);

let dbSeq = 0;
const openDatabases: RxDatabase[] = [];

async function manifestCollection(): Promise<RxCollection> {
	const db = await createRxDatabase({
		name: `manifest-walk-uncached-${(dbSeq += 1)}`,
		storage: memoryEngineStorage(),
		multiInstance: false,
	});
	openDatabases.push(db);
	await db.addCollections({
		existenceManifest: engineCollectionCreators().existenceManifest,
	} as never);
	const collection = db.collections.existenceManifest;
	await collection.bulkInsert(
		[1, 2, 1500, 2500, 7000].map((wooId) =>
			existenceManifestDocument({ wooId, objectType: 'product', digest: `d${wooId}` })
		)
	);
	return collection;
}

/** Cached queries over the manifest's wooId index: the walk's pages and the bucket ranges. */
function cachedWooIdFinds(collection: RxCollection): string[] {
	return [...collection._queryCache._map.values()]
		.filter((query) => query.op === 'find' && 'wooId' in (query.mangoQuery.selector ?? {}))
		.map((query) => query.toString());
}

afterEach(async () => {
	await Promise.all(openDatabases.splice(0).map((db) => db.close()));
});

describe('existence-manifest walks on a real database (#2502)', () => {
	it('the paged occupied-bucket walk leaves no page query in the query cache', async () => {
		const collection = await manifestCollection();

		// Page size 2 over 5 rows: three distinct page queries ($gt -1, $gt 2, $gt 2500).
		const buckets = await occupiedManifestBucketIndexes(
			collection as unknown as ManifestCollection,
			1000,
			2
		);

		expect(cachedWooIdFinds(collection)).toEqual([]);
		expect([...buckets].sort((a, b) => a - b)).toEqual([0, 1, 2, 7]);
	});

	it('a per-bucket range read leaves no query in the query cache', async () => {
		const collection = await manifestCollection();

		const rows = await readManifestRange(collection as unknown as ManifestCollection, 1000, 3000);

		expect(cachedWooIdFinds(collection)).toEqual([]);
		expect(rows.map((row) => row.wooId).sort((a, b) => a - b)).toEqual([1500, 2500]);
	});
});

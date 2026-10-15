// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addRxPlugin, createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';

import { customerDocumentId } from '@wcpos/sync-core';

import { engineCollectionCreators } from '../collections/engine-collections';
import { memoryEngineStorage, remoteId } from '../testing';
import { existenceManifestDocument } from './existence-manifest-schema';
import { type ExistenceManifestPrimeDatabase, primeExistenceManifestCustomers } from './manifest';

/**
 * #2502: the customer boot prime reads the whole customers and existenceManifestCustomers
 * collections. Those reads must not stay in RxDB's query cache, where each would pin every
 * document of its collection for as long as the pass keeps re-running it.
 */

addRxPlugin(RxDBMigrationSchemaPlugin);

const PRIME_COLLECTIONS = ['customers', 'existenceManifestCustomers'] as const;

let dbSeq = 0;
const openDatabases: RxDatabase[] = [];

async function primeDatabase(): Promise<RxDatabase> {
	const db = await createRxDatabase({
		name: `manifest-prime-uncached-${(dbSeq += 1)}`,
		storage: memoryEngineStorage(),
		multiInstance: false,
	});
	openDatabases.push(db);
	const creators = engineCollectionCreators();
	await db.addCollections(
		Object.fromEntries(PRIME_COLLECTIONS.map((name) => [name, creators[name]])) as never
	);
	return db;
}

function customer(wooId: number) {
	return {
		uuid: customerDocumentId(remoteId(wooId)),
		remoteId: String(wooId),
		payload: { id: wooId, date_modified_gmt: '2026-07-01T10:00:00' },
		sync: { revision: `r${wooId}`, partial: false, source: 'woo-rest' },
		local: { dirty: false, pendingMutationIds: [] },
	};
}

/** Cached queries that read the whole collection: `find` with an empty selector. */
function cachedFullFinds(collection: RxCollection): string[] {
	return [...collection._queryCache._map.values()]
		.filter(
			(query) => query.op === 'find' && Object.keys(query.mangoQuery.selector ?? {}).length === 0
		)
		.map((query) => query.toString());
}

afterEach(async () => {
	await Promise.all(openDatabases.splice(0).map((db) => db.close()));
});

describe('primeExistenceManifestCustomers on a real database (#2502)', () => {
	it('primes the manifest and leaves no full-collection read in either query cache', async () => {
		const db = await primeDatabase();
		await db.collections.customers.bulkInsert([customer(1), customer(2), customer(3)]);
		// One resident with a row already, one stranded row (99) with no resident: 2 rows ≠ 3 residents.
		await db.collections.existenceManifestCustomers.bulkInsert([
			existenceManifestDocument({ wooId: 3, objectType: 'customer', digest: 'd3' }),
			existenceManifestDocument({ wooId: 99, objectType: 'customer', digest: 'd99' }),
		]);
		const fetcher = vi.fn(async (url: string) => {
			const ids = new URL(url).searchParams.get('include')!.split(',').map(Number);
			return {
				ok: true,
				status: 200,
				json: async () => ({ digests: ids.map((id) => ({ id, digest: `d${id}` })) }),
			};
		});

		const primed = await primeExistenceManifestCustomers(
			db.collections as unknown as ExistenceManifestPrimeDatabase,
			{ fetcher, syncBaseUrl: 'https://store.test/wcpos/v1/sync' }
		);

		// Checked before any read of our own, which would cache a full find of its own.
		for (const name of PRIME_COLLECTIONS) {
			expect(cachedFullFinds(db.collections[name]), name).toEqual([]);
		}

		// The pass did its normal work: the stranded row went, the two missing rows came in.
		expect(primed).toBe(2);
		expect(fetcher).toHaveBeenCalledTimes(1);
		const manifestWooIds = (await db.collections.existenceManifestCustomers.find().exec())
			.map((doc) => (doc as unknown as { wooId: number }).wooId)
			.sort((a, b) => a - b);
		expect(manifestWooIds).toEqual([1, 2, 3]);
	});
});

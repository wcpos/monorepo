// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import { existenceManifestDocument, existenceManifestSchema } from '@wcpos/sync-engine/testing';

import {
	readManifestRange,
	removeManifestByWooIds,
	upsertManifestRows,
} from './rx-existence-manifest-repository';

addRxPlugin(RxDBMigrationSchemaPlugin);

let dbCounter = 0;
async function manifestCollection() {
	dbCounter += 1;
	const db = await createRxDatabase({
		name: `manifesttest${dbCounter}`,
		storage: getRxStorageMemory(),
	});
	await db.addCollections({ existenceManifest: { schema: existenceManifestSchema } });
	return db.existenceManifest as unknown as Parameters<typeof upsertManifestRows>[0];
}

describe('existenceManifestDocument', () => {
	it('keys by String(wooId) and carries the numeric wooId + string digest', () => {
		expect(
			existenceManifestDocument({ wooId: 42, objectType: 'product', digest: '9223372036854775810' })
		).toEqual({
			id: '42',
			wooId: 42,
			objectType: 'product',
			digest: '9223372036854775810', // > JS safe int — kept as a string
		});
	});
});

describe('existence manifest repository', () => {
	it('range-reads by wooId (the bucketing query) and upserts idempotently', async () => {
		const c = await manifestCollection();
		await upsertManifestRows(c, [
			existenceManifestDocument({ wooId: 5, objectType: 'product', digest: 'a' }),
			existenceManifestDocument({ wooId: 12, objectType: 'variation', digest: 'b' }),
			existenceManifestDocument({ wooId: 20, objectType: 'product', digest: 'c' }),
		]);

		// Bucket [0, 15): wooId 5 + 12 (numeric range on the indexed field — NOT lexical).
		const bucket = await readManifestRange(c, 0, 15);
		expect(bucket.map((r) => r.wooId).sort((a, b) => a - b)).toEqual([5, 12]);

		// Upsert is idempotent by String(wooId) and updates the digest in place.
		await upsertManifestRows(c, [
			existenceManifestDocument({ wooId: 5, objectType: 'product', digest: 'a2' }),
		]);
		const reread = await readManifestRange(c, 5, 6);
		expect(reread).toHaveLength(1);
		expect(reread[0].digest).toBe('a2');
	});

	it('range excludes the upper bound (half-open) so adjacent buckets never double-count', async () => {
		const c = await manifestCollection();
		await upsertManifestRows(c, [
			existenceManifestDocument({ wooId: 9, objectType: 'product', digest: 'x' }),
			existenceManifestDocument({ wooId: 10, objectType: 'product', digest: 'y' }),
		]);
		expect((await readManifestRange(c, 0, 10)).map((r) => r.wooId)).toEqual([9]); // 10 is in the NEXT bucket
		expect((await readManifestRange(c, 10, 20)).map((r) => r.wooId)).toEqual([10]);
	});

	it('removes rows by wooId', async () => {
		const c = await manifestCollection();
		await upsertManifestRows(c, [
			existenceManifestDocument({ wooId: 5, objectType: 'product', digest: 'a' }),
			existenceManifestDocument({ wooId: 6, objectType: 'product', digest: 'b' }),
		]);
		await removeManifestByWooIds(c, [5]);
		expect((await readManifestRange(c, 0, 100)).map((r) => r.wooId)).toEqual([6]);
	});

	it('no-ops on empty batches', async () => {
		const c = await manifestCollection();
		await upsertManifestRows(c, []);
		await removeManifestByWooIds(c, []);
		expect(await readManifestRange(c, 0, 100)).toEqual([]);
	});
});

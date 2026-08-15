// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import { existenceManifestDocument, existenceManifestSchema } from '@wcpos/sync-engine/testing';

import {
	occupiedManifestBucketIndexes,
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

describe('occupiedManifestBucketIndexes (chunked page walk, #949)', () => {
	const rowsUpTo = (max: number) =>
		Array.from({ length: max }, (_unused, index) =>
			existenceManifestDocument({
				wooId: index + 1,
				objectType: 'product',
				digest: String(index + 1),
			})
		);

	it('returns no buckets for an empty manifest', async () => {
		expect(await occupiedManifestBucketIndexes(await manifestCollection(), 100)).toEqual([]);
	});

	it('finds occupied buckets across MANY pages, not just the first', async () => {
		const c = await manifestCollection();
		await upsertManifestRows(c, rowsUpTo(250));
		// A page size well below the row count forces the multi-page path — a single-page walk
		// would report only bucket 0 here.
		expect(await occupiedManifestBucketIndexes(c, 100, 10)).toEqual([0, 1, 2]);
	});

	it('agrees with the single-page walk regardless of page size', async () => {
		const c = await manifestCollection();
		await upsertManifestRows(c, rowsUpTo(97));
		for (const pageSize of [1, 2, 96, 97, 98, 1_000]) {
			expect(await occupiedManifestBucketIndexes(c, 100, pageSize)).toEqual([0]);
		}
	});

	it('returns only occupied indexes for sparse high IDs', async () => {
		const c = await manifestCollection();
		await upsertManifestRows(c, [
			existenceManifestDocument({ wooId: 3, objectType: 'product', digest: 'low' }),
			existenceManifestDocument({ wooId: 10_003, objectType: 'product', digest: 'high' }),
		]);
		expect(await occupiedManifestBucketIndexes(c, 1000)).toEqual([0, 10]);
	});

	it('keyset-pages by VALUE, so rows deleted mid-walk cannot make it skip live rows', async () => {
		const c = await manifestCollection();
		await upsertManifestRows(c, rowsUpTo(40));
		// Emulate a prune landing between pages: an offset-based walk would shift and miss the
		// tail; a value cursor just steps over the gap.
		await removeManifestByWooIds(c, [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
		expect(await occupiedManifestBucketIndexes(c, 10, 10)).toEqual([0, 1, 2, 3, 4]);
	});

	it('rejects a bucket or page size that would never advance', async () => {
		const c = await manifestCollection();
		for (const bucketSize of [0, -5, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
			await expect(occupiedManifestBucketIndexes(c, bucketSize)).rejects.toThrow(RangeError);
		}
		for (const pageSize of [0, -5, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
			await expect(occupiedManifestBucketIndexes(c, 100, pageSize)).rejects.toThrow(RangeError);
		}
	});

	it('THROWS rather than reporting truncated buckets when the page cap is exhausted', async () => {
		// Silently returning partial buckets would not self-heal: every pass restarts from the same
		// cursor, so the audit would hide every id above the cap forever.
		const c = await manifestCollection();
		await upsertManifestRows(c, rowsUpTo(10));
		await expect(occupiedManifestBucketIndexes(c, 10, 2, 3)).rejects.toThrow(
			/refusing to report truncated occupied buckets/
		);
	});

	it('does not throw when the last allowed page is the one that exhausts the index', async () => {
		const c = await manifestCollection();
		await upsertManifestRows(c, rowsUpTo(6));
		// 6 rows at 2/page = 3 full pages, then a 4th empty page proves exhaustion.
		expect(await occupiedManifestBucketIndexes(c, 10, 2, 4)).toEqual([0]);
	});
});

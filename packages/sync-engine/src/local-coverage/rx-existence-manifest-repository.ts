import { assertBulkSuccess } from '@wcpos/sync-core';

import { yieldToEventLoop } from '../event-loop-yield';

import type { ExistenceManifestDocument } from './existence-manifest-schema';

/**
 * Read/write seam for the Leg-3 existence-reconcile manifest (ADR 0014). Structural collection type
 * keeps RxDB's generics out of the engine. The reconcile (increment 5) reads a wooId RANGE per bucket
 * — index-backed on `wooId` — hashes the tiny rows, and compares to the server's bucket; population
 * (increment 4b) upserts rows as records are pulled; the prune arm removes rows for pruned ids.
 */
export type ManifestCollection = {
	bulkUpsert(docs: ExistenceManifestDocument[]): Promise<unknown>;
	bulkRemove(ids: string[]): Promise<unknown>;
	find(query?: unknown): { exec(): Promise<{ toJSON(): ExistenceManifestDocument }[]> };
};

/** Upsert manifest rows (idempotent by primary key = String(wooId)). No-op on an empty batch. */
export async function upsertManifestRows(
	collection: ManifestCollection,
	rows: readonly ExistenceManifestDocument[]
): Promise<void> {
	if (rows.length === 0) {
		return;
	}
	assertBulkSuccess(
		await collection.bulkUpsert([...rows]),
		'rx-existence-manifest-repository upsert'
	);
}

/**
 * Manifest rows whose `wooId` is in the half-open range `[start, end)` — the per-bucket read the
 * reconcile uses. Index-backed on `wooId`, so it never scans the whole manifest.
 */
export async function readManifestRange(
	collection: ManifestCollection,
	start: number,
	end: number
): Promise<ExistenceManifestDocument[]> {
	const docs = await collection.find({ selector: { wooId: { $gte: start, $lt: end } } }).exec();
	return docs.map((doc) => doc.toJSON());
}

/**
 * Rows per page of the max-wooId scan (#949 tranche 2).
 *
 * Measured 2026-08-06, memory storage, 50k manifest rows: 2,000 rows/page costs ~3.3 ms per page
 * (25 pages, 83 ms total) against 63 ms for the single unbroken `find().exec()` it replaces —
 * a ~30% cost on this one phase, ~8% of the whole audit, in exchange for a block a cashier can no
 * longer feel. Larger pages did not measure faster (5k: 76 ms, 10k: 80 ms) but do coarsen the
 * blocks, so 2,000 is the tuned value rather than an arbitrary one.
 */
export const MANIFEST_SCAN_PAGE_SIZE = 2_000;

/**
 * Hard stop for the page walk, guarding against the one shape that could otherwise run forever:
 * a writer inserting rows with ever-higher wooIds faster than the walk consumes them.
 *
 * Hitting it THROWS rather than returning the partial maximum. Truncating silently would not
 * self-heal the way a stale-low read does: every pass restarts from the same cursor, so it would
 * return the same false maximum forever and permanently hide every id above it from the audit —
 * a convergence backstop that has quietly stopped covering the tail of the catalog. At the
 * default page size this is 10M manifest rows, an order of magnitude beyond any real store, so
 * reaching it means something is wrong and the reconcile should say so.
 */
const MAX_SCAN_PAGES = 5_000;

/**
 * The highest `wooId` in the manifest, or 0 when it is empty — the reconcile derives its bucket
 * span from this.
 *
 * Walks the wooId index in ascending KEYSET pages, yielding to the event loop between them. Two
 * reasons it is a keyset walk and not `skip`/`limit`:
 *
 *  - the cursor is a VALUE, so a row deleted mid-walk shifts nothing; an offset walk would skip a
 *    live row for every concurrent delete;
 *  - `{wooId: {$gt: cursor}}` sorted ascending is fully index-backed on this schema (RxDB reports
 *    `sortSatisfiedByIndex` and `selectorSatisfiedByIndex` both true), so paging costs an index
 *    seek rather than a re-sort.
 *
 * Concurrency: rows written after the walk passes their id are not observed, so the result can be
 * stale-LOW by one audit. That is the same staleness the single-query version had (it, too, was a
 * snapshot taken before the walk began) and it is benign — the next pass sees them.
 */
export async function maxManifestWooId(
	collection: ManifestCollection,
	pageSize: number = MANIFEST_SCAN_PAGE_SIZE,
	maxPages: number = MAX_SCAN_PAGES
): Promise<number> {
	if (!Number.isSafeInteger(pageSize) || pageSize <= 0) {
		throw new RangeError('pageSize must be a positive integer');
	}
	let cursor = -1;
	let max = 0;
	for (let page = 0; page < maxPages; page += 1) {
		if (page > 0) {
			await yieldToEventLoop();
		}
		const rows = await collection
			.find({ selector: { wooId: { $gt: cursor } }, sort: [{ wooId: 'asc' }], limit: pageSize })
			.exec();
		for (const doc of rows) {
			const wooId = Number(doc.toJSON().wooId) || 0;
			if (wooId > max) {
				max = wooId;
			}
			if (wooId > cursor) {
				cursor = wooId;
			}
		}
		// A short (or empty) page means the index is exhausted — this is the only clean exit.
		if (rows.length < pageSize) {
			return max;
		}
	}
	throw new Error(
		`existence manifest scan exceeded ${maxPages} pages of ${pageSize} rows; refusing to report a truncated max wooId`
	);
}

/** Remove manifest rows for the given numeric Woo ids (their primary keys are `String(wooId)`). */
export async function removeManifestByWooIds(
	collection: ManifestCollection,
	wooIds: readonly number[]
): Promise<void> {
	if (wooIds.length === 0) {
		return;
	}
	assertBulkSuccess(
		await collection.bulkRemove(wooIds.map((id) => String(id))),
		'rx-existence-manifest-repository remove'
	);
}

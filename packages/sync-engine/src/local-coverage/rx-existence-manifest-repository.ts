import { assertBulkSuccess } from '@wcpos/sync-core';

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

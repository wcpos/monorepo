import { hasPendingLocalWork } from '../write-path/local-work-guard';

import type { RxDatabase } from 'rxdb';

/**
 * One-shot scope-open repair for stores polluted while the products search lane
 * still sent `sku=`. Woo answered that filter from both post types, so matching
 * variations were persisted into the PRODUCTS collection; the lane no longer
 * sends it. Such a document makes every barcode scan of that code falsely
 * ambiguous: the scan reads products AND variations, and the one record matches
 * in both collections.
 *
 * Removes products-collection documents whose promoted `type` column says
 * `variation`, plus any existence-manifest row still claiming `objectType:
 * 'product'` for a removed document's wooId — that row was authored by the same
 * polluted persist and describes a product the server does not have. A manifest
 * row already re-labelled `variation` (by a later legitimate variations pull) is
 * left alone: the manifest is keyed by wooId, and wp_posts ids are globally
 * unique, so that row now correctly describes the real variation.
 *
 * Documents with pending local work are skipped, mirroring the reconcile prune's
 * guard — deleting an unpushed edit loses data, and a dirty misfiled document is
 * a bug report, not a cleanup target.
 */
export async function purgeMisfiledVariationProducts(db: RxDatabase): Promise<number> {
	const misfiled = await db.collections.products
		.find({ selector: { type: 'variation' } as never })
		.exec();
	if (misfiled.length === 0) return 0;

	const removable: (typeof misfiled)[number][] = [];
	const removableWooIds: number[] = [];
	for (const doc of misfiled) {
		const row = doc.toJSON() as { remoteId?: string | null };
		if (hasPendingLocalWork(row)) continue;
		removable.push(doc);
		const wooId = Number(row.remoteId);
		if (Number.isSafeInteger(wooId) && wooId > 0) removableWooIds.push(wooId);
	}
	if (removable.length === 0) return 0;

	if (removableWooIds.length > 0) {
		const manifestRows = await db.collections.existenceManifest
			.find({
				selector: {
					remoteId: { $in: removableWooIds.map(String) },
					objectType: 'product',
				} as never,
			})
			.exec();
		if (manifestRows.length > 0) {
			await Promise.all(manifestRows.map((row) => row.incrementalRemove()));
		}
	}

	await Promise.all(removable.map((doc) => doc.incrementalRemove()));

	return removable.length;
}

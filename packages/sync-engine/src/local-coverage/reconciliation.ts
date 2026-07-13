import { type ReconcileSummary, runExistenceReconcile } from './reconcile-existence-pass';

import type { ExistenceManifestDocument } from './existence-manifest-schema';
import type { ReconcileAction, ServerDigestEntry } from '../reconcile-bucket-plan';

/**
 * Leg-3 existence reconcile — the impure adapter (ADR 0014 increment 5c-wire) that supplies the pure
 * bucket-walk (runExistenceReconcile) with real client/server I/O, closing the program's founding gap.
 * The pure orchestration stays untouched; this module owns the storage/transport/dirty details and is
 * itself driven by injected deps so it remains unit-testable end-to-end with fakes.
 */

/** Bucket indices [0..floor(maxWooId/bucketSize)] covering every id in [1, maxWooId]. Empty if no ids. */
export function bucketIndexesForMaxWooId(maxWooId: number, bucketSize: number): number[] {
	if (maxWooId <= 0 || bucketSize <= 0) {
		return [];
	}
	const count = Math.floor(maxWooId / bucketSize) + 1;
	return Array.from({ length: count }, (_unused, index) => index);
}

/** Split reconcile actions into the product and variation wooId lists (products and variations share the id space). */
export function partitionActionsByLane(actions: readonly ReconcileAction[]): {
	productWooIds: number[];
	variationWooIds: number[];
} {
	const productWooIds: number[] = [];
	const variationWooIds: number[] = [];
	for (const action of actions) {
		if (action.objectType === 'variation') {
			variationWooIds.push(action.wooId);
		} else {
			productWooIds.push(action.wooId);
		}
	}
	return { productWooIds, variationWooIds };
}

/**
 * The set of wooIds with pending local writes, for the dirty guard. The mutation queue is keyed by the
 * record's uuid (recordId), NOT its wooId, so each products/variations mutation is resolved recordId→wooId
 * via the injected lookup (a point-read per pending mutation — the queue is small). Non-product/variation
 * mutations (orders, etc.) are ignored.
 */
export async function resolveDirtyWooIds(
	mutations: readonly { recordId: string; collectionName: string }[],
	lookupWooId: (recordId: string, collectionName: string) => Promise<number | null>
): Promise<Set<number>> {
	const dirty = new Set<number>();
	for (const mutation of mutations) {
		if (mutation.collectionName !== 'products' && mutation.collectionName !== 'variations') {
			continue;
		}
		const wooId = await lookupWooId(mutation.recordId, mutation.collectionName);
		if (wooId !== null && wooId > 0) {
			dirty.add(wooId);
		}
	}
	return dirty;
}

/**
 * Run one existence-reconcile audit. Derives the bucket span from the max local wooId, marks dirty
 * records from the pending-mutation queue, and drives the pure walk — pruning stale records (reusing the
 * lane delete handlers, which already remove the doc AND its manifest row) and (re)pulling missing/changed.
 */
export async function reconcileExistence(deps: {
	bucketSize: number;
	maxWooId: () => Promise<number>;
	readManifestRange: (lo: number, hi: number) => Promise<ExistenceManifestDocument[]>;
	dirtyWooIds: () => Promise<ReadonlySet<number>>;
	fetchServerBucket: (bucket: number, bucketSize: number) => Promise<ServerDigestEntry[]>;
	/** Removes the product docs AND their manifest rows (the tick's deleteProducts handler). */
	deleteProducts: (wooIds: number[]) => Promise<void>;
	deleteVariations: (wooIds: number[]) => Promise<void>;
	pullProducts: (wooIds: number[]) => Promise<void>;
	pullVariations: (wooIds: number[]) => Promise<void>;
	isAborted?: () => boolean;
}): Promise<ReconcileSummary> {
	const emptySummary: ReconcileSummary = {
		buckets: 0,
		pruned: 0,
		pulled: 0,
		repulled: 0,
		skippedDirty: 0,
	};
	const maxWooId = await deps.maxWooId();
	const buckets = bucketIndexesForMaxWooId(maxWooId, deps.bucketSize);
	if (buckets.length === 0) {
		return emptySummary;
	}
	const dirty = await deps.dirtyWooIds();

	return runExistenceReconcile({
		buckets,
		bucketSize: deps.bucketSize,
		readLocalBucket: async (lo, hi) =>
			(await deps.readManifestRange(lo, hi)).map((row) => ({
				wooId: row.wooId,
				digest: row.digest,
				objectType: row.objectType,
				dirty: dirty.has(row.wooId),
			})),
		fetchServerBucket: deps.fetchServerBucket,
		executePrune: async (actions) => {
			const { productWooIds, variationWooIds } = partitionActionsByLane(actions);
			if (productWooIds.length > 0) {
				await deps.deleteProducts(productWooIds);
			}
			if (variationWooIds.length > 0) {
				await deps.deleteVariations(variationWooIds);
			}
		},
		enqueuePull: async (actions) => {
			const { productWooIds, variationWooIds } = partitionActionsByLane(actions);
			if (productWooIds.length > 0) {
				await deps.pullProducts(productWooIds);
			}
			if (variationWooIds.length > 0) {
				await deps.pullVariations(variationWooIds);
			}
		},
		isAborted: deps.isAborted,
	});
}

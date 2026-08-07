import { assertBulkSuccess } from '@wcpos/sync-core';

import { forEachYielding } from '../event-loop-yield';
import { EngineOrderRepository } from '../write-path/engine-order-repository';
import { hasPendingLocalWork } from '../write-path/local-work-guard';
import {
	maxManifestWooId,
	readManifestRange,
	removeManifestByWooIds,
} from './rx-existence-manifest-repository';

import type { LocalCoverageReconcilePort, ReconcileRequest } from './local-coverage';
import type { RxDatabase } from 'rxdb';

/**
 * Documents per yield in the dirty-guard catalog scan (#949 tranche 2).
 *
 * Measured 2026-08-06, memory storage: the `toJSON()` walk runs 2.4-5.9 us/document depending on
 * JIT warmth, so 1,000 documents is a 2-6 ms span — inside a 60fps frame budget with room to
 * spare, while keeping the yield count (and its per-hop overhead) proportionate.
 */
const DIRTY_SCAN_CHUNK_SIZE = 1_000;

type ReconcilePortDeps = {
	database: RxDatabase;
	fetcher: (url: string, init?: RequestInit) => Promise<Response>;
	ports: { site: { syncBaseUrl: string } };
};

export function createReconcilePorts(deps: ReconcilePortDeps): LocalCoverageReconcilePort[] {
	const { database: db, fetcher, ports } = deps;
	const reconcilePort = (
		manifestName: 'existenceManifest' | 'existenceManifestCustomers' | 'existenceManifestOrders',
		collection: 'products' | 'customers' | 'orders'
	) => {
		const manifest = db.collections[manifestName] as never;
		const collectionParam =
			collection === 'products' ? '&status=publish' : `&collection=${collection}`;
		const sourceCollections =
			collection === 'products' ? (['products', 'variations'] as const) : ([collection] as const);
		const dirtyWooIds = async (): Promise<Set<number>> => {
			const ids = new Set<number>();
			for (const name of sourceCollections) {
				const docs = await db.collections[name].find().exec();
				// Chunked so the per-document `toJSON()` cost — the main-thread half of this scan,
				// measured at ~24 ms per 50k products — cannot hold the loop in one span (#949).
				await forEachYielding(docs, DIRTY_SCAN_CHUNK_SIZE, (doc) => {
					const row = doc.toJSON() as {
						wooProductId?: number;
						wooId?: number;
						wooCustomerId?: number;
						wooOrderId?: number;
						local?: { dirty?: boolean; pendingMutationIds?: unknown[] };
					};
					if (!row.local?.dirty && !row.local?.pendingMutationIds?.length) return;
					const wooId = row.wooProductId ?? row.wooId ?? row.wooCustomerId ?? row.wooOrderId;
					if (typeof wooId === 'number') ids.add(wooId);
				});
			}
			return ids;
		};
		const removeTargeted = async (
			name: 'products' | 'variations' | 'customers',
			field: string,
			wooIds: number[]
		) => {
			const docs = await db.collections[name]
				.find({ selector: { [field]: { $in: wooIds } } as never })
				.exec();
			const protectedWooIds = new Set<number>();
			const removable = docs.filter((doc) => {
				const row = doc.toJSON() as Record<string, unknown>;
				if (!hasPendingLocalWork(row)) return true;
				const wooId = row[field];
				if (typeof wooId === 'number') protectedWooIds.add(wooId);
				return false;
			});
			if (removable.length > 0)
				assertBulkSuccess(
					await db.collections[name].bulkRemove(removable.map((doc) => doc.primary)),
					'create-rxdb-sync-engine remove'
				);
			await removeManifestByWooIds(
				manifest,
				wooIds.filter((wooId) => !protectedWooIds.has(wooId))
			);
		};
		return {
			bucketSize: 1000,
			maxWooId: () => maxManifestWooId(manifest),
			readManifestRange: (lo: number, hi: number) => readManifestRange(manifest, lo, hi),
			dirtyWooIds,
			fetchServerBucket: async (bucket: number, bucketSize: number, request?: ReconcileRequest) => {
				const response = await (request?.fetcher ?? fetcher)(
					`${ports.site.syncBaseUrl}/integrity/bucket?bucket=${bucket}&bucket_size=${bucketSize}${collectionParam}`,
					request?.signal ? { signal: request.signal } : undefined
				);
				if (!response.ok) throw new Error(`existence bucket fetch failed: ${response.status}`);
				const body = (await response.json()) as {
					ids?: { id: number; digest: string; object_type?: string }[];
				};
				return (body.ids ?? []).map((row) => ({
					id: row.id,
					digest: row.digest,
					objectType: (row.object_type ??
						(collection === 'orders'
							? 'order'
							: collection === 'customers'
								? 'customer'
								: 'product')) as 'product' | 'variation' | 'customer' | 'order',
				}));
			},
			deleteProducts: async (wooIds: number[]) => {
				if (collection === 'orders')
					return new EngineOrderRepository(db.collections as never).removeDeletedOrders(wooIds);
				return removeTargeted(
					collection,
					collection === 'products' ? 'wooProductId' : 'wooCustomerId',
					wooIds
				);
			},
			deleteVariations: (wooIds: number[]) => removeTargeted('variations', 'wooId', wooIds),
		};
	};
	return [
		reconcilePort('existenceManifest', 'products'),
		reconcilePort('existenceManifestCustomers', 'customers'),
		reconcilePort('existenceManifestOrders', 'orders'),
	];
}

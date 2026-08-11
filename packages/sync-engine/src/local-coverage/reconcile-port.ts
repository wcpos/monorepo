import { assertBulkSuccess } from '@wcpos/sync-core';

import { forEachYielding } from '../event-loop-yield';
import { EngineOrderRepository } from '../write-path/engine-order-repository';
import { hasPendingLocalWork } from '../write-path/local-work-guard';
import {
	occupiedManifestBucketIndexes,
	readManifestRange,
	removeManifestByWooIds,
} from './rx-existence-manifest-repository';

import type { LocalCoverageReconcilePort, ReconcileRequest } from './local-coverage';
import type { ExistenceScanBucket, ExistenceScanPage } from './reconcile-existence-pass';
import type { RxDatabase } from 'rxdb';

/**
 * Documents per yield in the dirty-guard catalog scan (#949 tranche 2).
 *
 * Measured 2026-08-06, memory storage: the `toJSON()` walk runs 2.4-5.9 us/document depending on
 * JIT warmth, so 1,000 documents is a 2-6 ms span — inside a 60fps frame budget with room to
 * spare, while keeping the yield count (and its per-hop overhead) proportionate.
 */
const DIRTY_SCAN_CHUNK_SIZE = 1_000;
const SCAN_BUCKETS_PER_PAGE = 50;
const UNSIGNED_DECIMAL = /^(?:0|[1-9]\d*)$/;

function parseScanPage(
	body: unknown,
	collection: 'products' | 'customers' | 'orders',
	bucketSize: number,
	afterId: number
): ExistenceScanPage {
	const invalid = (): never => {
		throw new Error(`existence scan returned an unusable ${collection} envelope`);
	};
	if (typeof body !== 'object' || body === null) return invalid();
	const envelope = body as Record<string, unknown>;
	const checkpoint = envelope['checkpoint'];
	if (
		envelope['collection'] !== collection ||
		typeof checkpoint !== 'object' ||
		checkpoint === null ||
		!Array.isArray(envelope['changes']) ||
		typeof envelope['complete'] !== 'boolean' ||
		typeof envelope['meta'] !== 'object' ||
		envelope['meta'] === null
	) {
		return invalid();
	}
	const rawCheckpoint = checkpoint as Record<string, unknown>;
	const nextAfterId = rawCheckpoint['after_id'];
	if (
		rawCheckpoint['bucket_size'] !== bucketSize ||
		!Number.isSafeInteger(nextAfterId) ||
		(nextAfterId as number) < afterId
	) {
		return invalid();
	}
	const changes: ExistenceScanBucket[] = envelope['changes'].map((value) => {
		if (typeof value !== 'object' || value === null) return invalid();
		const row = value as Record<string, unknown>;
		if (
			!Number.isSafeInteger(row['bucket']) ||
			(row['bucket'] as number) < 0 ||
			!Number.isSafeInteger(row['stored_count']) ||
			(row['stored_count'] as number) < 0 ||
			!Number.isSafeInteger(row['current_count']) ||
			(row['current_count'] as number) < 0 ||
			typeof row['stored_digest'] !== 'string' ||
			!UNSIGNED_DECIMAL.test(row['stored_digest']) ||
			typeof row['current_digest'] !== 'string' ||
			!UNSIGNED_DECIMAL.test(row['current_digest']) ||
			typeof row['match'] !== 'boolean'
		) {
			return invalid();
		}
		return {
			bucket: row['bucket'] as number,
			storedCount: row['stored_count'] as number,
			currentCount: row['current_count'] as number,
			storedDigest: row['stored_digest'],
			currentDigest: row['current_digest'],
			match: row['match'],
		};
	});
	return {
		changes,
		nextAfterId: nextAfterId as number,
		complete: envelope['complete'],
	};
}

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
			occupiedBucketIndexes: () => occupiedManifestBucketIndexes(manifest, 1000),
			readManifestRange: (lo: number, hi: number) => readManifestRange(manifest, lo, hi),
			dirtyWooIds,
			fetchServerScanPage: async (
				afterId: number,
				bucketSize: number,
				request?: ReconcileRequest
			) => {
				const response = await (request?.fetcher ?? fetcher)(
					`${ports.site.syncBaseUrl}/integrity/scan?bucket_size=${bucketSize}&after_id=${afterId}&limit_buckets=${SCAN_BUCKETS_PER_PAGE}${collectionParam}`,
					request?.signal ? { signal: request.signal } : undefined
				);
				if (!response.ok) throw new Error(`existence scan fetch failed: ${response.status}`);
				return parseScanPage(await response.json(), collection, bucketSize, afterId);
			},
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

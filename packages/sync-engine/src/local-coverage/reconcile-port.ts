import { assertBulkSuccess } from '@wcpos/sync-core';

import { pullTargetedByIds } from '../change-signal/change-signal-handlers';
import { COLLECTION_DESCRIPTORS } from '../collections/collection-descriptors';
import { manifestRowOf } from '../materialization/record-materialization';
import { chunk, orderDocumentFromWooPayload, WOO_REST_MAX_PER_PAGE } from '../scheduler';
import { EngineOrderRepository } from '../write-path/engine-order-repository';
import { hasPendingLocalWork } from '../write-path/local-work-guard';
import {
	readManifestRange,
	removeManifestByWooIds,
	upsertManifestRows,
} from './rx-existence-manifest-repository';

import type { LocalCoverageReconcilePort, ReconcileRequest } from './local-coverage';
import type { RxDatabase } from 'rxdb';

type ReconcilePortDeps = {
	database: RxDatabase;
	fetcher: (url: string, init?: RequestInit) => Promise<Response>;
	ports: { site: { syncBaseUrl: string } };
};

export function createReconcilePorts(deps: ReconcilePortDeps): LocalCoverageReconcilePort[] {
	const { database: db, fetcher, ports } = deps;
	const targeted = Object.fromEntries(
		COLLECTION_DESCRIPTORS.filter((descriptor) => descriptor.shape === 'targeted').map(
			(descriptor) => [descriptor.collection, descriptor]
		)
	) as Record<
		'products' | 'variations' | 'customers',
		Extract<(typeof COLLECTION_DESCRIPTORS)[number], { shape: 'targeted' }>
	>;
	const handlerContext = {
		database: db,
		fetch: fetcher,
		syncBaseUrl: ports.site.syncBaseUrl,
		persistState: async () => undefined,
		log: () => undefined,
	};
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
				for (const doc of docs) {
					const row = doc.toJSON() as {
						wooProductId?: number;
						wooId?: number;
						wooCustomerId?: number;
						wooOrderId?: number;
						local?: { dirty?: boolean; pendingMutationIds?: unknown[] };
					};
					if (!row.local?.dirty && !row.local?.pendingMutationIds?.length) continue;
					const wooId = row.wooProductId ?? row.wooId ?? row.wooCustomerId ?? row.wooOrderId;
					if (typeof wooId === 'number') ids.add(wooId);
				}
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
		const pullTargetedAndPopulateManifest = async (
			descriptor: (typeof targeted)[keyof typeof targeted],
			wooIds: number[],
			request?: ReconcileRequest
		) => {
			await pullTargetedByIds(
				{ ...handlerContext, fetch: request?.fetcher ?? fetcher },
				descriptor,
				wooIds,
				async (documents) => {
					let publishable = documents;
					if (descriptor.collection === 'products') {
						const unpublishedWooIds: number[] = [];
						publishable = documents.filter((document) => {
							if ((document as { payload?: { status?: unknown } }).payload?.status === 'publish')
								return true;
							const wooId = (document as { wooProductId?: unknown }).wooProductId;
							if (typeof wooId === 'number') unpublishedWooIds.push(wooId);
							return false;
						});
						if (unpublishedWooIds.length > 0)
							await removeTargeted('products', 'wooProductId', unpublishedWooIds);
					}
					const manifestRows = publishable.flatMap((document) =>
						manifestRowOf(document) ? [manifestRowOf(document)!] : []
					);
					if (publishable.length > 0)
						assertBulkSuccess(
							await db.collections[descriptor.collection].bulkUpsert(publishable as never[]),
							'create-rxdb-sync-engine upsert'
						);
					if (manifestRows.length > 0) await upsertManifestRows(manifest, manifestRows);
				},
				async (missingWooIds) => {
					await removeTargeted(descriptor.collection, descriptor.wooIdField, missingWooIds);
					return missingWooIds.length;
				}
			);
		};
		return {
			bucketSize: 1000,
			maxWooId: async () => {
				const docs = await db.collections[manifestName].find().exec();
				return docs.reduce(
					(max, doc) => Math.max(max, Number((doc.toJSON() as { wooId?: unknown }).wooId) || 0),
					0
				);
			},
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
			pullProducts: async (wooIds: number[], request?: ReconcileRequest) => {
				if (collection === 'orders') {
					for (const batch of chunk(wooIds, WOO_REST_MAX_PER_PAGE)) {
						// No `dp` — see the monetary-precision note in rx-scheduler-order-fetcher (#946).
						const response = await (request?.fetcher ?? fetcher)(
							`${ports.site.syncBaseUrl}/orders?include=${batch.join(',')}&per_page=${batch.length}&orderby=include`,
							request?.signal ? { signal: request.signal } : undefined
						);
						if (!response.ok) throw new Error(`order existence pull failed: ${response.status}`);
						const payloads = (await response.json()) as Record<string, unknown>[];
						const payloadByWooId = new Map(
							payloads.map((payload) => [Number(payload.id), payload])
						);
						const existingPayloads = batch.flatMap((wooId) => {
							const payload = payloadByWooId.get(wooId);
							return payload ? [payload] : [];
						});
						await new EngineOrderRepository(db.collections as never).upsertMany(
							existingPayloads.map((payload) => orderDocumentFromWooPayload(payload))
						);
					}
					return;
				}
				await pullTargetedAndPopulateManifest(targeted[collection], wooIds, request);
			},
			pullVariations: async (wooIds: number[], request?: ReconcileRequest) => {
				await pullTargetedAndPopulateManifest(targeted.variations, wooIds, request);
			},
		};
	};
	return [
		reconcilePort('existenceManifest', 'products'),
		reconcilePort('existenceManifestCustomers', 'customers'),
		reconcilePort('existenceManifestOrders', 'orders'),
	];
}

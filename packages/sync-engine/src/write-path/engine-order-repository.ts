/** The apps/main order repository: local-work guards, delete/resync reconciliation,
 * and the custom-pull checkpoint and epoch store used by the scheduler fetcher. */

import {
	assertBulkSuccess,
	normalizeCheckpoint,
	type OrderDocument,
	POS_META_KEYS,
	type RemoteId,
	type SyncCheckpoint,
	withOrderColumns,
	wooIdOf,
} from '@wcpos/sync-core';

import { stripOrderManifestDigest } from '../local-coverage/existence-manifest-population';
import {
	type ManifestCollection,
	removeManifestByWooIds,
	upsertManifestRows,
} from '../local-coverage/rx-existence-manifest-repository';
import { orderStorageIdsForWooDeletes } from './order-tombstones';
import { hasPendingLocalWork, withoutLocallyProtected } from './local-work-guard';

import type { ExistenceManifestDocument } from '../local-coverage/existence-manifest-schema';

const CUSTOM_PULL_CHECKPOINT_ID = 'custom-pull';

/** POS identity metadata whose resident values must survive server adoption. */
export const POS_ORDER_IDENTITY_META_KEYS = [
	POS_META_KEYS.user,
	POS_META_KEYS.store,
	POS_META_KEYS.taxBasedOn,
] as const;

type StoredOrderDoc = { toJSON(): unknown };

type OrdersCollection = {
	bulkUpsert(docs: unknown[]): Promise<unknown>;
	bulkRemove(ids: string[]): Promise<unknown>;
	findByIds(ids: string[]): { exec(): Promise<Map<string, StoredOrderDoc>> };
	find(query?: unknown): { exec(): Promise<StoredOrderDoc[]> };
	count(): { exec(): Promise<number> };
};

type SyncCheckpointDoc = {
	checkpoint?: Partial<SyncCheckpoint> | null;
	epoch?: string;
};

type SyncCheckpointsCollection = {
	findOne(id: string): { exec(): Promise<SyncCheckpointDoc | null> };
	upsert(doc: Record<string, unknown>): Promise<unknown>;
};

/** Structural: the collections the order repository touches — any engine scope database satisfies it. */
export type OrderRepositoryDatabase = {
	orders: OrdersCollection;
	existenceManifestOrders: ManifestCollection;
	syncCheckpoints: SyncCheckpointsCollection;
	close(): Promise<unknown>; // RxDatabase.close() resolves boolean; the repository only awaits it
};

export class EngineOrderRepository {
	constructor(private readonly db: OrderRepositoryDatabase) {}

	/** Returns the subset the storage guard actually applied, so the ingest site can
	 * record manifest rows for exactly those documents (the guard-skipped-manifest class,
	 * Greptile P1 on this PR — same contract as `collectionSchedulerRepository`). */
	async upsertMany(documents: OrderDocument[]): Promise<readonly OrderDocument[]> {
		if (documents.length === 0) return [];
		// Offline-first guard: a pulled server row must never clobber a local edit that hasn't drained
		// yet. `upsertMany` is only ever the pull-apply path (every incoming order is server truth with
		// `local.dirty === false`), so dropping any incoming id whose ALREADY-STORED counterpart carries
		// un-drained local work protects the edit at the storage boundary in its own right — independent
		// of the adapter-level pending-set filter, which can't see a row that is `local.dirty` (or holds
		// `pendingMutationIds`) without being in the passed pending set. This is the same protection
		// `resetForResync` (F8) and `removeDeletedOrders` (F6) already apply via `unprotectedOrders`.
		const applicable = await withoutLocallyProtected(this.db.orders, documents);
		if (applicable.length === 0) return [];
		const residents = await this.db.orders
			.findByIds(applicable.map((document) => document.uuid))
			.exec();
		// Leg-3 (ADR 0015): the order existence manifest is seeded by the INGEST SITE, which holds the
		// `Materialized` envelope and knows which documents it applied (ADR 0028 rider) — see
		// `upsertManifestRows` below. This boundary only guarantees no `_rxdb_digest` reaches storage.
		const materialized = applicable.map((document) => ({
			storedDocument: stripOrderManifestDigest(document),
		}));
		for (const entry of materialized) {
			const resident = residents.get(entry.storedDocument.uuid)?.toJSON() as
				{ payload?: Record<string, unknown> } | undefined;
			const localMeta = Array.isArray(resident?.payload?.meta_data)
				? resident.payload.meta_data
				: [];
			const serverMeta = Array.isArray(entry.storedDocument.payload.meta_data)
				? [...entry.storedDocument.payload.meta_data]
				: [];
			for (const key of POS_ORDER_IDENTITY_META_KEYS) {
				const localEntry = localMeta.find((meta) => meta?.key === key);
				if (!localEntry) continue;
				const index = serverMeta.findIndex((meta) => meta?.key === key);
				if (index === -1) serverMeta.push(localEntry);
				else serverMeta[index] = localEntry;
			}
			if (serverMeta.length > 0) {
				entry.storedDocument = {
					...entry.storedDocument,
					payload: { ...entry.storedDocument.payload, meta_data: serverMeta },
				};
			}
		}
		// Promote the filter/sort columns at the single storage boundary so the in-flight OrderDocument
		// stays free of storage concerns and every stored order is queryable by the indexed columns.
		assertBulkSuccess(
			await this.db.orders.bulkUpsert(
				materialized.map(({ storedDocument }) => withOrderColumns(storedDocument))
			),
			'engine-order-repository upsert'
		);
		return applicable;
	}

	/**
	 * Seed the order existence manifest (Leg-3, ADR 0015) with rows the CALLER extracted from the
	 * pull's `Materialized` envelopes. The pull lanes call this AFTER their `upsertMany`, for the
	 * documents that were actually applied: rows written before their documents would leave an
	 * orphan row on an abort, and rows for skipped documents would claim local residency the store
	 * does not have.
	 */
	async upsertManifestRows(rows: readonly ExistenceManifestDocument[]): Promise<void> {
		if (rows.length === 0) return;
		await upsertManifestRows(this.db.existenceManifestOrders, [...rows]);
	}

	async count(): Promise<number> {
		return this.db.orders.count().exec();
	}

	/**
	 * Apply the server order-delete channel (F6). Resolve each deleted remoteId to its stored uuid
	 * key and remove the local order — EXCEPT any order with queued local work (pending mutation or
	 * `local.dirty`), which stays resident so an offline POS edit is never clobbered by an upstream
	 * delete (mirrors the pull-apply guard). Born-local orders (null remoteId) are never matched.
	 * Full-scan census like deleteProducts — order fields live in an unindexable payload blob.
	 *
	 * A PROTECTED order keeps its manifest row too. Dropping the row while the document survives
	 * would leave the order invisible to the existence reconcile — the manifest is the local side
	 * of that diff — so it could never be pruned again once its local work was pushed, until a
	 * boot prime happened to repair it. This mirrors removeTargeted's protected-id filter (#949).
	 */
	async removeDeletedOrders(
		remoteIds: RemoteId[],
		pendingMutationOrderIds?: ReadonlySet<string>
	): Promise<void> {
		if (remoteIds.length === 0) return;
		const { unprotected, protectedRemoteIds } = await this.orderCensus(pendingMutationOrderIds);
		const storageIds = orderStorageIdsForWooDeletes(unprotected, remoteIds);
		if (storageIds.length > 0)
			assertBulkSuccess(
				await this.db.orders.bulkRemove(storageIds),
				'engine-order-repository remove'
			);
		// Leg-3 maintenance invariant (ADR 0015): depurate the deleted remoteIds from the order
		// manifest — except the ones whose document we just declined to remove.
		await removeManifestByWooIds(
			this.db.existenceManifestOrders,
			remoteIds.filter((remoteId) => !protectedRemoteIds.has(remoteId)).map(wooIdOf)
		);
	}

	/**
	 * Reconcile local orders for a journal reset (F8). The re-pull from zero repopulates the current
	 * generation, so every local order that is NOT protected by queued local work is cleared first —
	 * otherwise an order absent from the new generation lingers as a phantom. A dirty/pending order
	 * (its uuid in the pending set) stays resident so an offline POS edit survives.
	 */
	async resetForResync(pendingMutationOrderIds?: ReadonlySet<string>): Promise<void> {
		const removable = await this.unprotectedOrders(pendingMutationOrderIds);
		if (removable.length > 0)
			assertBulkSuccess(
				await this.db.orders.bulkRemove(removable.map((doc) => doc.uuid)),
				'engine-order-repository remove'
			);
	}

	/**
	 * Full-scan census of local orders that are NOT protected by queued local work — safe to remove.
	 * Shared by the delete channel (F6) and the resync reconcile (F8). Treats a missing/non-array
	 * pendingMutationIds (the schema only requires `local` to be an object) as empty, so a partial row
	 * can't throw. An order stays protected when it is dirty, has pending mutation ids, or its uuid
	 * is in the pending-mutation set (which is keyed by record uuid — see `pendingRecordIds`).
	 */
	private async unprotectedOrders(
		pendingMutationOrderIds?: ReadonlySet<string>
	): Promise<OrderDocument[]> {
		return (await this.orderCensus(pendingMutationOrderIds)).unprotected;
	}

	/**
	 * The same census, but keeping BOTH sides: the removable orders and the Woo ids of the ones the
	 * guard protected. The delete channel needs the protected ids so it can leave their manifest
	 * rows intact — one scan, both answers.
	 */
	private async orderCensus(pendingMutationOrderIds?: ReadonlySet<string>): Promise<{
		unprotected: OrderDocument[];
		protectedRemoteIds: Set<RemoteId>;
	}> {
		const docs = (await this.db.orders.find().exec()).map(
			(doc) => doc.toJSON() as unknown as OrderDocument
		);
		const protectedRemoteIds = new Set<RemoteId>();
		const unprotected = docs.filter((doc) => {
			if (this.isUnprotectedOrder(doc, pendingMutationOrderIds)) return true;
			if (doc.remoteId !== null) protectedRemoteIds.add(doc.remoteId);
			return false;
		});
		return { unprotected, protectedRemoteIds };
	}

	private isUnprotectedOrder(
		doc: OrderDocument,
		pendingMutationOrderIds?: ReadonlySet<string>
	): boolean {
		if (hasPendingLocalWork(doc)) return false;
		if (pendingMutationOrderIds?.has(doc.uuid)) return false;
		return true;
	}

	async firstPageForDisplay(limit = 100): Promise<OrderDocument[]> {
		const documents = await this.db.orders
			.find({
				selector: {},
				sort: [{ uuid: 'asc' }],
				limit,
			})
			.exec();

		// Stored docs carry the promoted columns (StoredOrderDocument ⊇ OrderDocument); display only
		// needs the in-flight shape, so narrow back to OrderDocument.
		return documents.map((document) => document.toJSON() as unknown as OrderDocument);
	}

	async readCustomPullCheckpoint(): Promise<SyncCheckpoint> {
		const document = await this.db.syncCheckpoints.findOne(CUSTOM_PULL_CHECKPOINT_ID).exec();
		return normalizeCheckpoint(document?.checkpoint);
	}

	async writeCustomPullCheckpoint(checkpoint: SyncCheckpoint): Promise<void> {
		// checkpoint + epoch (F8) share one document; preserve the stored epoch so a checkpoint write
		// (including the reset-to-zero write) never clobbers the epoch that a prior epoch-write set.
		const existing = await this.db.syncCheckpoints.findOne(CUSTOM_PULL_CHECKPOINT_ID).exec();
		await this.db.syncCheckpoints.upsert({
			checkpointKey: CUSTOM_PULL_CHECKPOINT_ID,
			checkpoint: normalizeCheckpoint(checkpoint),
			updatedAt: new Date().toISOString(),
			...(existing?.epoch ? { epoch: existing.epoch } : {}),
		});
	}

	async readJournalEpoch(): Promise<string | undefined> {
		const document = await this.db.syncCheckpoints.findOne(CUSTOM_PULL_CHECKPOINT_ID).exec();
		const epoch = document?.epoch;
		return typeof epoch === 'string' && epoch !== '' ? epoch : undefined;
	}

	async writeJournalEpoch(epoch: string): Promise<void> {
		// Persist the epoch beside the checkpoint (F8), preserving the stored checkpoint.
		const existing = await this.db.syncCheckpoints.findOne(CUSTOM_PULL_CHECKPOINT_ID).exec();
		await this.db.syncCheckpoints.upsert({
			checkpointKey: CUSTOM_PULL_CHECKPOINT_ID,
			checkpoint: normalizeCheckpoint(existing?.checkpoint),
			updatedAt: new Date().toISOString(),
			epoch,
		});
	}

	getDatabase(): OrderRepositoryDatabase {
		return this.db;
	}

	async close(): Promise<void> {
		await this.db.close();
	}
}

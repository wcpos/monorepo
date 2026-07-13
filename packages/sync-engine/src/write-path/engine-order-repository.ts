/**
 * The order repository CORE (slice 5e, #430 phase 1): upsert with the
 * offline-first local-work guard, the F6 delete channel, the F8 resync
 * reconcile, and the custom-pull checkpoint/epoch store — everything the
 * orders scheduler fetcher needs, engine-side. The web host subclasses this
 * as RxOrderRepository to add its FlexSearch teardown on close() and the
 * exclusive-ownership resolver frames (host concerns, not engine ones).
 *
 * Structurally typed: LabDatabase and engine scope databases both satisfy
 * OrderRepositoryDatabase, so the same class serves the pre-adoption web
 * assembly and the engine's own scheduler drain.
 */

import {
	assertBulkSuccess,
	normalizeCheckpoint,
	type OrderDocument,
	type SyncCheckpoint,
	withOrderColumns,
} from '@wcpos/sync-core';

import {
	manifestRowOf,
	materializeExistingLocalOnly,
} from '../materialization/record-materialization';
import {
	type ManifestCollection,
	removeManifestByWooIds,
	upsertManifestRows,
} from '../local-coverage/rx-existence-manifest-repository';
import { orderStorageIdsForWooDeletes } from './order-tombstones';

const CUSTOM_PULL_CHECKPOINT_ID = 'custom-pull';

type StoredOrderDoc = { toJSON(): unknown };

type OrdersCollection = {
	bulkUpsert(docs: unknown[]): Promise<unknown>;
	bulkRemove(ids: string[]): Promise<unknown>;
	findByIds(ids: string[]): { exec(): Promise<Map<string, StoredOrderDoc>> };
	find(query?: unknown): { exec(): Promise<StoredOrderDoc[]> };
	count(): { exec(): Promise<number> };
};

type SyncCheckpointDoc = { checkpoint?: Partial<SyncCheckpoint> | null; epoch?: string };

type SyncCheckpointsCollection = {
	findOne(id: string): { exec(): Promise<SyncCheckpointDoc | null> };
	upsert(doc: Record<string, unknown>): Promise<unknown>;
};

/** Structural: the collections the order repository touches — LabDatabase and engine scope dbs both satisfy it. */
export type OrderRepositoryDatabase = {
	orders: OrdersCollection;
	existenceManifestOrders: ManifestCollection;
	syncCheckpoints: SyncCheckpointsCollection;
	close(): Promise<unknown>; // RxDatabase.close() resolves boolean; the repository only awaits it
};

export class EngineOrderRepository {
	constructor(private readonly db: OrderRepositoryDatabase) {}

	async upsertMany(documents: OrderDocument[]): Promise<void> {
		if (documents.length === 0) return;
		// Offline-first guard: a pulled server row must never clobber a local edit that hasn't drained
		// yet. `upsertMany` is only ever the pull-apply path (every incoming order is server truth with
		// `local.dirty === false`), so dropping any incoming id whose ALREADY-STORED counterpart carries
		// un-drained local work protects the edit at the storage boundary in its own right — independent
		// of the adapter-level pending-set filter, which can't see a row that is `local.dirty` (or holds
		// `pendingMutationIds`) without being in the passed pending set. This is the same protection
		// `resetForResync` (F8) and `removeDeletedOrders` (F6) already apply via `unprotectedOrders`.
		const applicable = await this.withoutLocallyProtected(documents);
		if (applicable.length === 0) return;
		// Leg-3 (ADR 0015): seed the order existence manifest (its OWN collection) from each pull's
		// `_rxdb_digest`, and strip the digest from the stored payload so it never pollutes the order doc.
		const materialized = applicable.map((document) =>
			manifestRowOf(document)
				? { storedDocument: document, manifestRow: manifestRowOf(document) }
				: materializeExistingLocalOnly(document)
		);
		const manifestRows = materialized.flatMap(({ manifestRow }) =>
			manifestRow ? [manifestRow] : []
		);
		// Promote the filter/sort columns at the single storage boundary so the in-flight OrderDocument
		// stays free of storage concerns and every stored order is queryable by the indexed columns.
		assertBulkSuccess(
			await this.db.orders.bulkUpsert(
				materialized.map(({ storedDocument }) => withOrderColumns(storedDocument))
			),
			'engine-order-repository upsert'
		);
		if (manifestRows.length > 0) {
			await upsertManifestRows(this.db.existenceManifestOrders, manifestRows);
		}
	}

	/**
	 * Drop any incoming order whose ALREADY-STORED counterpart carries un-drained local work
	 * (`local.dirty` or a non-empty `pendingMutationIds`) so a re-pull can't overwrite it. A brand-new
	 * id (not yet stored) is always applied. Mirrors the `unprotectedOrders` predicate so upsert,
	 * delete (F6) and resync (F8) all honour the same local-work protection. Targeted `findByIds` keeps
	 * this to one bounded read of just the incoming ids, not a full-collection scan.
	 */
	private async withoutLocallyProtected(documents: OrderDocument[]): Promise<OrderDocument[]> {
		const stored = await this.db.orders.findByIds(documents.map((doc) => doc.id)).exec();
		if (stored.size === 0) return documents;
		return documents.filter((doc) => {
			const local = (stored.get(doc.id)?.toJSON() as unknown as OrderDocument | undefined)?.local;
			const pendingIds = Array.isArray(local?.pendingMutationIds) ? local.pendingMutationIds : [];
			return !(local?.dirty || pendingIds.length > 0);
		});
	}

	async count(): Promise<number> {
		return this.db.orders.count().exec();
	}

	/**
	 * Apply the server order-delete channel (F6). Resolve each deleted wooOrderId to its stored uuid
	 * key and remove the local order — EXCEPT any order with queued local work (pending mutation or
	 * `local.dirty`), which stays resident so an offline POS edit is never clobbered by an upstream
	 * delete (mirrors the pull-apply guard). Born-local orders (null wooOrderId) are never matched.
	 * Full-scan census like deleteProducts — order fields live in an unindexable payload blob.
	 */
	async removeDeletedOrders(
		wooOrderIds: number[],
		pendingMutationOrderIds?: ReadonlySet<string | number>
	): Promise<void> {
		if (wooOrderIds.length === 0) return;
		const docs = await this.unprotectedOrders(pendingMutationOrderIds);
		const storageIds = orderStorageIdsForWooDeletes(docs, wooOrderIds);
		if (storageIds.length > 0)
			assertBulkSuccess(
				await this.db.orders.bulkRemove(storageIds),
				'engine-order-repository remove'
			);
		// Leg-3 maintenance invariant (ADR 0015): depurate the deleted wooOrderIds from the order manifest.
		await removeManifestByWooIds(this.db.existenceManifestOrders, wooOrderIds);
	}

	/**
	 * Reconcile local orders for a journal reset (F8). The re-pull from zero repopulates the current
	 * generation, so every local order that is NOT protected by queued local work is cleared first —
	 * otherwise an order absent from the new generation lingers as a phantom. A dirty/pending order
	 * (its id or wooOrderId in the pending set) stays resident so an offline POS edit survives.
	 */
	async resetForResync(pendingMutationOrderIds?: ReadonlySet<string | number>): Promise<void> {
		const removable = await this.unprotectedOrders(pendingMutationOrderIds);
		if (removable.length > 0)
			assertBulkSuccess(
				await this.db.orders.bulkRemove(removable.map((doc) => doc.id)),
				'engine-order-repository remove'
			);
	}

	/**
	 * Full-scan census of local orders that are NOT protected by queued local work — safe to remove.
	 * Shared by the delete channel (F6) and the resync reconcile (F8). Treats a missing/non-array
	 * pendingMutationIds (the schema only requires `local` to be an object) as empty, so a partial row
	 * can't throw. An order stays protected when it is dirty, has pending mutation ids, or its id /
	 * wooOrderId is in the pending-mutation set.
	 */
	private async unprotectedOrders(
		pendingMutationOrderIds?: ReadonlySet<string | number>
	): Promise<OrderDocument[]> {
		const docs = (await this.db.orders.find().exec()).map(
			(doc) => doc.toJSON() as unknown as OrderDocument
		);
		return docs.filter((doc) => {
			const pendingIds = Array.isArray(doc.local?.pendingMutationIds)
				? doc.local.pendingMutationIds
				: [];
			if (doc.local?.dirty || pendingIds.length > 0) return false;
			if (pendingMutationOrderIds?.has(doc.id)) return false;
			if (doc.wooOrderId !== null && pendingMutationOrderIds?.has(doc.wooOrderId)) return false;
			return true;
		});
	}

	async firstPageForDisplay(limit = 100): Promise<OrderDocument[]> {
		const documents = await this.db.orders
			.find({
				selector: {},
				sort: [{ id: 'asc' }],
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
			id: CUSTOM_PULL_CHECKPOINT_ID,
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
			id: CUSTOM_PULL_CHECKPOINT_ID,
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

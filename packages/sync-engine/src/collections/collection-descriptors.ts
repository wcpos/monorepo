/**
 * Package-private collection descriptors (facade slice 3, ADR 0018): each
 * syncable collection declares its change-signal SHAPE, and the facade
 * GENERATES every apply-handler arm from it (changeSignalHandlers.ts). Hosts
 * cannot register or customize a descriptor — that seam would have exactly one
 * adapter, and per-host arm wiring is the drift class ADR 0007/0018 exist to
 * kill.
 *
 * The four shapes (mirroring how the change-signal applier treats collections):
 *  - `targeted`        — pulled BY ID on a signal, deleted by tombstone
 *                        (products, variations, customers);
 *  - `greedy-prunable` — ONE re-pull refreshes the whole small collection AND
 *                        set-difference-prunes deletes (categories, brands,
 *                        tags, coupons — no per-id arms exist for these);
 *  - `upsert-refresh`  — a full re-pull UPSERTS but never prunes, so deletes
 *                        need their own tombstone arm (taxRates — ADR 0009
 *                        keys them by Woo id, giving deterministic tombstones);
 *  - `local-only`      — no change-signal arms at all (orders: on-demand
 *                        windowed pull + the write path own that collection).
 *
 * Slice-3 arm EFFECTS are direct chunked fetch-and-upsert through the
 * scope-bound fetcher. The scheduler/coverage indirection the web host uses
 * for products/customers is the slice-4 fetch queue's job; these bodies are
 * package-internal and swap then without touching the descriptor surface.
 *
 * Projections mirror the web lanes byte-for-byte (identifyRecord keys every
 * record by its server-stamped _woocommerce_pos_uuid, mintOnMissing:false —
 * a pulled record MUST carry it). `sync.revision` adopts the server's
 * `_rxdb_revision` stamp when present (revision cutover step 1b, #423 —
 * stripped from the stored payload so bytes stay identity-clean); the old
 * synthesized values (date_modified_gmt / String(id)) remain only as the
 * transitional fallback for proxies that predate the stamp.
 */

import type { RxDatabase } from 'rxdb';
import type { HybridCollection, ReferenceCollection } from '@woo-rxdb-lab/sync-core';
import { materializeGreedyPrunable, materializeTargeted, materializeUpsertRefresh } from '../materialization/record-materialization';
import { taxRateDocumentId, type WooTaxRatePayload } from './tax-rate-schema';
import type { WooReferencePayload } from './reference-collection-schema';
import type { SyncCollectionName } from './engine-collections';

type WooPayload = Record<string, unknown> & { id?: number };


/** shape: 'targeted' — pulled by id, deleted by tombstone. */
export type TargetedDescriptor = {
  shape: 'targeted';
  collection: Extract<SyncCollectionName, 'products' | 'variations' | 'customers'>;
  /** The detection vocabulary this collection appears under in sequence-log rows. */
  hybrid: HybridCollection;
  /** Namespaced read path for the include-chunked pull (under site.syncBaseUrl). */
  pullPath: string;
  /** The document field carrying the numeric Woo id — delete resolution selector. */
  wooIdField: string;
  /**
   * Response-body → pull items. /products and /customers return a BARE wc/v3
   * array; the lab /variations endpoint returns `{ documents: [{ id,
   * parent_id, payload, _rxdb_digest? }] }` — each endpoint's envelope is the
   * descriptor's fact, not the puller's guess.
   */
  parse: (body: unknown) => WooPayload[];
  project: (payload: WooPayload) => Record<string, unknown>;
};

/** The bare wc/v3 array envelope (/products, /customers). */
function parseBareArray(body: unknown): WooPayload[] {
  if (!Array.isArray(body)) {
    throw new Error('targeted pull returned a non-array body');
  }
  return body as WooPayload[];
}

/**
 * The lab /variations include envelope: `{ documents: [...] }`. Each wrapper
 * is flattened into the payload the projection consumes — `parent_id` rides
 * the wrapper (not the inner payload), and the wrapper-level `_rxdb_digest`
 * (a transport-only Leg-3 digest) is deliberately dropped.
 */
function parseVariationsEnvelope(body: unknown): WooPayload[] {
  const documents = (body as { documents?: unknown })?.documents;
  if (!Array.isArray(documents)) {
    throw new Error('variations pull returned no documents array');
  }
  return (documents as Array<{ id: number; parent_id: number; payload: Record<string, unknown>; _rxdb_digest?: string }>).map((wrapper) => ({
    ...wrapper.payload,
    id: wrapper.id,
    parent_id: wrapper.parent_id,
    ...(wrapper._rxdb_digest !== undefined ? { _rxdb_digest: wrapper._rxdb_digest } : {}),
  }));
}

/** shape: 'greedy-prunable' — one re-pull upserts AND prunes; no per-id arms. */
export type GreedyPrunableDescriptor = {
  shape: 'greedy-prunable';
  collection: Extract<SyncCollectionName, 'categories' | 'brands' | 'tags' | 'coupons'>;
  hybrid: ReferenceCollection;
  refreshPath: string;
  project: (payload: WooPayload) => Record<string, unknown>;
};

/** shape: 'upsert-refresh' — refresh never prunes; deletes tombstone by id. */
export type UpsertRefreshDescriptor = {
  shape: 'upsert-refresh';
  collection: Extract<SyncCollectionName, 'taxRates'>;
  hybrid: Extract<HybridCollection, 'tax_rates'>;
  refreshPath: string;
  tombstoneIdFor: (wooId: number) => string;
  project: (payload: WooPayload) => Record<string, unknown>;
};

/** A successful create/update push, resolved for the ack write-back. */
export type WriteAck = {
  mutation: { mutationId: string; operation: 'create' | 'update' | 'delete'; recordId: string };
  recordId: string;
  remoteId: unknown;
  currentRevision: string | null;
};

/**
 * The write facet (slice 4): a collection is client-writeable ONLY when its
 * descriptor carries this — the push route existing server-side is not
 * enough; the ack write-back contract must exist too. Orthogonal to `shape`
 * (orders are change-signal 'local-only' AND the one writeable collection).
 */
export type CollectionWriteFacet = {
  /** Create/update ack: re-anchor sync.revision, capture the remote id, drop
   * the drained mutationId, clear dirty when nothing is pending. */
  reconcile: (db: RxDatabase, ack: WriteAck, signal?: AbortSignal) => Promise<void>;
  /** Delete ack: the record is gone server-side — remove the local row. */
  onDeleteAck: (db: RxDatabase, mutation: { mutationId: string; recordId: string }, signal?: AbortSignal) => Promise<void>;
};

/** shape: 'local-only' — no change-signal arms (orders). */
export type LocalOnlyDescriptor = {
  shape: 'local-only';
  collection: Extract<SyncCollectionName, 'orders'>;
  write?: CollectionWriteFacet;
};

type AckDoc = {
  incrementalModify(fn: (data: Record<string, unknown>) => Record<string, unknown>): Promise<unknown>;
  remove(): Promise<unknown>;
};

/**
 * The orders ack write-back — a faithful port of the web host's
 * applyOrderWriteAck/applyOrderDeleteAck (apps/web/src/db/orderWriteIntents.ts,
 * kept until #430): capture the server-assigned numeric id on create (the
 * uuid PK is never re-keyed), re-anchor `sync.revision` as the next edit's
 * baseRevision, drop the drained mutationId, clear dirty once nothing pends.
 */
const ordersWriteFacet: CollectionWriteFacet = {
  reconcile: async (db, ack, signal) => {
    if (signal?.aborted) return;
    const doc = (await db.collections.orders.findOne(ack.recordId).exec()) as AckDoc | null;
    if (!doc || signal?.aborted) return; // gone, or the scope switched — nothing to reconcile
    await doc.incrementalModify((data) => {
      const local = (data.local ?? {}) as { dirty?: boolean; pendingMutationIds?: string[] };
      const pending = (Array.isArray(local.pendingMutationIds) ? local.pendingMutationIds : []).filter((id) => id !== ack.mutation.mutationId);
      const sync = (data.sync ?? {}) as { revision?: string };
      return {
        ...data,
        wooOrderId: ack.mutation.operation === 'create' && typeof ack.remoteId === 'number' ? ack.remoteId : data.wooOrderId,
        sync: { ...sync, revision: ack.currentRevision ?? sync.revision },
        local: { ...local, pendingMutationIds: pending, dirty: pending.length > 0 },
      };
    });
  },
  onDeleteAck: async (db, mutation, signal) => {
    if (signal?.aborted) return;
    const doc = (await db.collections.orders.findOne(mutation.recordId).exec()) as AckDoc | null;
    if (!doc || signal?.aborted) return; // already removed, or the scope switched
    await doc.remove();
  },
};

export type CollectionDescriptor =
  | TargetedDescriptor
  | GreedyPrunableDescriptor
  | UpsertRefreshDescriptor
  | LocalOnlyDescriptor;

function productDocument(rawPayload: WooPayload): Record<string, unknown> {
  return materializeTargeted('products', rawPayload).storedDocument;
}

function variationDocument(rawPayload: WooPayload): Record<string, unknown> {
  return materializeTargeted('variations', rawPayload).storedDocument;
}

function customerDocument(rawPayload: WooPayload): Record<string, unknown> {
  return materializeTargeted('customers', rawPayload).storedDocument;
}

function referenceDocument(rawPayload: WooPayload): Record<string, unknown> {
  return materializeGreedyPrunable(rawPayload as WooReferencePayload).storedDocument;
}

function taxRateDocument(rawPayload: WooPayload): Record<string, unknown> {
  return materializeUpsertRefresh(rawPayload as WooTaxRatePayload).storedDocument;
}

/** THE descriptor table — one row per syncable collection, keyed by shape. */
export const COLLECTION_DESCRIPTORS: readonly CollectionDescriptor[] = [
  { shape: 'targeted', collection: 'products', hybrid: 'products', pullPath: '/products', wooIdField: 'wooProductId', parse: parseBareArray, project: productDocument },
  { shape: 'targeted', collection: 'variations', hybrid: 'variations', pullPath: '/variations', wooIdField: 'wooId', parse: parseVariationsEnvelope, project: variationDocument },
  { shape: 'targeted', collection: 'customers', hybrid: 'customers', pullPath: '/customers', wooIdField: 'wooCustomerId', parse: parseBareArray, project: customerDocument },
  { shape: 'upsert-refresh', collection: 'taxRates', hybrid: 'tax_rates', refreshPath: '/taxes', tombstoneIdFor: taxRateDocumentId, project: taxRateDocument },
  { shape: 'greedy-prunable', collection: 'categories', hybrid: 'categories', refreshPath: '/products/categories', project: referenceDocument },
  { shape: 'greedy-prunable', collection: 'brands', hybrid: 'brands', refreshPath: '/products/brands', project: referenceDocument },
  { shape: 'greedy-prunable', collection: 'tags', hybrid: 'tags', refreshPath: '/products/tags', project: referenceDocument },
  { shape: 'greedy-prunable', collection: 'coupons', hybrid: 'coupons', refreshPath: '/coupons', project: referenceDocument },
  { shape: 'local-only', collection: 'orders', write: ordersWriteFacet },
] as const;

/** The write dispatch: descriptor lookup by collection, null when not writeable. */
export function writeFacetFor(collection: string): CollectionWriteFacet | null {
  const descriptor = COLLECTION_DESCRIPTORS.find((d) => d.collection === collection);
  if (!descriptor || descriptor.shape !== 'local-only' || !descriptor.write) return null;
  return descriptor.write;
}

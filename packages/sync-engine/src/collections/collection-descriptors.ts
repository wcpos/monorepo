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

import { assertBulkSuccess } from '@wcpos/sync-core';
import type { Fetcher, HybridCollection, ReferenceCollection } from '@wcpos/sync-core';

import {
	materializeGreedyPrunable,
	materializeLocalOnly,
	materializeTargeted,
	materializeUpsertRefresh,
} from '../materialization/record-materialization';
import { EngineOrderRepository } from '../write-path/engine-order-repository';
import { taxRateDocumentId, type WooTaxRatePayload } from './tax-rate-schema';

import type { RxDatabase } from 'rxdb';
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
	write: CollectionWriteFacet;
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
	return (
		documents as {
			id: number;
			parent_id: number;
			payload: Record<string, unknown>;
			_rxdb_digest?: string;
		}[]
	).map((wrapper) => ({
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
	write?: CollectionWriteFacet;
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
	document?: Record<string, unknown> | null;
};

/**
 * The write facet (slice 4): a collection is client-writeable ONLY when its
 * descriptor carries this — the push route existing server-side is not
 * enough; the ack write-back contract must exist too. Orthogonal to `shape`
 * (writeability is explicit and independent of the change-signal shape).
 */
export type CollectionWriteFacet = {
	collection: Extract<
		SyncCollectionName,
		'orders' | 'products' | 'variations' | 'customers' | 'coupons'
	>;
	/** Stored field carrying the server numeric identity used by targeted refresh. */
	remoteIdField: 'wooOrderId' | 'wooProductId' | 'wooId' | 'wooCustomerId';
	/** Read one server document through this collection's existing include-pull shape. */
	fetchServerDocument: (input: {
		fetch: Fetcher;
		syncBaseUrl: string;
		remoteId: number;
		signal?: AbortSignal;
	}) => Promise<Record<string, unknown> | null>;
	/** Pull/ack payload → the exact stored shape used by ordinary materialization. */
	documentFromServerPayload: (payload: Record<string, unknown>) => Record<string, unknown>;
	/** Missing-row ack/discard write-back through the collection's repository seam. */
	upsertServerDocument: (db: RxDatabase, document: Record<string, unknown>) => Promise<void>;
	/** Create/update ack: re-anchor sync.revision, capture the remote id, drop
	 * the drained mutationId, clear dirty when nothing is pending. */
	reconcile: (db: RxDatabase, ack: WriteAck, signal?: AbortSignal) => Promise<void>;
	/** Delete ack: the record is gone server-side — remove the local row. */
	onDeleteAck: (
		db: RxDatabase,
		mutation: { mutationId: string; recordId: string },
		signal?: AbortSignal
	) => Promise<void>;
};

/** shape: 'local-only' — no change-signal arms (orders). */
export type LocalOnlyDescriptor = {
	shape: 'local-only';
	collection: Extract<SyncCollectionName, 'orders'>;
	write: CollectionWriteFacet;
};

type AckDoc = {
	incrementalModify(
		fn: (data: Record<string, unknown>) => Record<string, unknown>
	): Promise<unknown>;
	remove(): Promise<unknown>;
};

function ackBookkeeping(
	collection: CollectionWriteFacet['collection'],
	remoteIdField: CollectionWriteFacet['remoteIdField'],
	createAckSource?: 'woo-rest',
	payloadFromAckDocument?: (document: Record<string, unknown>) => Record<string, unknown>
): Pick<CollectionWriteFacet, 'reconcile' | 'onDeleteAck'> {
	return {
		reconcile: async (db, ack, signal) => {
			if (signal?.aborted) return;
			const doc = (await db.collections[collection].findOne(ack.recordId).exec()) as AckDoc | null;
			if (!doc || signal?.aborted) return; // gone, or the scope switched — nothing to reconcile
			await doc.incrementalModify((data) => {
				const local = (data.local ?? {}) as { dirty?: boolean; pendingMutationIds?: string[] };
				const pending = (
					Array.isArray(local.pendingMutationIds) ? local.pendingMutationIds : []
				).filter((id) => id !== ack.mutation.mutationId);
				const sync = (data.sync ?? {}) as { revision?: string; source?: string };
				return {
					...data,
					...(payloadFromAckDocument &&
					ack.document &&
					pending.length === 0 &&
					ack.mutation.operation !== 'delete'
						? { payload: payloadFromAckDocument(ack.document) }
						: {}),
					[remoteIdField]:
						ack.mutation.operation === 'create' && typeof ack.remoteId === 'number'
							? ack.remoteId
							: data[remoteIdField],
					sync: {
						...sync,
						revision: ack.currentRevision ?? sync.revision,
						...(ack.mutation.operation === 'create' && createAckSource
							? { source: createAckSource }
							: {}),
					},
					local: { ...local, pendingMutationIds: pending, dirty: pending.length > 0 },
				};
			});
		},
		onDeleteAck: async (db, mutation, signal) => {
			if (signal?.aborted) return;
			const doc = (await db.collections[collection]
				.findOne(mutation.recordId)
				.exec()) as AckDoc | null;
			if (!doc || signal?.aborted) return; // already removed, or the scope switched
			await doc.remove();
		},
	};
}

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

function orderDocument(rawPayload: WooPayload): Record<string, unknown> {
	return materializeLocalOnly(rawPayload as never).storedDocument as Record<string, unknown>;
}

function createWriteFacet(input: {
	collection: CollectionWriteFacet['collection'];
	remoteIdField: CollectionWriteFacet['remoteIdField'];
	pullPath: string;
	parse: (body: unknown) => WooPayload[];
	project: (payload: WooPayload) => Record<string, unknown>;
	createAckSource?: 'woo-rest';
	payloadFromAckDocument?: (document: Record<string, unknown>) => Record<string, unknown>;
	upsert?: CollectionWriteFacet['upsertServerDocument'];
}): CollectionWriteFacet {
	return {
		collection: input.collection,
		remoteIdField: input.remoteIdField,
		documentFromServerPayload: (payload) => input.project(payload as WooPayload),
		fetchServerDocument: async ({ fetch, syncBaseUrl, remoteId, signal }) => {
			const search = new URLSearchParams({
				include: String(remoteId),
				per_page: '1',
			});
			const response = await fetch(`${syncBaseUrl}${input.pullPath}?${search.toString()}`, {
				...(signal ? { signal } : {}),
			});
			if (!response.ok) {
				throw new Error(`${input.pullPath} revision refresh failed: HTTP ${response.status}`);
			}
			const [payload] = input.parse(await response.json());
			return payload ? input.project(payload) : null;
		},
		upsertServerDocument:
			input.upsert ??
			(async (db, document) => {
				const collection = db.collections[input.collection];
				if (!collection) {
					throw new Error(`Engine scope database is missing collection "${input.collection}"`);
				}
				assertBulkSuccess(
					await collection.bulkUpsert([document] as never[]),
					`write facet ${input.collection} upsert`
				);
			}),
		...ackBookkeeping(
			input.collection,
			input.remoteIdField,
			input.createAckSource,
			input.payloadFromAckDocument
		),
	};
}

const productsWriteFacet = createWriteFacet({
	collection: 'products',
	remoteIdField: 'wooProductId',
	pullPath: '/products',
	parse: parseBareArray,
	project: productDocument,
});
const variationsWriteFacet = createWriteFacet({
	collection: 'variations',
	remoteIdField: 'wooId',
	pullPath: '/variations',
	parse: parseVariationsEnvelope,
	project: variationDocument,
});
const customersWriteFacet = createWriteFacet({
	collection: 'customers',
	remoteIdField: 'wooCustomerId',
	pullPath: '/customers',
	parse: parseBareArray,
	project: customerDocument,
});
const couponsWriteFacet = createWriteFacet({
	collection: 'coupons',
	remoteIdField: 'wooId',
	pullPath: '/coupons',
	parse: parseBareArray,
	project: referenceDocument,
	// Greedy reference pruning recognizes only server-sourced rows. Once Woo
	// assigns the create's id, the coupon participates in authoritative pruning.
	createAckSource: 'woo-rest',
});
/** The order facet retains its repository and pull-side materializer byte-for-byte. */
const ordersWriteFacet = createWriteFacet({
	collection: 'orders',
	remoteIdField: 'wooOrderId',
	pullPath: '/orders',
	parse: parseBareArray,
	project: orderDocument,
	payloadFromAckDocument: (document) =>
		orderDocument(document as WooPayload).payload as Record<string, unknown>,
	upsert: async (db, document) => {
		await new EngineOrderRepository(db.collections as never).upsertMany([document as never]);
	},
});

/** THE descriptor table — one row per syncable collection, keyed by shape. */
export const COLLECTION_DESCRIPTORS: readonly CollectionDescriptor[] = [
	{
		shape: 'targeted',
		collection: 'products',
		hybrid: 'products',
		pullPath: '/products',
		wooIdField: 'wooProductId',
		parse: parseBareArray,
		project: productDocument,
		write: productsWriteFacet,
	},
	{
		shape: 'targeted',
		collection: 'variations',
		hybrid: 'variations',
		pullPath: '/variations',
		wooIdField: 'wooId',
		parse: parseVariationsEnvelope,
		project: variationDocument,
		write: variationsWriteFacet,
	},
	{
		shape: 'targeted',
		collection: 'customers',
		hybrid: 'customers',
		pullPath: '/customers',
		wooIdField: 'wooCustomerId',
		parse: parseBareArray,
		project: customerDocument,
		write: customersWriteFacet,
	},
	{
		shape: 'upsert-refresh',
		collection: 'taxRates',
		hybrid: 'tax_rates',
		refreshPath: '/taxes',
		tombstoneIdFor: taxRateDocumentId,
		project: taxRateDocument,
	},
	{
		shape: 'greedy-prunable',
		collection: 'categories',
		hybrid: 'categories',
		refreshPath: '/products/categories',
		project: referenceDocument,
	},
	{
		shape: 'greedy-prunable',
		collection: 'brands',
		hybrid: 'brands',
		refreshPath: '/products/brands',
		project: referenceDocument,
	},
	{
		shape: 'greedy-prunable',
		collection: 'tags',
		hybrid: 'tags',
		refreshPath: '/products/tags',
		project: referenceDocument,
	},
	{
		shape: 'greedy-prunable',
		collection: 'coupons',
		hybrid: 'coupons',
		refreshPath: '/coupons',
		project: referenceDocument,
		write: couponsWriteFacet,
	},
	{ shape: 'local-only', collection: 'orders', write: ordersWriteFacet },
] as const;

/** The write dispatch: descriptor lookup by collection, null when not writeable. */
export function writeFacetFor(collection: string): CollectionWriteFacet | null {
	const descriptor = COLLECTION_DESCRIPTORS.find((d) => d.collection === collection);
	if (!descriptor || !('write' in descriptor) || !descriptor.write) return null;
	return descriptor.write;
}

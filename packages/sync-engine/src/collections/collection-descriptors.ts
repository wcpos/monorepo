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

import {
	assertBulkSuccess,
	Fetcher,
	HybridCollection,
	ReferenceCollection,
	type RemoteId,
	remoteIdOrNull,
	withOrderColumns,
	wooIdOf,
	WooOrderPayload,
} from '@wcpos/sync-core';

import {
	type BarcodeSelectors,
	barcodeSelectorsFor,
	type BarcodeSelectorsReader,
} from '../materialization/barcode-selectors';
import {
	materializeGreedyPrunable,
	materializeLocalOnly,
	materializeTargeted,
	materializeUpsertRefresh,
} from '../materialization/record-materialization';
import { stripNonStringMetaDisplayFields } from '../materialization/strip-order-meta-display';
import {
	EngineOrderRepository,
	POS_ORDER_IDENTITY_META_KEYS,
} from '../write-path/engine-order-repository';
import { graftServerLineIdentity } from '../write-path/graft-server-line-identity';
import { preserveEquivalentLocalPrecision } from '../write-path/order-money-divergence';
import { taxRateDocumentId, type WooTaxRatePayload } from './tax-rate-schema';

import type { RxDatabase } from 'rxdb';
import type { WooReferencePayload } from './reference-collection-schema';
import type { SyncCollectionName } from './engine-collections';

type WooPayload = Record<string, unknown> & { id?: number };

/**
 * Payload → stored document. `barcodeSelectors` are the ACTIVE SCOPE's barcode
 * carriers (materialization/barcode-selectors): the projection is otherwise
 * pure, so every caller must hand the scope it is writing into — omitting them
 * materializes no `barcode` field.
 */
type RecordProjection = (
	payload: WooPayload,
	barcodeSelectors?: BarcodeSelectors
) => Record<string, unknown>;

/** shape: 'targeted' — pulled by id, deleted by tombstone. */
export type TargetedDescriptor = {
	shape: 'targeted';
	collection: Extract<SyncCollectionName, 'products' | 'variations' | 'customers'>;
	/** The detection vocabulary this collection appears under in sequence-log rows. */
	hybrid: HybridCollection;
	/** Namespaced read path for the include-chunked pull (under site.syncBaseUrl). */
	pullPath: string;
	/** The document field carrying the numeric Woo id — delete resolution selector. */
	wooIdField: 'remoteId';
	/**
	 * Response-body → pull items. /products and /customers return a BARE wc/v3
	 * array; the lab /variations endpoint returns `{ documents: [{ id,
	 * parent_id, payload, _rxdb_digest? }] }` — each endpoint's envelope is the
	 * descriptor's fact, not the puller's guess.
	 */
	parse: (body: unknown) => WooPayload[];
	project: RecordProjection;
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
export function parseVariationsEnvelope(body: unknown): WooPayload[] {
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
	project: RecordProjection;
	write?: CollectionWriteFacet;
};

/** shape: 'upsert-refresh' — refresh never prunes; deletes tombstone by id. */
export type UpsertRefreshDescriptor = {
	shape: 'upsert-refresh';
	collection: Extract<SyncCollectionName, 'taxRates'>;
	hybrid: Extract<HybridCollection, 'tax_rates'>;
	refreshPath: string;
	tombstoneIdFor: (remoteId: RemoteId) => string;
	project: RecordProjection;
};

/** A successful create/update push, resolved for the ack write-back. */
export type WriteAck = {
	mutation: { mutationId: string; operation: 'create' | 'update' | 'delete'; recordId: string };
	recordId: string;
	remoteId: RemoteId | null;
	currentRevision: string | null;
	document?: Record<string, unknown> | null;
	/**
	 * The acking SCOPE's live barcode-carrier READER (see
	 * materialization/barcode-selectors: anything spanning awaits holds the
	 * reader and calls it at the point of use — reconcile awaits its resident
	 * lookup before projecting, so a snapshot taken at ack construction could
	 * re-materialize `payload.barcode` by carriers a concurrent config poll
	 * already replaced). Ack-document adoption re-materializes the payload, and
	 * materializing without the scope's carriers would drop the stored barcode.
	 */
	barcodeSelectors?: BarcodeSelectorsReader;
	/**
	 * The RAW server document, kept even when `document` is deliberately withheld
	 * from value adoption (the born-twice arm). Identity-only source for
	 * `graftAckIdentity` (#818): taking an id off an existing server record is
	 * always safe; taking its VALUES over a local edit is not.
	 */
	identityDocument?: Record<string, unknown> | null;
};

/**
 * Graft server-assigned CHILD-ROW identity onto a LOCAL payload without
 * adopting any of the source's values (#818). The source is an ack document at
 * ack time and the resident's stored payload at push time — both carry the same
 * `{ id, meta_data }` line shape. Distinct from `documentPatchFromAckDocument`,
 * which replaces the payload wholesale and is therefore only safe when nothing
 * is queued behind the ack.
 *
 * Returning the SAME reference means "nothing to graft".
 */
export type AckIdentityGraft = (
	payload: Record<string, unknown>,
	source: Record<string, unknown>
) => Record<string, unknown>;

/**
 * A collection's rule for turning "what the resident holds" plus "what the ack
 * projected" into the payload actually stored (#946 / R1).
 *
 * Wholesale replacement — the old behaviour — reads every property of the ack
 * document as an assertion, including the ones it never made. Two are load-bearing
 * for orders: a TRIMMED projection that omits `line_items` would delete the cart,
 * and a 2dp rendering of `6.713280` would silently destroy precision the server
 * never disputed. A collection with no such subtleties omits this and keeps the
 * wholesale patch.
 */
export type AckPayloadAdoption = (
	localPayload: Record<string, unknown>,
	adoptedPayload: Record<string, unknown>
) => Record<string, unknown>;

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
	remoteIdField: 'remoteId';
	/**
	 * Read one server document through this collection's existing include-pull
	 * shape. `barcodeSelectors` are the calling SCOPE's carriers: the result is
	 * materialized by the same projection an ordinary pull uses, so a caller that
	 * WRITES the document (conflict discard restoring server truth) must pass
	 * them or the restored row loses its `barcode`. A caller that only reads
	 * `sync.revision` off the result may omit them.
	 */
	fetchServerDocument: (input: {
		fetch: Fetcher;
		syncBaseUrl: string;
		remoteId: RemoteId;
		signal?: AbortSignal;
		barcodeSelectors?: BarcodeSelectors;
	}) => Promise<Record<string, unknown> | null>;
	/** Pull/ack payload → the exact stored shape used by ordinary materialization. */
	documentFromServerPayload: (
		payload: Record<string, unknown>,
		barcodeSelectors?: BarcodeSelectors
	) => Record<string, unknown>;
	/** Missing-row ack/discard write-back through the collection's repository seam. */
	upsertServerDocument: (db: RxDatabase, document: Record<string, unknown>) => Promise<void>;
	/** Create/update ack: re-anchor sync.revision, capture the remote id, drop
	 * the drained mutationId, clear dirty when nothing is pending. */
	reconcile: (db: RxDatabase, ack: WriteAck, signal?: AbortSignal) => Promise<void>;
	/**
	 * Identity-only projection (#818), used at BOTH ends of the write path: the
	 * ack teaches the RESIDENT the server's line ids, and every outgoing push
	 * re-grafts from that resident so a frozen queue snapshot never posts an
	 * id-less line. Present only for collections whose payload carries child rows
	 * the server keys by id — orders today.
	 */
	graftAckIdentity?: AckIdentityGraft;
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

function ackBookkeeping(options: {
	collection: CollectionWriteFacet['collection'];
	remoteIdField: CollectionWriteFacet['remoteIdField'];
	createAckSource?: 'woo-rest';
	documentPatchFromAckDocument: (
		document: Record<string, unknown>,
		barcodeSelectors?: BarcodeSelectors
	) => Record<string, unknown>;
	preserveMetaKeys?: string[];
	graftAckIdentity?: AckIdentityGraft;
	adoptPayload?: AckPayloadAdoption;
}): Pick<CollectionWriteFacet, 'reconcile' | 'onDeleteAck'> {
	const {
		collection,
		remoteIdField,
		createAckSource,
		documentPatchFromAckDocument,
		preserveMetaKeys,
		graftAckIdentity,
		adoptPayload,
	} = options;
	return {
		reconcile: async (db, ack, signal) => {
			if (signal?.aborted) return;
			const doc = (await db.collections[collection].findOne(ack.recordId).exec()) as AckDoc | null;
			if (!doc || signal?.aborted) return; // gone, or the scope switched — nothing to reconcile
			let ackDocumentPatch: Record<string, unknown> | null = null;
			if (ack.document && ack.mutation.operation !== 'delete') {
				try {
					// Point-of-use read: the resident lookup above awaited, so only now
					// are the carriers guaranteed current for this projection.
					ackDocumentPatch = documentPatchFromAckDocument(ack.document, ack.barcodeSelectors?.());
				} catch {
					// The push contract allows a trimmed ack document (a bare `{ id }`,
					// no uuid meta) the pull materializer cannot key. Adoption is
					// opportunistic — fall back to the bookkeeping-only ack rather than
					// failing an ack for a write the server already applied.
					ackDocumentPatch = null;
				}
			}
			await doc.incrementalModify((data) => {
				const local = (data.local ?? {}) as { dirty?: boolean; pendingMutationIds?: string[] };
				const pending = (
					Array.isArray(local.pendingMutationIds) ? local.pendingMutationIds : []
				).filter((id) => id !== ack.mutation.mutationId);
				const sync = (data.sync ?? {}) as { revision?: string; source?: string };
				let adoptionPatch = ackDocumentPatch;
				if (adoptionPatch && (preserveMetaKeys || adoptPayload) && pending.length === 0) {
					const localPayload = (data.payload ?? {}) as Record<string, unknown>;
					let adoptedPayload = (adoptionPatch.payload ?? {}) as Record<string, unknown>;
					// The collection's own adoption rule runs FIRST — it decides what the
					// ack actually ASSERTED, before any meta bookkeeping (see the orders
					// facet: an omitted key is silence, not a deletion, and a narrower
					// rendering of the same number is not a correction).
					if (adoptPayload) adoptedPayload = adoptPayload(localPayload, adoptedPayload);
					if (preserveMetaKeys) {
						const localMeta = Array.isArray(localPayload.meta_data) ? localPayload.meta_data : [];
						const adoptedMeta = Array.isArray(adoptedPayload.meta_data)
							? [...adoptedPayload.meta_data]
							: [];
						for (const key of preserveMetaKeys) {
							const localEntry = localMeta.find((entry) => entry?.key === key);
							if (!localEntry) continue;
							const index = adoptedMeta.findIndex((entry) => entry?.key === key);
							if (index === -1) adoptedMeta.push(localEntry);
							else adoptedMeta[index] = localEntry;
						}
						adoptedPayload = { ...adoptedPayload, meta_data: adoptedMeta };
					}
					adoptionPatch = withOrderColumns({ ...adoptionPatch, payload: adoptedPayload });
				}
				const adopting = adoptionPatch !== null && pending.length === 0;
				// #818: when adoption is SKIPPED — a successor is queued, the ack
				// document was not materializable, or the born-twice arm withheld it —
				// the resident would keep its pre-create, ID-LESS lines, and every push
				// built from it makes WooCommerce APPEND duplicates. Take the server's
				// line IDENTITY (and nothing else) so local values still win.
				let identityPatch: Record<string, unknown> = {};
				if (!adopting && graftAckIdentity && ack.identityDocument) {
					const residentPayload = (data.payload ?? {}) as Record<string, unknown>;
					const grafted = graftAckIdentity(residentPayload, ack.identityDocument);
					// Payload ONLY: the promoted filter/sort columns derive from values
					// this graft never touches, so re-promoting them here would smuggle
					// the ack's status/total past the pending-successor guard.
					if (grafted !== residentPayload) identityPatch = { payload: grafted };
				}
				return {
					...data,
					...(adopting && adoptionPatch ? adoptionPatch : identityPatch),
					[remoteIdField]:
						ack.mutation.operation === 'create'
							? (remoteIdOrNull(ack.remoteId) ?? data[remoteIdField])
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
	TargetedDescriptor | GreedyPrunableDescriptor | UpsertRefreshDescriptor | LocalOnlyDescriptor;

const productDocument: RecordProjection = (rawPayload, barcodeSelectors) =>
	materializeTargeted('products', rawPayload, barcodeSelectorsFor(barcodeSelectors, 'products'))
		.storedDocument;

export const variationDocument: RecordProjection = (rawPayload, barcodeSelectors) =>
	materializeTargeted('variations', rawPayload, barcodeSelectorsFor(barcodeSelectors, 'variations'))
		.storedDocument;

const customerDocument: RecordProjection = (rawPayload) =>
	materializeTargeted('customers', rawPayload).storedDocument;

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
	project: RecordProjection;
	createAckSource?: 'woo-rest';
	/**
	 * REQUIRED (#1231): every writeable collection must declare what the
	 * resident adopts from a create/update ack document. The ack re-anchors
	 * sync.revision to the server's post-write value, which blinds all three
	 * staleness-detection tiers to any divergence — so an ack whose values are
	 * dropped leaves server-derived fields stale with no layer left to heal
	 * them. Wholesale projected adoption (catalogAckPatch) is the default
	 * shape; orders declares trimmed-ack/money-precision rules via
	 * adoptPayload on top. Opting OUT is not expressible by omission.
	 */
	documentPatchFromAckDocument: (
		document: Record<string, unknown>,
		barcodeSelectors?: BarcodeSelectors
	) => Record<string, unknown>;
	preserveMetaKeys?: string[];
	graftAckIdentity?: AckIdentityGraft;
	adoptPayload?: AckPayloadAdoption;
	upsert?: CollectionWriteFacet['upsertServerDocument'];
}): CollectionWriteFacet {
	return {
		collection: input.collection,
		remoteIdField: input.remoteIdField,
		...(input.graftAckIdentity ? { graftAckIdentity: input.graftAckIdentity } : {}),
		documentFromServerPayload: (payload, barcodeSelectors) =>
			input.project(payload as WooPayload, barcodeSelectors),
		fetchServerDocument: async ({ fetch, syncBaseUrl, remoteId, signal, barcodeSelectors }) => {
			const search = new URLSearchParams({
				include: `${wooIdOf(remoteId)}`,
				per_page: '1',
			});
			const response = await fetch(`${syncBaseUrl}${input.pullPath}?${search.toString()}`, {
				...(signal ? { signal } : {}),
			});
			if (!response.ok) {
				throw new Error(`${input.pullPath} revision refresh failed: HTTP ${response.status}`);
			}
			const [payload] = input.parse(await response.json());
			return payload ? input.project(payload, barcodeSelectors) : null;
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
		...ackBookkeeping({
			collection: input.collection,
			remoteIdField: input.remoteIdField,
			...(input.createAckSource ? { createAckSource: input.createAckSource } : {}),
			documentPatchFromAckDocument: input.documentPatchFromAckDocument,
			...(input.preserveMetaKeys ? { preserveMetaKeys: input.preserveMetaKeys } : {}),
			...(input.graftAckIdentity ? { graftAckIdentity: input.graftAckIdentity } : {}),
			...(input.adoptPayload ? { adoptPayload: input.adoptPayload } : {}),
		}),
	};
}

/**
 * Ack adoption for targeted catalog collections (#1231): WooCommerce derives
 * fields the client cannot compute (stock_status from a stock_quantity edit,
 * date_modified, price rollups), and the ack re-anchors sync.revision to the
 * server's post-write value — so a dropped ack document leaves those fields
 * stale locally with the pull plane believing the row is current. Adopt the
 * projected server document, minus the identity/bookkeeping keys `reconcile`
 * owns (it re-stamps remoteId/sync/local itself after the spread; adopting
 * `id` could collide with the primary key). Wholesale payload replacement is
 * the documented default for collections without orders' trimmed-ack/money
 * subtleties; a non-materializable ack document (bare `{ id }`, no uuid meta)
 * throws in the projection and falls back to the bookkeeping-only ack.
 */
function catalogAckPatch(
	project: RecordProjection,
	document: Record<string, unknown>,
	barcodeSelectors?: BarcodeSelectors
): Record<string, unknown> {
	const {
		uuid: _uuid,
		sync: _sync,
		local: _local,
		remoteId: _remoteId,
		...patch
	} = project(document as WooPayload, barcodeSelectors);
	return patch;
}

const productsWriteFacet = createWriteFacet({
	collection: 'products',
	remoteIdField: 'remoteId',
	pullPath: '/products',
	parse: parseBareArray,
	project: productDocument,
	documentPatchFromAckDocument: (document, barcodeSelectors) =>
		catalogAckPatch(productDocument, document, barcodeSelectors),
});
const variationsWriteFacet = createWriteFacet({
	collection: 'variations',
	remoteIdField: 'remoteId',
	pullPath: '/variations',
	parse: parseVariationsEnvelope,
	project: variationDocument,
	documentPatchFromAckDocument: (document, barcodeSelectors) =>
		catalogAckPatch(variationDocument, flattenVariationAckDocument(document), barcodeSelectors),
});

/**
 * The variation push ack `document` is the SAME wrapper shape the pull
 * envelope carries — `{ id, parent_id, payload, _rxdb_digest? }` with identity
 * and the REST fields inside `payload` (Write_Controller::document_for) — so
 * it must be flattened exactly like parseVariationsEnvelope flattens a pull
 * row before the flat-payload projection can key it. Passing the wrapper
 * straight through leaves no top-level meta_data, identifyRecord throws, and
 * adoption silently degrades to the bookkeeping-only ack. A document that is
 * already flat (defensive: no nested payload object) passes through untouched.
 */
function flattenVariationAckDocument(document: Record<string, unknown>): Record<string, unknown> {
	if (typeof document.payload !== 'object' || document.payload === null) return document;
	const [flattened] = parseVariationsEnvelope({ documents: [document] });
	return flattened ?? document;
}
const customersWriteFacet = createWriteFacet({
	collection: 'customers',
	remoteIdField: 'remoteId',
	pullPath: '/customers',
	parse: parseBareArray,
	project: customerDocument,
	documentPatchFromAckDocument: (document, barcodeSelectors) =>
		catalogAckPatch(customerDocument, document, barcodeSelectors),
});
const couponsWriteFacet = createWriteFacet({
	collection: 'coupons',
	remoteIdField: 'remoteId',
	pullPath: '/coupons',
	parse: parseBareArray,
	project: referenceDocument,
	// Greedy reference pruning recognizes only server-sourced rows. Once Woo
	// assigns the create's id, the coupon participates in authoritative pruning.
	createAckSource: 'woo-rest',
	// Woo normalizes coupon codes to lowercase and derives usage_count/date
	// fields server-side — the ack document is the only prompt carrier of them.
	documentPatchFromAckDocument: (document, barcodeSelectors) =>
		catalogAckPatch(referenceDocument, document, barcodeSelectors),
});
/** The order facet retains its repository and pull-side materializer byte-for-byte. */
const ordersWriteFacet = createWriteFacet({
	collection: 'orders',
	remoteIdField: 'remoteId',
	pullPath: '/orders',
	parse: parseBareArray,
	project: orderDocument,
	// The stored order row promotes filter/sort columns from the payload
	// (withOrderColumns is the single promotion mapping) — adopt them together
	// with the payload so order-list filters/sorts see the acked totals too.
	documentPatchFromAckDocument: (document) =>
		withOrderColumns({
			payload: orderDocument(document as WooPayload).payload as WooOrderPayload,
		}) as unknown as Record<string, unknown>,
	preserveMetaKeys: [...POS_ORDER_IDENTITY_META_KEYS],
	// R1, the adoption half of the mirror contract. Two rules, both about what the
	// ack DIDN'T say:
	//  - key presence: the write contract permits a TRIMMED ack document, so a key
	//    the server omitted keeps the resident's value. Wholesale adoption read an
	//    omitted `line_items` as an empty cart and deleted the sale's lines.
	//  - money width: a 2dp rendering of the same number is a serialization width,
	//    not a correction (#946). Keeping the six-decimal local value preserves the
	//    sub-cent tax components 1.9 shipped AND stops the cart from patching the
	//    rounded value straight back — an oscillation the cashier never asked for.
	//    A number that genuinely CHANGED is adopted verbatim: server is truth.
	adoptPayload: (localPayload, adoptedPayload) =>
		preserveEquivalentLocalPrecision(localPayload, { ...localPayload, ...adoptedPayload }),
	// #818: WooCommerce APPENDS an order line posted without an `id`. Adoption is
	// skipped while a successor is queued, so without this the resident — and
	// every push built from it — keeps posting ID-LESS lines and duplicates the
	// cart. Identity only, never a value. The display-field strip re-applies
	// because a payload may predate it (#885/#890) and this rewrites line arrays.
	graftAckIdentity: (payload, source) =>
		stripNonStringMetaDisplayFields(graftServerLineIdentity(payload, source)),
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
		wooIdField: 'remoteId',
		parse: parseBareArray,
		project: productDocument,
		write: productsWriteFacet,
	},
	{
		shape: 'targeted',
		collection: 'variations',
		hybrid: 'variations',
		pullPath: '/variations',
		wooIdField: 'remoteId',
		parse: parseVariationsEnvelope,
		project: variationDocument,
		write: variationsWriteFacet,
	},
	{
		shape: 'targeted',
		collection: 'customers',
		hybrid: 'customers',
		pullPath: '/customers',
		wooIdField: 'remoteId',
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

/**
 * Finds the write facet for a sync collection.
 *
 * @param collection - Collection name to look up.
 * @returns The collection's write facet, or null when the collection is not writeable.
 */
export function writeFacetFor(collection: string): CollectionWriteFacet | null {
	const descriptor = COLLECTION_DESCRIPTORS.find((d) => d.collection === collection);
	if (!descriptor || !('write' in descriptor) || !descriptor.write) return null;
	return descriptor.write;
}

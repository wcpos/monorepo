import type { RemoteId } from '@wcpos/sync-core';
import type {
	CouponDocument,
	CustomerDocument,
	OrderDocument,
	ProductBrandDocument,
	ProductCategoryDocument,
	ProductDocument,
	ProductTagDocument,
	ProductVariationDocument,
	TaxRateDocument,
} from '@wcpos/database';

import type { RxDocument } from 'rxdb';

/**
 * The engine record interface — a TYPE DISCIPLINE, not a runtime layer (ADR 0028).
 *
 * An engine record IS the RxDocument: immutable snapshot instances, doc-cache identity
 * (new instance ⟺ changed data), `getLatest()` as the explicit escape to current. Nothing
 * here wraps, caches, or re-emits; these types give the domain a typed face onto what the
 * engine already stores.
 */

/** Local record identity — the engine primary key. Never derived from, or compared to, a RemoteId. */
export type Uuid = string & { readonly __localUuid: true };

/**
 * The client's document model, per collection: the payload the engine stores intact under
 * `payload`. Woo-shaped because Woo defined it first — a future backend driver materializes
 * this same shape at ingest (ADR 0029). Derived from the existing `@wcpos/database` document
 * types (minus the legacy `uuid` storage key, which is engine-level identity, not payload).
 */
type LegacyDataOf<TDoc> = TDoc extends { toMutableJSON: () => infer TData } ? TData : never;

export type EngineRecordCollectionName =
	| 'orders'
	| 'products'
	| 'variations'
	| 'customers'
	| 'taxRates'
	| 'categories'
	| 'tags'
	| 'brands'
	| 'coupons';

type LegacyDocumentByCollection = {
	orders: OrderDocument;
	products: ProductDocument;
	variations: ProductVariationDocument;
	customers: CustomerDocument;
	taxRates: TaxRateDocument;
	categories: ProductCategoryDocument;
	tags: ProductTagDocument;
	brands: ProductBrandDocument;
	coupons: CouponDocument;
};

export type PayloadOf<C extends EngineRecordCollectionName> = Omit<
	LegacyDataOf<LegacyDocumentByCollection[C]>,
	'uuid'
>;

/** Sync metadata the engine stamps on every record (see `@wcpos/sync-core` protocol). */
export interface EngineRecordSyncState {
	revision: string;
	checkpoint: unknown;
	partial: boolean;
	source: string;
}

/** Local write bookkeeping (absent on collections without a write facet, e.g. taxRates). */
export interface EngineRecordLocalState {
	dirty: boolean;
	pendingMutationIds: string[];
}

/**
 * The stored shape of one engine record. Promoted filter/sort columns are deliberately NOT
 * enumerated here — they are engine/query-plane vocabulary owned by the collection registry,
 * not part of the domain's record face. Domain code reads `payload`; the executor reads
 * promoted columns through the registry.
 */
export type EngineRecordShape<C extends EngineRecordCollectionName> = {
	uuid: Uuid;
	/** Backend identity, minted by the driver at the wire. `null` = never acknowledged. */
	remoteId: RemoteId | null;
	payload: PayloadOf<C>;
	sync: EngineRecordSyncState;
	local?: EngineRecordLocalState;
};

/** An engine record: the RxDocument itself, typed. */
export type EngineRecord<C extends EngineRecordCollectionName> = RxDocument<EngineRecordShape<C>>;

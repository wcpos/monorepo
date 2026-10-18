import { normalizeMangoQuery, prepareQuery } from 'rxdb';
import { combineLatest, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { remoteIdOrNull } from '@wcpos/sync-core';
import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { observeEngineDatabases } from '../engine-query';
import { engineCollection } from '../records/engine-collection';

import type { ProductPayload, VariationPayload } from '../records/order-lines';

type StockPayload = ProductPayload | VariationPayload;

export async function readStockPayload(
	engine: RxdbSyncEngine,
	collectionName: 'products' | 'variations',
	wooId: number
) {
	const collection = engineCollection(engine.active()?.database, collectionName);
	if (!collection) return null;
	const remoteId = remoteIdOrNull(wooId);
	if (remoteId === null) return null;
	const result = await collection.findOne({ selector: { remoteId } }).exec();
	if (result) {
		return result.getLatest().payload as StockPayload;
	}
	// Catalog primary keys are server UUIDs, not IDs derived from the Woo id.
	// RxQuery hides tombstones; query storage explicitly for the deleted remote id.
	const schema = collection.schema.jsonSchema;
	const {
		documents: [deletedDocument],
	} = await collection.storageInstance.query(
		prepareQuery(
			schema,
			normalizeMangoQuery(schema, {
				selector: { remoteId, _deleted: true },
				limit: 1,
			})
		)
	);
	const payload = (deletedDocument as { payload?: unknown } | undefined)?.payload;
	return payload !== null && typeof payload === 'object' ? (payload as StockPayload) : null;
}

/** The record whose stock a line draws on: the variation when it manages its own, else the product. */
export async function resolveStockOwnerId(
	engine: RxdbSyncEngine,
	productId: number,
	variationId = 0
) {
	if (!variationId) return productId;
	const variation = await readStockPayload(engine, 'variations', variationId);
	if (!variation) return variationId;
	return variation.manage_stock === true ? variationId : productId;
}

const inIds = (ids: (number | null | undefined)[]) => ({
	remoteId: {
		$in: [...new Set(ids)].map((id) => remoteIdOrNull(id ?? 0)).filter((id) => id !== null),
	},
});

/** Rebound to each database; availability keeps the cart idle during a scope gap. */
export function observeCatalogByWooIds(
	engine: RxdbSyncEngine,
	{
		productIds,
		variationIds,
	}: {
		productIds: (number | null | undefined)[];
		variationIds: (number | null | undefined)[];
	}
) {
	return observeEngineDatabases(engine).pipe(
		switchMap((database) => {
			const products = engineCollection(database, 'products');
			const variations = engineCollection(database, 'variations');
			return products && variations
				? combineLatest([
						products.find({ selector: inIds(productIds) }).$,
						variations.find({ selector: inIds(variationIds) }).$,
					]).pipe(map(([products, variations]) => ({ products, variations, available: true })))
				: of({ products: [], variations: [], available: false });
		})
	);
}

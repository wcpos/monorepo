import { engineCollection, type useQueryRuntime } from '@wcpos/query';
import { catalogDocumentId, remoteIdOrNull } from '@wcpos/sync-core';

import type { StockFields } from './stock-guard';

type StockDocument = StockFields & { id?: number; name?: string };

export async function readStockDocument(
	runtime: ReturnType<typeof useQueryRuntime>,
	collectionName: 'products' | 'variations',
	wooId: number
) {
	const collection = engineCollection(runtime.engine.active()?.database, collectionName);
	if (!collection) return null;
	const remoteId = remoteIdOrNull(wooId);
	if (remoteId === null) return null;
	const result = await collection.findOne({ selector: { remoteId } }).exec();
	if (result) {
		return result.getLatest().payload as StockDocument;
	}
	const documentId = catalogDocumentId(
		collectionName === 'products' ? 'product' : 'variation',
		remoteId
	);
	const [deletedDocument] = await collection.storageInstance.findDocumentsById([documentId], true);
	const payload = (deletedDocument as { payload?: unknown } | undefined)?.payload;
	return payload !== null && typeof payload === 'object' ? (payload as StockDocument) : null;
}

/** The record whose stock a line draws on: the variation when it manages its own, else the product. */
export async function resolveStockOwnerId(
	runtime: ReturnType<typeof useQueryRuntime>,
	productId: number,
	variationId = 0
) {
	if (!variationId) return productId;
	const variation = await readStockDocument(runtime, 'variations', variationId);
	if (!variation) return variationId;
	return variation.manage_stock === true ? variationId : productId;
}

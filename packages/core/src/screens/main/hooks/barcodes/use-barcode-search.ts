import * as React from 'react';

import { useQueryManager } from '@wcpos/query';
import { wrapEngineDocument } from '@wcpos/query/engine-adapter/document-proxy';
import { buildLocalBarcodeIndex } from '@wcpos/sync-core';

type ProductDocument = import('@wcpos/database').ProductDocument;
type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;
type EngineRxDocument = Parameters<typeof wrapEngineDocument>[1];

function isEngineRxDocument(value: unknown): value is EngineRxDocument {
	if (value === null || typeof value !== 'object') {
		return false;
	}
	const candidate = value as {
		id?: unknown;
		payload?: unknown;
		getLatest?: unknown;
		collection?: unknown;
	};
	return (
		typeof candidate.id === 'string' &&
		candidate.payload !== null &&
		typeof candidate.payload === 'object' &&
		typeof candidate.getLatest === 'function' &&
		candidate.collection !== null &&
		typeof candidate.collection === 'object'
	);
}

function engineDocuments(value: unknown): EngineRxDocument[] {
	return Array.isArray(value) ? value.filter(isEngineRxDocument) : [];
}

function matchesBarcode(document: EngineRxDocument, barcode: string): boolean {
	const payload = document.payload;
	if (!payload) {
		return false;
	}
	return buildLocalBarcodeIndex([{ id: document.id, payload }]).index.has(barcode);
}

export const useBarcodeSearch = () => {
	const manager = useQueryManager();

	/**
	 * Searches for a barcode in the product and variation collections.
	 *
	 * @param barcode - The barcode to search for.
	 * @returns {Promise<(ProductDocument | ProductVariationDocument)[]>} - A promise that resolves to an array containing the search results.
	 */
	const barcodeSearch = React.useCallback(
		async (barcode: string): Promise<(ProductDocument | ProductVariationDocument)[]> => {
			const normalizedBarcode = barcode.trim();
			if (normalizedBarcode === '') {
				return [];
			}

			// Resolve on every scan: a store-scope move replaces the active engine database.
			const collections = manager.engine.active()?.database.collections;
			const productCollection = collections?.products;
			const variationsCollection = collections?.variations;
			if (!productCollection || !variationsCollection) {
				return [];
			}

			// Phase 1 ceiling: barcode fields live in the unindexable payload blob, so scan both
			// collections once per (rare) scan until the payload-blob indexing debt is retired.
			const [productResult, variationResult] = await Promise.all([
				productCollection.find().exec(),
				variationsCollection.find().exec(),
			]);
			const products = engineDocuments(productResult);
			const variations = engineDocuments(variationResult);

			return [
				...products
					.filter((document) => matchesBarcode(document, normalizedBarcode))
					.map((document) => wrapEngineDocument<ProductDocument>('products', document)),
				...variations
					.filter((document) => matchesBarcode(document, normalizedBarcode))
					.map((document) => wrapEngineDocument<ProductVariationDocument>('variations', document)),
			];
		},
		[manager]
	);

	const findProductById = React.useCallback(
		async (productId: number): Promise<ProductDocument | null> => {
			// Resolve on every call so parent lookup follows a concurrent store-scope move.
			const productCollection = manager.engine.active()?.database.collections.products;
			if (!productCollection) {
				return null;
			}
			const result = await productCollection
				.findOne({ selector: { wooProductId: productId } })
				.exec();
			return isEngineRxDocument(result)
				? wrapEngineDocument<ProductDocument>('products', result)
				: null;
		},
		[manager]
	);

	return { barcodeSearch, findProductById };
};

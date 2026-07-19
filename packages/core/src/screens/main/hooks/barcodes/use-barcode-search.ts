import * as React from 'react';

import { useQueryManager } from '@wcpos/query';
import { wrapEngineDocument } from '@wcpos/query/engine-compat';
import {
	barcodeMatchCandidates,
	buildBarcodeSymbologyIndex,
	buildLocalBarcodeIndex,
} from '@wcpos/sync-core';

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

/** The document carries the scanned code verbatim in a barcode-symbology field. */
function matchesExactSymbology(document: EngineRxDocument, barcode: string): boolean {
	const payload = document.payload;
	if (!payload) {
		return false;
	}
	return buildBarcodeSymbologyIndex([{ id: document.id, payload }]).index.has(barcode);
}

/**
 * The document carries the UPC-A/EAN-13 counterpart of the scanned code in a
 * barcode-symbology field (#740). Scoped to barcode fields so a numeric SKU
 * never gains an equivalent form, and excludes the exact code (a higher tier) so
 * this is strictly the equivalence match.
 */
function matchesEquivalentSymbology(document: EngineRxDocument, barcode: string): boolean {
	const payload = document.payload;
	if (!payload) {
		return false;
	}
	const { index } = buildBarcodeSymbologyIndex([{ id: document.id, payload }]);
	return barcodeMatchCandidates(barcode).some(
		(candidate) => candidate !== barcode && index.has(candidate)
	);
}

/** The document carries the scanned code verbatim in any discovery field (incl. SKU). */
function matchesExactAnyField(document: EngineRxDocument, barcode: string): boolean {
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

			const select = (predicate: (document: EngineRxDocument) => boolean) => [
				...products
					.filter(predicate)
					.map((document) => wrapEngineDocument<ProductDocument>('products', document)),
				...variations
					.filter(predicate)
					.map((document) => wrapEngineDocument<ProductVariationDocument>('variations', document)),
			];

			// Precedence (#740), first non-empty tier wins so a scan never turns
			// falsely ambiguous:
			//   1. exact match on a barcode field — the product literally has this barcode;
			//   2. UPC-A/EAN-13 equivalent on a barcode field — the leading-zero twin;
			//   3. exact match on any field, incl. SKU — a coincidental SKU string.
			// Barcode semantics rank above a SKU coincidence: an unrelated product whose
			// SKU equals the scanned digits must not preempt a genuine barcode equivalence.
			const symbologyExact = select((document) =>
				matchesExactSymbology(document, normalizedBarcode)
			);
			if (symbologyExact.length > 0) {
				return symbologyExact;
			}
			const symbologyEquivalent = select((document) =>
				matchesEquivalentSymbology(document, normalizedBarcode)
			);
			if (symbologyEquivalent.length > 0) {
				return symbologyEquivalent;
			}
			return select((document) => matchesExactAnyField(document, normalizedBarcode));
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

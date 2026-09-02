import * as React from 'react';

import { engineCollection, type EngineRecord, useQueryRuntime } from '@wcpos/query';
import { barcodeMatchCandidates, buildLocalBarcodeIndex, remoteIdOrNull } from '@wcpos/sync-core';

/**
 * The barcode carriers of the engine's ACTIVE scope, per materialized
 * collection — the scan reads them off the scope it is scanning, so a store
 * switch cannot leave a previous site's carriers in play.
 */
type ActiveBarcodeSelectors = { products: readonly string[]; variations: readonly string[] };
const NO_BARCODE_SELECTORS: ActiveBarcodeSelectors = { products: [], variations: [] };

type CatalogRecord = EngineRecord<'products'> | EngineRecord<'variations'>;

/** The document carries the scanned code verbatim in a barcode-symbology field. */
function matchesExactSymbology(document: CatalogRecord, barcode: string): boolean {
	const materialized = document.payload?.barcode;
	return typeof materialized === 'string' && materialized.trim() === barcode;
}

/**
 * The document carries the UPC-A/EAN-13 counterpart of the scanned code in its
 * MATERIALIZED barcode field (#740) — the value of whichever carrier the store's
 * representation config declares to be its barcode. Excludes the exact code (a
 * higher tier) so this is strictly the equivalence match.
 *
 * Reading only `payload.barcode` is what keeps #740's protection intact: a raw
 * `sku` the store has NOT declared as its barcode carrier is never materialized
 * into `payload.barcode`, so an arbitrary numeric stock code still cannot gain a
 * 0-prefixed twin. This deliberately no longer excludes a store whose declared
 * carrier IS `sku` — there the merchant has said those values are barcodes, and
 * refusing equivalence disabled the feature for exactly the stores that keep
 * their GTINs in the SKU field. That exclusion is how a UPC-A scanned by the
 * camera (zxing reports every UPC symbol in its 13-digit GTIN form) missed a
 * product that a HID wedge, reading the same symbol as the printed 12 digits,
 * resolved and added to the cart.
 */
function matchesEquivalentSymbology(
	document: CatalogRecord,
	barcode: string,
	symbology?: string
): boolean {
	const materialized = document.payload?.barcode;
	if (typeof materialized !== 'string') {
		return false;
	}
	return barcodeMatchCandidates(barcode, symbology).some(
		(candidate) => candidate !== barcode && candidate === materialized.trim()
	);
}

/** The document carries the scanned code verbatim in any discovery field (incl. SKU). */
function matchesExactAnyField(document: CatalogRecord, barcode: string): boolean {
	const payload = document.payload;
	if (!payload) {
		return false;
	}
	return buildLocalBarcodeIndex([{ id: document.uuid, payload }]).index.has(barcode);
}

function matchesEquivalentGlobalId(
	document: CatalogRecord,
	barcode: string,
	symbology?: string
): boolean {
	const value = document.payload?.global_unique_id;
	return (
		typeof value === 'string' && barcodeMatchCandidates(barcode, symbology).includes(value.trim())
	);
}

export const useBarcodeSearch = () => {
	const runtime = useQueryRuntime();

	/**
	 * Searches for a barcode in the product and variation collections.
	 *
	 * @param barcode - The barcode to search for.
	 * @returns {Promise<(ProductDocument | ProductVariationDocument)[]>} - A promise that resolves to an array containing the search results.
	 */
	const barcodeSearch = React.useCallback(
		async (
			barcode: string,
			// The symbology the scan source reported, when there was one. Only an
			// 8-digit UPC-E needs it — it is otherwise indistinguishable from an
			// EAN-8 — so a caller without one (the products screen's plain barcode
			// stream, a typed search) still resolves every other form.
			symbology?: string
		): Promise<(EngineRecord<'products'> | EngineRecord<'variations'>)[]> => {
			const normalizedBarcode = barcode.trim();
			if (normalizedBarcode === '') {
				return [];
			}

			// Resolve on every scan: a store-scope move replaces the active engine
			// database AND its barcode carriers — read both off the same scope.
			const scope = runtime.engine.active();
			const selectors: ActiveBarcodeSelectors = scope?.barcodeSelectors ?? NO_BARCODE_SELECTORS;
			const productCollection = engineCollection(scope?.database, 'products');
			const variationsCollection = engineCollection(scope?.database, 'variations');
			if (!productCollection || !variationsCollection) {
				return [];
			}

			// Phase 1 ceiling: barcode fields live in the unindexable payload blob, so scan both
			// collections once per (rare) scan until the payload-blob indexing debt is retired.
			const [productResult, variationResult] = await Promise.all([
				productCollection.find().exec(),
				variationsCollection.find().exec(),
			]);
			const products = productResult.filter(
				(document) =>
					selectors.products.length > 0 &&
					document.payload?.status === 'publish' &&
					// A products-collection document claiming to be a variation is misfiled
					// (Woo answered the `sku=` leg from both post types while the search
					// lane still sent it; the lane no longer does, and scope-open purges
					// old residue). Guarding here too keeps a scan from turning falsely
					// ambiguous — the same record matching once per collection — while a
					// polluted store is still open, or if any future path misfiles again.
					// String() because
					// the payload TYPE already forbids 'variation'; this guards data
					// written outside that contract.
					String(document.payload?.type) !== 'variation'
			);
			const variations = variationResult.filter(
				(document) => selectors.variations.length > 0 && document.payload?.status === 'publish'
			);

			const select = (predicate: (document: CatalogRecord) => boolean) => [
				...products.filter(predicate),
				...variations.filter(predicate),
			];

			// Precedence (#740), first non-empty tier wins so a scan never turns
			// falsely ambiguous:
			//   1. exact match on the materialized barcode — the product literally has this barcode;
			//   2. UPC-A/EAN-13 equivalent on the materialized barcode — the leading-zero twin;
			//   3. UPC-A/EAN-13 equivalent on the global_unique_id fallback field;
			//   4. exact match on any field, incl. SKU — a coincidental SKU string.
			// Barcode semantics rank above a SKU coincidence: an unrelated product whose
			// SKU equals the scanned digits must not preempt a genuine barcode
			// equivalence — including a global-ID equivalence while SKU is the
			// active carrier, so every equivalence tier runs before the exact-any
			// fallback.
			const symbologyExact = select((document) =>
				matchesExactSymbology(document, normalizedBarcode)
			);
			if (symbologyExact.length > 0) {
				return symbologyExact;
			}
			const symbologyEquivalent = select((document) =>
				matchesEquivalentSymbology(document, normalizedBarcode, symbology)
			);
			if (symbologyEquivalent.length > 0) {
				return symbologyEquivalent;
			}
			const globalIdEquivalent = select((document) =>
				matchesEquivalentGlobalId(document, normalizedBarcode, symbology)
			);
			if (globalIdEquivalent.length > 0) {
				return globalIdEquivalent;
			}
			return select((document) => matchesExactAnyField(document, normalizedBarcode));
		},
		[runtime]
	);

	const findProductById = React.useCallback(
		async (productId: number): Promise<EngineRecord<'products'> | null> => {
			// Resolve on every call so parent lookup follows a concurrent store-scope move.
			const productCollection = engineCollection(runtime.engine.active()?.database, 'products');
			if (!productCollection) {
				return null;
			}
			return productCollection
				.findOne({ selector: { remoteId: remoteIdOrNull(productId) } })
				.exec();
		},
		[runtime]
	);

	return { barcodeSearch, findProductById };
};

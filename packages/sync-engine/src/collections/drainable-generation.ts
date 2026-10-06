/**
 * The schemas of the DRAINABLE scope-database generation
 * (`DRAINABLE_SCOPE_DATABASE_GENERATION`, the one before the current).
 *
 * Pre-GA a schema edit moves the scope generation instead of the schema
 * version (see `productSchema`), so the previous generation's database holds
 * collections whose schema differs from today's at the SAME version — opening
 * it with today's recipe throws DB6. Its unsent sales still have to be sent
 * (`drainLegacyScopeDatabase`), so the drain opens it with exactly the schemas
 * that generation shipped: today's recipe with each moved schema put back.
 *
 * v5 → v6 moved one schema: products promoted `tagIds`. When the generation
 * moves again, this file becomes the schemas the NEW previous generation
 * shipped — and `DRAINABLE_SCHEMAS_GENERATION` below moves with it.
 * `schema-behaviour.test.ts` pins its digests as a literal map beside the
 * current ones, keyed by generation, and fails a bump that forgot this file.
 */

import {
	type CollectionWriteFacet,
	productDocument,
	productsWriteFacetProjectedBy,
	type RecordProjection,
	writeFacetFor,
} from './collection-descriptors';
import { type CollectionCreator, engineCollectionCreators } from './engine-collections';
import { productSchema } from './product-schema';

/**
 * The scope-database generation whose schemas this file reproduces. The engine
 * refuses to open the drainable generation with them unless this equals
 * `DRAINABLE_SCOPE_DATABASE_GENERATION` — a bump that left this file behind
 * fails closed (the drain reports `failed`) instead of opening a database with
 * the wrong schemas.
 */
export const DRAINABLE_SCHEMAS_GENERATION = 5;

const { tagIds: _promotedAtV6, ...drainableProductProperties } = productSchema.properties;

/** The product schema v5 shipped: today's minus the `tagIds` column v6 promoted. */
export const drainableGenerationProductSchema = {
	...productSchema,
	properties: drainableProductProperties,
	required: productSchema.required.filter((field) => field !== 'tagIds'),
};

/** The full addCollections() argument for a drainable-generation scope database. */
export function drainableGenerationCollectionCreators(): Record<string, CollectionCreator> {
	const creators = engineCollectionCreators();
	return {
		...creators,
		products: { ...creators.products, schema: drainableGenerationProductSchema },
	};
}

/**
 * The stored product document v5 wrote: today's projection without the
 * `tagIds` column v6 promoted. An acknowledgment the drain writes into a v5
 * database goes through this, so it fits `drainableGenerationProductSchema`
 * (today's projection would add `tagIds`, which that schema forbids).
 * `schema-behaviour.test.ts` pins it against the drainable schema.
 */
export const drainableGenerationProductDocument: RecordProjection = (payload, barcodeSelectors) => {
	const { tagIds: _promotedAtV6, ...document } = productDocument(payload, barcodeSelectors);
	return document;
};

const drainableProductsWriteFacet = productsWriteFacetProjectedBy(
	drainableGenerationProductDocument
);

/** The write facets a drainable-generation engine uses: today's, with each moved projection put back. */
export function drainableGenerationWriteFacetFor(collection: string): CollectionWriteFacet | null {
	return collection === 'products' ? drainableProductsWriteFacet : writeFacetFor(collection);
}

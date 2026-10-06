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
 * shipped; `schema-behaviour.test.ts` pins its digests beside the current ones.
 */

import { type CollectionCreator, engineCollectionCreators } from './engine-collections';
import { productSchema } from './product-schema';

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

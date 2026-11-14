/**
 * The schemas of the DRAINABLE scope-database generation
 * (`DRAINABLE_SCOPE_DATABASE_GENERATION`, the one before the current).
 *
 * Pre-GA a schema edit moves the scope generation instead of the schema
 * version (see `productSchema`), so the previous generation's database holds
 * collections whose schema differs from today's at the SAME version — opening
 * it with today's recipe throws DB6. The drain therefore opens it with exactly
 * the schemas that generation shipped: today's recipe with each moved schema put back.
 *
 * v6 → v7 moved NO schema: the bump is protocol 3 (ADR 0040), and a protocol-2 queue is
 * parked, never drained. So generation 6's recipe is
 * today's creators. When the generation moves again, this file becomes the schemas the NEW
 * previous generation shipped — and `DRAINABLE_SCHEMAS_GENERATION` below moves with it.
 * `schema-behaviour.test.ts` pins its digests as a literal map beside the current ones,
 * keyed by generation, and fails a bump that forgot this file.
 */

import { type CollectionCreator, engineCollectionCreators } from './engine-collections';

/** The generation these schemas reproduce; `schema-behaviour.test.ts` pins it to the drainable one. */
export const DRAINABLE_SCHEMAS_GENERATION = 6;

/** The full addCollections() argument for a drainable-generation scope database. */
export function drainableGenerationCollectionCreators(): Record<string, CollectionCreator> {
	const creators = engineCollectionCreators();
	return {
		...creators,
	};
}

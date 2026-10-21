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
 * parked, never drained (`FIRST_PROTOCOL_3_SCOPE_GENERATION`). So generation 6's recipe is
 * today's creators. When the generation moves again, this file becomes the schemas the NEW
 * previous generation shipped — and `DRAINABLE_SCHEMAS_GENERATION` below moves with it.
 * `schema-behaviour.test.ts` pins its digests as a literal map beside the current ones,
 * keyed by generation, and fails a bump that forgot this file.
 */

import { type CollectionWriteFacet, writeFacetFor } from './collection-descriptors';
import {
	type CollectionCreator,
	engineCollectionCreators,
	MUTATION_QUEUE_RXDB_COLLECTION,
} from './engine-collections';

/**
 * The scope-database generation whose schemas this file reproduces. The engine
 * refuses to open the drainable generation with them unless this equals
 * `DRAINABLE_SCOPE_DATABASE_GENERATION` — a bump that left this file behind
 * fails closed (the drain reports `failed`) instead of opening a database with
 * the wrong schemas.
 */
export const DRAINABLE_SCHEMAS_GENERATION = 6;

/** The full addCollections() argument for a drainable-generation scope database. */
export function drainableGenerationCollectionCreators(): Record<string, CollectionCreator> {
	const creators = engineCollectionCreators();
	return {
		...creators,
		// The drain keeps its once-a-day report stamp in the queue's local documents: the queue is
		// the one collection every drain opens. Local documents live beside the collection, not in
		// its schema, so no digest moves.
		[MUTATION_QUEUE_RXDB_COLLECTION]: {
			...creators[MUTATION_QUEUE_RXDB_COLLECTION]!,
			localDocuments: true,
		},
	};
}

/** The write facets a drainable-generation engine uses: generation 6 shipped today's projections. */
export function drainableGenerationWriteFacetFor(collection: string): CollectionWriteFacet | null {
	return writeFacetFor(collection);
}

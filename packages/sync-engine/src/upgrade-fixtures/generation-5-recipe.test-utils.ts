/**
 * TEST FIXTURE: the generation-5 drainable recipe, as `drainable-generation.ts` shipped it at
 * generation 6. The 17.4.0 upgrade suite (`rxdb-upgrade-pending-orders.test.ts`) drains a real
 * generation-5 database to pin the drain machinery, which generation 7 parks for protocol-2 queues
 * (ADR 0040) and ADR 0040 PR B drains again from generation 7.
 */

import {
	recordMutationQueueMigrationStrategies,
	recordMutationQueueSchema,
} from '@wcpos/sync-core';

import {
	type CollectionWriteFacet,
	productDocument,
	productsWriteFacetProjectedBy,
	type RecordProjection,
	writeFacetFor,
} from '../collections/collection-descriptors';
import {
	type CollectionCreator,
	engineCollectionCreators,
	MUTATION_QUEUE_RXDB_COLLECTION,
} from '../collections/engine-collections';
import { productSchema } from '../collections/product-schema';

/**
 * The scope-database generation whose schemas this file reproduces. The engine
 * refuses to open the drainable generation with them unless this equals
 * `DRAINABLE_SCOPE_DATABASE_GENERATION` — a bump that left this file behind
 * fails closed (the drain reports `failed`) instead of opening a database with
 * the wrong schemas.
 */
export const DRAINABLE_SCHEMAS_GENERATION = 5;

// Keep the shipped v5 queue: its pre-upgrade rows have no expectedEpoch.
// The drain opens it as-is; adding the field would force a legacy database migration.
const {
	expectedEpoch: _moneyEpoch,
	supersededBy: _voidMark,
	markedAt: _markedAt,
	expiresAt: _expiresAt,
	admittedBy: _admittedBy,
	admittedAt: _admittedAt,
	admissionReleased: _admissionReleased,
	mutationId: _mutationId,
	...drainableQueueProperties
} = recordMutationQueueSchema.properties;

const {
	6: _voidMarkMigration,
	7: _voidFenceMigration,
	8: _moneyEpochMigration,
	...drainableQueueMigrations
} = recordMutationQueueMigrationStrategies;

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
		// The drain keeps its once-a-day report stamp in the queue's local documents: the queue is
		// the one collection every drain opens (a v5 database need not hold orders). Local
		// documents live beside the collection, not in its schema, so no digest moves.
		[MUTATION_QUEUE_RXDB_COLLECTION]: {
			...creators[MUTATION_QUEUE_RXDB_COLLECTION]!,
			localDocuments: true,
			schema: {
				...recordMutationQueueSchema,
				version: 5,
				properties: {
					...drainableQueueProperties,
					mutationId: { type: 'string', maxLength: 64 },
					status: {
						type: 'string',
						enum: ['pending', 'claimed', 'conflicted', 'needs-revision', 'rejected'],
					},
				},
			},
			migrationStrategies: drainableQueueMigrations,
		},
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

/**
 * The engine's per-scope database recipe — package-private (ADR 0018:
 * "collections are package-private descriptors"; hosts don't vary
 * collections, so there is no public registration seam).
 *
 * Slice 2 carries exactly what the scope lifecycle needs:
 *  - the syncable collections (slice 1's schemas + their migrations), so a
 *    scope switch never changes what the app can store;
 *  - the mutation queue (`recordMutations` — the one collection that cannot
 *    be re-fetched from the server; the manager's needs-confirmation guard
 *    protects it under the public name `mutations`);
 *  - `engineKv`, the engine-owned string store backing the default
 *    checkpoints port (ADR 0018: "default: engine-owned collection INSIDE
 *    each scope db" — a volatile database therefore has a volatile cursor,
 *    for free). Deliberately absent from the public reset surface;
 *  - the legacy `changeSignalStates` collection, reopened only so facade
 *    adoption can copy its web cursor into `engineKv` before the first tick.
 *
 * Slice 5 adds the persisted scheduler/coverage tier collections (task
 * states, coverage records/lanes, compaction leases/failures, query-total
 * cache/request states, the three existence manifests) — the durable state
 * the scheduler loops need once they run inside the engine. Creating them is
 * additive on any existing RxDB database, so hosts that already carry these
 * collections (the web app's createDatabase recipe) open identically.
 */

import {
	MUTATION_QUEUE_COLLECTION,
	recordMutationQueueMigrationStrategies,
	recordMutationQueueSchema,
} from '@wcpos/sync-core';

import { orderMigrationStrategies, orderSchema } from './order-schema';
import { productMigrationStrategies, productSchema } from './product-schema';
import { variationMigrationStrategies, variationSchema } from './variation-schema';
import { customerSchema } from './customer-schema';
import { taxRateSchema } from './tax-rate-schema';
import {
	brandSchema,
	categorySchema,
	couponSchema,
	referenceCollectionMigrationStrategies,
	tagSchema,
} from './reference-collection-schema';
import { existenceManifestSchema } from '../local-coverage/existence-manifest-schema';
import { syncCheckpointMigrationStrategies, syncCheckpointSchema } from './sync-checkpoint-schema';
import {
	schedulerTaskStateMigrationStrategies,
	schedulerTaskStateSchema,
} from '../scheduler/scheduler-task-state-schema';
import {
	coverageLaneMigrationStrategies,
	coverageLaneSchema,
	coverageRecordMigrationStrategies,
	coverageRecordSchema,
} from '../local-coverage/coverage-schema';
import {
	coverageCompactionLeaseMigrationStrategies,
	coverageCompactionLeaseSchema,
} from '../local-coverage/coverage-compaction-lease-schema';
import {
	coverageCompactionFailureMigrationStrategies,
	coverageCompactionFailureSchema,
} from '../local-coverage/coverage-compaction-failure-schema';
import {
	queryTotalCacheMigrationStrategies,
	queryTotalCacheSchema,
} from '../scheduler/query-total-cache-schema';
import {
	queryTotalRequestStateMigrationStrategies,
	queryTotalRequestStateSchema,
} from '../scheduler/query-total-request-state-schema';
import { changeSignalStateSchema } from '../change-signal/change-signal-state-schema';

import type { RxDatabase } from 'rxdb';

/** The syncable collections a host can reset through the public handle. */
export const SYNC_COLLECTION_NAMES = [
	'orders',
	'products',
	'variations',
	'customers',
	'taxRates',
	'categories',
	'brands',
	'tags',
	'coupons',
] as const;

export type SyncCollectionName = (typeof SYNC_COLLECTION_NAMES)[number];

/** The public reset surface: every syncable collection plus the guarded queue. */
export type ResettableCollectionName = SyncCollectionName | typeof MUTATION_QUEUE_COLLECTION;

/**
 * The RxDB collection that stores the mutation queue. Public surfaces speak
 * `MUTATION_QUEUE_COLLECTION` ('mutations'); this is the storage name.
 */
export const MUTATION_QUEUE_RXDB_COLLECTION = 'recordMutations';

/** Engine-owned kv collection backing the default checkpoints StringStore. */
export const ENGINE_KV_COLLECTION = 'engineKv';

export type EngineKvDocument = {
	id: string;
	value: string;
};

export const engineKvSchema = {
	title: 'Sync engine internal key-value store',
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string', maxLength: 256 },
		value: { type: 'string' },
	},
	required: ['id', 'value'],
} as const;

export type CollectionCreator = { schema: unknown; migrationStrategies?: unknown };

const SYNC_COLLECTION_CREATORS: Record<SyncCollectionName, CollectionCreator> = {
	orders: { schema: orderSchema, migrationStrategies: orderMigrationStrategies },
	products: { schema: productSchema, migrationStrategies: productMigrationStrategies },
	variations: { schema: variationSchema, migrationStrategies: variationMigrationStrategies },
	customers: { schema: customerSchema },
	taxRates: { schema: taxRateSchema },
	categories: {
		schema: categorySchema,
		migrationStrategies: referenceCollectionMigrationStrategies,
	},
	brands: { schema: brandSchema, migrationStrategies: referenceCollectionMigrationStrategies },
	tags: { schema: tagSchema, migrationStrategies: referenceCollectionMigrationStrategies },
	coupons: { schema: couponSchema, migrationStrategies: referenceCollectionMigrationStrategies },
};

/** Deliberate `/testing` seam for hosts that open schema-canary databases. */
export function engineSyncCollectionCreators(): Record<SyncCollectionName, CollectionCreator> {
	return { ...SYNC_COLLECTION_CREATORS };
}

/**
 * The persisted scheduler/coverage tier (slice 5): durable task queue,
 * coverage evidence, compaction bookkeeping, query-total cache/requests, and
 * the three per-id-space existence manifests (ADR 0014/0015 — customers live
 * in wp_users and orders in HPOS/CPT, so a shared manifest would collide
 * numerically with wp_posts ids). Mirrors the web host's createDatabase
 * recipe byte-for-byte so an adopted host opens its existing data unchanged.
 */
const SCHEDULER_TIER_CREATORS: Record<string, CollectionCreator> = {
	schedulerTaskStates: {
		schema: schedulerTaskStateSchema,
		migrationStrategies: schedulerTaskStateMigrationStrategies,
	},
	coverageRecords: {
		schema: coverageRecordSchema,
		migrationStrategies: coverageRecordMigrationStrategies,
	},
	coverageLanes: {
		schema: coverageLaneSchema,
		migrationStrategies: coverageLaneMigrationStrategies,
	},
	coverageCompactionLeases: {
		schema: coverageCompactionLeaseSchema,
		migrationStrategies: coverageCompactionLeaseMigrationStrategies,
	},
	coverageCompactionFailures: {
		schema: coverageCompactionFailureSchema,
		migrationStrategies: coverageCompactionFailureMigrationStrategies,
	},
	queryTotalCacheEntries: {
		schema: queryTotalCacheSchema,
		migrationStrategies: queryTotalCacheMigrationStrategies,
	},
	queryTotalRequestStates: {
		schema: queryTotalRequestStateSchema,
		migrationStrategies: queryTotalRequestStateMigrationStrategies,
	},
	existenceManifest: { schema: existenceManifestSchema },
	existenceManifestCustomers: { schema: existenceManifestSchema },
	existenceManifestOrders: { schema: existenceManifestSchema },
	// The custom-pull checkpoint/epoch store (slice 5e): the orders scheduler
	// fetcher's checkpoint seam — mirrors the web createDatabase recipe.
	syncCheckpoints: {
		schema: syncCheckpointSchema,
		migrationStrategies: syncCheckpointMigrationStrategies,
	},
};

/** The full addCollections() argument for one engine scope database. */
export function engineCollectionCreators(): Record<string, CollectionCreator> {
	return {
		...SYNC_COLLECTION_CREATORS,
		...SCHEDULER_TIER_CREATORS,
		[MUTATION_QUEUE_RXDB_COLLECTION]: {
			schema: recordMutationQueueSchema,
			migrationStrategies: recordMutationQueueMigrationStrategies,
		},
		[ENGINE_KV_COLLECTION]: { schema: engineKvSchema },
		// Compatibility-only: existing web scope databases persisted the hybrid
		// cursor here before facade adoption. createRxdbSyncEngine copies its one
		// row into engineKv before ready resolves.
		changeSignalStates: { schema: changeSignalStateSchema },
	};
}

export function isResettableCollection(name: string): name is ResettableCollectionName {
	return (
		name === MUTATION_QUEUE_COLLECTION ||
		(SYNC_COLLECTION_NAMES as readonly string[]).includes(name)
	);
}

/** Maps a public reset name to the RxDB collection it drops and recreates. */
export function rxdbCollectionNameFor(name: ResettableCollectionName): string {
	return name === MUTATION_QUEUE_COLLECTION ? MUTATION_QUEUE_RXDB_COLLECTION : name;
}

/** The creator used to recreate one collection after a reset drop. */
export function creatorFor(name: ResettableCollectionName): CollectionCreator {
	return name === MUTATION_QUEUE_COLLECTION
		? {
				schema: recordMutationQueueSchema,
				migrationStrategies: recordMutationQueueMigrationStrategies,
			}
		: SYNC_COLLECTION_CREATORS[name];
}

/**
 * Drop and recreate one collection on an engine scope database. RxDB
 * re-registers `db.<name>` as a live getter after addCollections, so
 * per-access references re-resolve; only references captured BEFORE the
 * reset go stale (the same contract as the web host's scope database —
 * apps/web/src/db/createScopeLabDatabase.ts).
 */
export async function resetEngineCollection(
	db: RxDatabase,
	name: ResettableCollectionName
): Promise<void> {
	const rxdbName = rxdbCollectionNameFor(name);
	const live = db.collections[rxdbName];
	if (!live) {
		throw new Error(`Collection "${rxdbName}" is not open on engine database ${db.name}`);
	}
	await live.remove();
	await db.addCollections({ [rxdbName]: creatorFor(name) as never });
}

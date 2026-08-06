/** RxDB replication for apps/main; this production door and `./testing` are the complete surface. */
export {
	createRxdbSyncEngine,
	type CensusTotal,
	type CensusTotals,
	type ConflictResolutionChoice,
	type CoverageOutcome,
	type EngineConflict,
	type EngineConnectivity,
	type EngineEvent,
	type EngineRequirement,
	type EngineStatus,
	type OrderBrowseDimensions,
	type ProductBrowseDimensions,
	type RequirementHandle,
	type RxdbSyncEngine,
	type StoreScopeIdentity,
	type SyncCollectionName,
} from './create-rxdb-sync-engine';
export { engineDocumentIdFor } from './engine-document-id';
export { rejectionSuggestsServerRecord } from './write-path/conflict-resolution';

// prettier-ignore
export { MUTATION_QUEUE_RXDB_COLLECTION, SYNC_COLLECTION_NAMES } from './collections/engine-collections';

export type { CoverageLaneDocument } from './local-coverage/coverage-schema';
export type { QueryTotalCacheDocument } from './scheduler';
export type { QueryTotalWooRequest } from './scheduler';

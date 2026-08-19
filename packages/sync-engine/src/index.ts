/** RxDB replication for apps/main; this production door and `./testing` are the complete surface. */
export {
	createRxdbSyncEngine,
	type CensusTotal,
	type CensusTotals,
	type CollectionCheckReport,
	type ConflictResolutionChoice,
	type CoverageOutcome,
	type EngineConflict,
	type EngineConnectivity,
	type EngineEvent,
	type EngineFetcher,
	type EngineRequirement,
	type EngineStatus,
	type CustomerBrowseDimensions,
	type OrderBrowseDimensions,
	type ProductBrowseDimensions,
	type RequirementHandle,
	type RxdbSyncEngine,
	type StoreScopeIdentity,
	type SyncCollectionName,
} from './create-rxdb-sync-engine';
export { engineDocumentIdFor } from './engine-document-id';
/** Web multi-tab write-outcome feedback (#1209) — the host opens the channel
 * (named per scope database, re-pointed on a scope switch) and injects it as the
 * `writeOutcomeBridge` port. */
export {
	createWriteOutcomeBridge,
	type ScopedWriteOutcomeBridge,
	type WriteOutcomeBridge,
	writeOutcomeChannelName,
} from './write-path/write-outcome-bridge';
export { rejectionSuggestsServerRecord } from './write-path/conflict-resolution';
export {
	normalizeVariationAttributes,
	promotedVariationColumns,
} from './collections/variation-schema';

// prettier-ignore
export { MUTATION_QUEUE_RXDB_COLLECTION, SYNC_COLLECTION_NAMES } from './collections/engine-collections';

// The coverage TABLES stay private: `coverageChanges` answers the questions their rows were
// being read for, so no caller re-implements the engine's precedence/freshness rules.
export type { CoverageTarget, CoverageVerdict } from './local-coverage/coverage-verdicts';
/** PORT type: the request contract of `ports.queryTotal`, implemented host-side
 * (apps/main/lib/engine-fetcher.ts) — not a storage document. */
export type { QueryTotalWooRequest } from './scheduler';

export { QueryProvider, useQueryManager, type QueryRuntime } from './provider';
export { useLocalQuery, type LocalQueryOptions } from './use-local-query';
export { useTemplatesSync } from './templates';
export { awaitWriteOutcome, type AwaitedWriteOutcome } from './await-write-outcome';
export type { QueryResult } from './query-result';
export {
	observeEngineDatabases,
	observeEngineQuery,
	type EngineQueryDescriptor,
} from './engine-query';
export {
	observeEngineCensus,
	observeEngineCollectionCounts,
	observeEngineMutationCounts,
	type EngineCollectionCounts,
	type EngineMutationCounts,
} from './engine-monitor';
export {
	declareRequirements,
	prepareCollectionResetRefill,
	registerActiveBinding,
	requirementsForQuery,
} from './requirement-bridge';
export {
	isRecoverableLogsStorageError,
	recoverLogsCollectionStorage,
} from './logs-storage-recovery';
export type {
	CoverageLaneDocument,
	CensusTotal,
	CensusTotals,
	EngineEvent,
	EngineLane,
	EngineRequirement,
	EngineStatus,
	QueryTotalCacheDocument,
	RequirementHandle,
	RxdbSyncEngine,
	SyncCollectionName,
} from '@wcpos/sync-engine';

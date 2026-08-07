export { QueryProvider, useQueryRuntime, type QueryRuntime } from './provider';
export { useLocalQuery } from './use-local-query';
export { awaitWriteOutcome, WriteOutcomeError } from './await-write-outcome';
export type { QueryResult } from './query-result';
export { isEngineRxDocument, wrapEngineDocument } from './engine-adapter/document-proxy';
export {
	adapterDerivedFieldsFor,
	COLLECTION_VOCABULARY,
	engineCollectionNameFor,
	promotedColumnsFor,
	resolveLegacyField,
	sortAliasFor,
	sortTiebreakFor,
	wooOrderbyFor,
	type LegacyCollectionName,
	type WriteableCollection,
} from './engine-adapter/collection-map';
export type { EngineRxDocument } from './engine-adapter/execute-query';
export {
	observeCoverage,
	observeEngineDatabases,
	observeEngineQuery,
	type EngineQueryDescriptor,
} from './engine-query';
export {
	declareRequirements,
	runResetRefill,
	requirementsForQuery,
	type RequirementSortPart,
} from './requirement-bridge';
export { observeCollectionActive } from './engine-status';
export { recoverLogsCollectionStorage } from './logs-storage-recovery';

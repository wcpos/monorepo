export { QueryProvider, useQueryRuntime } from './provider';
export type { EngineRecord } from './records/engine-record';
export { useDocField, useRecordField } from './records/use-record-field';
export { useLocalQuery } from './use-local-query';
export { awaitWriteOutcome, WriteOutcomeError } from './await-write-outcome';
export type { QueryResult } from './query-result';
export { isEngineRxDocument, wrapEngineDocument } from './engine-adapter/document-proxy';
export {
	adapterDerivedFieldsFor,
	COLLECTION_VOCABULARY,
	engineCollectionNameFor,
	LEGACY_SEARCH_FIELDS,
	promotedColumnsFor,
	resolveLegacyField,
	sortAliasFor,
	sortTiebreakFor,
	wooOrderbyFor,
	type LegacyCollectionName,
	type WriteableCollection,
} from './engine-adapter/collection-map';
export type {
	CompiledQueryRead,
	CompiledSortPart,
	EngineRxDocument,
} from './engine-adapter/execute-query';
export { variationAllMatch, variationAttributesMatch } from './engine-adapter/translate-selector';
export {
	FLEXSEARCH_MIN_TERM_LENGTH,
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

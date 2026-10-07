export { QueryProvider, useQueryRuntime } from './provider';
export type { EngineRecord, EngineRecordCollectionName } from './records/engine-record';
export {
	engineCollection,
	observeEngineCollection,
	type EngineCollection,
} from './records/engine-collection';
export { useDocField, useRecordField } from './records/use-record-field';
export {
	useFollowedCollection,
	useFollowedCollection$,
	useLocalCollection$,
} from './use-local-collection';
export type { LocalCollectionReset, LocalDatabaseWithReset } from './use-local-collection';
export { useLocalQuery } from './use-local-query';
export {
	awaitWriteOutcome,
	awaitWriteSettlement,
	awaitTerminalWriteOutcome,
	type WriteSettlement,
	WriteDeferredError,
	WriteOutcomeError,
} from './await-write-outcome';
export type { QueryResult } from './query-result';
export {
	adapterDerivedFieldsFor,
	COLLECTION_VOCABULARY,
	engineCollectionNameFor,
	isWriteableCollection,
	promotedColumnsFor,
	resolveLegacyField,
	sortAliasFor,
	sortTiebreakFor,
	wooOrderbyFor,
	WRITEABLE_REMOTE_ID_FIELD,
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
	observeCoverage,
	observeEngineDatabases,
	observeEngineQuery,
	type EngineQueryDescriptor,
} from './engine-query';
export {
	META_FIELD_PREFIX,
	SEARCH_FIELDS,
	searchFieldsFor,
	searchRowText,
	setSearchMetaKeys,
	subscribeSearchFields,
	type SearchMetaKeys,
} from './search-fields';
export { useSearchFields } from './use-search-fields';
export { searchBlobFor, searchRows, type SearchBlob } from './search-blob';
export { warmSearchBlobs } from './search-warmup';
export { declareRequirements, runResetRefill } from './requirement-bridge';
export { observeCollectionActive } from './engine-status';
export { recoverLogsCollectionStorage } from './logs-storage-recovery';

export { normalizeSelectorSemantics } from './engine-adapter/normalize-selector';
export { OPEN_ORDER_STATUSES, OPEN_ORDERS_SORT, openOrdersSelector } from './open-orders-scope';

export {
	projectionReaderFor,
	registerProjectionReader,
	storageQueryProjectionReader,
} from './projection-read';
export type { ProjectionCollection, ProjectionReader, ProjectionRow } from './projection-read';

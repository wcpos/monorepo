export type { ReadonlyEngineRecord } from './records/readonly-engine-record';
export { QueryProvider, useQueryRuntime } from './provider';
export type { EngineRecord, EngineRecordCollectionName } from './records/engine-record';
export type * from './records/order-lines';
export { engineCollection, type EngineCollection } from './records/engine-collection';
export { useDocField, useRecordField } from './records/use-record-field';
export {
	useFollowedCollection,
	useFollowedCollection$,
	useLocalCollection$,
} from './use-local-collection';
export type { LocalCollectionReset, LocalDatabaseWithReset } from './use-local-collection';
export { useLocalQuery$ } from './use-local-query';
export { useOwnedResource } from './use-owned-resource';
export type { OwnedResource } from './use-owned-resource';
export {
	awaitWriteOutcome,
	awaitWriteSettlement,
	awaitTerminalWriteOutcome,
	type WriteSettlement,
	WriteDeferredError,
	WriteOutcomeError,
	WriteOutcomeTimeoutError,
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
	readCoverageGeneration,
	observeEngineDatabases,
	observeEngineQuery,
	type EngineQueryDescriptor,
	type EngineQueryRelation,
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
export {
	declareRequirements,
	runResetRefill,
	resetCollectionsAndRefill,
} from './requirement-bridge';
export { observeCollectionActive } from './engine-status';
export { recoverLogsCollectionStorage } from './logs-storage-recovery';

export { normalizeSelectorSemantics } from './engine-adapter/normalize-selector';
export {
	OPEN_ORDER_STATUSES,
	OPEN_ORDERS_SORT,
	openOrdersSelector,
	acquireOpenOrdersQueryHandle,
	type OpenOrdersScope,
} from './open-orders-scope';
export { acquireOrderRefundsQueryHandle } from './order-refunds';

export {
	projectionReaderFor,
	registerProjectionReader,
	storageQueryProjectionReader,
} from './projection-read';
export type { ProjectionCollection, ProjectionReader, ProjectionRow } from './projection-read';
export {
	acquireQueryHandle,
	ATTEMPTED,
	censusTotal$,
	coverageProjection$,
	coverageProjectionWithResult$,
	coverageTargetFor,
	coverageTargetKey,
	createDemand,
	createQueryHandle,
	exhaustedFromCoverage$,
	NO_CENSUS_TOTAL$,
	NOT_ATTEMPTED,
	queryHandleAnswers$,
	queryHandleResults$,
	readinessFrom,
	releaseHandles,
} from './query-handle';
export type {
	Demand,
	DemandPlan,
	DemandReadiness,
	QueryHandle,
	QueryHandleSpec,
	QueryLaneProgress,
	QuerySnapshot,
} from './query-handle';

export {
	observePaymentMethodHistory,
	type ObservedPaymentMethod,
} from './reads/payment-method-history';
export { observeCatalogChanges, readCatalogGeneration } from './reads/catalog-changes';
export { observeLocalRecordsById } from './reads/local-records-by-id';
export { observeProductMetaKeys } from './reads/product-meta-keys';
export { observeUnsentWorkCount } from './reads/unsent-work-count';
export { hasQueuedDelete } from './reads/queued-delete';

export {
	observeQueueRows,
	observeQueueCounts,
	type EngineMutationCounts,
	type QueueSelection,
	BACKLOG_QUEUE_STATUSES,
	PARKED_QUEUE_STATUSES,
	REJECTED_QUEUE_STATUSES,
	TERMINAL_QUEUE_STATUSES,
} from './reads/queue-rows';

export { observeDescribedQueueRows, type DescribedQueueRow } from './reads/described-queue-rows';

export {
	observeCollectionCounts,
	readCollectionSampleSizes,
	emptyCollectionCounts,
	type EngineCollectionCounts,
} from './reads/collection-counts';

export {
	observeTemplatePrinterOverrides,
	observePrinterProfiles,
	observeActiveTemplates,
	type StoreLocalDatabase,
	type NotificationRow,
	type ActiveTemplate,
	type LocalPrinterProfile,
} from './reads/store-local';

export { readStorePaymentsContract, useStorePaymentsContract } from './store-payments-contract';

export {
	savePrinterProfile,
	ensureSystemPrinterProfile,
	setDefaultPrinterProfile,
	deletePrinterProfile,
	PrinterProfileNotFoundError,
	StoreDatabaseUnavailableError,
	SYSTEM_PRINTER_ID,
	type PrinterStoreDatabase,
	type PrinterProfileFields,
} from './commands/printer-profiles';
export { setTemplatePrinterOverride } from './commands/template-printer-overrides';
export {
	MoneyCommandError,
	moneyCommandPoster,
	RECOVERY_RETRY_DELAYS_MS,
	recoverMoneyCommands,
	resendOpenCommands,
	type CommandProvenance,
	type MoneyCommandErrorReason,
	type MoneyCommandPoster,
	type Post,
	type ProvenanceCommand,
	type ResentCommand,
} from './commands/money-command';
export type { OrderApproval } from './store-local/money-commands';

export { observeNotifications, observeNotificationsReplaced } from './reads/notifications';
export {
	markNotificationRead,
	markAllNotificationsRead,
	markAllNotificationsSeen,
	upsertNotification,
} from './commands/notifications';

export {
	fetchFreshRecords,
	refreshStockFor,
	watchVariationParentRefresh,
} from './reads/refresh-demands';
export { searchCatalogByBarcode, readProductByWooId } from './reads/barcode-search';
export { isRecordClosed, isVariationRecord } from './records/engine-record';
export {
	isStorageWorkerFailure,
	noteStorageWriteDeadlinePassed,
	STORAGE_WRITE_DEADLINE_MS,
} from '@wcpos/database/plugins/wrapped-error-handler-storage';

export {
	measureStorageFootprint,
	classifyStorageEntries,
	collectionFromEntryName,
	type StorageBreakdown,
	type StorageContext,
	type StorageFootprintSummary,
} from './reads/storage-footprint';

export {
	readStockPayload,
	resolveStockOwnerId,
	observeCatalogByWooIds,
} from './reads/stock-record';
export { readCouponCatalog } from './reads/coupon-catalog';

export { observeCashierSalesTotal } from './reads/cashier-sales';

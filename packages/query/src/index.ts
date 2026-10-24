export type { ReadonlyEngineRecord } from './records/readonly-engine-record';
export { QueryProvider, useQueryRuntime } from './provider';
export type { EngineRecord, EngineRecordCollectionName } from './records/engine-record';
export type * from './records/order-lines';
export { useDocField, useRecordField } from './records/use-record-field';
export { useFollowedCollection } from './use-local-collection';
export { useOwnedResource } from './use-owned-resource';
export {
	awaitWriteOutcome,
	awaitWriteSettlement,
	awaitTerminalWriteOutcome,
	WriteDeferredError,
	WriteOutcomeError,
	WriteOutcomeTimeoutError,
} from './await-write-outcome';
export type { QueryResult } from './query-result';
export {
	COLLECTION_VOCABULARY,
	engineCollectionNameFor,
	sortAliasFor,
	wooOrderbyFor,
	type LegacyCollectionName,
	type WriteableCollection,
} from './engine-adapter/collection-map';
export { observeCoverage, readCoverageGeneration } from './engine-query';
export { setSearchMetaKeys, type SearchMetaKeys } from './search-fields';
export { useSearchFields } from './use-search-fields';
export { warmSearchBlobs } from './search-warmup';
export { resetCollectionsAndRefill } from './requirement-bridge';
export { OPEN_ORDER_STATUSES, acquireOpenOrdersQueryHandle } from './open-orders-scope';
export { acquireOrderRefundsQueryHandle } from './order-refunds';
export { NOT_ATTEMPTED, queryHandleAnswers$, queryHandleResults$ } from './query-handle';
export type { QueryHandle, QueryLaneProgress, QuerySnapshot } from './query-handle';

export {
	observePaymentMethodHistory,
	type ObservedPaymentMethod,
} from './reads/payment-method-history';
export { observeCatalogChanges, readCatalogGeneration } from './reads/catalog-changes';
export { observeLocalRecordsById, observeResidentOrders } from './reads/local-records-by-id';
export { observeProductMetaKeys } from './reads/product-meta-keys';
export { observeUnsentWorkCount } from './reads/unsent-work-count';
export { orderHasQueuedDelete } from './reads/queued-delete';

export {
	observeQueueRows,
	observeQueueCounts,
	type EngineMutationCounts,
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

export { useStorePaymentsContract } from './store-payments-contract';

export {
	savePrinterProfile,
	ensureSystemPrinterProfile,
	setDefaultPrinterProfile,
	deletePrinterProfile,
	PrinterProfileNotFoundError,
	type PrinterStoreDatabase,
} from './commands/printer-profiles';
export { setTemplatePrinterOverride } from './commands/template-printer-overrides';
export {
	answerAdopted,
	MoneyCommandError,
	moneyCommandPoster,
	resendOpenCommands,
	residentHoldsAnswer,
	type CommandProvenance,
	type MoneyCommandErrorReason,
	type MoneyCommandPoster,
	type Post,
	type ProvenanceCommand,
	type RecoveredOrder,
	type ResentCommand,
} from './commands/money-command';
export { moneyCommandRecovery, RECOVERY_RETRY_DELAYS_MS } from './commands/money-command-recovery';
export type { OrderApproval } from './store-local/money-commands';
export { adoptStoreOrderSnapshot } from './commands/adopt-store-order';

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

export { measureStorageFootprint, type StorageFootprintSummary } from './reads/storage-footprint';

export {
	readStockPayload,
	resolveStockOwnerId,
	observeCatalogByWooIds,
} from './reads/stock-record';
export { readCouponCatalog } from './reads/coupon-catalog';

export { observeCashierSalesTotal } from './reads/cashier-sales';

import { Query, QueryHooks, QueryResult } from './query-state';

export { QueryProvider, useQueryManager } from './provider';
export { useQuery } from './use-query';
export { useLocalQuery } from './use-local-query';
export { useRelationalQuery } from './use-relational-query';
export { useReplicationState } from './use-replication-state';
export { swapCollection, swapCollections } from './collection-swap';
export { yieldToEventLoop, processInChunks, chunkedIterator } from './yield';
// TRANSITIONAL — @deprecated increment-3. Kept so Core's use-mutation /
// use-stock-adjustment keep importing the name while they migrate to the engine.
export { CollectionReplicationState } from './data-fetcher';
export type { RelationalQuery } from './relational-query-state';
export type { Query, QueryHooks, QueryResult };
export type { CollectionSwapConfig, CollectionSwapResult } from './collection-swap';
export {
	isRecoverableLogsStorageError,
	recoverLogsCollectionStorage,
} from './logs-storage-recovery';

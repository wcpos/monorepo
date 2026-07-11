import { pendingRecordIds, RxRecordMutationStorage } from '@wcpos/sync-core';

/**
 * The order pull-apply guard provider: the set of order record-ids (uuids) that have un-pushed local mutations,
 * so a scheduled pull never overwrites queued local work. Reads the shared record-mutation queue (the `mutations`
 * RxDB collection) and filters to the orders collection; `pendingRecordIds` drops `rejected` dead letters, so a
 * write-rejected record is immediately syncable again (#507 regression 4). Shared by App.tsx and the order
 * scheduler tick so the wiring + the (single) collection cast live in one place.
 */
export function createOrderPendingMutationIds(
	mutationsCollection: unknown
): () => Promise<Set<string>> {
	const storage = new RxRecordMutationStorage(
		mutationsCollection as ConstructorParameters<typeof RxRecordMutationStorage>[0]
	);
	return async () =>
		pendingRecordIds(
			(await storage.list()).filter((mutation) => mutation.collectionName === 'orders')
		);
}

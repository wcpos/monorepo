import { pendingRecordIds, RecordMutationQueue, RxRecordMutationStorage } from '@wcpos/sync-core';

import { isOpenCartHoldCandidate } from './open-cart-hold';

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

/** Retire unsent cart intent before adopting store settlement; never release its stale payload. */
export function createOrderHeldRowDiscarder(
	mutationsCollection: unknown,
	ordersCollection: unknown
): (recordId: string) => Promise<number> {
	const queue = new RecordMutationQueue(
		new RxRecordMutationStorage(
			mutationsCollection as ConstructorParameters<typeof RxRecordMutationStorage>[0]
		)
	);
	const orders = ordersCollection as {
		findOne(id: string): {
			exec(): Promise<{
				incrementalModify(
					fn: (data: Record<string, unknown>) => Record<string, unknown>
				): Promise<unknown>;
			} | null>;
		};
	};
	return async (recordId) => {
		const rows = (await queue.pending()).filter(
			(row) => row.collectionName === 'orders' && row.recordId === recordId
		);
		if (!rows.length || !rows.every(isOpenCartHoldCandidate)) return 0;
		const removed = new Set<string>();
		for (const row of rows.reverse()) {
			if (!(await queue.removePending(row.mutationId))) break;
			removed.add(row.mutationId);
		}
		if (removed.size) {
			const resident = await orders.findOne(recordId).exec();
			await resident?.incrementalModify((data) => {
				const local = (data.local ?? {}) as { pendingMutationIds?: string[] };
				const remaining = (local.pendingMutationIds ?? []).filter((id) => !removed.has(id));
				return {
					...data,
					local: { ...local, pendingMutationIds: remaining, dirty: remaining.length > 0 },
				};
			});
		}
		return removed.size;
	};
}

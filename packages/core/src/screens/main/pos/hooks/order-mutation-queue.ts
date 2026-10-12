import { createDispatchToken, type DispatchToken } from '../../../../extensions/actions/registry';

import type { CurrentOrderRecord } from '../contexts/current-order';

export interface OrderMutationContext {
	dispatchToken: DispatchToken;
	order?: CurrentOrderRecord;
}

interface OrderMutationQueueEntry {
	tail: Promise<void>;
	context: OrderMutationContext;
}

const orderMutationQueues = new Map<string, OrderMutationQueueEntry>();
/**
 * The saved record a first add left for each order born in this session. A writer that captured
 * the temporary record before an async step and enqueues after the add's queue has drained still
 * finds the saved one on its slot (`queue.order`); the temporary record is gone by then.
 */
const savedOrders = new Map<string, CurrentOrderRecord>();

/** Serialize stock validation and cart mutations across hook instances for an order. */
export function enqueueOrderMutation<T>(
	recordId: string,
	mutation: (context: OrderMutationContext) => Promise<T>
): Promise<T> {
	const existing = orderMutationQueues.get(recordId);
	const context = existing?.context ?? {
		dispatchToken: createDispatchToken(),
		order: savedOrders.get(recordId),
	};
	// A remembered record whose collection has closed is frozen; drop it, whichever path set it.
	if (context.order && isClosed(context.order)) {
		context.order = undefined;
		savedOrders.delete(recordId);
	}
	const result = (existing?.tail ?? Promise.resolve()).then(() => mutation(context));
	const tail = result.then(
		() => undefined,
		() => undefined
	);

	orderMutationQueues.set(recordId, { tail, context });
	void tail.then(() => {
		if (context.order && !isClosed(context.order)) savedOrders.set(recordId, context.order);
		if (orderMutationQueues.get(recordId)?.tail === tail) {
			orderMutationQueues.delete(recordId);
		}
	});

	return result;
}

/**
 * The remembered record is a live document; one whose collection has closed (logout, a store
 * switch) would hand every later writer a frozen cart. Such a record is forgotten, and the writer
 * falls back to the record it was called with.
 */
function isClosed(record: CurrentOrderRecord): boolean {
	return (record as unknown as { collection?: { closed?: boolean } }).collection?.closed === true;
}

/** Tests only: forget every queue and every remembered saved record. */
export function resetOrderMutationQueues(): void {
	orderMutationQueues.clear();
	savedOrders.clear();
}

type OrderDocument = import('@wcpos/database').OrderDocument;

interface OrderMutationContext {
	order?: OrderDocument;
}

interface OrderMutationQueueEntry {
	tail: Promise<void>;
	context: OrderMutationContext;
}

const orderMutationQueues = new Map<string, OrderMutationQueueEntry>();

/** Serialize stock validation and cart mutations across hook instances for an order. */
export function enqueueOrderMutation<T>(
	recordId: string,
	mutation: (context: OrderMutationContext) => Promise<T>
): Promise<T> {
	const existing = orderMutationQueues.get(recordId);
	const context = existing?.context ?? {};
	const result = (existing?.tail ?? Promise.resolve()).then(() => mutation(context));
	const tail = result.then(
		() => undefined,
		() => undefined
	);

	orderMutationQueues.set(recordId, { tail, context });
	void tail.then(() => {
		if (orderMutationQueues.get(recordId)?.tail === tail) {
			orderMutationQueues.delete(recordId);
		}
	});

	return result;
}

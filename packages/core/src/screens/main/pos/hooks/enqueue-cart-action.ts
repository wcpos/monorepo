import { enqueueOrderMutation, type OrderMutationContext } from './order-mutation-queue';
import {
	type ActionContext,
	type ActionRefusal,
	isActionRefusal,
	presentActionRefusal,
} from '../../../../extensions/actions';

import type { CurrentOrderRecord } from '../contexts/current-order';

type Run<R> = (
	target: CurrentOrderRecord,
	queue: OrderMutationContext
) => Promise<R | ActionRefusal>;
type Present = { ctx: ActionContext; context: Record<string, unknown> };

/**
 * Queue a cart action on `queue.order ?? record`: a first add queued ahead leaves the saved
 * order on the queue entry (actions ledger 31). The callback owns dispatch and the write.
 * A refusal is presented and returned as `false`, or returned unpresented in `'caller'` mode.
 */
export function enqueueCartAction<R>(
	record: CurrentOrderRecord,
	run: Run<R>,
	present: Present
): Promise<R | false>;
export function enqueueCartAction<R>(
	record: CurrentOrderRecord,
	run: Run<R>,
	present: 'caller'
): Promise<R | ActionRefusal>;
export function enqueueCartAction<R>(
	record: CurrentOrderRecord,
	run: Run<R>,
	present: Present | 'caller'
): Promise<R | ActionRefusal | false> {
	return enqueueOrderMutation(record.uuid, async (queue) => {
		const result = await run(queue.order ?? record, queue);
		if (!isActionRefusal(result) || present === 'caller') return result;
		presentActionRefusal(present.ctx, result, present.context);
		return false;
	});
}

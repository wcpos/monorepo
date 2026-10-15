import { enqueueOrderMutation, type OrderMutationContext } from './order-mutation-queue';
import {
	type ActionContext,
	type ActionRefusal,
	isActionRefusal,
	presentActionRefusal,
} from '../../../../extensions/actions';

import type { CurrentOrderRecord } from '../contexts/current-order';

/** Queue a cart action on its live target; the callback owns dispatch and the write. */
export function enqueueCartAction<R>(
	record: CurrentOrderRecord,
	run: (target: CurrentOrderRecord, queue: OrderMutationContext) => Promise<R | ActionRefusal>,
	present: { ctx: ActionContext; context: Record<string, unknown> } | 'caller'
): Promise<R | false> {
	return enqueueOrderMutation(record.uuid, async (queue) => {
		const result = await run(queue.order ?? record, queue);
		if (isActionRefusal(result)) {
			if (present !== 'caller') presentActionRefusal(present.ctx, result, present.context);
			return false;
		}
		return result;
	});
}

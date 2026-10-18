import type { EngineRecord } from '@wcpos/query';

import { completionMetaFor, type SaleContext } from '../checkout/sale-completion';

import type { PayloadChanges } from '../../hooks/mutations/use-local-mutation';
import type { OrderMutationContext } from '../hooks/order-mutation-queue';

/** The manual tender and paid-balance boundary share one atomic status/provenance write. */
export async function writeZeroBalanceCompletion(
	ctx: SaleContext,
	{
		order,
		sessionId,
		changes = () => ({}),
		queue,
		complete,
		write,
	}: {
		order: EngineRecord<'orders'>;
		sessionId: string | null;
		changes?: (current: EngineRecord<'orders'>['payload']) => Record<string, unknown> | null;
		write: (changes: PayloadChanges) => Promise<unknown>;
		queue: OrderMutationContext;
		complete: (order: EngineRecord<'orders'>, queue: OrderMutationContext) => Promise<unknown>;
	}
) {
	const latest = order.getLatest().payload;
	const stamped = await completionMetaFor(ctx, latest.meta_data, { sessionId });
	const additions = stamped.filter(
		(entry) => !latest.meta_data?.some(({ key }) => key === entry.key)
	);
	let superseded = false;
	const written = await write((current) => {
		const patch = changes(current);
		superseded = patch === null;
		if (!patch) return {};
		const meta = (current.meta_data ?? []) as typeof stamped;
		return {
			...patch,
			status: 'completed',
			meta_data: [
				...meta,
				...additions.filter((entry) => !meta.some(({ key }) => key === entry.key)),
			],
		};
	});
	if (superseded) return 'superseded';
	if (!written) throw new Error('zero_balance_completion_failed');
	await complete(order, queue);
}

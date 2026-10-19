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
		revalidate,
		aggregateOnly,
		queue,
		complete,
		write,
	}: {
		order: EngineRecord<'orders'>;
		sessionId: string | null;
		changes?: (current: EngineRecord<'orders'>['payload']) => Record<string, unknown> | null;
		revalidate?: () => Promise<string | undefined>;
		aggregateOnly?: () => boolean;
		write: (changes: PayloadChanges) => Promise<unknown>;
		queue: OrderMutationContext;
		complete: (order: EngineRecord<'orders'>, queue: OrderMutationContext) => Promise<unknown>;
	}
) {
	const latest = order.getLatest().payload;
	// Reject an obsolete boundary before allocating irreversible sale provenance.
	if (changes(latest) === null) return 'superseded';
	const preflightReason = await revalidate?.();
	if (preflightReason) return { superseded: true as const, reason: preflightReason };
	const stamped = aggregateOnly?.()
		? (latest.meta_data ?? [])
		: await completionMetaFor(ctx, latest.meta_data, { sessionId });
	const additions = stamped.filter(
		(entry) => !latest.meta_data?.some(({ key }) => key === entry.key)
	);
	// Counter allocation has no release API; the resident resolver is synchronous and replayable.
	// A late supersession can leave a counter gap. Re-read stock AFTER allocation, then keep
	// synchronous payload validity in the resolver; never await provenance after this fence.
	const reason = await revalidate?.();
	if (reason) return { superseded: true as const, reason };
	let superseded = false;
	const written = await write((current) => {
		const patch = changes(current);
		superseded = patch === null || aggregateOnly?.() === true;
		if (superseded) return patch ?? {};
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

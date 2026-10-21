import type { EngineRecord } from '@wcpos/query';
import { resolveCompletionAttempt } from '@wcpos/query/store-local';

import { completionMetaFor, type SaleContext } from '../checkout/sale-completion';

import type { CloseOutcome } from './close-sale';
import type { PayloadChanges } from '../../hooks/mutations/use-local-mutation';
import type { OrderMutationContext } from '../hooks/order-mutation-queue';

/**
 * The manual tender and paid-balance boundary share one atomic line/provenance write, then the
 * server completes the sale through `close` (ADR 0040 D2): the till never writes `completed`.
 * Offline nothing is written; a close the server refuses leaves the order as it was.
 *
 * Both callers journal the completing sale before this runs. A close that ends without one
 * resolves that attempt: offline and an unapproved change sent nothing, and a definitive refusal
 * is the store's answer, so no later replay can finish this sale. Only `outstanding` keeps it:
 * money still moving (a leg settling) can cover the balance and the replay finishes the sale then.
 * A close that throws (no answer) keeps it too: the journaled command is re-sent.
 */
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
		online,
		close,
	}: {
		order: EngineRecord<'orders'>;
		sessionId: string | null;
		changes?: (current: EngineRecord<'orders'>['payload']) => Record<string, unknown> | null;
		revalidate?: () => Promise<string | undefined>;
		aggregateOnly?: () => boolean;
		write: (changes: PayloadChanges) => Promise<unknown>;
		queue: OrderMutationContext;
		complete: (order: EngineRecord<'orders'>, queue: OrderMutationContext) => Promise<unknown>;
		online: () => boolean;
		close: (order: EngineRecord<'orders'>) => Promise<CloseOutcome>;
	}
): Promise<
	| 'superseded'
	| { superseded: true; reason: string }
	| Exclude<CloseOutcome, { kind: 'completed' }>
	| undefined
> {
	const latest = order.getLatest().payload;
	// Reject an obsolete boundary before allocating irreversible sale provenance.
	if (changes(latest) === null) return 'superseded';
	const unfinished = async (outcome: Exclude<CloseOutcome, { kind: 'completed' }>) => {
		if (outcome.kind !== 'outstanding') await resolveCompletionAttempt(ctx.storeDB, order.uuid);
		return outcome;
	};
	if (!online()) return unfinished({ kind: 'offline' });
	const preflightReason = await revalidate?.();
	if (preflightReason) return { superseded: true, reason: preflightReason };
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
	if (reason) return { superseded: true, reason };
	let superseded = false;
	const written = await write((current) => {
		const patch = changes(current);
		superseded = patch === null || aggregateOnly?.() === true;
		if (superseded) return patch ?? {};
		const meta = (current.meta_data ?? []) as typeof stamped;
		return {
			...patch,
			meta_data: [
				...meta,
				...additions.filter((entry) => !meta.some(({ key }) => key === entry.key)),
			],
		};
	});
	if (superseded) return 'superseded';
	if (!written) throw new Error('zero_balance_completion_failed');
	const closed = await close(order);
	if (closed.kind !== 'completed') return unfinished(closed);
	await complete(order, queue);
}

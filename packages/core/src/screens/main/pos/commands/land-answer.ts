import cloneDeep from 'lodash/cloneDeep';

import {
	type AwaitingCustomerStamp,
	hasSaleProvenance,
	isCompletingStatus,
	type OrderPaymentSummary,
	type PaymentRow,
	readAwaitingCustomer,
} from '@wcpos/order-math';
import type { EngineRecord, MoneyCommandPoster, ResentCommand } from '@wcpos/query';

import { refreshOrderRecord } from '../checkout/hooks/reconcile-completed-order';
import { submitStillDone } from '../checkout/payments/submit-gateway-payment';
import {
	completionMetaFor,
	type CompletionResult,
	reopenedSince,
	type SaleContext,
	type SaleOutcome,
} from '../checkout/sale-completion';

export type NotMirrored = { cause: unknown } | null;

/** A mirror that put a completing status on the order stamps its provenance, unless held. */
export async function stampCompletionIfMissing(
	ctx: Pick<SaleContext, 'userDB' | 'siteUuid' | 'storeId' | 'stampCompletion'>,
	order: EngineRecord<'orders'>,
	status: string | null | undefined,
	facts: Parameters<typeof completionMetaFor>[2] = {}
): Promise<void> {
	if (!isCompletingStatus(status ?? '')) return;
	const meta = cloneDeep((order.getLatest?.() ?? order).payload.meta_data ?? []);
	if (hasSaleProvenance(meta)) return;
	if (!(await ctx.stampCompletion(order, await completionMetaFor(ctx, meta, facts))))
		throw new Error('provenance_save_failed');
}

/**
 * The one mirror policy for a store answer (record, gateway): mirror, stamp an accepted answer, and
 * pull the store's copy on any local failure. Never rejects: that failure is `{ cause }`.
 */
export function mirrorAnswer(deps: {
	ctx: Pick<SaleContext, 'userDB' | 'siteUuid' | 'storeId' | 'stampCompletion' | 'runtime'>;
	order: EngineRecord<'orders'>;
	poster: Pick<MoneyCommandPoster, 'mirror'>;
	facts?: Parameters<typeof completionMetaFor>[2];
}) {
	const { ctx, order, poster, facts } = deps;
	const pull = async () => refreshOrderRecord(ctx.runtime, Number(order.getLatest().payload.id));
	return async (
		answer: Parameters<MoneyCommandPoster['mirror']>[0],
		{ accepted = true }: { accepted?: boolean } = {}
	): Promise<NotMirrored> => {
		try {
			await poster.mirror(answer);
			if (accepted) await stampCompletionIfMissing(ctx, order, answer.order?.status, facts);
			return null;
		} catch (cause) {
			await pull().catch(() => undefined);
			return { cause };
		}
	};
}

/** The store's answer to a money command, in the adapters' own vocabulary. */
export type StoreAnswer =
	| {
			kind: 'recorded';
			via: 'online' | 'offline';
			row: PaymentRow;
			order: OrderPaymentSummary | null;
	  }
	| { kind: 'sent'; order: OrderPaymentSummary; stamp: AwaitingCustomerStamp }
	| { kind: 'settled'; order: OrderPaymentSummary }
	/** A replayed `settled`/`paid` whose sale was reopened since (`submitStillDone`). */
	| { kind: 'reopened'; order: OrderPaymentSummary }
	| { kind: 'close'; order: OrderPaymentSummary };
/** `remainingMinor`: the press's prediction for a recorded leg (`StampedSale`). */
export type Arrival = { via: 'press' | 'try-again'; remainingMinor: number };

/**
 * A replayed answer (Try again) as a store answer: it arrives mirrored, so this only reads it.
 * Null when it lands nothing: a cancel, a void, a terminal leg (its service finishes it), or a
 * send whose adopted order no longer carries the stamp (the store settled or cancelled it).
 */
export function answerOf(
	{ kind, data }: ResentCommand,
	resident: EngineRecord<'orders'>['payload']
): StoreAnswer | null {
	const order = data.order as OrderPaymentSummary | undefined;
	const row = data.payment as PaymentRow | undefined;
	if (kind === 'close') return order ? { kind, order } : null;
	if (row && (kind === 'record' || (kind === 'submit' && data.outcome === 'recorded')))
		return { kind: 'recorded', via: 'online', row, order: order ?? null };
	if (kind !== 'submit' || !order) return null;
	if (data.outcome === 'sent') {
		const stamp = readAwaitingCustomer(resident.meta_data);
		return stamp ? { kind: 'sent', order, stamp } : null;
	}
	if (data.outcome !== 'settled' && data.outcome !== 'paid') return null;
	return { kind: submitStillDone(data.outcome, order.status) ? 'settled' : 'reopened', order };
}

/** The one table from a store answer to the outcome the completion (`finishSale`) judges. */
export function saleOutcomeOf(
	answer: Exclude<StoreAnswer, { kind: 'reopened' }>,
	{ remainingMinor }: Arrival,
	mirrorFailed: boolean
): SaleOutcome {
	switch (answer.kind) {
		case 'recorded': {
			const { row, order, via } = answer;
			return { source: 'manual', via, row, order, mirrorFailed, remainingMinor };
		}
		case 'close':
			return { source: 'zero-balance', order: answer.order };
		case 'sent':
			return { source: 'gateway', order: answer.order, stamp: answer.stamp };
		case 'settled':
			return { source: 'gateway-settled', order: answer.order };
		default:
			return answer satisfies never;
	}
}

/**
 * Only the answer settles the command; `finish` (`finishSale`, the resident's one judge) completes
 * the sale. `reopened`: the answer said so (the attempt is resolved), or a close or a recorded leg
 * whose answer `reopenedSince` did not finish.
 */
export async function landAnswer(
	answer: StoreAnswer,
	arrival: Arrival,
	deps: {
		finish: (outcome: SaleOutcome) => Promise<CompletionResult>;
		resolveAttempt: () => Promise<void>;
		dp: number;
		notMirrored?: NotMirrored;
	}
): Promise<CompletionResult | 'reopened'> {
	if (answer.kind === 'reopened') {
		await deps.resolveAttempt();
		return 'reopened';
	}
	const result = await deps.finish(saleOutcomeOf(answer, arrival, !!deps.notMirrored));
	const reopened =
		(result === 'not-completed' || result === 'partial') &&
		(answer.kind === 'close' ||
			(answer.kind === 'recorded' && reopenedSince(answer.order, deps.dp)));
	return reopened ? 'reopened' : result;
}

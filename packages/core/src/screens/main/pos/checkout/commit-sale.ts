import { derive, readLedger, toMinor } from '@wcpos/order-math';
import type { EngineRecord } from '@wcpos/query';
import { RegisterSessionRequiredError, requireOpenSession } from '@wcpos/query/register-session';

import {
	type ActionEventInput,
	type ActionRefusal,
	dispatchAction,
	TENDER_COMMIT_EVENT,
	TENDER_GUARD_IDS,
} from '../../../../extensions/actions';
import { conditionRules } from '../conditions/evaluate';
import { countConditionsInSlot } from '../conditions/snapshot';
import { enqueueOrderMutation, type OrderMutationContext } from '../hooks/order-mutation-queue';

import './tender/tender-guards';

import type { SaleContext } from './sale-completion';

export type SaleCommitContext = Pick<
	SaleContext,
	'actionCtx' | 'actionActor' | 'storeDB' | 'sessionsOn' | 'dp'
>;
export type SaleAmounts =
	| { kind: 'whole-balance' }
	| { kind: 'retained-captures' }
	| {
			kind: 'entry';
			expectedBalanceMinor: number;
			amountMinor: number;
			tenderedMinor: number;
			captureMode: string | null;
	  };
export interface SaleCommitRequest {
	order: EngineRecord<'orders'>;
	methodId: string | null;
	bindingStatus: 'bound' | 'choose' | 'none';
	amounts: SaleAmounts;
}
/** The chain's payload, handed to the writer only after its stamped session is re-verified. */
export type StampedSale = ActionEventInput<typeof TENDER_COMMIT_EVENT>['payload'];

/**
 * One dispatch of `checkout.tender.commit`, inside the order's queue slot. Returns the refusal when a
 * guard or the entry stale-balance check refuses; throws `RegisterSessionRequiredError` when the
 * pre-action session write lands on a different session. `write` never runs in either case. Any
 * error `write` throws is rethrown untouched, so the tender hook's mirror-error identity checks hold.
 */
export function commitSale<R>(
	ctx: SaleCommitContext,
	{ order, methodId, bindingStatus, amounts }: SaleCommitRequest,
	write: (sale: StampedSale, queue: OrderMutationContext) => Promise<R>,
	options?: { queue?: OrderMutationContext }
): Promise<ActionRefusal | R> {
	const run = async (queue: OrderMutationContext): Promise<ActionRefusal | R> => {
		const latest = order.getLatest().payload;
		const retained = amounts.kind === 'retained-captures';
		const balanceMinor = retained
			? 0
			: toMinor(
					derive(latest.total, readLedger(latest.meta_data), [], { dp: ctx.dp }).balance,
					ctx.dp
				);
		// The keypad's facts were read at render, before any cart edit queued ahead.
		if (amounts.kind === 'entry' && amounts.expectedBalanceMinor !== balanceMinor)
			return {
				deny: {
					reasonKey: 'pos_checkout.order_changed_retry',
					detail: {
						balanceMinor: amounts.expectedBalanceMinor,
						latestBalanceMinor: balanceMinor,
					},
				},
			};
		const whole = amounts.kind === 'whole-balance';
		const amountMinor = amounts.kind === 'entry' ? amounts.amountMinor : balanceMinor;
		const unmet = await countConditionsInSlot(
			queue.order ?? order,
			ctx.actionCtx,
			conditionRules(ctx.actionCtx.store.preventOverselling)
		);
		// The event leaves its result open; a non-refusal is the bottom handler's own return.
		return dispatchAction({
			event: TENDER_COMMIT_EVENT,
			requiredGuards: TENDER_GUARD_IDS,
			token: queue.dispatchToken,
			ctx: ctx.actionCtx,
			input: {
				orderId: order.uuid,
				actor: ctx.actionActor,
				source: 'user',
				payload: {
					methodId,
					mode: whole
						? 'gateway'
						: amounts.kind === 'entry' && balanceMinor !== 0
							? amounts.captureMode
							: 'zero-balance',
					amountMinor,
					tenderedMinor: amounts.kind === 'entry' ? amounts.tenderedMinor : balanceMinor,
					balanceMinor,
					roundingMinor: 0,
					completing: amountMinor === balanceMinor,
					bindingStatus,
					registerId: null,
					sessionId: null,
					conditions: { unmet },
				},
			},
			bottom: async ({ payload }) => {
				// This pre-action write precedes the attempt and money; a replacement session refuses.
				const sessionId = await requireOpenSession(ctx.storeDB, payload.registerId, ctx.sessionsOn);
				if (sessionId !== payload.sessionId) throw new RegisterSessionRequiredError();
				return write(payload, queue);
			},
		}) as Promise<ActionRefusal | R>;
	};
	return options?.queue ? run(options.queue) : enqueueOrderMutation(order.uuid, run);
}

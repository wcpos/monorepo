import { derive, readLedger, toMinor } from '@wcpos/order-math';
import type { EngineRecord } from '@wcpos/query';

import {
	type ActionRefusal,
	dispatchAction,
	isActionRefusal,
	TENDER_COMMIT_EVENT,
	TENDER_GUARD_IDS,
} from '../../../../extensions/actions';
import { enqueueOrderMutation } from '../hooks/order-mutation-queue';
import { conditionRules } from '../conditions/evaluate';
import { countConditionsInSlot } from '../conditions/snapshot';
import './tender/tender-guards';
import {
	RegisterSessionRequiredError,
	requireOpenSession,
} from '../../../../services/register-session/session-store';
import { persistSaleProvenance, recordSaleAttempt, type SaleContext } from './sale-completion';

type StampedSession = { registerId: string | null; sessionId: string | null };

/**
 * A gateway sale takes the whole balance, so its tender commit is dispatched here, around the
 * writes that precede money: the journal row and, online, the provenance the store must hold
 * before the gateway is reached. The register and session gates on `checkout.tender.commit`
 * are the only rules; the handler's write must land on the session the gate stamped.
 */
export async function commitGatewaySale(
	ctx: SaleContext,
	input: {
		order: EngineRecord<'orders'>;
		source: 'gateway-contract' | 'gateway-snapshot';
		methodId: string | null;
		bindingStatus: 'bound' | 'choose' | 'none';
		online: boolean;
		/** The gateway's stored POS Order Status, journaled for the attempt's replay. */
		settledOrderStatus?: string | null;
		/**
		 * Every gateway's stored status, keyed by id — journaled instead of one status when
		 * the pay page can settle through a gateway other than the one the sale opened with.
		 */
		settledOrderStatuses?: Record<string, string | null>;
	}
): Promise<ActionRefusal | StampedSession> {
	const { order, source, online } = input;
	// The contract leaves this event's result open; a dispatch that is not a refusal carries the
	// handler's own return (a hook that answers without `next` is refused as `actions.hook_failed`).
	const outcome: unknown = await enqueueOrderMutation(order.uuid, async (queue) => {
		// Read inside the slot, so a cart edit queued just ahead is already applied to the balance.
		const latest = order.getLatest().payload;
		const balanceMinor = toMinor(
			derive(latest.total, readLedger(latest.meta_data), [], { dp: ctx.dp }).balance,
			ctx.dp
		);
		// The same count the tender pane makes in its slot, so `conditions.gate` judges every sale.
		const rules = conditionRules(ctx.actionCtx.store.preventOverselling);
		const unmet = await countConditionsInSlot(queue.order ?? order, ctx.actionCtx, rules);
		return dispatchAction({
			event: TENDER_COMMIT_EVENT,
			// Money path: refuse rather than run unguarded if the registering import were ever lost.
			requiredGuards: TENDER_GUARD_IDS,
			token: queue.dispatchToken,
			ctx: ctx.actionCtx,
			input: {
				orderId: order.uuid,
				actor: ctx.actionActor,
				source: 'user',
				payload: {
					methodId: input.methodId,
					mode: 'gateway',
					amountMinor: balanceMinor,
					tenderedMinor: balanceMinor,
					balanceMinor,
					roundingMinor: 0,
					completing: true,
					bindingStatus: input.bindingStatus,
					registerId: null,
					sessionId: null,
					conditions: { unmet },
				},
			},
			bottom: async (e) => {
				const { registerId, sessionId } = e.payload;
				const writtenSessionId = await requireOpenSession(ctx.sessions, registerId, ctx.sessionsOn);
				// A replacement session invalidates the facts the gate approved; its stamped id is binding.
				if (writtenSessionId !== sessionId) throw new RegisterSessionRequiredError();
				await recordSaleAttempt(ctx, {
					order,
					completing: true,
					source,
					settledOrderStatus: input.settledOrderStatus,
					settledOrderStatuses: input.settledOrderStatuses,
				});
				await persistSaleProvenance(ctx, { order, source, sessionId, online });
				return { registerId, sessionId } satisfies StampedSession;
			},
		});
	});
	return isActionRefusal(outcome) ? outcome : (outcome as StampedSession);
}

import {
	type CartConfig,
	type CouponContext,
	serverOwnsMoney,
	settleAggregate,
	settleCart,
	settlementPatch,
	snapshotFromOrderJSON,
	toMinor,
} from '@wcpos/order-math';
import { getLogger } from '@wcpos/utils/logger';
import type { EngineRecord } from '@wcpos/query';
import { resolveCompletionAttempt } from '@wcpos/query/store-local';

import { isActionRefusal } from '../../../../extensions/actions';
import { commitSale, type SaleCommitRequest } from '../checkout/commit-sale';
import { recordSaleAttempt, type SaleContext } from '../checkout/sale-completion';
import {
	type BoundaryResult,
	crossesPaidBalanceBoundary,
	netPaidForBoundary,
} from './paid-balance-boundary';
import { writeZeroBalanceCompletion } from './zero-balance-completion';

import type { OrderPayload } from './cart-config-for-order';
import type { OrderMutationContext } from '../hooks/order-mutation-queue';

const logger = getLogger(['wcpos', 'pos', 'settlement']);
export async function commitAtBoundary(
	ctx: SaleContext & {
		bindingStatus: SaleCommitRequest['bindingStatus'];
		source?: 'user' | 'system';
		configForOrder: (payload: OrderPayload) => CartConfig;
		serverOwnsMoney: (uuid: string) => boolean;
		storeContract?: () => string | null;
		complete: (order: EngineRecord<'orders'>, queue: OrderMutationContext) => Promise<unknown>;
	},
	{
		order,
		coupons,
		allowed,
		queue,
		write,
	}: {
		write: Parameters<typeof writeZeroBalanceCompletion>[1]['write'];
		coupons?: CouponContext;
		allowed?: (payload: OrderPayload) => boolean;
		order: EngineRecord<'orders'>;
		result: BoundaryResult;
		queue: OrderMutationContext;
	}
) {
	const outcome = await commitSale(
		ctx,
		{
			order,
			methodId: null,
			bindingStatus: ctx.bindingStatus,
			amounts: { kind: 'retained-captures' },
		},
		async ({ sessionId }, slot) => {
			await recordSaleAttempt(ctx, { order, source: 'zero-balance', completing: true });
			let overpaid: { orderId: string; total: string; netPaid: number } | undefined;
			const completion = await writeZeroBalanceCompletion(ctx, {
				order,
				sessionId,
				write,
				queue: slot,
				complete: ctx.complete,
				changes: (payload) => {
					overpaid = undefined;
					if (allowed && !allowed(payload)) return null;
					if (
						serverOwnsMoney(payload.meta_data, { storeContract: ctx.storeContract?.() }) ||
						ctx.serverOwnsMoney(order.uuid)
					)
						return null;
					const config = ctx.configForOrder(payload);
					const snapshot = snapshotFromOrderJSON(payload);
					const fresh = coupons
						? settleCart(snapshot, config, { coupons })
						: settleAggregate(snapshot, config);
					if (
						'error' in fresh ||
						!crossesPaidBalanceBoundary({ payload, result: fresh, dp: config.dp })
					)
						return null;
					const patch = settlementPatch(fresh);
					const netPaid = netPaidForBoundary(payload, config.dp);
					if (toMinor(patch.total, config.dp) < toMinor(netPaid, config.dp))
						overpaid = { orderId: order.uuid, total: patch.total, netPaid };
					return patch;
				},
			});
			if (completion === 'superseded') {
				await resolveCompletionAttempt(ctx.storeDB, order.uuid);
				logger.warn('settlement.boundary-superseded', { context: { orderId: order.uuid } });
			} else if (overpaid) logger.warn('settlement.boundary-overpaid', { context: overpaid });
			return completion;
		},
		{ queue, source: ctx.source }
	);
	if (isActionRefusal(outcome))
		logger.warn('settlement.boundary-deferred', {
			context: { orderId: order.uuid, reason: outcome.deny.reasonKey },
		});
	return outcome;
}

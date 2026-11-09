import {
	type CartConfig,
	type CouponContext,
	type EngineWarning,
	hasLiveSettlementLeg,
	serverOwnsMoney,
	settleAggregate,
	settleCart,
	settlementPatch,
	snapshotFromOrderJSON,
} from '@wcpos/order-math';

import { crossesPaidBalanceBoundary, netPaidForBoundary } from './paid-balance-boundary';

import type { OrderPayload } from './cart-config-for-order';

type Warnings = readonly EngineWarning[];
export type SettleError = Extract<ReturnType<typeof settleCart>, { ok: false }>['error'];

/** What one settle of a resident payload means for the write that holds it. */
export type SettleOutcome =
	| { kind: 'owned' }
	| { kind: 'unchanged'; warnings: Warnings }
	| { kind: 'patch'; changes: ReturnType<typeof settlementPatch>; warnings: Warnings }
	| {
			kind: 'boundary';
			changes: ReturnType<typeof settlementPatch>;
			netPaid: number;
			warnings: Warnings;
	  }
	| { kind: 'error'; error: SettleError; warnings: Warnings };

/**
 * Settle a payload once: the server or a live leg owns its money, or the settlement leaves it
 * unchanged, patches it, crosses the paid-balance boundary, or fails on a coupon.
 * A coupon cart settles with its context and that context's catalog tax statuses.
 */
export function settlePayload({
	payload,
	config,
	coupons,
	owner,
}: {
	payload: OrderPayload;
	config: CartConfig;
	coupons?: CouponContext;
	owner: { uuid: string; serverOwnsMoney: (uuid: string) => boolean };
}): SettleOutcome {
	if (
		serverOwnsMoney(payload.meta_data) ||
		owner.serverOwnsMoney(owner.uuid) ||
		hasLiveSettlementLeg(payload.meta_data)
	)
		return { kind: 'owned' };
	const snapshot = snapshotFromOrderJSON(payload);
	const result = coupons
		? settleCart(snapshot, config, { coupons, taxStatusFor: coupons.taxStatusFor })
		: settleAggregate(snapshot, config);
	const { warnings } = result;
	if ('error' in result) return { kind: 'error', error: result.error, warnings };
	if (crossesPaidBalanceBoundary({ payload, result, dp: config.dp }))
		return {
			kind: 'boundary',
			changes: settlementPatch(result),
			netPaid: netPaidForBoundary(payload, config.dp),
			warnings,
		};
	return result.changed
		? { kind: 'patch', changes: settlementPatch(result), warnings }
		: { kind: 'unchanged', warnings };
}

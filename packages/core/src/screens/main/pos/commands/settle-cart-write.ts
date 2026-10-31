import cloneDeep from 'lodash/cloneDeep';

import {
	hasLiveSettlementLeg,
	serverOwnsMoney,
	settleAggregate,
	settleCart,
	settlementPatch,
	snapshotFromOrderJSON,
} from '@wcpos/order-math';
import { OPEN_ORDER_STATUSES } from '@wcpos/query';
import type { CartConfig, CouponContext, SettleOptions } from '@wcpos/order-math';

import { type BoundaryResult, crossesPaidBalanceBoundary } from './paid-balance-boundary';
import { type ActionRefusal, isActionRefusal } from '../../../../extensions/actions';

import type { PayloadChanges } from '../../hooks/mutations/use-local-mutation';
import type { CurrentOrderRecord } from '../contexts/current-order/context';
import type { OrderPayload } from './cart-config-for-order';
import type { OrderMutationContext } from '../hooks/order-mutation-queue';

type Input = {
	document: CurrentOrderRecord;
	data: object | ((currentPayload: OrderPayload) => object | ActionRefusal);
	coupons?: {
		taxStatusFor?: SettleOptions['taxStatusFor'];
		context: CouponContext;
		missing: ActionRefusal;
		boundary?: ActionRefusal;
	};
	queue?: OrderMutationContext;
};
export type Deps<T> = {
	localPatch: (input: { document: CurrentOrderRecord; changes: PayloadChanges }) => T;
	configForOrder: (order: OrderPayload) => CartConfig;
	serverOwnsMoney: (uuid: string) => boolean;
};
export type BoundaryCommit = (
	order: CurrentOrderRecord,
	result: BoundaryResult,
	queue: OrderMutationContext,
	coupons?: Input['coupons']
) => Promise<unknown>;

// Birth intents remain synchronous; persisted cart commands await completion in their held slot.
export function settleCartWrite<T>(
	input: Input & { queue: OrderMutationContext },
	deps: Deps<T> & { commitAtBoundary: BoundaryCommit }
): Promise<Awaited<T> | ActionRefusal>;
export function settleCartWrite<T>(
	input: Omit<Input, 'data' | 'coupons'> & { data: object },
	deps: Deps<T>
): T;
/** Called only inside the command's existing per-order mutation slot. */
export function settleCartWrite<T>(
	input: Input,
	deps: Deps<T> & { commitAtBoundary?: BoundaryCommit }
): T | Promise<unknown> {
	let boundary: BoundaryResult | undefined;
	let closed = false;
	let refusal: ActionRefusal | undefined;
	const document = input.document.getLatest();
	const written = deps.localPatch({
		document,
		changes: (currentPayload) => {
			closed = false;
			boundary = undefined;
			refusal = undefined;
			const data = typeof input.data === 'function' ? input.data(currentPayload) : input.data;
			if (isActionRefusal(data)) {
				refusal = data;
				return {};
			}
			closed = !OPEN_ORDER_STATUSES.some((status) => status === currentPayload.status);
			if (closed) return {};
			const payload = cloneDeep(currentPayload) as OrderPayload;
			// localPatch omits undefined fields; settle what it will actually persist.
			const intent = Object.fromEntries(
				Object.entries(data).filter(([, value]) => value !== undefined)
			);
			const hint = payload.meta_data?.find((entry) => entry.key === '_wcpos_money_owner_hint');
			if (
				hint &&
				Array.isArray(intent.meta_data) &&
				!intent.meta_data.some((entry) => entry.key === hint.key)
			) {
				intent.meta_data = [...intent.meta_data, hint];
			}
			const after = { ...payload, ...intent };
			const owned = serverOwnsMoney(payload.meta_data) || deps.serverOwnsMoney(document.uuid);
			const config = deps.configForOrder(after);
			const hasCoupons = after.coupon_lines?.some((line) => line.code != null);
			// Without an explicit context, coupon continuation still owns redistribution.
			const result =
				owned || hasLiveSettlementLeg(after.meta_data) || (hasCoupons && !input.coupons)
					? undefined
					: hasCoupons && input.coupons
						? settleCart(snapshotFromOrderJSON(after), config, {
								coupons: input.coupons.context,
								taxStatusFor: input.coupons.taxStatusFor,
							})
						: settleAggregate(snapshotFromOrderJSON(after), config);
			if (result && 'error' in result) {
				refusal = input.coupons!.missing;
				return {};
			}
			boundary =
				result && crossesPaidBalanceBoundary({ payload: after, result, dp: config.dp })
					? result
					: undefined;
			if (boundary && hasCoupons && input.coupons!.boundary) {
				refusal = input.coupons!.boundary;
				return {};
			}
			if (boundary && (!deps.commitAtBoundary || !input.queue))
				throw new Error('boundary_commit_requires_queue');
			return {
				...data,
				...intent,
				...(result?.changed && !boundary ? settlementPatch(result) : {}),
			};
		},
	});
	if (!deps.commitAtBoundary) return written;
	return Promise.resolve(written).then(async (value) => {
		if (refusal) return refusal;
		if (closed) return { deny: { reasonKey: 'pos_checkout.order_changed_retry' } };
		if (boundary && value) {
			const outcome = await deps.commitAtBoundary!(document, boundary, input.queue!, input.coupons);
			if (isActionRefusal(outcome)) return outcome;
		}
		return value;
	});
}

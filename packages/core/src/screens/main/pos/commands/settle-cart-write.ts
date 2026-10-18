import cloneDeep from 'lodash/cloneDeep';

import {
	serverOwnsMoney,
	settleAggregate,
	settlementPatch,
	snapshotFromOrderJSON,
} from '@wcpos/order-math';
import { OPEN_ORDER_STATUSES } from '@wcpos/query';
import type { CartConfig } from '@wcpos/order-math';

import { type BoundaryResult, crossesPaidBalanceBoundary } from './paid-balance-boundary';
import { type ActionRefusal, isActionRefusal } from '../../../../extensions/actions';

import type { PayloadChanges } from '../../hooks/mutations/use-local-mutation';
import type { CurrentOrderRecord } from '../contexts/current-order/context';
import type { OrderPayload } from './cart-config-for-order';
import type { OrderMutationContext } from '../hooks/order-mutation-queue';

type Input = { document: CurrentOrderRecord; data: object; queue?: OrderMutationContext };
type Deps<T> = {
	localPatch: (input: { document: CurrentOrderRecord; changes: PayloadChanges }) => T;
	configForOrder: (order: OrderPayload) => CartConfig;
	serverOwnsMoney: (uuid: string) => boolean;
	storeContract?: () => string | null;
};
type BoundaryCommit = (
	order: CurrentOrderRecord,
	result: BoundaryResult,
	queue: OrderMutationContext
) => Promise<unknown>;

// Birth intents remain synchronous; persisted cart commands await completion in their held slot.
export function settleCartWrite<T>(
	input: Input & { queue: OrderMutationContext },
	deps: Deps<T> & { commitAtBoundary: BoundaryCommit }
): Promise<Awaited<T> | ActionRefusal>;
export function settleCartWrite<T>(input: Input, deps: Deps<T>): T;
/** Called only inside the command's existing per-order mutation slot. */
export function settleCartWrite<T>(
	input: Input,
	deps: Deps<T> & { commitAtBoundary?: BoundaryCommit }
): T | Promise<unknown> {
	let boundary: BoundaryResult | undefined;
	let closed = false;
	const document = input.document.getLatest();
	const written = deps.localPatch({
		document,
		changes: (currentPayload) => {
			boundary = undefined;
			closed = !OPEN_ORDER_STATUSES.some((status) => status === currentPayload.status);
			if (closed) return {};
			const payload = cloneDeep(currentPayload) as OrderPayload;
			// localPatch omits undefined fields; settle what it will actually persist.
			const intent = Object.fromEntries(
				Object.entries(input.data).filter(([, value]) => value !== undefined)
			);
			for (const key of ['_wcpos_money_owner', '_wcpos_money_owner_hint']) {
				const owner = payload.meta_data?.find((entry) => entry.key === key);
				if (
					owner &&
					Array.isArray(intent.meta_data) &&
					!intent.meta_data.some((entry) => entry.key === key)
				) {
					intent.meta_data = [...intent.meta_data, owner];
				}
			}
			const after = { ...payload, ...intent };
			const owned =
				serverOwnsMoney(payload.meta_data, { storeContract: deps.storeContract?.() }) ||
				deps.serverOwnsMoney(document.uuid);
			const config = deps.configForOrder(after);
			// Coupon continuation owns redistribution and its paid-balance boundary.
			const result =
				owned || after.coupon_lines?.some((line) => line.code != null)
					? undefined
					: settleAggregate(snapshotFromOrderJSON(after), config);
			boundary =
				result && crossesPaidBalanceBoundary({ payload: after, result, dp: config.dp })
					? result
					: undefined;
			if (boundary && (!deps.commitAtBoundary || !input.queue))
				throw new Error('boundary_commit_requires_queue');
			return {
				...input.data,
				...intent,
				...(result?.changed && !boundary ? settlementPatch(result) : {}),
			};
		},
	});
	if (!deps.commitAtBoundary) return written;
	return Promise.resolve(written).then(async (value) => {
		if (closed) return { deny: { reasonKey: 'pos_checkout.order_changed_retry' } };
		if (boundary && value) {
			const outcome = await deps.commitAtBoundary!(document, boundary, input.queue!);
			if (isActionRefusal(outcome)) return outcome;
		}
		return value;
	});
}

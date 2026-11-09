import type { CartConfig, CouponContext, EngineWarning } from '@wcpos/order-math';
import type { EngineRecord } from '@wcpos/query';
import type { PayloadChanges } from '@wcpos/query/mutations';
import { getLogger } from '@wcpos/utils/logger';

import { type SettleError, settlePayload } from './settle-payload';

import type { BoundaryOutcome } from './boundary-commit';
import type { BoundaryCommitter } from './use-boundary-committer';
import type { OrderPayload } from './cart-config-for-order';
import type { CurrentOrderRecord } from '../contexts/current-order/context';
import type { ReportEngineWarnings } from '../contexts/order-engine-warnings';
import type { OrderMutationContext } from '../hooks/order-mutation-queue';
import type { useT } from '../../../../contexts/translations';

const logger = getLogger(['wcpos', 'pos', 'settlement']);

export interface SettleOpenOrderDeps {
	/** The order-only resolver write; `changes` resolves against the resident inside it. */
	write: (document: CurrentOrderRecord, changes: PayloadChanges) => Promise<unknown>;
	configForOrder: (payload: OrderPayload) => CartConfig;
	serverOwnsMoney: (uuid: string) => boolean;
	/** The system boundary commit: nobody is at the till. */
	commit: BoundaryCommitter;
	report: ReportEngineWarnings;
	t: ReturnType<typeof useT>;
}

/**
 * The coordinator's `settle` for one open order: one resolver write of the settled payload, a
 * boundary handed to the system commit, the pass's warnings reported once, a coupon failure
 * toasted. Resolves the boundary's outcome, or undefined when the pass wrote no boundary.
 */
export async function settleOpenOrder(
	deps: SettleOpenOrderDeps,
	uuid: string,
	document: CurrentOrderRecord,
	allowed: (payload: OrderPayload, ignoreCheckout?: boolean) => boolean,
	coupons: CouponContext | undefined,
	queue: OrderMutationContext
): Promise<BoundaryOutcome | undefined> {
	let warnings: readonly EngineWarning[] = [];
	let boundary = false;
	let failure: SettleError | undefined;
	const write = (changes: PayloadChanges) => deps.write(document, changes);
	await write((payload) => {
		boundary = false;
		if (!allowed(payload as OrderPayload)) return {};
		const outcome = settlePayload({
			payload: payload as OrderPayload,
			config: deps.configForOrder(payload as OrderPayload),
			coupons,
			owner: { uuid, serverOwnsMoney: deps.serverOwnsMoney },
		});
		if (outcome.kind === 'owned') return {};
		warnings = outcome.warnings;
		if (outcome.kind === 'error') {
			failure = outcome.error;
			return {};
		}
		boundary = outcome.kind === 'boundary';
		return outcome.kind === 'patch' ? outcome.changes : {};
	});
	let outcome;
	if (boundary)
		outcome = await deps.commit({
			order: document as EngineRecord<'orders'>,
			queue,
			write,
			coupons,
			allowed,
		});
	deps.report(warnings, { orderId: uuid, site: 'settlement-coordinator' });
	if (failure)
		logger.warn('Cart settlement failed', {
			showToast: true,
			toast: {
				title:
					failure.code === 'missing_coupon'
						? deps.t('pos_cart.coupon_not_found')
						: deps.t('pos_cart.coupon_apply_failed'),
			},
			context: failure,
		});
	return outcome;
}

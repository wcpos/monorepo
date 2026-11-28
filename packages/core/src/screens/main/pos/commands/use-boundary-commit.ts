import * as React from 'react';

import type { EngineRecord } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';

import { type CartWriteCoupons, settleCouponContext } from './settle-cart-write';
import { useBoundaryCommitter } from './use-boundary-committer';
import { useT } from '../../../../contexts/translations';
import { vetoSentence } from '../checkout/veto-sentence';

import type { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import type { CurrentOrderRecord } from '../contexts/current-order';
import type { OrderMutationContext } from '../hooks/order-mutation-queue';
import type { OrderPayload } from './cart-config-for-order';

const logger = getLogger(['wcpos', 'pos', 'commands', 'boundary']);
const pricedContent = ({ line_items, coupon_lines }: OrderPayload) =>
	JSON.stringify({ line_items, coupon_lines });

/** The cashier's boundary commit for a command's order, written through the command's patch. */
export function useBoundaryCommit(write: ReturnType<typeof useLocalMutation>['localPatch']) {
	const commit = useBoundaryCommitter('user');
	const t = useT();
	return React.useCallback(
		async (order: CurrentOrderRecord, queue: OrderMutationContext, coupons?: CartWriteCoupons) => {
			// Taken before the guards: the write priced exactly these lines with `coupons`.
			const priced = coupons && pricedContent(order.getLatest().payload);
			const outcome = await commit({
				order: order as EngineRecord<'orders'>,
				queue,
				coupons: coupons && settleCouponContext(coupons),
				// Coupon carts this write did not price (arrivals during guards) are the continuation's.
				allowed: (payload) =>
					!payload.coupon_lines?.some((line) => line.code != null) ||
					(priced !== undefined && pricedContent(payload) === priced),
				write: (changes) => write({ document: order, changes }),
			});
			const close = outcome.kind === 'unclosed' ? outcome.close : null;
			if (close?.kind === 'order_changed' && close.veto)
				logger.info(vetoSentence(close.veto, t)!, {
					showToast: true,
					context: { orderId: order.uuid, close: 'vetoed' },
				});
			return outcome;
		},
		[commit, write, t]
	);
}

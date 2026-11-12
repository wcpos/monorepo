import * as React from 'react';

import type { EngineRecord } from '@wcpos/query';

import { type CartWriteCoupons, settleCouponContext } from './settle-cart-write';
import { useBoundaryCommitter } from './use-boundary-committer';

import type { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import type { CurrentOrderRecord } from '../contexts/current-order';
import type { OrderMutationContext } from '../hooks/order-mutation-queue';
import type { OrderPayload } from './cart-config-for-order';

const pricedContent = ({ line_items, coupon_lines }: OrderPayload) =>
	JSON.stringify({ line_items, coupon_lines });

/** The cashier's boundary commit for a command's order, written through the command's patch. */
export function useBoundaryCommit(write: ReturnType<typeof useLocalMutation>['localPatch']) {
	const commit = useBoundaryCommitter('user');
	return React.useCallback(
		(
			order: CurrentOrderRecord,
			queue: OrderMutationContext,
			coupons?: CartWriteCoupons,
			written?: OrderPayload
		) => {
			// The revision the write landed, not a re-read: it priced exactly these lines with `coupons`.
			const priced = coupons && written && pricedContent(written);
			return commit({
				order: order as EngineRecord<'orders'>,
				queue,
				coupons: coupons && settleCouponContext(coupons),
				// Coupon carts this write did not price (arrivals during guards) are the continuation's.
				allowed: (payload) =>
					!payload.coupon_lines?.some((line) => line.code != null) ||
					(priced !== undefined && pricedContent(payload) === priced),
				write: (changes) => write({ document: order, changes }),
			});
		},
		[commit, write]
	);
}

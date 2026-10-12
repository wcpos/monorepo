import * as React from 'react';

import { getLogger } from '@wcpos/utils/logger';

import { CartChangedError, isActionRefusal, removeCouponLine } from './coupon-line-actions';
import { readQuickDiscountIntent } from './quick-discount';
import { useActionContext } from './use-action-context';
import { useRecalculateCoupons } from './use-recalculate-coupons';
import { useT } from '../../../../contexts/translations';
import { presentActionRefusal } from '../../../../extensions/actions';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useCurrentOrder } from '../contexts/current-order';

const cartLogger = getLogger(['wcpos', 'pos', 'cart']);

/**
 * Hook for removing a coupon from the current order.
 *
 * Removes the coupon from coupon_lines by code. For synced items (with id),
 * sets code to null to signal deletion to WooCommerce.
 * After removal, recalculates all remaining coupon discounts from scratch.
 */
export const useRemoveCoupon = () => {
	const { currentOrderRecord } = useCurrentOrder();
	const { localPatch } = useLocalMutation();
	const t = useT();
	const { recalculate } = useRecalculateCoupons();
	const { ctx, actor } = useActionContext();

	const orderLogger = React.useMemo(
		() =>
			cartLogger.with({
				orderUUID: currentOrderRecord.uuid,
				orderID: currentOrderRecord.payload.id,
				orderNumber: currentOrderRecord.payload.number,
			}),
		[currentOrderRecord]
	);

	const removeCoupon = React.useCallback(
		async (couponCode: string) => {
			const normalizedCode = couponCode.toLowerCase().trim();
			const removedLine = (currentOrderRecord.getLatest().payload.coupon_lines ?? []).find(
				(cl) => (cl.code ?? '').toLowerCase() === normalizedCode
			);
			if (!removedLine) return;
			const removedIntent = readQuickDiscountIntent(removedLine);

			let outcome: unknown;
			try {
				outcome = await removeCouponLine(
					{ ctx, actor, recalculate, localPatch },
					currentOrderRecord,
					couponCode
				);
			} catch (error) {
				// The cart moved under the recalculation; the coupon is still on the order, and the
				// cashier hears why (a removal has no field to carry the reason).
				if (error instanceof CartChangedError) {
					orderLogger.info(t('pos_cart.cart_changed'), {
						showToast: true,
						context: { couponCode },
					});
					return;
				}
				throw error;
			}
			if (isActionRefusal(outcome)) {
				presentActionRefusal(ctx, outcome, { couponCode, orderId: currentOrderRecord.payload.id });
				return;
			}
			if (!outcome) return;

			orderLogger.info(t(removedIntent ? 'pos_cart.discount_removed' : 'pos_cart.coupon_removed'), {
				showToast: true,
				context: { couponCode },
			});
		},
		[currentOrderRecord, localPatch, t, orderLogger, recalculate, ctx, actor]
	);

	return { removeCoupon };
};

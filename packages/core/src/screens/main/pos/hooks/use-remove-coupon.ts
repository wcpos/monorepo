import * as React from 'react';

import { getLogger } from '@wcpos/utils/logger';

import { CartChangedError, isActionRefusal, removeCouponLine } from './coupon-line-actions';
import { readQuickDiscountIntent } from './quick-discount';
import { useActionContext } from './use-action-context';
import { useRecalculateCoupons } from './use-recalculate-coupons';
import { useT } from '../../../../contexts/translations';
import { presentActionRefusal } from '../../../../extensions/actions';
import { useCartCommand } from '../commands/use-cart-command';
import { useCurrentOrderActions } from '../contexts/current-order';

const cartLogger = getLogger(['wcpos', 'pos', 'cart']);

/**
 * Hook for removing a coupon from the current order.
 *
 * Removes the coupon from coupon_lines by code. For synced items (with id),
 * sets code to null to signal deletion to WooCommerce.
 * After removal, recalculates all remaining coupon discounts from scratch.
 */
export const useRemoveCoupon = () => {
	// Resolved at the press, not subscribed in render (current-order ledger 1).
	const { getCurrentOrderRecord } = useCurrentOrderActions();
	const command = useCartCommand('cart.coupon.remove');
	const t = useT();
	const { recalculate } = useRecalculateCoupons();
	const { ctx } = useActionContext();

	const removeCoupon = React.useCallback(
		async (couponCode: string) => {
			const currentOrderRecord = getCurrentOrderRecord();
			const orderLogger = cartLogger.with({
				orderUUID: currentOrderRecord.uuid,
				orderID: currentOrderRecord.payload.id,
				orderNumber: currentOrderRecord.payload.number,
			});
			const normalizedCode = couponCode.toLowerCase().trim();
			const removedLine = (currentOrderRecord.getLatest().payload.coupon_lines ?? []).find(
				(cl) => (cl.code ?? '').toLowerCase() === normalizedCode
			);
			if (!removedLine) return;
			const removedIntent = readQuickDiscountIntent(removedLine);

			let outcome: unknown;
			try {
				outcome = await removeCouponLine({ command, recalculate }, currentOrderRecord, couponCode);
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

			orderLogger.info(
				removedIntent ? t('pos_cart.discount_removed') : t('pos_cart.coupon_removed'),
				{
					showToast: true,
					context: { couponCode },
				}
			);
		},
		[getCurrentOrderRecord, command, t, recalculate, ctx]
	);

	return { removeCoupon };
};

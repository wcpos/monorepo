import * as React from 'react';

import { getLogger } from '@wcpos/utils/logger';

import { useRecalculateCoupons } from './use-recalculate-coupons';
import { useT } from '../../../../contexts/translations';
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
	const { currentOrder } = useCurrentOrder();
	const { localPatch } = useLocalMutation();
	const t = useT();
	const { recalculate } = useRecalculateCoupons();

	const orderLogger = React.useMemo(
		() =>
			cartLogger.with({
				orderUUID: currentOrder.uuid,
				orderID: currentOrder.id,
				orderNumber: currentOrder.number,
			}),
		[currentOrder.uuid, currentOrder.id, currentOrder.number]
	);

	const removeCoupon = React.useCallback(
		async (couponCode: string) => {
			const order = currentOrder.getLatest();
			const couponLines = order.coupon_lines || [];
			const normalizedCode = couponCode.toLowerCase().trim();

			let removed = false;
			const updatedCouponLines = couponLines
				.map((cl: any) => {
					if ((cl.code ?? '').toLowerCase() === normalizedCode) {
						removed = true;
						// If synced (has id), null the code to signal deletion
						if (cl.id) {
							return { ...cl, code: null };
						}
						// If local-only, remove entirely
						return null;
					}
					return cl;
				})
				.filter((cl: any) => cl !== null);

			if (!removed) return;

			const result = await recalculate(order.line_items || [], updatedCouponLines);

			const patchResult = await localPatch({
				document: order,
				data: {
					coupon_lines: result.couponLines,
					line_items: result.lineItems,
				},
			});
			if (!patchResult) {
				return;
			}

			orderLogger.info(t('pos_cart.coupon_removed', { defaultValue: 'Coupon removed' }), {
				showToast: true,
				context: { couponCode },
			});
		},
		[currentOrder, localPatch, t, orderLogger, recalculate]
	);

	return { removeCoupon };
};

import * as React from 'react';

import { getLogger } from '@wcpos/utils/logger';

import { useT } from '../../../../contexts/translations';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useCurrentOrder } from '../contexts/current-order';

const cartLogger = getLogger(['wcpos', 'pos', 'cart']);

/**
 * Hook for removing a coupon from the current order.
 *
 * Removes the coupon from coupon_lines by code. For synced items (with id),
 * sets code to null to signal deletion to WooCommerce.
 */
export const useRemoveCoupon = () => {
	const { currentOrder } = useCurrentOrder();
	const { localPatch } = useLocalMutation();
	const t = useT();

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

			const updatedCouponLines = couponLines
				.map((cl: any) => {
					if (cl.code === couponCode) {
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

			await localPatch({
				document: order,
				data: { coupon_lines: updatedCouponLines },
			});

			orderLogger.info(t('pos_cart.coupon_removed', { defaultValue: 'Coupon removed' }), {
				showToast: true,
				context: { couponCode },
			});
		},
		[currentOrder, localPatch, t, orderLogger]
	);

	return { removeCoupon };
};

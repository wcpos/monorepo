import * as React from 'react';

import isEqual from 'lodash/isEqual';
import { v4 as uuidv4 } from 'uuid';

import { wooMetaCarrier } from '@wcpos/sync-core';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';

import { reportCartFailure } from './cart-failure';
import {
	mintQuickDiscountCode,
	QUICK_DISCOUNT_META_KEY,
	quickDiscountCouponConfig,
} from './quick-discount';
import { useRecalculateCoupons } from './use-recalculate-coupons';
import { useT } from '../../../../contexts/translations';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useCurrentOrder } from '../contexts/current-order';

const cartLogger = getLogger(['wcpos', 'pos', 'cart']);

export const useAddQuickDiscount = () => {
	const { localPatch } = useLocalMutation();
	const { currentOrderRecord } = useCurrentOrder();
	const { recalculate } = useRecalculateCoupons();
	const t = useT();
	const orderLogger = React.useMemo(
		() =>
			cartLogger.with({
				orderUUID: currentOrderRecord.uuid,
				orderID: currentOrderRecord.payload.id,
				orderNumber: currentOrderRecord.payload.number,
			}),
		[currentOrderRecord]
	);

	const addQuickDiscount = React.useCallback(
		async (intent: Parameters<typeof quickDiscountCouponConfig>[0]) => {
			try {
				const order = currentOrderRecord.getLatest();
				const couponLines = order.payload.coupon_lines || [];
				const code = mintQuickDiscountCode(
					couponLines.flatMap((line) => (line.code == null ? [] : [line.code]))
				);
				const newLine = wooMetaCarrier.ensureLineUuid(
					{
						code,
						discount: '0',
						discount_tax: '0',
						meta_data: [{ key: QUICK_DISCOUNT_META_KEY, value: intent }],
					},
					uuidv4
				);
				const snapshot = {
					line_items: order.payload.line_items,
					coupon_lines: order.payload.coupon_lines,
				};
				const isFresh = () => {
					const latest = currentOrderRecord.getLatest();
					return isEqual(snapshot, {
						line_items: latest.payload.line_items,
						coupon_lines: latest.payload.coupon_lines,
					});
				};
				if (!isFresh()) return { success: false, error: t('pos_cart.cart_changed') };
				const result = await recalculate(order.payload.line_items || [], [...couponLines, newLine]);
				if (!isFresh()) return { success: false, error: t('pos_cart.cart_changed') };
				const patched = await localPatch({
					document: order,
					data: {
						coupon_lines: result.couponLines,
						line_items: result.lineItems,
					},
				});
				if (!patched) return { success: false, error: t('pos_cart.coupon_apply_failed') };
				orderLogger.info('Quick discount added', {
					context: {
						event: 'quick_discount.added',
						discountType: intent.discount_type,
						amount: intent.amount,
						code,
					},
				});
				return { success: true };
			} catch (error) {
				const message = getErrorMessage(error);
				reportCartFailure(orderLogger, 'Local mutation failed', {
					toastTitle: t('common.there_was_an_error', { message }),
					error,
				});
				return { success: false, error: message };
			}
		},
		[currentOrderRecord, localPatch, recalculate, t, orderLogger]
	);
	return { addQuickDiscount };
};

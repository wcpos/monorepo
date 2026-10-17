import * as React from 'react';

import { v4 as uuidv4 } from 'uuid';

import { useRecordField } from '@wcpos/query';
import { wooMetaCarrier } from '@wcpos/sync-core';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';

import { useAppliedCouponReferenceDemand } from '../../../../query';
import { reportCartFailure } from './cart-failure';
import { useCouponRejectionMessage } from './coupon-rejection-message';
import { useCouponContext } from './use-coupon-context';
import {
	mintQuickDiscountCode,
	QUICK_DISCOUNT_META_KEY,
	quickDiscountCouponConfig,
	readQuickDiscountIntent,
} from './quick-discount';
import {
	applyCouponLine,
	CartChangedError,
	cartSnapshotOf,
	isActionRefusal,
} from './coupon-line-actions';
import { useActionContext } from './use-action-context';
import { useRecalculateCoupons } from './use-recalculate-coupons';
import { useT } from '../../../../contexts/translations';
import { useCartWrite } from '../commands/use-cart-write';
import { useCurrentOrder } from '../contexts/current-order';

const cartLogger = getLogger(['wcpos', 'pos', 'cart']);

export const useAddQuickDiscount = () => {
	const { localPatch } = useCartWrite();
	const { currentOrderRecord } = useCurrentOrder();
	const { recalculate } = useRecalculateCoupons();
	const { ctx, actor } = useActionContext();
	const { getCouponContext } = useCouponContext();
	const couponRejectionMessage = useCouponRejectionMessage();
	const t = useT();
	// The exclusivity check below scans the RESIDENT coupons, and on a device that never
	// opened the coupon picker they arrive on demand (#952). Declare that demand for a cart
	// carrying a catalog coupon and wait for it (bounded) before scanning, as settlement does.
	const hasCatalogCoupons = useRecordField(currentOrderRecord, (order) =>
		(order.payload.coupon_lines || []).some(
			(line) => line.code != null && !readQuickDiscountIntent(line)
		)
	);
	const { whenSettled: whenCouponReferencesSettled } =
		useAppliedCouponReferenceDemand(hasCatalogCoupons);
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
				// The cart the exclusivity rule is checked against; the writer refuses if it moved.
				const validated = cartSnapshotOf(order.payload);
				const couponLines = order.payload.coupon_lines || [];

				// An applied catalog coupon marked individual-use forbids any other coupon, and
				// a quick discount IS a coupon line — the same rule useAddCoupon enforces.
				const catalogCodes = couponLines
					.filter((line) => line.code != null && !readQuickDiscountIntent(line))
					.map((line) => line.code as string);
				if (catalogCodes.length > 0) {
					await whenCouponReferencesSettled();
					const coupons = await getCouponContext(order.payload.line_items || [], couponLines);
					// Codes compare case-insensitively everywhere else in the cart; match that.
					const records = catalogCodes.map((catalogCode) =>
						coupons.coupons.get(catalogCode.toLowerCase())
					);
					// Still not resident after the wait: we cannot tell whether it is exclusive, and
					// settlement could not replay it either. Refuse rather than guess.
					if (records.some((record) => record === undefined)) {
						return { success: false, error: t('pos_cart.coupon_not_found') };
					}
					const exclusive = catalogCodes.find(
						(catalogCode, index) => records[index]?.individual_use
					);
					if (exclusive) {
						return {
							success: false,
							error: couponRejectionMessage({
								code: 'individual_use_conflict',
								params: { code: exclusive },
							}),
						};
					}
				}

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
				// The writer compares the cart when its slot starts and after its recalculation.
				const outcome = await applyCouponLine(
					{ ctx, actor, recalculate, localPatch },
					currentOrderRecord,
					newLine,
					validated
				);
				// The refusal is the field's error line; a hook that already presented it is not echoed.
				if (isActionRefusal(outcome))
					return {
						success: false,
						error: outcome.deny.presented
							? undefined
							: ctx.t(outcome.deny.reasonKey, outcome.deny.params),
					};
				if (!outcome) return { success: false, error: t('pos_cart.coupon_apply_failed') };
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
				if (error instanceof CartChangedError)
					return { success: false, error: t('pos_cart.cart_changed') };
				const message = getErrorMessage(error);
				reportCartFailure(orderLogger, 'Local mutation failed', {
					toastTitle: t('common.there_was_an_error', { message }),
					error,
				});
				return { success: false, error: message };
			}
		},
		[
			currentOrderRecord,
			localPatch,
			recalculate,
			getCouponContext,
			couponRejectionMessage,
			whenCouponReferencesSettled,
			t,
			orderLogger,
			ctx,
			actor,
		]
	);
	return { addQuickDiscount };
};

import * as React from 'react';

import { v4 as uuidv4 } from 'uuid';

import { type MetaDataEntry, wooMetaCarrier } from '@wcpos/sync-core';
import { getLogger, isErrorReported } from '@wcpos/utils/logger';
import { type CouponRejection, couponValidationContext } from '@wcpos/order-math/internal';

import { useCouponContext } from './use-coupon-context';
import { useCouponRejectionMessage } from './coupon-rejection-message';
import { validateCoupon } from './coupon-validation';
import { reportCartFailure } from './cart-failure';
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
import { refusalText } from '../../../../extensions/actions/present';

const cartLogger = getLogger(['wcpos', 'pos', 'cart']);

/**
 * Hook for adding a coupon to the current order.
 *
 * Looks up the coupon code in the engine coupons collection,
 * validates it against the current cart state, calculates the discount,
 * and adds it to the order's coupon_lines.
 */
export const useAddCoupon = () => {
	const { localPatch } = useCartWrite();
	const t = useT();
	const { currentOrderRecord } = useCurrentOrder();
	const { getCouponContext } = useCouponContext();
	const { recalculate } = useRecalculateCoupons();
	const { ctx, actor } = useActionContext();
	const couponRejectionMessage = useCouponRejectionMessage();

	const orderLogger = React.useMemo(
		() =>
			cartLogger.with({
				orderUUID: currentOrderRecord.uuid,
				orderID: currentOrderRecord.payload.id,
				orderNumber: currentOrderRecord.payload.number,
			}),
		[currentOrderRecord]
	);

	const addCoupon = React.useCallback(
		async (couponCode: string) => {
			/**
			 * The cashier gets a translated sentence; the LOG gets the code.
			 *
			 * These used to be the same English string, which meant a support log
			 * from a French till read in French once the copy was translated —
			 * unsearchable, and untranslatable back. `reason` is now the stable
			 * enum and `params` carries what the sentence interpolated.
			 */
			// A store rule doing its job (expired, minimum spend…), shown inline by the
			// coupon form: lifecycle, not an amber row.
			const rejectCoupon = (rejection: CouponRejection) => {
				orderLogger.info('Coupon application rejected', {
					context: {
						event: 'coupon.rejected',
						couponCode: couponCode.toLowerCase().trim(),
						reason: rejection.code,
						...(rejection.params ? { params: rejection.params } : {}),
					},
				});
				return { success: false, error: couponRejectionMessage(rejection) };
			};
			try {
				const order = currentOrderRecord.getLatest();
				// The cart these rules are checked against; the writer refuses if it moved before the write.
				const validated = cartSnapshotOf(order.payload);
				const lineItems = (order.payload.line_items || []).filter(
					(item) => item.product_id !== null
				);
				const appliedCouponLines = (order.payload.coupon_lines || []).filter(
					(cl): cl is typeof cl & { code: string } => cl.code != null
				);
				const coupons = await getCouponContext(lineItems, appliedCouponLines);
				const coupon = coupons.coupons.get(couponCode.toLowerCase().trim());
				if (!coupon) {
					return { success: false, error: t('pos_cart.coupon_not_found') };
				}
				const validation = validateCoupon(
					coupon,
					couponValidationContext({
						lineItems,
						appliedCouponLines,
						billing: order.payload.billing,
						customer_id: order.payload.customer_id,
						coupons,
					})
				);

				// No fallback string needed any more: the result is a discriminated union,
				// so an invalid one always carries its rejection.
				if (!validation.valid) return rejectCoupon(validation.rejection);

				// 5. Create new coupon line and recalculate all coupons from scratch
				const couponData = coupon;

				const newCouponLineData = {
					// Coupon line codes are lowercase, whatever case the catalog stores.
					code: couponData.code.toLowerCase(),
					discount: '0',
					discount_tax: '0',
					meta_data: [] as MetaDataEntry[],
				};
				const newCouponLine = wooMetaCarrier.ensureLineUuid(newCouponLineData, uuidv4);

				// The cart the coupon was validated against must be the cart it is applied to: the
				// writer compares when its queue slot starts and again after its recalculation.
				const outcome = await applyCouponLine(
					{ ctx, actor, recalculate, localPatch },
					currentOrderRecord,
					newCouponLine,
					validated
				);
				// A hook's refusal is the coupon field's error line, where the cashier is looking;
				// a hook that already presented its reason is not echoed.
				if (isActionRefusal(outcome)) {
					return {
						success: false,
						error: outcome.deny.presented ? undefined : refusalText(outcome.deny, ctx.t),
					};
				}
				if (!outcome) {
					return {
						success: false,
						error: t('pos_cart.coupon_apply_failed'),
					};
				}

				const appliedCouponLine = outcome.couponLines.find(
					(cl) => cl.code?.toLowerCase() === couponData.code?.toLowerCase()
				);
				orderLogger.info(t('pos_cart.coupon_applied'), {
					context: {
						couponCode: couponData.code,
						discountType: couponData.discount_type,
						discount: appliedCouponLine?.discount ?? '0',
					},
				});

				return { success: true };
			} catch (error) {
				if (error instanceof CartChangedError) {
					return { success: false, error: t('pos_cart.cart_changed') };
				}
				// localPatch already reported its own rethrow (a scope that moved twice).
				if (!isErrorReported(error)) {
					reportCartFailure(orderLogger, 'Coupon could not be applied', {
						toastTitle: t('pos_cart.coupon_apply_failed'),
						error,
					});
				}
				return { success: false, error: t('pos_cart.coupon_apply_failed') };
			}
		},
		[
			getCouponContext,
			currentOrderRecord,
			localPatch,
			t,
			orderLogger,
			recalculate,
			couponRejectionMessage,
			ctx,
			actor,
		]
	);

	return { addCoupon };
};

import * as React from 'react';

import isEqual from 'lodash/isEqual';
import { v4 as uuidv4 } from 'uuid';

import {
	isGuestCustomer,
	type MetaDataEntry,
	MISC_PRODUCT_ID,
	wooMetaCarrier,
} from '@wcpos/sync-core';
import { useQueryRuntime } from '@wcpos/query';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import {
	type CouponLineItem,
	type CouponRejection,
	enrichCategoriesWithAncestors,
} from '@wcpos/order-math/internal';

import { buildCategoryParents } from './coupon-helpers-engine';
import { useCouponRejectionMessage } from './coupon-rejection-message';
import { validateCoupon } from './coupon-validation';
import {
	readEngineCategories,
	readEngineCoupons,
	readEngineProductsByWooId,
} from './engine-coupon-data';
import { reportCartFailure } from './cart-failure';
import { useRecalculateCoupons } from './use-recalculate-coupons';
import { parsePosData } from './utils';
import { useT } from '../../../../contexts/translations';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useCurrentOrder } from '../contexts/current-order';

const cartLogger = getLogger(['wcpos', 'pos', 'cart']);

/**
 * Hook for adding a coupon to the current order.
 *
 * Looks up the coupon code in the engine coupons collection,
 * validates it against the current cart state, calculates the discount,
 * and adds it to the order's coupon_lines.
 */
export const useAddCoupon = () => {
	const { localPatch } = useLocalMutation();
	const t = useT();
	const { currentOrderRecord } = useCurrentOrder();
	const runtime = useQueryRuntime();
	const { recalculate } = useRecalculateCoupons();
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
			const rejectCoupon = (rejection: CouponRejection) => {
				orderLogger.warn('Coupon application rejected', {
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
				// 1. Preserve the legacy selector semantics: normalize only the input value,
				// then match payload.code exactly against the resident Tier-0 coupon scan.
				const coupons = await readEngineCoupons(runtime);
				const coupon = coupons.find(
					(record) => record.payload.code === couponCode.toLowerCase().trim()
				);

				if (!coupon) {
					return {
						success: false,
						error: t('pos_cart.coupon_not_found'),
					};
				}

				const order = currentOrderRecord.getLatest();
				const lineItems = (order.payload.line_items || []).filter(
					(item: any) => item.product_id !== null
				);
				const appliedCouponLines = (order.payload.coupon_lines || []).filter(
					(cl: any): cl is any & { code: string } => cl.code != null
				);
				const appliedCoupons = appliedCouponLines.map((cl: any) => cl.code);

				// 2. Look up applied coupons that have individual_use for reverse check
				const appliedCouponsWithIndividualUse: string[] = [];
				for (const cl of appliedCouponLines) {
					const appliedCoupon = coupons.find((record) => record.payload.code === cl.code);
					if (appliedCoupon?.payload.individual_use && cl.code) {
						appliedCouponsWithIndividualUse.push(cl.code);
					}
				}

				// 3. Look up products for category/on_sale info
				const productIds = lineItems
					.map((item: any) => item.product_id)
					.filter(
						(productId): productId is number => productId != null && productId !== MISC_PRODUCT_ID
					);
				const products =
					productIds.length > 0 ? await readEngineProductsByWooId(runtime, productIds) : [];
				const productMap = new Map(products.map((p: any) => [p.id, p]));

				// Build ancestor-enriched category map for coupon restriction matching.
				// WC's wc_get_product_cat_ids() includes parent categories.
				let productCategoriesMap = new Map<number, { id: number }[]>();
				for (const p of products) {
					if (p.id != null) {
						productCategoriesMap.set(p.id as number, (p.categories || []) as { id: number }[]);
					}
				}
				const categories = await readEngineCategories(runtime);
				productCategoriesMap = enrichCategoriesWithAncestors(
					productCategoriesMap,
					buildCategoryParents(categories)
				);

				// 4. Build validation context
				// Use POS data to determine on_sale — this matches recalculateCoupons'
				// isLineItemOnSale() so validation and replay agree on sale state.
				const couponLineItems: CouponLineItem[] = lineItems.map((item: any) => {
					const product = productMap.get(item.product_id);
					const qty = item.quantity || 1;
					const posData = parsePosData(item);
					const posPrice = posData?.price != null ? parseFloat(String(posData.price)) : NaN;
					const posRegular =
						posData?.regular_price != null ? parseFloat(String(posData.regular_price)) : NaN;
					const onSale =
						Number.isFinite(posPrice) && Number.isFinite(posRegular) && posRegular > 0
							? posPrice < posRegular
							: false;
					return {
						product_id: item.product_id,
						quantity: qty,
						price: parseFloat(item.total || '0') / qty,
						subtotal: item.subtotal || '0',
						total: item.total || '0',
						categories: productCategoriesMap.get(item.product_id) || product?.categories || [],
						on_sale: onSale,
					};
				});

				const cartSubtotal = lineItems.reduce(
					(sum: number, item: any) => sum + parseFloat(item.subtotal || '0'),
					0
				);

				const validation = validateCoupon(coupon.payload, {
					lineItems: couponLineItems,
					appliedCoupons,
					appliedCouponsWithIndividualUse,
					cartSubtotal,
					customerEmail: order.payload.billing?.email || '',
					// customer_id 0 = guest: WC records guest coupon usage by email, so guests
					// must map to null here to trigger the email-based used_by check
					customerId:
						order.payload.customer_id == null || isGuestCustomer(order.payload.customer_id)
							? null
							: order.payload.customer_id,
				});

				// No fallback string needed any more: the result is a discriminated union,
				// so an invalid one always carries its rejection.
				if (!validation.valid) return rejectCoupon(validation.rejection);

				// 5. Create new coupon line and recalculate all coupons from scratch
				const couponData = coupon.payload;

				const newCouponLineData = {
					code: couponData.code,
					discount: '0',
					discount_tax: '0',
					meta_data: [] as MetaDataEntry[],
				};
				const newCouponLine = wooMetaCarrier.ensureLineUuid(newCouponLineData, uuidv4);

				const cartSnapshot = {
					line_items: order.payload.line_items,
					coupon_lines: order.payload.coupon_lines,
				};

				const latestBeforeRecalculate = currentOrderRecord.getLatest();
				if (
					!isEqual(cartSnapshot, {
						line_items: latestBeforeRecalculate.payload.line_items,
						coupon_lines: latestBeforeRecalculate.payload.coupon_lines,
					})
				) {
					return {
						success: false,
						error: t('pos_cart.cart_changed'),
					};
				}

				const allCouponLines = [...(order.payload.coupon_lines || []), newCouponLine];

				// Note: recalculate() re-queries coupon/product docs from the engine, so
				// there's a theoretical TOCTOU gap if a background sync changes docs
				// between validateCoupon() and recalculate(). In practice the window
				// is milliseconds and the server will re-validate on sync. A full fix
				// would require passing pre-loaded docs into recalculate(), which we
				// defer to avoid over-engineering.
				const result = await recalculate(order.payload.line_items || [], allCouponLines);

				// Re-check freshness after async recalculate — the order may have
				// changed during engine lookups inside recalculate()
				const latestOrder = currentOrderRecord.getLatest();
				if (
					!isEqual(cartSnapshot, {
						line_items: latestOrder.payload.line_items,
						coupon_lines: latestOrder.payload.coupon_lines,
					})
				) {
					return {
						success: false,
						error: t('pos_cart.cart_changed'),
					};
				}

				const patchResult = await localPatch({
					document: order,
					data: {
						coupon_lines: result.couponLines,
						line_items: result.lineItems,
					},
				});

				if (!patchResult) {
					return {
						success: false,
						error: t('pos_cart.coupon_apply_failed'),
					};
				}

				const appliedCouponLine = result.couponLines.find(
					(cl: any) => cl.code?.toLowerCase() === couponData.code?.toLowerCase()
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
				const message = getErrorMessage(error);
				reportCartFailure(orderLogger, 'Local mutation failed', {
					toastTitle: t('common.there_was_an_error', { message }),
					error,
				});
				return { success: false, error: message };
			}
		},
		[runtime, currentOrderRecord, localPatch, t, orderLogger, recalculate, couponRejectionMessage]
	);

	return { addCoupon };
};

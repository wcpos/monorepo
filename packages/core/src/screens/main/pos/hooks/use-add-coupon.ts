import * as React from 'react';

import { v4 as uuidv4 } from 'uuid';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { buildEnrichedProductCategories } from './coupon-helpers';
import { validateCoupon } from './coupon-validation';
import { useRecalculateCoupons } from './use-recalculate-coupons';
import { parsePosData } from './utils';
import { useT } from '../../../../contexts/translations';
import { useCollection } from '../../hooks/use-collection';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useCurrentOrder } from '../contexts/current-order';

import type { CouponLineItem } from './coupon-helpers';

const cartLogger = getLogger(['wcpos', 'pos', 'cart']);

/**
 * Hook for adding a coupon to the current order.
 *
 * Looks up the coupon code in the local RxDB coupons collection,
 * validates it against the current cart state, calculates the discount,
 * and adds it to the order's coupon_lines.
 */
export const useAddCoupon = () => {
	const { localPatch } = useLocalMutation();
	const t = useT();
	const { currentOrder } = useCurrentOrder();
	const { collection: couponCollection } = useCollection('coupons');
	const { collection: productCollection } = useCollection('products');
	const { collection: categoryCollection } = useCollection('products/categories');
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

	const addCoupon = React.useCallback(
		async (couponCode: string) => {
			try {
				// 1. Look up coupon in local DB (case-insensitive)
				const coupon = await couponCollection
					.findOne({ selector: { code: couponCode.toLowerCase().trim() } })
					.exec();

				if (!coupon) {
					return {
						success: false,
						error: t('pos_cart.coupon_not_found', { defaultValue: 'Coupon not found.' }),
					};
				}

				const order = currentOrder.getLatest();
				const lineItems = (order.line_items || []).filter((item: any) => item.product_id !== null);
				const appliedCouponLines = (order.coupon_lines || []).filter(
					(cl: any): cl is any & { code: string } => cl.code != null
				);
				const appliedCoupons = appliedCouponLines.map((cl: any) => cl.code);

				// 2. Look up applied coupons that have individual_use for reverse check
				const appliedCouponsWithIndividualUse: string[] = [];
				for (const cl of appliedCouponLines) {
					const appliedCouponDoc = await couponCollection
						.findOne({ selector: { code: cl.code } })
						.exec();
					if (appliedCouponDoc?.toJSON().individual_use && cl.code) {
						appliedCouponsWithIndividualUse.push(cl.code);
					}
				}

				// 3. Look up products for category/on_sale info
				const productIds = lineItems.map((item: any) => item.product_id).filter(Boolean);
				const products =
					productIds.length > 0
						? await productCollection.find({ selector: { id: { $in: productIds } } }).exec()
						: [];
				const productMap = new Map(products.map((p: any) => [p.id, p]));

				// Build ancestor-enriched category map for coupon restriction matching.
				// WC's wc_get_product_cat_ids() includes parent categories.
				let productCategoriesMap = new Map<number, { id: number }[]>();
				for (const p of products) {
					if (p.id != null) {
						productCategoriesMap.set(p.id as number, (p.categories || []) as { id: number }[]);
					}
				}
				productCategoriesMap = await buildEnrichedProductCategories(
					productCategoriesMap,
					categoryCollection
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

				const validation = validateCoupon(coupon.toJSON(), {
					lineItems: couponLineItems,
					appliedCoupons,
					appliedCouponsWithIndividualUse,
					cartSubtotal,
					customerEmail: order.billing?.email || '',
					customerId: order.customer_id || null,
				});

				if (!validation.valid) {
					return { success: false, error: validation.error };
				}

				// 5. Create new coupon line and recalculate all coupons from scratch
				const couponData = coupon.toJSON();

				const newCouponLine = {
					code: couponData.code,
					discount: '0',
					discount_tax: '0',
					meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidv4() }],
				};

				// Bail if cart changed during async coupon lookups to avoid stale writes
				if (currentOrder.getLatest() !== order) {
					return {
						success: false,
						error: t('pos_cart.cart_changed', {
							defaultValue: 'Cart changed during coupon application. Please try again.',
						}),
					};
				}

				const allCouponLines = [...(order.coupon_lines || []), newCouponLine];

				// Note: recalculate() re-queries coupon/product docs from RxDB, so
				// there's a theoretical TOCTOU gap if a background sync changes docs
				// between validateCoupon() and recalculate(). In practice the window
				// is milliseconds and the server will re-validate on sync. A full fix
				// would require passing pre-loaded docs into recalculate(), which we
				// defer to avoid over-engineering.
				const result = await recalculate(order.line_items || [], allCouponLines);

				// Re-check freshness after async recalculate — the order may have
				// changed during RxDB lookups inside recalculate()
				if (currentOrder.getLatest() !== order) {
					return {
						success: false,
						error: t('pos_cart.cart_changed', {
							defaultValue: 'Cart changed during coupon application. Please try again.',
						}),
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
						error: t('pos_cart.coupon_apply_failed', {
							defaultValue: 'Failed to apply coupon. Please try again.',
						}),
					};
				}

				const appliedCouponLine = result.couponLines.find(
					(cl: any) => cl.code?.toLowerCase() === couponData.code?.toLowerCase()
				);
				orderLogger.info(t('pos_cart.coupon_applied', { defaultValue: 'Coupon applied' }), {
					context: {
						couponCode: couponData.code,
						discountType: couponData.discount_type,
						discount: appliedCouponLine?.discount ?? '0',
					},
				});

				return { success: true };
			} catch (error) {
				orderLogger.error(
					t('common.there_was_an_error', {
						message: error instanceof Error ? error.message : String(error),
					}),
					{
						showToast: true,
						saveToDb: true,
						context: {
							errorCode: ERROR_CODES.TRANSACTION_FAILED,
							error: error instanceof Error ? error.message : String(error),
						},
					}
				);
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
		[
			couponCollection,
			productCollection,
			categoryCollection,
			currentOrder,
			localPatch,
			t,
			orderLogger,
			recalculate,
		]
	);

	return { addCoupon };
};

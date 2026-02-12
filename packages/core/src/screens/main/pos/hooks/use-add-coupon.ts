import * as React from 'react';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { calculateCouponDiscount } from './coupon-discount';
import { validateCoupon } from './coupon-validation';
import { useAddItemToOrder } from './use-add-item-to-order';
import { useT } from '../../../../contexts/translations';
import { useCollection } from '../../hooks/use-collection';
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
	const { addItemToOrder } = useAddItemToOrder();
	const t = useT();
	const { currentOrder } = useCurrentOrder();
	const { collection: couponCollection } = useCollection('coupons');
	const { collection: productCollection } = useCollection('products');

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
				const appliedCoupons = (order.coupon_lines || []).map((cl: any) => cl.code).filter(Boolean);

				// 2. Look up products for category/on_sale info
				const productIds = lineItems.map((item: any) => item.product_id).filter(Boolean);
				const products =
					productIds.length > 0
						? await productCollection.find({ selector: { id: { $in: productIds } } }).exec()
						: [];
				const productMap = new Map(products.map((p: any) => [p.id, p]));

				// 3. Build validation context
				const couponLineItems: CouponLineItem[] = lineItems.map((item: any) => {
					const product = productMap.get(item.product_id);
					const qty = item.quantity || 1;
					return {
						product_id: item.product_id,
						quantity: qty,
						price: parseFloat(item.subtotal || '0') / qty,
						subtotal: item.subtotal || '0',
						total: item.total || '0',
						categories: product?.categories || [],
						on_sale: product
							? parseFloat(product.price || '0') < parseFloat(product.regular_price || '0')
							: false,
					};
				});

				const cartSubtotal = lineItems.reduce(
					(sum: number, item: any) => sum + parseFloat(item.subtotal || '0'),
					0
				);

				const validation = validateCoupon(coupon.toJSON(), {
					lineItems: couponLineItems,
					appliedCoupons,
					cartSubtotal,
					customerEmail: order.billing?.email || '',
					customerId: order.customer_id || null,
				});

				if (!validation.valid) {
					return { success: false, error: validation.error };
				}

				// 4. Calculate discount
				const couponData = coupon.toJSON();
				const discountResult = calculateCouponDiscount(
					{
						discount_type: couponData.discount_type as any,
						amount: couponData.amount || '0',
						limit_usage_to_x_items: couponData.limit_usage_to_x_items ?? null,
						product_ids: couponData.product_ids || [],
						excluded_product_ids: couponData.excluded_product_ids || [],
						product_categories: couponData.product_categories || [],
						excluded_product_categories: couponData.excluded_product_categories || [],
						exclude_sale_items: couponData.exclude_sale_items || false,
					},
					couponLineItems
				);

				// 5. Add to coupon_lines
				await addItemToOrder('coupon_lines', {
					code: couponData.code,
					discount: String(discountResult.totalDiscount),
					discount_tax: '0',
					meta_data: [],
				});

				orderLogger.info(t('pos_cart.coupon_applied', { defaultValue: 'Coupon applied' }), {
					context: {
						couponCode: couponData.code,
						discountType: couponData.discount_type,
						discount: String(discountResult.totalDiscount),
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
		[couponCollection, productCollection, currentOrder, addItemToOrder, t, orderLogger]
	);

	return { addCoupon };
};

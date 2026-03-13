import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { v4 as uuidv4 } from 'uuid';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { calculateCouponDiscount } from './coupon-discount';
import {
	applyPerItemDiscountsToLineItems,
	calculateCouponDiscountTaxSplit,
	computeDiscountedLineItems,
	convertDiscountsToExTax,
	isProductOnSale,
} from './coupon-helpers';
import { validateCoupon } from './coupon-validation';
import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useTaxRates } from '../../contexts/tax-rates';
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
	const { store } = useAppState();
	const { currentOrder } = useCurrentOrder();
	const { collection: couponCollection } = useCollection('coupons');
	const { collection: productCollection } = useCollection('products');
	const { rates: taxRates, pricesIncludeTax } = useTaxRates();
	const woocommerceSequential = useObservableEagerState(
		(store as any).woocommerce_calc_discounts_sequentially$
	);
	const legacySequential = useObservableEagerState((store as any).calc_discounts_sequentially$);
	const calcDiscountsSequentially = woocommerceSequential === 'yes' || legacySequential === 'yes';

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

				// 4. Build validation context
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
						on_sale: isProductOnSale(product),
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

				// 5. Calculate discount
				const couponData = coupon.toJSON();
				const couponConfig = {
					discount_type: couponData.discount_type as any,
					amount: couponData.amount || '0',
					limit_usage_to_x_items: couponData.limit_usage_to_x_items ?? null,
					product_ids: [...(couponData.product_ids || [])],
					excluded_product_ids: [...(couponData.excluded_product_ids || [])],
					product_categories: [...(couponData.product_categories || [])],
					excluded_product_categories: [...(couponData.excluded_product_categories || [])],
					exclude_sale_items: couponData.exclude_sale_items || false,
				};

				let discountItems = couponLineItems;
				if (calcDiscountsSequentially && appliedCouponLines.length > 0) {
					for (const appliedCouponLine of appliedCouponLines) {
						const appliedCoupon = await couponCollection
							.findOne({ selector: { code: appliedCouponLine.code } })
							.exec();
						if (!appliedCoupon) continue;

						const appliedCouponData = appliedCoupon.toJSON();
						const appliedResult = calculateCouponDiscount(
							{
								discount_type: appliedCouponData.discount_type as any,
								amount: appliedCouponData.amount || '0',
								limit_usage_to_x_items: appliedCouponData.limit_usage_to_x_items ?? null,
								product_ids: [...(appliedCouponData.product_ids || [])],
								excluded_product_ids: [...(appliedCouponData.excluded_product_ids || [])],
								product_categories: [...(appliedCouponData.product_categories || [])],
								excluded_product_categories: [
									...(appliedCouponData.excluded_product_categories || []),
								],
								exclude_sale_items: appliedCouponData.exclude_sale_items || false,
							},
							discountItems
						);

						const exTaxPerItem = convertDiscountsToExTax(
							appliedResult.perItem,
							lineItems,
							appliedCouponData.discount_type,
							pricesIncludeTax
						);
						discountItems = applyPerItemDiscountsToLineItems(discountItems, exTaxPerItem);
					}
				}

				const discountResult = calculateCouponDiscount(couponConfig, discountItems);

				// 6. Normalize discounts to ex-tax, then apply to line items and coupon line
				const exTaxPerItem = convertDiscountsToExTax(
					discountResult.perItem,
					lineItems,
					couponConfig.discount_type,
					pricesIncludeTax
				);

				const latestOrder = currentOrder.getLatest();

				// Bail if cart changed during async coupon lookups to avoid stale writes
				if (latestOrder !== order) {
					return {
						success: false,
						error: t('pos_cart.cart_changed', {
							defaultValue: 'Cart changed during coupon application. Please try again.',
						}),
					};
				}

				const discountedLineItems = computeDiscountedLineItems(latestOrder.line_items || [], [
					exTaxPerItem,
				]);
				const { discount, discount_tax } = calculateCouponDiscountTaxSplit(
					exTaxPerItem,
					lineItems,
					taxRates as {
						id: number;
						rate: string;
						compound: boolean;
						order: number;
						class?: string;
					}[]
				);
				const patchResult = await localPatch({
					document: latestOrder,
					data: {
						coupon_lines: [
							...(latestOrder.coupon_lines || []),
							{
								code: couponData.code,
								discount,
								discount_tax,
								meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidv4() }],
							},
						],
						line_items: discountedLineItems,
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
		[
			couponCollection,
			productCollection,
			currentOrder,
			localPatch,
			t,
			orderLogger,
			calcDiscountsSequentially,
			taxRates,
			pricesIncludeTax,
		]
	);

	return { addCoupon };
};

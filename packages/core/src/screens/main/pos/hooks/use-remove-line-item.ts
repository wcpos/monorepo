import * as React from 'react';

import { getLogger } from '@wcpos/utils/logger';

import { recalculateCoupons } from './coupon-recalculate';
import { useT } from '../../../../contexts/translations';
import { useTaxRates } from '../../contexts/tax-rates';
import { useCollection } from '../../hooks/use-collection';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useCurrentOrder } from '../contexts/current-order';

import type { CouponDiscountConfig } from './coupon-discount';

const cartLogger = getLogger(['wcpos', 'pos', 'cart', 'remove']);

type Line = 'line_items' | 'fee_lines' | 'shipping_lines' | 'coupon_lines';
type LineItem =
	| NonNullable<import('@wcpos/database').OrderDocument['line_items']>[number]
	| NonNullable<import('@wcpos/database').OrderDocument['fee_lines']>[number]
	| NonNullable<import('@wcpos/database').OrderDocument['shipping_lines']>[number]
	| NonNullable<import('@wcpos/database').OrderDocument['coupon_lines']>[number];

/**
 *
 */
export const useRemoveLineItem = () => {
	const { currentOrder } = useCurrentOrder();
	const { localPatch } = useLocalMutation();
	const t = useT();
	const { collection: couponCollection } = useCollection('coupons');
	const { collection: productCollection } = useCollection('products');
	const { rates: taxRates, pricesIncludeTax } = useTaxRates();

	/**
	 *
	 */
	const undoRemove = React.useCallback(
		async (uuid: string, type: Line, itemToRestore: LineItem) => {
			const order = currentOrder.getLatest();

			// Determine if the item with this UUID exists in the current list
			const items = (order[type] ?? []) as LineItem[];
			const itemIndex = items.findIndex((item) =>
				(item.meta_data ?? []).some(
					(meta) => meta.key === '_woocommerce_pos_uuid' && meta.value === uuid
				)
			);

			let updatedLines: LineItem[];

			if (itemIndex >= 0) {
				// If item exists, replace the existing one with the restored one
				updatedLines = [...items];
				updatedLines[itemIndex] = itemToRestore;
			} else {
				// If item does not exist, add the restored item to the array
				updatedLines = [...items, itemToRestore];
			}

			// Perform the patch to restore the item
			await localPatch({
				document: order,
				data: {
					[type]: updatedLines,
				},
			});
		},
		[currentOrder, localPatch]
	);

	/**
	 * In WooCommerce, if one of the follwing is null then the line item is removed
	 * 'product_id', 'method_id', 'method_title', 'name', 'code'
	 *
	 * If quantity is 0, then the line item is also removed, but we will stick with product_id for now
	 */
	const removeLineItem = React.useCallback(
		async (uuid: string, type: Line) => {
			const order = currentOrder.getLatest();
			let itemToRestore: LineItem | undefined;

			const items = (order[type] ?? []) as LineItem[];
			const updatedLines = items
				.map((item) => {
					if (
						(item.meta_data ?? []).some(
							(meta) => meta.key === '_woocommerce_pos_uuid' && meta.value === uuid
						)
					) {
						itemToRestore = item;
						if (item.id) {
							switch (type) {
								case 'line_items':
									return { ...item, product_id: null };
								case 'fee_lines':
									return { ...item, name: null };
								case 'shipping_lines':
									return { ...item, method_id: null };
								case 'coupon_lines':
									return { ...item, code: null };
								default:
									return item;
							}
						}
						return null; // If item should be removed completely, return null (to be filtered out later)
					}
					return item;
				})
				.filter((item) => item !== null);

			// Check if this is a line_items removal and order has active coupons
			const activeCouponLines = (order.coupon_lines || []).filter((cl: any) => cl.code != null);

			if (type === 'line_items' && activeCouponLines.length > 0) {
				// Filter to remaining valid line items (not nulled product_id)
				const remainingLineItems = updatedLines.filter((item: any) => item.product_id != null);

				// Build couponConfigs
				const couponConfigs = new Map<string, CouponDiscountConfig>();
				for (const cl of activeCouponLines) {
					const code = (cl as any).code.toLowerCase();
					const couponDoc = await couponCollection.findOne({ selector: { code } }).exec();
					if (couponDoc) {
						const cd = couponDoc.toJSON();
						couponConfigs.set(code, {
							discount_type: cd.discount_type as any,
							amount: cd.amount || '0',
							limit_usage_to_x_items: cd.limit_usage_to_x_items ?? null,
							product_ids: [...(cd.product_ids || [])],
							excluded_product_ids: [...(cd.excluded_product_ids || [])],
							product_categories: [...(cd.product_categories || [])],
							excluded_product_categories: [...(cd.excluded_product_categories || [])],
							exclude_sale_items: cd.exclude_sale_items || false,
						});
					}
				}

				// Build product categories
				const productCategories = new Map<number, { id: number }[]>();
				const productIds = remainingLineItems.map((item: any) => item.product_id).filter(Boolean);
				if (productIds.length > 0) {
					const products = await productCollection
						.find({ selector: { id: { $in: productIds } } })
						.exec();
					for (const p of products) {
						productCategories.set(p.id, p.categories || []);
					}
				}

				const result = recalculateCoupons({
					lineItems: updatedLines as any,
					couponLines: order.coupon_lines || [],
					couponConfigs,
					pricesIncludeTax,
					calcDiscountsSequentially: false,
					taxRates: taxRates as any,
					productCategories,
				});

				localPatch({
					document: order,
					data: {
						line_items: result.lineItems,
						coupon_lines: result.couponLines,
					},
				});
			} else {
				// Original behavior for non-line_items or no coupons
				localPatch({
					document: order,
					data: {
						[type]: updatedLines,
					},
				});
			}

			if (itemToRestore) {
				const itemName =
					(itemToRestore as Record<string, unknown>).name ??
					(itemToRestore as Record<string, unknown>).method_title;
				cartLogger.success(
					t('pos.removed_from_cart', {
						name: itemName,
					}),
					{
						showToast: true,
						saveToDb: true,
						toast: {
							dismissable: true,
							action: {
								label: t('common.undo'),
								onClick: () => undoRemove(uuid, type, itemToRestore!),
							},
						},
						context: {
							itemName,
							itemType: type,
							orderId: currentOrder.id,
						},
					}
				);
			} else {
				// should we show a snackbar if the item was not found?
			}
		},
		[
			currentOrder,
			localPatch,
			t,
			undoRemove,
			couponCollection,
			productCollection,
			taxRates,
			pricesIncludeTax,
		]
	);

	return { removeLineItem };
};

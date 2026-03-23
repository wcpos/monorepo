import * as React from 'react';

import unset from 'lodash/unset';
import { v4 as uuidv4 } from 'uuid';

import { recalculateCoupons } from './coupon-recalculate';
import { useCalculateLineItemTaxAndTotals } from './use-calculate-line-item-tax-and-totals';
import { useLineItemData } from './use-line-item-data';
import { updatePosDataMeta } from './utils';
import { useTaxRates } from '../../contexts/tax-rates';
import { useCollection } from '../../hooks/use-collection';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useCurrentOrder } from '../contexts/current-order';

import type { CouponDiscountConfig } from './coupon-discount';

type LineItem = NonNullable<import('@wcpos/database').OrderDocument['line_items']>[number];

interface Changes extends Partial<Omit<LineItem, 'price'>> {
	price?: number;
	regular_price?: number;
	tax_status?: string;
}

/**
 *
 */
export const useUpdateLineItem = () => {
	const { currentOrder } = useCurrentOrder();
	const { localPatch } = useLocalMutation();
	const { calculateLineItemTaxesAndTotals } = useCalculateLineItemTaxAndTotals();
	const { getLineItemData } = useLineItemData();
	const { collection: couponCollection } = useCollection('coupons');
	const { collection: productCollection } = useCollection('products');
	const { rates: taxRates, pricesIncludeTax } = useTaxRates();

	/**
	 * Update line item
	 *
	 * @TODO - what if more than one property is changed at once?
	 */
	const updateLineItem = React.useCallback(
		async (uuid: string, changes: Changes) => {
			const order = currentOrder.getLatest();
			const json = order.toMutableJSON();
			let updated = false;

			const updatedLineItems = json.line_items?.map((lineItem) => {
				if (
					updated ||
					!lineItem.meta_data?.some((m) => m.key === '_woocommerce_pos_uuid' && m.value === uuid)
				) {
					return lineItem;
				}

				// get previous line data from meta_data
				const prevData = getLineItemData(lineItem);

				// extract the meta_data from the changes
				const { price, regular_price, tax_status, ...rest } = changes;

				// merge the previous line data with the rest of the changes
				let updatedItem = { ...lineItem, ...rest };

				// apply the changes to the shipping line
				updatedItem = updatePosDataMeta(updatedItem, {
					price: price ?? prevData.price,
					regular_price: regular_price ?? prevData.regular_price,
					tax_status: tax_status ?? prevData.tax_status,
				});

				updatedItem = calculateLineItemTaxesAndTotals(updatedItem);
				updated = true;
				return updatedItem;
			});

			// if we have updated a line item, patch the order
			if (updated && updatedLineItems) {
				// Check if order has active coupons
				const activeCouponLines = (json.coupon_lines || []).filter((cl: any) => cl.code != null);

				if (activeCouponLines.length > 0) {
					// Build couponConfigs for all active coupons
					const couponConfigs = new Map<string, CouponDiscountConfig>();
					for (const cl of activeCouponLines) {
						const code = cl.code!.toLowerCase();
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
					const productIds = updatedLineItems.map((item: any) => item.product_id).filter(Boolean);
					if (productIds.length > 0) {
						const products = await productCollection
							.find({ selector: { id: { $in: productIds } } })
							.exec();
						for (const p of products) {
							if (p.id != null)
								productCategories.set(p.id, (p.categories || []) as { id: number }[]);
						}
					}

					const result = recalculateCoupons({
						lineItems: updatedLineItems,
						couponLines: json.coupon_lines || [],
						couponConfigs,
						pricesIncludeTax,
						calcDiscountsSequentially: false,
						taxRates: taxRates as any,
						productCategories,
					});

					return localPatch({
						document: order,
						data: {
							line_items: result.lineItems,
							coupon_lines: result.couponLines,
						},
					});
				}

				// No coupons — just patch line items as before
				return localPatch({ document: order, data: { line_items: updatedLineItems } });
			}
		},
		[
			calculateLineItemTaxesAndTotals,
			currentOrder,
			getLineItemData,
			localPatch,
			couponCollection,
			productCollection,
			taxRates,
			pricesIncludeTax,
		]
	);

	/**
	 *
	 */
	const splitLineItem = React.useCallback(
		async (uuid: string) => {
			const order = currentOrder.getLatest();
			const lineItemIndex = (order.line_items ?? []).findIndex((item) =>
				(item.meta_data ?? []).some(
					(meta) => meta.key === '_woocommerce_pos_uuid' && meta.value === uuid
				)
			);

			if (lineItemIndex === -1) {
				console.error('Line item not found');
				return;
			}

			const lineItemToSplit = (order.line_items ?? [])[lineItemIndex];

			if ((lineItemToSplit?.quantity ?? 0) <= 1) {
				console.error('Line item quantity must be greater than 1');
				return;
			}

			const lineItemToCopy = calculateLineItemTaxesAndTotals({ ...lineItemToSplit, quantity: 1 });
			const quantity = Math.floor(lineItemToSplit?.quantity ?? 0);
			const rawRemainder = (lineItemToSplit?.quantity ?? 0) - quantity;
			const remainder = parseFloat(rawRemainder.toFixed(6));
			const newLineItems = [{ ...lineItemToCopy }];
			unset(lineItemToCopy, 'id'); // remove id so it is treated as a new item

			for (let i = 1; i < quantity; i++) {
				const newItem = {
					...lineItemToCopy,
					meta_data: (lineItemToCopy.meta_data ?? []).map((meta) =>
						meta.key === '_woocommerce_pos_uuid' ? { ...meta, value: uuidv4() } : meta
					),
				};
				newLineItems.push(newItem);
			}

			if (remainder > 0) {
				const remainderLineItem = calculateLineItemTaxesAndTotals({
					...lineItemToCopy,
					quantity: remainder,
				});
				const newItem = {
					...remainderLineItem,
					quantity: remainder,
					meta_data: (remainderLineItem.meta_data ?? []).map((meta) =>
						meta.key === '_woocommerce_pos_uuid' ? { ...meta, value: uuidv4() } : meta
					),
				};
				newLineItems.push(newItem);
			}

			// Replace the original item with the new items in the order
			const updatedLineItems = [
				...(order.line_items ?? []).slice(0, lineItemIndex),
				...newLineItems,
				...(order.line_items ?? []).slice(lineItemIndex + 1),
			];

			return localPatch({ document: order, data: { line_items: updatedLineItems } });
		},
		[calculateLineItemTaxesAndTotals, currentOrder, localPatch]
	);

	return { updateLineItem, splitLineItem };
};

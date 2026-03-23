import * as React from 'react';

import { getLogger } from '@wcpos/utils/logger';

import { useRecalculateCoupons } from './use-recalculate-coupons';
import { useT } from '../../../../contexts/translations';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useCurrentOrder } from '../contexts/current-order';

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
	const { recalculate } = useRecalculateCoupons();

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

			// If restoring a line_items entry and order has active coupons,
			// recalculate coupons to keep discounts consistent (mirrors removal path).
			const activeCouponLines = (order.coupon_lines || []).filter((cl: any) => cl.code != null);

			if (type === 'line_items' && activeCouponLines.length > 0) {
				const result = await recalculate(updatedLines as any, order.coupon_lines || []);
				await localPatch({
					document: order,
					data: {
						line_items: result.lineItems,
						coupon_lines: result.couponLines,
					},
				});
			} else if (type === 'coupon_lines') {
				// Restoring a coupon — recalculate line_items with the restored coupon
				const result = await recalculate(order.line_items || [], updatedLines as any);
				await localPatch({
					document: order,
					data: {
						line_items: result.lineItems,
						coupon_lines: result.couponLines,
					},
				});
			} else {
				await localPatch({
					document: order,
					data: {
						[type]: updatedLines,
					},
				});
			}
		},
		[currentOrder, localPatch, recalculate]
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
				const result = await recalculate(updatedLines as any, order.coupon_lines || []);

				await localPatch({
					document: order,
					data: {
						line_items: result.lineItems,
						coupon_lines: result.couponLines,
					},
				});
			} else if (type === 'coupon_lines') {
				// Removing a coupon — recalculate line_items without this coupon
				const result = await recalculate(order.line_items || [], updatedLines as any);
				await localPatch({
					document: order,
					data: {
						line_items: result.lineItems,
						coupon_lines: result.couponLines,
					},
				});
			} else {
				// Original behavior for fee_lines/shipping_lines or no coupons
				await localPatch({
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
		[currentOrder, localPatch, t, undoRemove, recalculate]
	);

	return { removeLineItem };
};

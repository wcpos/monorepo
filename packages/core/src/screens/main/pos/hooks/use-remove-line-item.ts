import * as React from 'react';

import { getLogger } from '@wcpos/utils/logger';
import { wooMetaCarrier } from '@wcpos/sync-core';

import { reportStaleCartLine } from './cart-failure';
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
	const { currentOrderRecord } = useCurrentOrder();
	const { localPatch } = useLocalMutation();
	const t = useT();

	/**
	 *
	 */
	const undoRemove = React.useCallback(
		async (uuid: string, type: Line, itemToRestore: LineItem) => {
			const order = currentOrderRecord.getLatest();

			// Determine if the item with this UUID exists in the current list
			const items = (order.payload[type] ?? []) as LineItem[];
			const itemIndex = items.findIndex((item) => wooMetaCarrier.lineUuid(item) === uuid);

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
		[currentOrderRecord, localPatch]
	);

	/**
	 * In WooCommerce, if one of the follwing is null then the line item is removed
	 * 'product_id', 'method_id', 'method_title', 'name', 'code'
	 *
	 * If quantity is 0, then the line item is also removed, but we will stick with product_id for now
	 */
	const removeLineItem = React.useCallback(
		async (uuid: string, type: Line) => {
			const order = currentOrderRecord.getLatest();
			let itemToRestore: LineItem | undefined;

			const items = (order.payload[type] ?? []) as LineItem[];
			const updatedLines = items
				.map((item) => {
					if (wooMetaCarrier.lineUuid(item) === uuid) {
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

			// update the order with the item removed
			await localPatch({
				document: order,
				data: {
					[type]: updatedLines,
				},
			});

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
						toast: {
							dismissable: true,
							action: {
								label: t('common.undo'),
								onClick: () => void undoRemove(uuid, type, itemToRestore!),
							},
						},
						context: {
							itemName,
							itemType: type,
							orderId: currentOrderRecord.payload.id,
						},
					}
				);
			} else {
				// The uuid isn't in the order document — the cashier acted on a stale row
				// (multi-tab is first-class). Cashier-full-information ruling: say so.
				reportStaleCartLine(cartLogger, 'Remove tapped for a line that is no longer in the cart', {
					toastTitle: t('pos_cart.remove_line_not_found'),
					context: { uuid, itemType: type, orderId: currentOrderRecord.payload.id },
				});
			}
		},
		[currentOrderRecord, localPatch, t, undoRemove]
	);

	return { removeLineItem };
};

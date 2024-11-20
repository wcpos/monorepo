import * as React from 'react';

import { Toast } from '@wcpos/components/src/toast';

import { useT } from '../../../../contexts/translations';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useCurrentOrder } from '../contexts/current-order';

type Line = 'line_items' | 'fee_lines' | 'shipping_lines';
type LineItem =
	| import('@wcpos/database').OrderDocument['line_items'][number]
	| import('@wcpos/database').OrderDocument['fee_lines'][number]
	| import('@wcpos/database').OrderDocument['shipping_lines'][number];

/**
 *
 */
export const useRemoveLineItem = () => {
	const { currentOrder } = useCurrentOrder();
	const { localPatch } = useLocalMutation();
	const t = useT();

	/**
	 *
	 */
	const undoRemove = React.useCallback(
		async (uuid: string, type: Line, itemToRestore: LineItem) => {
			const order = currentOrder.getLatest();

			// Determine if the item with this UUID exists in the current list
			const itemIndex = order[type].findIndex((item) =>
				item.meta_data.some((meta) => meta.key === '_woocommerce_pos_uuid' && meta.value === uuid)
			);

			let updatedLines;

			if (itemIndex >= 0) {
				// If item exists, replace the existing one with the restored one
				updatedLines = [...order[type]];
				updatedLines[itemIndex] = itemToRestore;
			} else {
				// If item does not exist, add the restored item to the array
				updatedLines = [...order[type], itemToRestore];
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
		(uuid: string, type: Line) => {
			const order = currentOrder.getLatest();
			let itemToRestore: LineItem | undefined;

			const updatedLines = (order[type] || [])
				.map((item) => {
					if (
						item.meta_data.some(
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
			localPatch({
				document: order,
				data: {
					[type]: updatedLines,
				},
			});

			if (itemToRestore) {
				Toast.show({
					type: 'success',
					text1: t('{name} removed from cart', {
						name: itemToRestore?.name || itemToRestore?.method_title,
						_tags: 'core',
					}),
					props: {
						dismissable: true,
						action: {
							label: t('Undo', { _tags: 'core' }),
							action: () => undoRemove(uuid, type, itemToRestore),
						},
					},
				});
			} else {
				// should we show a snackbar if the item was not found?
			}
		},
		[currentOrder, localPatch, t, undoRemove]
	);

	return { removeLineItem };
};

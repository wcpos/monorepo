import * as React from 'react';

import unset from 'lodash/unset';
import { v4 as uuidv4 } from 'uuid';

import { useCalculateLineItemTaxAndTotals } from './use-calculate-line-item-tax-and-totals';
import { useCartStockGuard } from './use-cart-stock-guard';
import { useLineItemData } from './use-line-item-data';
import { enqueueOrderMutation } from './order-mutation-queue';
import { updatePosDataMeta } from './utils';
import { documentRecordId, useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useCurrentOrder } from '../contexts/current-order';

type LineItem = NonNullable<import('@wcpos/database').OrderDocument['line_items']>[number];

interface Changes extends Partial<Omit<LineItem, 'price'>> {
	price?: number;
	regular_price?: number;
	tax_status?: string;
	virtual?: boolean;
	downloadable?: boolean;
	categories?: { id: number; name: string }[];
}

interface UpdateLineItemOptions {
	skipStockGuard?: boolean;
}

/**
 *
 */
export const useUpdateLineItem = () => {
	const { currentOrder } = useCurrentOrder();
	const { localPatch } = useLocalMutation();
	const { calculateLineItemTaxesAndTotals } = useCalculateLineItemTaxAndTotals();
	const { getLineItemData } = useLineItemData();
	const { stockGuardEnabled, checkCartStock, showBackorderWarning } = useCartStockGuard();

	/**
	 * Update line item
	 *
	 * @TODO - what if more than one property is changed at once?
	 */
	const applyLineItemChanges = React.useCallback(
		async (uuid: string, changes: Changes, options?: UpdateLineItemOptions) => {
			const order = currentOrder.getLatest();
			const json = order.toMutableJSON();
			let updated = false;
			let stockWarningName: string | null = null;
			const lineItemToUpdate = json.line_items?.find((lineItem) =>
				lineItem.meta_data?.some(
					(meta) => meta.key === '_woocommerce_pos_uuid' && meta.value === uuid
				)
			);

			if (
				stockGuardEnabled &&
				!options?.skipStockGuard &&
				lineItemToUpdate &&
				lineItemToUpdate.product_id !== 0 &&
				typeof changes.quantity === 'number' &&
				changes.quantity > (lineItemToUpdate.quantity ?? 0)
			) {
				const stockResult = await checkCartStock({
					lineItems: json.line_items ?? [],
					productId: lineItemToUpdate.product_id ?? 0,
					variationId: lineItemToUpdate.variation_id ?? 0,
					requestedQuantity: changes.quantity,
					excludedLineItemUuid: uuid,
					name: lineItemToUpdate.name,
				});
				if (!stockResult.allowed) return false;
				if (stockResult.warning === 'backorder') {
					stockWarningName = stockResult.name;
				}
			}

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
				const { price, regular_price, tax_status, virtual, downloadable, categories, ...rest } =
					changes;

				// merge the previous line data with the rest of the changes
				let updatedItem = { ...lineItem, ...rest };

				// apply the changes to the shipping line
				updatedItem = updatePosDataMeta(updatedItem, {
					price: price ?? prevData.price,
					regular_price: regular_price ?? prevData.regular_price,
					tax_status: tax_status ?? prevData.tax_status,
					...(virtual !== undefined && { virtual }),
					...(downloadable !== undefined && { downloadable }),
					...(categories !== undefined && { categories }),
				});

				updatedItem = calculateLineItemTaxesAndTotals(updatedItem);
				updated = true;
				return updatedItem;
			});

			// if we have updated a line item, patch the order
			if (updated && updatedLineItems) {
				const result = await localPatch({
					document: order,
					data: { line_items: updatedLineItems },
				});
				if (stockWarningName !== null) showBackorderWarning(stockWarningName);
				return result;
			}
		},
		[
			calculateLineItemTaxesAndTotals,
			checkCartStock,
			currentOrder,
			getLineItemData,
			localPatch,
			showBackorderWarning,
			stockGuardEnabled,
		]
	);

	const updateLineItem = React.useCallback(
		async (uuid: string, changes: Changes, options?: UpdateLineItemOptions) => {
			const recordId = documentRecordId(currentOrder.getLatest());
			if (!recordId) throw new Error('Order is missing its uuid');
			return enqueueOrderMutation(recordId, () => applyLineItemChanges(uuid, changes, options));
		},
		[applyLineItemChanges, currentOrder]
	);

	const incrementLineItem = React.useCallback(
		async (uuid: string, quantity: number) => {
			const recordId = documentRecordId(currentOrder.getLatest());
			if (!recordId) throw new Error('Order is missing its uuid');
			return enqueueOrderMutation(recordId, async () => {
				const lineItem = currentOrder
					.getLatest()
					.toMutableJSON()
					.line_items?.find((item) =>
						item.meta_data?.some(
							(meta) => meta.key === '_woocommerce_pos_uuid' && meta.value === uuid
						)
					);
				if (!lineItem) return;
				return applyLineItemChanges(uuid, {
					quantity: (lineItem.quantity ?? 0) + quantity,
				});
			});
		},
		[applyLineItemChanges, currentOrder]
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

	return { updateLineItem, incrementLineItem, splitLineItem };
};

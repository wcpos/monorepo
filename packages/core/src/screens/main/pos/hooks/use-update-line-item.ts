import * as React from 'react';

import unset from 'lodash/unset';
import { v4 as uuidv4 } from 'uuid';

import { POS_META_KEYS, wooMetaCarrier } from '@wcpos/sync-core';
import { getLogger } from '@wcpos/utils/logger';

import { useCalculateLineItemTaxAndTotals } from './use-calculate-line-item-tax-and-totals';
import { useCartStockGuard } from './use-cart-stock-guard';
import { useLineItemData } from './use-line-item-data';
import { enqueueOrderMutation } from './order-mutation-queue';
import { updatePosDataMeta } from './utils';
import { documentRecordId, useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useCurrentOrderActions } from '../contexts/current-order';

type OrderDocument = import('@wcpos/database').OrderDocument;
type LineItem = NonNullable<OrderDocument['line_items']>[number];

const cartLogger = getLogger(['wcpos', 'pos', 'cart', 'line-item']);

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
	// Event-time resolution — reached from every product tile via useAddProduct.
	const { getCurrentOrder } = useCurrentOrderActions();
	const { localPatch } = useLocalMutation();
	const { calculateLineItemTaxesAndTotals } = useCalculateLineItemTaxAndTotals();
	const { getLineItemData } = useLineItemData();
	const { stockGuardEnabled, checkCartStock, showBackorderWarning } = useCartStockGuard();

	/**
	 * Update line item
	 *
	 * @TODO - what if more than one property is changed at once?
	 */
	/**
	 * Takes the order it must operate on rather than resolving the CURRENT one.
	 *
	 * These mutations are queued, so execution can be arbitrarily later than the press. If
	 * this resolved `getCurrentOrder()` at execution time, a cashier who switched order tabs
	 * while a mutation was still queued would have it applied to the wrong order: the queue is
	 * keyed by the order that was selected at enqueue time, so the edit either lands in the
	 * new order or is silently dropped when its line is not found there.
	 *
	 * The caller captures the order at press time and threads it through. `getLatest()` still
	 * gets the freshest revision — of that order.
	 */
	const applyLineItemChanges = React.useCallback(
		async (
			capturedOrder: OrderDocument,
			uuid: string,
			changes: Changes,
			options?: UpdateLineItemOptions
		) => {
			const order = capturedOrder.getLatest();
			const json = order.toMutableJSON();
			let updated = false;
			let stockWarningName: string | null = null;
			const lineItemToUpdate = json.line_items?.find(
				(lineItem) => wooMetaCarrier.lineUuid(lineItem) === uuid
			);
			const previousData = lineItemToUpdate ? getLineItemData(lineItemToUpdate) : undefined;

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
				if (updated || wooMetaCarrier.lineUuid(lineItem) !== uuid) {
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
				if (result && lineItemToUpdate) {
					cartLogger.info('Cart line item updated', {
						context: {
							event: 'cart.line-item.updated',
							orderId: order.uuid ?? order.id,
							productName: lineItemToUpdate.name,
							previousQuantity: lineItemToUpdate.quantity,
							quantity: changes.quantity,
							previousPrice: previousData?.price,
							price: changes.price,
						},
					});
				}
				if (stockWarningName !== null) showBackorderWarning(stockWarningName);
				return result;
			}
		},
		[
			calculateLineItemTaxesAndTotals,
			checkCartStock,
			getLineItemData,
			localPatch,
			showBackorderWarning,
			stockGuardEnabled,
		]
	);

	const updateLineItem = React.useCallback(
		async (uuid: string, changes: Changes, options?: UpdateLineItemOptions) => {
			// Captured at press time, so the queued work operates on the order it was queued for.
			const capturedOrder = getCurrentOrder();
			const recordId = documentRecordId(capturedOrder.getLatest());
			if (!recordId) throw new Error('Order is missing its uuid');
			return enqueueOrderMutation(recordId, () =>
				applyLineItemChanges(capturedOrder, uuid, changes, options)
			);
		},
		[applyLineItemChanges, getCurrentOrder]
	);

	const incrementLineItem = React.useCallback(
		async (uuid: string, quantity: number) => {
			const capturedOrder = getCurrentOrder();
			const recordId = documentRecordId(capturedOrder.getLatest());
			if (!recordId) throw new Error('Order is missing its uuid');
			return enqueueOrderMutation(recordId, async () => {
				const lineItem = capturedOrder
					.getLatest()
					.toMutableJSON()
					.line_items?.find((item) => wooMetaCarrier.lineUuid(item) === uuid);
				if (!lineItem) return;
				return applyLineItemChanges(capturedOrder, uuid, {
					quantity: (lineItem.quantity ?? 0) + quantity,
				});
			});
		},
		[applyLineItemChanges, getCurrentOrder]
	);

	/**
	 *
	 */
	const splitLineItem = React.useCallback(
		async (uuid: string) => {
			const order = getCurrentOrder().getLatest();
			const lineItemIndex = (order.line_items ?? []).findIndex(
				(item) => wooMetaCarrier.lineUuid(item) === uuid
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
						meta.key === POS_META_KEYS.lineUuid ? { ...meta, value: uuidv4() } : meta
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
						meta.key === POS_META_KEYS.lineUuid ? { ...meta, value: uuidv4() } : meta
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
		[calculateLineItemTaxesAndTotals, getCurrentOrder, localPatch]
	);

	return { updateLineItem, incrementLineItem, splitLineItem };
};

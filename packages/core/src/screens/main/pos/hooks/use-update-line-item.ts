import * as React from 'react';

import unset from 'lodash/unset';
import { v4 as uuidv4 } from 'uuid';

import { calculateCartLine } from '@wcpos/order-math';
import {
	isMiscProductLine,
	MISC_PRODUCT_ID,
	POS_META_KEYS,
	wooMetaCarrier,
} from '@wcpos/sync-core';
import { getLogger } from '@wcpos/utils/logger';

import { reportCartInvariant } from './cart-failure';
import { useCartConfig } from './use-cart-config';
import { useCartStockGuard } from './use-cart-stock-guard';
// Still needed for the previous-price value in the update log, not for the merge.
import { useLineItemData } from './use-line-item-data';
import { enqueueOrderMutation } from './order-mutation-queue';
import { documentRecordId, useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { type CurrentOrderRecord, useCurrentOrderActions } from '../contexts/current-order';

type OrderDocument = import('@wcpos/database').OrderDocument;
type LineItem = NonNullable<OrderDocument['line_items']>[number];

const cartLogger = getLogger(['wcpos', 'pos', 'cart', 'line-item']);

interface Changes extends Partial<Omit<LineItem, 'price'>> {
	price?: number;
	regular_price?: number;
	tax_status?: 'taxable' | 'none';
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
	const { getCurrentOrderRecord } = useCurrentOrderActions();
	const { localPatch } = useLocalMutation();
	const cartConfig = useCartConfig();
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
	 * this resolved `getCurrentOrderRecord()` at execution time, a cashier who switched order tabs
	 * while a mutation was still queued would have it applied to the wrong order: the queue is
	 * keyed by the order that was selected at enqueue time, so the edit either lands in the
	 * new order or is silently dropped when its line is not found there.
	 *
	 * The caller captures the order at press time and threads it through. `getLatest()` still
	 * gets the freshest revision — of that order.
	 */
	const applyLineItemChanges = React.useCallback(
		async (
			capturedOrder: CurrentOrderRecord,
			uuid: string,
			changes: Changes,
			options?: UpdateLineItemOptions
		) => {
			const order = capturedOrder.getLatest();
			const json = order.toMutableJSON().payload;
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
				!isMiscProductLine(lineItemToUpdate) &&
				typeof changes.quantity === 'number' &&
				changes.quantity > (lineItemToUpdate.quantity ?? 0)
			) {
				const stockResult = await checkCartStock({
					lineItems: json.line_items ?? [],
					productId: lineItemToUpdate.product_id ?? MISC_PRODUCT_ID,
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

				// The changes-merge (pos_data fields with `?? previous` fallbacks, the
				// misc-product flags written only when supplied, everything else straight
				// through) and the tax maths are both the engine's now. See
				// `applyLineItemChanges` / `computeLineItem` in @wcpos/order-math.
				//
				// `warnings` (malformed pos_data) is dropped here, as it is at every other
				// engine call site in core — settle drops it too.
				const { line: updatedItem } = calculateCartLine(
					{ kind: 'line_item', line: lineItem, changes },
					cartConfig
				);
				updated = true;
				// The engine speaks structural line types; this boundary writes back to the
				// DB document they came from.
				return updatedItem as LineItem;
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
							orderId: order.uuid ?? order.payload.id,
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
			cartConfig,
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
			const capturedOrder = getCurrentOrderRecord();
			const recordId = documentRecordId(capturedOrder.getLatest());
			if (!recordId) throw new Error('Order is missing its uuid');
			return enqueueOrderMutation(recordId, () =>
				applyLineItemChanges(capturedOrder, uuid, changes, options)
			);
		},
		[applyLineItemChanges, getCurrentOrderRecord]
	);

	const incrementLineItem = React.useCallback(
		async (uuid: string, quantity: number) => {
			const capturedOrder = getCurrentOrderRecord();
			const recordId = documentRecordId(capturedOrder.getLatest());
			if (!recordId) throw new Error('Order is missing its uuid');
			return enqueueOrderMutation(recordId, async () => {
				const lineItem = capturedOrder
					.getLatest()
					.toMutableJSON()
					.payload.line_items?.find((item) => wooMetaCarrier.lineUuid(item) === uuid);
				if (!lineItem) return;
				return applyLineItemChanges(capturedOrder, uuid, {
					quantity: (lineItem.quantity ?? 0) + quantity,
				});
			});
		},
		[applyLineItemChanges, getCurrentOrderRecord]
	);

	/**
	 *
	 */
	const splitLineItem = React.useCallback(
		async (uuid: string) => {
			const capturedOrder = getCurrentOrderRecord();
			const recordId = documentRecordId(capturedOrder.getLatest());
			if (!recordId) throw new Error('Order is missing its uuid');
			return enqueueOrderMutation(recordId, async () => {
				const order = capturedOrder.getLatest();
				const lineItemIndex = (order.payload.line_items ?? []).findIndex(
					(item) => wooMetaCarrier.lineUuid(item) === uuid
				);

				if (lineItemIndex === -1) {
					// Unreachable through the UI (the Split link only renders on an existing
					// line) — an invariant break, so log with a code rather than toasting.
					reportCartInvariant(cartLogger, 'Split targeted a line item that is not in the cart', {
						uuid,
						orderId: order.payload.id,
					});
					return;
				}

				const lineItemToSplit = (order.payload.line_items ?? [])[lineItemIndex];

				if ((lineItemToSplit?.quantity ?? 0) <= 1) {
					// Unreachable through the UI (Split only renders when quantity > 1).
					reportCartInvariant(cartLogger, 'Split requires a line item quantity greater than 1', {
						uuid,
						quantity: lineItemToSplit?.quantity ?? 0,
						orderId: order.payload.id,
					});
					return;
				}

				const lineItemToCopy = calculateCartLine(
					{ kind: 'line_item', line: { ...lineItemToSplit, quantity: 1 } },
					cartConfig
				).line as LineItem;
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
					const remainderLineItem = calculateCartLine(
						{ kind: 'line_item', line: { ...lineItemToCopy, quantity: remainder } },
						cartConfig
					).line as LineItem;
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
					...(order.payload.line_items ?? []).slice(0, lineItemIndex),
					...newLineItems,
					...(order.payload.line_items ?? []).slice(lineItemIndex + 1),
				];

				return localPatch({ document: order, data: { line_items: updatedLineItems } });
			});
		},
		[cartConfig, getCurrentOrderRecord, localPatch]
	);

	return { updateLineItem, incrementLineItem, splitLineItem };
};

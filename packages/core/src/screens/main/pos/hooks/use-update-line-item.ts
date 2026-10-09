import * as React from 'react';

import unset from 'lodash/unset';
import { v4 as uuidv4 } from 'uuid';

import { calculateCartLine, type EngineWarning } from '@wcpos/order-math';
import { POS_META_KEYS, wooMetaCarrier } from '@wcpos/sync-core';
import { getLogger } from '@wcpos/utils/logger';

import { reportCartInvariant } from './cart-failure';
import { useCartConfig } from './use-cart-config';
import './stock-guard-hook';
import { useActionContext } from './use-action-context';
import {
	dispatchAction,
	isActionRefusal,
	presentActionRefusal,
} from '../../../../extensions/actions';
// Still needed for the previous-price value in the update log, not for the merge.
import { useLineItemData } from './use-line-item-data';
import { enqueueOrderMutation, type OrderMutationContext } from './order-mutation-queue';
import { documentRecordId, useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { type CurrentOrderRecord, useCurrentOrderActions } from '../contexts/current-order';
import { useReportEngineWarnings } from '../contexts/order-engine-warnings';

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
	const reportEngineWarnings = useReportEngineWarnings();
	const { getLineItemData } = useLineItemData();
	const { ctx, actor } = useActionContext();

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
	const writeLineItemChanges = React.useCallback(
		async (capturedOrder: CurrentOrderRecord, uuid: string, changes: Changes) => {
			const order = capturedOrder.getLatest();
			const json = order.toMutableJSON().payload;
			let updated = false;
			let warnings: readonly EngineWarning[] = [];
			const lineItemToUpdate = json.line_items?.find(
				(lineItem) => wooMetaCarrier.lineUuid(lineItem) === uuid
			);
			const previousData = lineItemToUpdate ? getLineItemData(lineItemToUpdate) : undefined;

			const updatedLineItems = json.line_items?.map((lineItem) => {
				if (updated || wooMetaCarrier.lineUuid(lineItem) !== uuid) {
					return lineItem;
				}

				// The changes-merge (pos_data fields with `?? previous` fallbacks, the
				// misc-product flags written only when supplied, everything else straight
				// through) and the tax maths are both the engine's now. See
				// `applyLineItemChanges` / `computeLineItem` in @wcpos/order-math.
				const { line: updatedItem, warnings: lineWarnings } = calculateCartLine(
					{ kind: 'line_item', line: lineItem, changes },
					cartConfig
				);
				updated = true;
				warnings = lineWarnings;
				// The engine speaks structural line types; this boundary writes back to the
				// DB document they came from.
				return updatedItem as LineItem;
			});

			reportEngineWarnings(warnings, { orderId: order.uuid, site: 'useUpdateLineItem' });

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
				return result;
			}
		},
		[cartConfig, getLineItemData, localPatch, reportEngineWarnings]
	);

	const applyLineItemChanges = React.useCallback(
		async (
			capturedOrder: CurrentOrderRecord,
			uuid: string,
			changes: Changes,
			context: OrderMutationContext,
			options?: UpdateLineItemOptions
		) => {
			const order = capturedOrder.getLatest();
			const lineItems = order.toMutableJSON().payload.line_items ?? [];
			const result = await dispatchAction({
				event: 'cart.line.update',
				token: context.dispatchToken,
				ctx,
				input: {
					orderId: documentRecordId(order)!,
					actor,
					source: 'user',
					payload: {
						lineUuid: uuid,
						changes: { ...changes } as Record<string, unknown>,
						line: lineItems.find((line) => wooMetaCarrier.lineUuid(line) === uuid) ?? null,
						lineItems,
						options: { skipStockGuard: options?.skipStockGuard },
					},
				},
				bottom: (e) =>
					writeLineItemChanges(capturedOrder, uuid, { ...e.payload.changes } as Changes),
			});
			if (isActionRefusal(result)) {
				presentActionRefusal(ctx, result, { orderId: documentRecordId(order) });
				return false;
			}
			return result;
		},
		[ctx, actor, writeLineItemChanges]
	);

	const updateLineItem = React.useCallback(
		async (uuid: string, changes: Changes, options?: UpdateLineItemOptions) => {
			// Captured at press time, so the queued work operates on the order it was queued for.
			const capturedOrder = getCurrentOrderRecord();
			const recordId = documentRecordId(capturedOrder.getLatest());
			if (!recordId) throw new Error('Order is missing its uuid');
			return enqueueOrderMutation(recordId, (context) =>
				applyLineItemChanges(capturedOrder, uuid, changes, context, options)
			);
		},
		[applyLineItemChanges, getCurrentOrderRecord]
	);

	const incrementLineItem = React.useCallback(
		async (uuid: string, quantity: number) => {
			const capturedOrder = getCurrentOrderRecord();
			const recordId = documentRecordId(capturedOrder.getLatest());
			if (!recordId) throw new Error('Order is missing its uuid');
			return enqueueOrderMutation(recordId, async (context) => {
				const lineItem = capturedOrder
					.getLatest()
					.toMutableJSON()
					.payload.line_items?.find((item) => wooMetaCarrier.lineUuid(item) === uuid);
				if (!lineItem) return;
				return applyLineItemChanges(
					capturedOrder,
					uuid,
					{
						quantity: (lineItem.quantity ?? 0) + quantity,
					},
					context
				);
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

				const split = calculateCartLine(
					{ kind: 'line_item', line: { ...lineItemToSplit, quantity: 1 } },
					cartConfig
				);
				// The split copies an EXISTING line, so an unreadable price basis is
				// reachable here in a way it is not when a line is first authored.
				reportEngineWarnings(split.warnings, { orderId: order.uuid, site: 'splitLineItem' });
				const lineItemToCopy = split.line as LineItem;
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
					// Same input as the split above, already reported: the engine is pure,
					// so this call can only repeat what that one said.
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
		[cartConfig, getCurrentOrderRecord, localPatch, reportEngineWarnings]
	);

	return { updateLineItem, incrementLineItem, splitLineItem };
};

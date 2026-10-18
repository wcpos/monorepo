import * as React from 'react';

import { getLogger } from '@wcpos/utils/logger';
import { wooMetaCarrier } from '@wcpos/sync-core';

import { reportStaleCartLine } from './cart-failure';
import { enqueueCartAction } from './enqueue-cart-action';
// Undo re-enters through cart.line.add; the guard must be registered whoever imported first.
import './stock-guard-hook';
import { useActionContext } from './use-action-context';
import { useT } from '../../../../contexts/translations';
import { dispatchAction } from '../../../../extensions/actions';
import { useCartWrite } from '../commands/use-cart-write';
import { type CurrentOrderRecord, useCurrentOrder } from '../contexts/current-order';

import type { OrderMutationContext } from './order-mutation-queue';

const cartLogger = getLogger(['wcpos', 'pos', 'cart', 'remove']);

type Line = 'line_items' | 'fee_lines' | 'shipping_lines' | 'coupon_lines';
type LineItem =
	| import('@wcpos/query').OrderLineItem
	| import('@wcpos/query').OrderFeeLine
	| import('@wcpos/query').OrderShippingLine
	| import('@wcpos/query').OrderCouponLine;

/**
 *
 */
export const useRemoveLineItem = () => {
	const { currentOrderRecord } = useCurrentOrder();
	const { localPatch } = useCartWrite();
	const { ctx, actor } = useActionContext();
	const t = useT();

	/**
	 * Undo is its own action: the restored line re-enters through `cart.line.add`, so a guard
	 * (stock, by then possibly short) and every pricing hook see it like any other add.
	 */
	const undoRemove = React.useCallback(
		async (uuid: string, type: Line, itemToRestore: LineItem) => {
			const orderContext = { orderId: currentOrderRecord.payload.id };
			const run = (target: CurrentOrderRecord, queue: OrderMutationContext) => {
				const order = target.getLatest();
				const items = (order.payload[type] ?? []) as LineItem[];
				// A confirmed deletion retired this Woo id; Undo must append a new line.
				if (itemToRestore.id && !items.some((item) => item.id === itemToRestore.id)) {
					const { id: _id, ...content } = itemToRestore;
					itemToRestore = content;
				}
				return dispatchAction({
					event: 'cart.line.add',
					token: queue.dispatchToken,
					ctx,
					input: {
						orderId: order.uuid,
						actor,
						source: 'user',
						payload: {
							type,
							line: itemToRestore as Record<string, unknown>,
							lineItems: (order.payload.line_items ?? []) as Record<string, unknown>[],
						},
					},
					bottom: async (e) => {
						const line = e.payload.line as LineItem;
						const itemIndex = items.findIndex((item) => wooMetaCarrier.lineUuid(item) === uuid);
						const updatedLines = [...items];
						// Replace the line if a later write brought it back, else append the restore.
						if (itemIndex >= 0) updatedLines[itemIndex] = line;
						else updatedLines.push(line);
						return localPatch({ document: order, queue, data: { [type]: updatedLines } });
					},
				});
			};
			await enqueueCartAction(currentOrderRecord, run, { ctx, context: orderContext });
		},
		[currentOrderRecord, localPatch, ctx, actor]
	);

	/**
	 * In WooCommerce, if one of the follwing is null then the line item is removed
	 * 'product_id', 'method_id', 'method_title', 'name', 'code'
	 *
	 * If quantity is 0, then the line item is also removed, but we will stick with product_id for now
	 */
	const removeLineItem = React.useCallback(
		async (uuid: string, type: Line) => {
			let itemToRestore: LineItem | undefined;
			const run = (target: CurrentOrderRecord, queue: OrderMutationContext) => {
				const order = target.getLatest();
				const items = (order.payload[type] ?? []) as LineItem[];
				itemToRestore = items.find((item) => wooMetaCarrier.lineUuid(item) === uuid);
				return dispatchAction({
					event: 'cart.line.remove',
					token: queue.dispatchToken,
					ctx,
					input: {
						orderId: order.uuid,
						actor,
						source: 'user',
						payload: {
							type,
							lineUuid: uuid,
							line: (itemToRestore ?? null) as Record<string, unknown> | null,
							lineItems: (order.payload.line_items ?? []) as Record<string, unknown>[],
						},
					},
					bottom: async () => {
						const updatedLines = items
							.map((item) => {
								if (wooMetaCarrier.lineUuid(item) !== uuid) return item;
								// A synced line is retired by nulling its key field; a local one is dropped.
								if (!item.id) return null;
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
							})
							.filter((item) => item !== null);
						return localPatch({ document: order, queue, data: { [type]: updatedLines } });
					},
				});
			};
			const outcome = await enqueueCartAction(currentOrderRecord, run, {
				ctx,
				context: { orderId: currentOrderRecord.payload.id, uuid, type },
			});
			if (outcome === false) return;

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
		[currentOrderRecord, localPatch, t, undoRemove, ctx, actor]
	);

	return { removeLineItem };
};

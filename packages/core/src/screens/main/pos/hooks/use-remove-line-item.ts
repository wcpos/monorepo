import * as React from 'react';

import { retaxLine } from '@wcpos/order-math';
import { getLogger } from '@wcpos/utils/logger';
import { POS_META_KEYS, wooMetaCarrier } from '@wcpos/sync-core';

import { reportStaleCartLine } from './cart-failure';
// Undo re-enters through cart.line.add; the guard must be registered whoever imported first.
import './stock-guard-hook';
import { useCartConfigReader } from './use-cart-config';
import { useReportEngineWarnings } from '../contexts/order-engine-warnings';
import { useT } from '../../../../contexts/translations';
import { useCartCommand } from '../commands/use-cart-command';

import type { CurrentOrderRecord } from '../contexts/current-order';

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
	const remove = useCartCommand('cart.line.remove');
	const restore = useCartCommand('cart.line.add');
	const configForOrder = useCartConfigReader();
	const report = useReportEngineWarnings();
	const t = useT();

	/**
	 * Undo is its own action: the restored line re-enters through `cart.line.add`, so a guard
	 * (stock, by then possibly short) and every pricing hook see it like any other add. It goes
	 * back to the order it left, whichever order is current when Undo is pressed.
	 */
	const undoRemove = React.useCallback(
		async (uuid: string, type: Line, itemToRestore: LineItem, from: CurrentOrderRecord) => {
			await restore(
				async ({ target, dispatch }) => {
					const order = target.getLatest();
					const items = (order.payload[type] ?? []) as LineItem[];
					// A confirmed deletion retired this Woo id; Undo must append a new line.
					if (itemToRestore.id && !items.some((item) => item.id === itemToRestore.id)) {
						const { id: _id, ...content } = itemToRestore;
						itemToRestore = content;
					}
					const input = {
						type,
						line: itemToRestore as Record<string, unknown>,
						lineItems: (order.payload.line_items ?? []) as Record<string, unknown>[],
					};
					return dispatch(input, async (e, write) => {
						const payload = order.getLatest().payload;
						const items = (payload[type] ?? []) as LineItem[];
						const restored = e.payload.line as LineItem;
						const config = configForOrder(payload);
						// Taxed web lines keep stored tax: their catalog tax status is unknown here.
						const { line, warnings } =
							type === 'line_items' &&
							(config.vatExempt ||
								restored.meta_data?.some(({ key }) => key === POS_META_KEYS.posData))
								? retaxLine({ kind: 'line_item', line: restored }, config)
								: type === 'fee_lines'
									? retaxLine({ kind: 'fee', line: restored }, config)
									: { line: restored, warnings: [] };
						report(warnings, { orderId: order.uuid, site: 'undoRemove' });
						const itemIndex = items.findIndex((item) => wooMetaCarrier.lineUuid(item) === uuid);
						const updatedLines = [...items];
						// Replace the line if a later write brought it back, else append the restore.
						if (itemIndex >= 0) updatedLines[itemIndex] = line;
						else updatedLines.push(line);
						return write({ [type]: updatedLines }, order);
					});
				},
				(record) => ({ orderId: record.payload.id }),
				from
			);
		},
		[restore, configForOrder, report]
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
			let from: CurrentOrderRecord | undefined;
			const outcome = await remove(
				async ({ target, dispatch }) => {
					from = target;
					const order = target.getLatest();
					const items = (order.payload[type] ?? []) as LineItem[];
					itemToRestore = items.find((item) => wooMetaCarrier.lineUuid(item) === uuid);
					const input = {
						type,
						lineUuid: uuid,
						line: (itemToRestore ?? null) as Record<string, unknown> | null,
						lineItems: (order.payload.line_items ?? []) as Record<string, unknown>[],
					};
					return dispatch(input, async (_e, write) => {
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
						return write({ [type]: updatedLines }, order);
					});
				},
				(record) => ({ orderId: record.payload.id, uuid, type })
			);
			if (outcome === false || !from) return;
			const origin = from; // the order the line left: Undo restores it there

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
								onClick: () => void undoRemove(uuid, type, itemToRestore!, origin),
							},
						},
						context: {
							itemName,
							itemType: type,
							orderId: origin.payload.id,
						},
					}
				);
			} else {
				// The uuid isn't in the order document — the cashier acted on a stale row
				// (multi-tab is first-class). Cashier-full-information ruling: say so.
				reportStaleCartLine(cartLogger, 'Remove tapped for a line that is no longer in the cart', {
					toastTitle: t('pos_cart.remove_line_not_found'),
					context: { uuid, itemType: type, orderId: origin.payload.id },
				});
			}
		},
		[remove, t, undoRemove]
	);

	return { removeLineItem };
};

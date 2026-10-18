import * as React from 'react';

import unset from 'lodash/unset';
import { v4 as uuidv4 } from 'uuid';

import { calculateCartLine } from '@wcpos/order-math';
import { POS_META_KEYS, wooMetaCarrier } from '@wcpos/sync-core';
import { getLogger } from '@wcpos/utils/logger';

import { reportStaleCartLine } from './cart-failure';
import { enqueueCartAction } from './enqueue-cart-action';
import { reducedStockQuantity } from './stock-guard';
import { useActionContext } from './use-action-context';
import { useCartConfig } from './use-cart-config';
import { dispatchAction } from '../../../../extensions/actions';
import { useCartWrite } from '../commands/use-cart-write';
import { useCurrentOrderActions } from '../contexts/current-order';
import { useReportEngineWarnings } from '../contexts/order-engine-warnings';

type OrderDocument = import('@wcpos/query').OrderPayload;
type LineItem = NonNullable<OrderDocument['line_items']>[number];
const cartLogger = getLogger(['wcpos', 'pos', 'cart', 'line-item']);

function splitLine(lineItemToSplit: LineItem, cartConfig: ReturnType<typeof useCartConfig>) {
	const split = calculateCartLine(
		{ kind: 'line_item', line: { ...lineItemToSplit, quantity: 1 } },
		cartConfig
	);
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

	// The server restores stock per item from `_reduced_stock` on a cancel or refund, so the
	// new lines share it in whole units, in order, the rest riding on the last: the sum holds.
	// A value that reads as nothing (zero, negative, unreadable) is dropped from every half.
	let reduced = reducedStockQuantity(lineItemToSplit);
	const hasReducedMeta = (lineItemToSplit.meta_data ?? []).some(
		(meta) => meta.key === POS_META_KEYS.reducedStock
	);
	const splitLineItems = !hasReducedMeta
		? newLineItems // never reduced: split as before
		: newLineItems.map((line, index) => {
				const last = index === newLineItems.length - 1;
				const share = last ? reduced : Math.min(Math.floor(line.quantity ?? 0), reduced);
				reduced -= share;
				const meta_data = (line.meta_data ?? []).flatMap((meta) => {
					if (meta.key !== POS_META_KEYS.reducedStock) return [meta];
					if (share === 0) return []; // dropped, not '0': the server reads it as never reduced
					return [{ ...meta, value: typeof meta.value === 'number' ? share : String(share) }];
				});
				return { ...line, meta_data };
			});
	return { lines: splitLineItems, warnings: split.warnings };
}

export const useSplitLineItem = () => {
	const { getCurrentOrderRecord } = useCurrentOrderActions();
	const { localPatch } = useCartWrite();
	const cartConfig = useCartConfig();
	const reportEngineWarnings = useReportEngineWarnings();
	const { ctx, actor } = useActionContext();
	const splitLineItem = React.useCallback(
		async (uuid: string) => {
			const record = getCurrentOrderRecord();
			if (!record.uuid) throw new Error('Order is missing its uuid');
			return enqueueCartAction(
				record,
				async (target, queue) => {
					const order = target.getLatest();
					const lineItems = order.toMutableJSON().payload.line_items ?? [];
					const index = lineItems.findIndex((item) => wooMetaCarrier.lineUuid(item) === uuid);
					const line = index === -1 ? undefined : lineItems[index];
					if (!line) {
						reportStaleCartLine(cartLogger, 'Split targeted a line that is no longer in the cart', {
							toastTitle: ctx.t('pos_cart.remove_line_not_found'),
							context: { uuid, orderId: order.payload.id },
						});
						return;
					}
					if ((line.quantity ?? 0) <= 1) return;
					const { lines, warnings } = splitLine(line, cartConfig);
					return dispatchAction({
						event: 'cart.line.split',
						token: queue.dispatchToken,
						ctx,
						input: {
							orderId: order.uuid,
							actor,
							source: 'user',
							payload: { lineUuid: uuid, line, lines, lineItems },
						},
						bottom: (e) => {
							// `index` was found in this same snapshot of `order`, so it still points at the line.
							const currentLines = order.payload.line_items ?? [];
							const line_items = [
								...currentLines.slice(0, index),
								...e.payload.lines.map((item) => ({ ...item })),
								...currentLines.slice(index + 1),
							];
							// Reported here, after the chain, so a refused split logs nothing.
							reportEngineWarnings(warnings, { orderId: order.uuid, site: 'splitLineItem' });
							return localPatch({ document: order, queue, data: { line_items } });
						},
					});
				},
				{ ctx, context: { orderId: record.uuid, uuid } }
			);
		},
		[actor, cartConfig, ctx, getCurrentOrderRecord, localPatch, reportEngineWarnings]
	);
	return { splitLineItem };
};

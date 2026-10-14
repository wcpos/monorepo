import * as React from 'react';

import unset from 'lodash/unset';
import { v4 as uuidv4 } from 'uuid';

import { calculateCartLine } from '@wcpos/order-math';
import { POS_META_KEYS, wooMetaCarrier } from '@wcpos/sync-core';
import { getLogger } from '@wcpos/utils/logger';

import { reportCartInvariant } from './cart-failure';
import { useCartConfig } from './use-cart-config';
import { reducedStockQuantity } from './stock-guard';
import './stock-guard-hook';
import {
	type CartLineChanges,
	type UpdateCartLineOptions,
	useUpdateCartLine,
} from './use-update-cart-line';
import { enqueueOrderMutation } from './order-mutation-queue';
import { documentRecordId, useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useCurrentOrderActions } from '../contexts/current-order';
import { useReportEngineWarnings } from '../contexts/order-engine-warnings';

type OrderDocument = import('@wcpos/database').OrderDocument;
type LineItem = NonNullable<OrderDocument['line_items']>[number];

const cartLogger = getLogger(['wcpos', 'pos', 'cart', 'line-item']);

/**
 *
 */
export const useUpdateLineItem = () => {
	// Event-time resolution — reached from every product tile via useAddProduct.
	const { getCurrentOrderRecord } = useCurrentOrderActions();
	const { localPatch } = useLocalMutation();
	const cartConfig = useCartConfig();
	const reportEngineWarnings = useReportEngineWarnings();
	const { updateCartLine, incrementLineItem } = useUpdateCartLine();
	const updateLineItem = React.useCallback(
		(uuid: string, changes: CartLineChanges['line_items'], options?: UpdateCartLineOptions) =>
			updateCartLine('line_items', uuid, changes, options),
		[updateCartLine]
	);

	/**
	 *
	 */
	const splitLineItem = React.useCallback(
		async (uuid: string) => {
			const capturedOrder = getCurrentOrderRecord();
			const recordId = documentRecordId(capturedOrder.getLatest());
			if (!recordId) throw new Error('Order is missing its uuid');
			return enqueueOrderMutation(recordId, async (context) => {
				const order = (context.order ?? capturedOrder).getLatest();
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

				// The server restores stock per item from `_reduced_stock` on a cancel or refund, so the
				// new lines share it in whole units, in order, the rest riding on the last: the sum holds.
				// A value that reads as nothing (zero, negative, unreadable) is dropped from every half.
				let reduced = reducedStockQuantity(lineItemToSplit);
				const hasReducedMeta = (lineItemToSplit.meta_data ?? []).some(
					(meta) => meta.key === '_reduced_stock'
				);
				const splitLineItems = !hasReducedMeta
					? newLineItems // never reduced: split as before
					: newLineItems.map((line, index) => {
							const last = index === newLineItems.length - 1;
							const share = last ? reduced : Math.min(Math.floor(line.quantity ?? 0), reduced);
							reduced -= share;
							const meta_data = (line.meta_data ?? []).flatMap((meta) => {
								if (meta.key !== '_reduced_stock') return [meta];
								if (share === 0) return []; // dropped, not '0': the server reads it as never reduced
								return [{ ...meta, value: typeof meta.value === 'number' ? share : String(share) }];
							});
							return { ...line, meta_data };
						});

				// Replace the original item with the new items in the order
				const updatedLineItems = [
					...(order.payload.line_items ?? []).slice(0, lineItemIndex),
					...splitLineItems,
					...(order.payload.line_items ?? []).slice(lineItemIndex + 1),
				];

				return localPatch({ document: order, data: { line_items: updatedLineItems } });
			});
		},
		[cartConfig, getCurrentOrderRecord, localPatch, reportEngineWarnings]
	);

	return { updateLineItem, incrementLineItem, splitLineItem };
};

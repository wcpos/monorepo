import * as React from 'react';

import { calculateCartLine, type EngineWarning } from '@wcpos/order-math';
import { wooMetaCarrier } from '@wcpos/sync-core';
import { getLogger } from '@wcpos/utils/logger';

import { reportStaleCartLine } from './cart-failure';
import { enqueueOrderMutation } from './order-mutation-queue';
import { useActionContext } from './use-action-context';
import { useCartConfig } from './use-cart-config';
import { useT } from '../../../../contexts/translations';
import {
	dispatchAction,
	isActionRefusal,
	presentActionRefusal,
} from '../../../../extensions/actions';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useCurrentOrder } from '../contexts/current-order';
import { useReportEngineWarnings } from '../contexts/order-engine-warnings';

const cartLogger = getLogger(['wcpos', 'pos', 'cart', 'shipping-line']);

type OrderDocument = import('@wcpos/database').OrderDocument;
type ShippingLine = NonNullable<OrderDocument['shipping_lines']>[number];

/**
 * Account for string or number changes just in case.
 *
 * No `tax_class`: a shipping line has none of its own in WooCommerce, so there is nothing
 * for the edit form to change. See `extractShippingLineData` in @wcpos/order-math.
 */
interface Changes extends Partial<ShippingLine> {
	amount?: number;
	prices_include_tax?: boolean;
	tax_status?: 'taxable' | 'none';
}

/**
 *
 */
export const useUpdateShippingLine = () => {
	const { currentOrderRecord } = useCurrentOrder();
	const { localPatch } = useLocalMutation();
	const cartConfig = useCartConfig();
	const reportEngineWarnings = useReportEngineWarnings();
	const { ctx, actor } = useActionContext();
	const t = useT();

	/** The one writer for a shipping line edit: the engine's merge and tax maths, then the patch. */
	const write = React.useCallback(
		async (uuid: string, changes: Changes) => {
			const order = currentOrderRecord.getLatest();
			const json = order.toMutableJSON().payload;
			let updated = false;
			let warnings: readonly EngineWarning[] = [];

			// get matching shipping line
			const updatedShippingLines = json.shipping_lines?.map((shippingLine) => {
				if (updated || wooMetaCarrier.lineUuid(shippingLine) !== uuid) {
					return shippingLine;
				}

				// The changes-merge (posData fields with `?? previous` fallbacks, everything
				// else straight through) and the tax maths are both the engine's now. See
				// `applyShippingLineChanges` / `computeShippingLine` in @wcpos/order-math.
				// The inheritance basis comes from THIS snapshot's line items — the same `json`
				// the map above is walking — for the same reason the percent-fee basis does:
				// re-reading the order mid-arithmetic would compute against a newer cart than
				// the one being patched. Only read when the line's tax class inherits.
				const { line: updatedItem, warnings: lineWarnings } = calculateCartLine(
					{
						kind: 'shipping',
						line: shippingLine,
						changes,
						cartLineItems: json.line_items ?? [],
					},
					cartConfig
				);
				updated = true;
				warnings = lineWarnings;
				// The engine speaks structural line types; this boundary writes back to the
				// DB document they came from.
				return updatedItem as ShippingLine;
			});

			reportEngineWarnings(warnings, { orderId: order.uuid, site: 'useUpdateShippingLine' });

			// if we have updated a line item, patch the order
			if (updated && updatedShippingLines) {
				return localPatch({
					document: order,
					data: { shipping_lines: updatedShippingLines },
				});
			}
			// The line left the cart between the dispatch and this write; nothing to patch.
			return undefined;
		},
		[cartConfig, currentOrderRecord, localPatch, reportEngineWarnings]
	);

	/**
	 * Update shipping line
	 *
	 * @TODO - what if more than one property is changed at once?
	 */
	const updateShippingLine = React.useCallback(
		async (uuid: string, changes: Changes) => {
			const order = currentOrderRecord.getLatest();
			const json = order.toMutableJSON().payload;
			const line =
				json.shipping_lines?.find((item) => wooMetaCarrier.lineUuid(item) === uuid) ?? null;
			if (!line) {
				// The uuid isn't in the order document — the cashier edited a stale row
				// (multi-tab is first-class). Cashier-full-information ruling: say so.
				reportStaleCartLine(
					cartLogger,
					'Shipping line update targeted a line that is no longer in the cart',
					{
						toastTitle: t('pos_cart.update_shipping_not_found'),
						context: { uuid, orderId: order.payload.id },
					}
				);
				return;
			}
			const outcome = await enqueueOrderMutation(order.uuid, (queue) =>
				dispatchAction({
					event: 'cart.line.update',
					token: queue.dispatchToken,
					ctx,
					input: {
						orderId: order.uuid,
						actor,
						source: 'user',
						payload: {
							type: 'shipping_lines',
							lineUuid: uuid,
							changes: { ...changes } as Record<string, unknown>,
							line: line as Record<string, unknown>,
							lineItems: (json.line_items ?? []) as Record<string, unknown>[],
							options: {},
						},
					},
					bottom: (e) => write(uuid, { ...e.payload.changes } as Changes),
				})
			);
			if (isActionRefusal(outcome)) {
				presentActionRefusal(ctx, outcome, { orderId: order.payload.id, uuid });
				return false;
			}
			return outcome as Awaited<ReturnType<typeof localPatch>> | undefined;
		},
		[currentOrderRecord, ctx, actor, t, write]
	);

	return { updateShippingLine };
};

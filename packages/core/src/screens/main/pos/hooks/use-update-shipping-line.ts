import * as React from 'react';

import { calculateCartLine } from '@wcpos/order-math';
import { wooMetaCarrier } from '@wcpos/sync-core';
import { getLogger } from '@wcpos/utils/logger';

import { reportStaleCartLine } from './cart-failure';
import { useCartConfig } from './use-cart-config';
import { useT } from '../../../../contexts/translations';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useCurrentOrder } from '../contexts/current-order';

const cartLogger = getLogger(['wcpos', 'pos', 'cart', 'shipping-line']);

type OrderDocument = import('@wcpos/database').OrderDocument;
type ShippingLine = NonNullable<OrderDocument['shipping_lines']>[number];

/**
 * Account for string or number changes just in case
 */
interface Changes extends Partial<ShippingLine> {
	amount?: number;
	prices_include_tax?: boolean;
	tax_status?: 'taxable' | 'none';
	tax_class?: string;
}

/**
 *
 */
export const useUpdateShippingLine = () => {
	const { currentOrderRecord } = useCurrentOrder();
	const { localPatch } = useLocalMutation();
	const cartConfig = useCartConfig();
	const t = useT();

	/**
	 * Update shipping line
	 *
	 * @TODO - what if more than one property is changed at once?
	 */
	const updateShippingLine = React.useCallback(
		async (uuid: string, changes: Changes) => {
			const order = currentOrderRecord.getLatest();
			const json = order.toMutableJSON().payload;
			let updated = false;

			// get matching shipping line
			const updatedShippingLines = json.shipping_lines?.map((shippingLine) => {
				if (updated || wooMetaCarrier.lineUuid(shippingLine) !== uuid) {
					return shippingLine;
				}

				// The changes-merge (posData fields with `?? previous` fallbacks, everything
				// else straight through) and the tax maths are both the engine's now. See
				// `applyShippingLineChanges` / `computeShippingLine` in @wcpos/order-math.
				//
				// `warnings` (malformed posData) is dropped here, as it is at every other
				// engine call site in core — settle drops it too. Surfacing engine warnings
				// to the cashier is one decision for all of them, not a shipping one.
				const { line: updatedItem } = calculateCartLine(
					{ kind: 'shipping', line: shippingLine, changes },
					cartConfig
				);
				updated = true;
				// The engine speaks structural line types; this boundary writes back to the
				// DB document they came from.
				return updatedItem as ShippingLine;
			});

			// if we have updated a line item, patch the order
			if (updated && updatedShippingLines) {
				return localPatch({
					document: order,
					data: { shipping_lines: updatedShippingLines },
				});
			}
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
		},
		[cartConfig, currentOrderRecord, localPatch, t]
	);

	return { updateShippingLine };
};

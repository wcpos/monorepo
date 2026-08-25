import * as React from 'react';

import { calculateCartLine, type EngineWarning } from '@wcpos/order-math';
import { wooMetaCarrier } from '@wcpos/sync-core';
import { getLogger } from '@wcpos/utils/logger';

import { reportStaleCartLine } from './cart-failure';
import { useCartConfig } from './use-cart-config';
import { useT } from '../../../../contexts/translations';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useCurrentOrder } from '../contexts/current-order';
import { useReportEngineWarnings } from '../contexts/order-engine-warnings';

const cartLogger = getLogger(['wcpos', 'pos', 'cart', 'fee-line']);

type OrderDocument = import('@wcpos/database').OrderDocument;
type FeeLine = NonNullable<OrderDocument['fee_lines']>[number];

/**
 * Account for string or number changes just in case
 */
interface Changes extends Partial<FeeLine> {
	amount?: string;
	percent?: boolean;
	prices_include_tax?: boolean;
	percent_of_cart_total_with_tax?: boolean;
}

/**
 *
 */
export const useUpdateFeeLine = () => {
	const { currentOrderRecord } = useCurrentOrder();
	const { localPatch } = useLocalMutation();
	const cartConfig = useCartConfig();
	const reportEngineWarnings = useReportEngineWarnings();
	const t = useT();

	/**
	 * Update fee line
	 */
	const updateFeeLine = React.useCallback(
		async (uuid: string, changes: Changes) => {
			const order = currentOrderRecord.getLatest();
			const json = order.toMutableJSON().payload;
			let updated = false;
			let warnings: readonly EngineWarning[] = [];

			const updatedLineItems = json.fee_lines?.map((feeLine) => {
				if (updated || wooMetaCarrier.lineUuid(feeLine) !== uuid) {
					return feeLine;
				}

				// The changes-merge (pos_data fields with `?? previous` fallbacks, everything
				// else straight through) and the tax maths are both the engine's now. See
				// `applyFeeLineChanges` / `computeFeeLine` in @wcpos/order-math.
				//
				// The percent basis comes from THIS snapshot's line items — the same `json`
				// the map above is walking. The retired hook called `getLatest()` again in
				// the middle of its arithmetic, so a percentage fee could be computed
				// against a newer cart than the one being patched, and the write would then
				// land carrying a total derived from lines it was not built from.
				const { line: updatedItem, warnings: lineWarnings } = calculateCartLine(
					{
						kind: 'fee',
						line: feeLine,
						changes,
						cartLineItems: json.line_items ?? [],
					},
					cartConfig
				);
				updated = true;
				warnings = lineWarnings;
				// The engine speaks structural line types; this boundary writes back to the
				// DB document they came from.
				return updatedItem as FeeLine;
			});

			reportEngineWarnings(warnings, { orderId: order.uuid, site: 'useUpdateFeeLine' });

			if (updated && updatedLineItems) {
				return localPatch({
					document: order,
					data: { fee_lines: updatedLineItems },
				});
			}
			// The uuid isn't in the order document — the cashier edited a stale row
			// (multi-tab is first-class). Cashier-full-information ruling: say so.
			reportStaleCartLine(
				cartLogger,
				'Fee line update targeted a line that is no longer in the cart',
				{
					toastTitle: t('pos_cart.update_fee_not_found'),
					context: { uuid, orderId: order.payload.id },
				}
			);
		},
		[cartConfig, currentOrderRecord, localPatch, reportEngineWarnings, t]
	);

	return { updateFeeLine };
};

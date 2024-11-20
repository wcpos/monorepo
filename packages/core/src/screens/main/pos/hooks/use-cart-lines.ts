import * as React from 'react';

import { useObservableEagerState, useSubscription, useObservable } from 'observable-hooks';
import { distinctUntilChanged, map, skip } from 'rxjs/operators';

import { useFeeLineData } from './use-fee-line-data';
import { useUpdateFeeLine } from './use-update-fee-line';
import { getUuidFromLineItem } from './utils';
import { useCurrentOrder } from '../contexts/current-order';

type LineItem = import('@wcpos/database').OrderDocument['line_items'][number];
type FeeLine = import('@wcpos/database').OrderDocument['fee_lines'][number];
type ShippingLine = import('@wcpos/database').OrderDocument['shipping_lines'][number];

/**
 * @NOTE - when current order is updated, eg: date_modified, the cart lines will re-subscribe.
 */
export const useCartLines = () => {
	const { currentOrder } = useCurrentOrder();
	const lineItems = useObservableEagerState(currentOrder.line_items$);
	const feeLines = useObservableEagerState(currentOrder.fee_lines$);
	const shippingLines = useObservableEagerState(currentOrder.shipping_lines$);
	const { getFeeLineData } = useFeeLineData();
	const { updateFeeLine } = useUpdateFeeLine();

	/**
	 * We need to filter out any items that have been 'removed', eg: product_id === null.
	 */
	const cartLines = React.useMemo(() => {
		return {
			line_items: (lineItems || []).filter((item) => item.product_id !== null),
			fee_lines: (feeLines || []).filter((item) => item.name !== null),
			shipping_lines: (shippingLines || []).filter((item) => item.method_id !== null),
		};
	}, [lineItems, feeLines, shippingLines]);

	/**
	 * If line items change, and we have a percentage fee line, we need to recalculate the fee line total.
	 *
	 * @TODO - this is a bit hacky, we should probably have a better way to handle this.
	 */
	const cartTotal$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				skip(1),
				map(([items]) => {
					// Sum the total and total_tax of all line items
					const test = (items || []).reduce(
						(acc, item) => {
							acc.cart_total += parseFloat(item.total);
							acc.cart_total_tax += parseFloat(item.total_tax);
							return acc;
						},
						{ cart_total: 0, cart_total_tax: 0 }
					);
					return test;
				}),
				distinctUntilChanged((prev, next) => JSON.stringify(prev) === JSON.stringify(next))
				// @TODO - this gets triggered twice, because if fee updates, line items will be a new array.
			),
		[lineItems]
	);

	useSubscription(cartTotal$, async () => {
		const percentageFeeLines = (feeLines || []).filter((item: FeeLine) => {
			const { percent } = getFeeLineData(item);
			return percent;
		});

		if (percentageFeeLines.length > 0) {
			// Update each percentage fee line
			for (const feeLine of percentageFeeLines) {
				const uuid = getUuidFromLineItem(feeLine);
				await updateFeeLine(uuid, {});
			}
		}
	});

	return cartLines;
};

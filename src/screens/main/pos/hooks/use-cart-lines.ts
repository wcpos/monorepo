import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { getUuidFromLineItem } from './utils';
import { useCurrentOrder } from '../contexts/current-order';

type LineItem = import('@wcpos/database').OrderDocument['line_items'][number];
type FeeLine = import('@wcpos/database').OrderDocument['fee_lines'][number];
type ShippingLine = import('@wcpos/database').OrderDocument['shipping_lines'][number];
export type CartLine = {
	item: LineItem | FeeLine | ShippingLine;
	id: string;
	type: 'line_items' | 'fee_lines' | 'shipping_lines';
};

/**
 *
 */
export const useCartLines = () => {
	const { currentOrder } = useCurrentOrder();
	const lineItems = useObservableEagerState(currentOrder.line_items$);
	const feeLines = useObservableEagerState(currentOrder.fee_lines$);
	const shippingLines = useObservableEagerState(currentOrder.shipping_lines$);

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

	return cartLines;
};

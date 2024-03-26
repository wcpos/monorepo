import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { useCurrentOrder } from '../../contexts/current-order';

type LineItem = import('@wcpos/database').OrderDocument['line_items'][0];
type FeeLine = import('@wcpos/database').OrderDocument['fee_lines'][0];
type ShippingLine = import('@wcpos/database').OrderDocument['shipping_lines'][0];
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

	/**
	 *
	 */
	const lineItems = useObservableEagerState(currentOrder.line_items$);
	const feeLines = useObservableEagerState(currentOrder.fee_lines$);
	const shippingLines = useObservableEagerState(currentOrder.shipping_lines$);

	/**
	 *
	 */
	const items = Array.isArray(lineItems)
		? lineItems.map((item) => {
				const uuidMetaData = item.meta_data.find((meta) => meta.key === '_woocommerce_pos_uuid');
				if (uuidMetaData && uuidMetaData.value) {
					return { item, id: uuidMetaData.value, type: 'line_items' };
				}
			})
		: [];

	const fees = Array.isArray(feeLines)
		? feeLines.map((item) => {
				const uuidMetaData = item.meta_data.find((meta) => meta.key === '_woocommerce_pos_uuid');
				if (uuidMetaData && uuidMetaData.value) {
					return { item, id: uuidMetaData.value, type: 'fee_lines' };
				}
			})
		: [];

	const shipping = Array.isArray(shippingLines)
		? shippingLines.map((item) => {
				const uuidMetaData = item.meta_data.find((meta) => meta.key === '_woocommerce_pos_uuid');
				if (uuidMetaData && uuidMetaData.value) {
					return { item, id: uuidMetaData.value, type: 'shipping_lines' };
				}
			})
		: [];

	/**
	 *
	 */
	return [...items, ...fees, ...shipping] as CartLine[];
};

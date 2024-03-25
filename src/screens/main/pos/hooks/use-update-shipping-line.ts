import * as React from 'react';

import { useCurrentOrder } from '../contexts/current-order';

type ShippingLine = import('@wcpos/database').OrderDocument['shipping_lines'][number];
type ShippingChangableProperties = 'method_title' | 'total' | 'taxes' | 'meta_data';
type ShippingLineChanges = Pick<ShippingLine, ShippingChangableProperties>;

export const useUpdateShippingLine = () => {
	const { currentOrder } = useCurrentOrder();

	/**
	 *
	 */
	const applyShippingLineChanges = React.useCallback(
		(changes: ShippingLineChanges, original: ShippingLine) => {
			const property = Object.keys(changes)[0];
			switch (property) {
				case 'method_title':
					return { ...original, method_title: changes.method_title };
				case 'total':
					return { ...original, total: changes.total };
				case 'taxes':
					return { ...original, taxes: changes.taxes };
				case 'meta_data':
					return { ...original, meta_data: changes.meta_data };
				default:
					return original;
			}
		},
		[]
	);

	/**
	 *
	 */
	const updateShippingLine = React.useCallback(
		async (changes: ShippingLineChanges, original: ShippingLine) => {
			/**
			 *
			 */
			currentOrder.incrementalModify((order) => {
				const updatedShippingLines = order.shipping_lines.map((li) => {
					const uuidMetaData = li.meta_data.find((meta) => meta.key === '_woocommerce_pos_uuid');
					if (uuidMetaData && uuidMetaData.value === original.meta_data[0].value) {
						return applyShippingLineChanges(changes, original);
					}
					return li;
				});

				return { ...order, shipping_lines: updatedShippingLines };
			});
		},
		[applyShippingLineChanges, currentOrder]
	);

	return { updateShippingLine };
};

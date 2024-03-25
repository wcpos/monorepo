import * as React from 'react';

import NumberInput from '../../../components/number-input';
import { useCurrentOrder } from '../../contexts/current-order';

interface Props {
	item: import('@wcpos/database').LineItemDocument;
}

export const Quantity = ({ item }: Props) => {
	const { currentOrder } = useCurrentOrder();

	/**
	 *
	 */
	const updateQuantity = React.useCallback(
		async (newQuantity: string) => {
			currentOrder.incrementalModify((order) => {
				const updatedLineItems = order.line_items.map((li) => {
					const uuidMetaData = li.meta_data.find((meta) => meta.key === '_woocommerce_pos_uuid');
					if (uuidMetaData && uuidMetaData.value === item.uuid) {
						return {
							...li,
							quantity: newQuantity,
							subtotal: String((parseFloat(li.subtotal) / li.quantity) * Number(newQuantity)),
							total: String((parseFloat(li.total) / li.quantity) * Number(newQuantity)),
						};
					}
					return li;
				});

				return { ...order, line_items: updatedLineItems };
			});
		},
		[currentOrder, item.uuid]
	);

	/**
	 *
	 */
	return <NumberInput value={String(item.quantity)} onChange={updateQuantity} />;
};

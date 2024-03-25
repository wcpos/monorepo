import * as React from 'react';

import Box from '@wcpos/components/src/box';
import { EdittableText } from '@wcpos/components/src/edittable-text';
import Text from '@wcpos/components/src/text';

import EditShippingLineButton from './edit-shipping-line';
import { useCurrentOrder } from '../../contexts/current-order';

interface Props {
	item: import('@wcpos/database').ShippingLineDocument;
}

export const ShippingTitle = ({ item }: Props) => {
	const { currentOrder } = useCurrentOrder();

	/**
	 *
	 */
	const handleUpdate = React.useCallback(
		async (newValue: string) => {
			currentOrder.incrementalModify((order) => {
				const updatedItems = order.shipping_lines.map((li) => {
					const uuidMetaData = li.meta_data.find((meta) => meta.key === '_woocommerce_pos_uuid');
					if (uuidMetaData && uuidMetaData.value === item.uuid) {
						return {
							...li,
							method_title: newValue,
						};
					}
					return li;
				});

				return { ...order, shipping_lines: updatedItems };
			});
		},
		[currentOrder, item.uuid]
	);

	return (
		<Box horizontal space="xSmall" style={{ width: '100%' }}>
			<Box fill>
				<EdittableText weight="bold" onChange={handleUpdate}>
					{item.method_title}
				</EdittableText>
			</Box>
			<Box distribution="center">
				<EditShippingLineButton item={item} />
			</Box>
		</Box>
	);
};

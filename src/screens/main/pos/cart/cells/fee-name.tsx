import * as React from 'react';

import Box from '@wcpos/components/src/box';
import { EdittableText } from '@wcpos/components/src/edittable-text';

import EditFeeLineButton from './edit-fee-line';
import { useCurrentOrder } from '../../contexts/current-order';

interface Props {
	item: import('@wcpos/database').FeeLineDocument;
}

export const FeeName = ({ item }: Props) => {
	const { currentOrder } = useCurrentOrder();

	/**
	 *
	 */
	const handleUpdate = React.useCallback(
		async (newValue: string) => {
			currentOrder.incrementalModify((order) => {
				const updatedLineItems = order.fee_lines.map((li) => {
					const uuidMetaData = li.meta_data.find((meta) => meta.key === '_woocommerce_pos_uuid');
					if (uuidMetaData && uuidMetaData.value === item.uuid) {
						return {
							...li,
							name: newValue,
						};
					}
					return li;
				});

				return { ...order, fee_lines: updatedLineItems };
			});
		},
		[currentOrder, item]
	);

	return (
		<Box horizontal space="xSmall" style={{ width: '100%' }}>
			<Box fill>
				<EdittableText weight="bold" onChange={handleUpdate}>
					{item.name}
				</EdittableText>
			</Box>
			<Box distribution="center">
				<EditFeeLineButton item={item} />
			</Box>
		</Box>
	);
};

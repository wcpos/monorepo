import * as React from 'react';

import find from 'lodash/find';
import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import { EdittableText } from '@wcpos/components/src/edittable-text';
import Text from '@wcpos/components/src/text';

import EditLineItemButton from './edit-line-item';
import { useCurrentOrder } from '../../contexts/current-order';

type LineItemDocument = import('@wcpos/database').LineItemDocument;
interface Props {
	item: LineItemDocument;
	column: import('@wcpos/components/src/table').ColumnProps<LineItemDocument>;
}

export const ProductName = ({ item, column }: Props) => {
	const { currentOrder } = useCurrentOrder();
	const { display } = column;

	/**
	 *
	 */
	const show = React.useCallback(
		(key: string): boolean => {
			const d = find(display, { key });
			return !!(d && d.show);
		},
		[display]
	);

	/**
	 *  filter out the private meta data
	 */
	const attributes = item.meta_data.filter((meta) => {
		if (meta.key) {
			return !meta.key.startsWith('_');
		}
		return true;
	});

	/**
	 *
	 */
	const handleUpdate = React.useCallback(
		async (newValue: string) => {
			currentOrder.incrementalModify((order) => {
				const updatedLineItems = order.line_items.map((li) => {
					const uuidMetaData = li.meta_data.find((meta) => meta.key === '_woocommerce_pos_uuid');
					if (uuidMetaData && uuidMetaData.value === item.uuid) {
						return {
							...li,
							name: newValue,
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
	return (
		<Box horizontal space="xSmall" style={{ width: '100%' }}>
			<Box fill space="xSmall">
				<EdittableText weight="bold" onChange={handleUpdate}>
					{item.name}
				</EdittableText>
				{show('sku') && <Text size="small">{item.sku}</Text>}

				{attributes.map((meta) => {
					return (
						<Box space="xxSmall" key={meta.display_key || meta.key} horizontal>
							<Text size="small" type="secondary">{`${meta.display_key || meta.key}:`}</Text>
							<Text size="small">{meta.display_value || meta.value}</Text>
						</Box>
					);
				})}
			</Box>
			<Box distribution="center">
				<EditLineItemButton item={item} />
			</Box>
		</Box>
	);
};

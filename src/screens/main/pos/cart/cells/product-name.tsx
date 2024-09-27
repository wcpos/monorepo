import * as React from 'react';
import { View } from 'react-native';

import { Box } from '@wcpos/components/src/box';
import { HStack } from '@wcpos/components/src/hstack';
import { Text } from '@wcpos/components/src/text';
import { VStack } from '@wcpos/components/src/vstack';

import { EditCartItemButton } from './edit-cart-item-button';
import { EditLineItem } from './edit-line-item';
import { useT } from '../../../../../contexts/translations';
import { EditableName } from '../../../components/editable-name';
import { useUpdateLineItem } from '../../hooks/use-update-line-item';

import type { CellContext } from '@tanstack/react-table';

type LineItem = import('@wcpos/database').OrderDocument['line_items'][number];
interface Props {
	uuid: string;
	item: LineItem;
	type: 'line_items';
}

/**
 *
 */
export const ProductName = ({ row, column }: CellContext<Props, 'name'>) => {
	const { item, uuid } = row.original;
	const { updateLineItem } = useUpdateLineItem();
	const t = useT();

	/**
	 * filter out the private meta data
	 */
	const attributes = React.useMemo(
		() =>
			item.meta_data.filter((meta) => {
				if (meta.key) {
					return !meta.key.startsWith('_');
				}
				return true;
			}),
		[item.meta_data]
	);

	/**
	 *
	 */
	return (
		<VStack>
			<HStack className="gap-0">
				<View className="flex-1">
					<EditableName value={item.name} onChangeText={(name) => updateLineItem(uuid, { name })} />
				</View>
				<EditCartItemButton title={t('Edit {name}', { _tags: 'core', name: item.name })}>
					<EditLineItem uuid={uuid} item={item} />
				</EditCartItemButton>
			</HStack>

			{column.columnDef.meta.show('sku') && <Text className="text-sm">{item.sku}</Text>}

			{attributes.length > 0 && (
				<Box className="grid gap-1 grid-cols-2 p-0">
					{attributes.map((meta) => {
						return (
							<React.Fragment key={meta.id || meta.display_key || meta.key}>
								<Text
									className="text-sm"
									numberOfLines={1}
								>{`${meta.display_key || meta.key}:`}</Text>
								<Text className="text-sm" numberOfLines={1}>
									{meta.display_value || meta.value}
								</Text>
							</React.Fragment>
						);
					})}
				</Box>
			)}
		</VStack>
	);
};

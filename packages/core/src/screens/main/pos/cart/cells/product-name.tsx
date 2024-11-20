import * as React from 'react';
import { View } from 'react-native';

import { decode } from 'html-entities';

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
	const metaData = React.useMemo(
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
		<VStack className="w-full">
			<HStack className="gap-0">
				<View className="flex-1">
					<EditableName value={item.name} onChangeText={(name) => updateLineItem(uuid, { name })} />
				</View>
				<EditCartItemButton title={t('Edit {name}', { _tags: 'core', name: item.name })}>
					<EditLineItem uuid={uuid} item={item} />
				</EditCartItemButton>
			</HStack>

			{column.columnDef.meta.show('sku') && <Text className="text-sm">{item.sku}</Text>}

			{metaData.length > 0 && (
				<VStack space="xs">
					{metaData.map((meta: any) => (
						<HStack key={meta.id || meta.key || meta.display_key} className="flex-wrap gap-0">
							<Text className="text-xs text-muted-foreground">{`${decode(meta.display_key || meta.key)}: `}</Text>
							<Text className="text-xs">{decode(meta.display_value || meta.value)}</Text>
						</HStack>
					))}
				</VStack>
			)}
		</VStack>
	);
};

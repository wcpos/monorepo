import * as React from 'react';
import { View } from 'react-native';

import { Box } from '@wcpos/components/src/box';
import { HStack } from '@wcpos/components/src/hstack';
import { Text } from '@wcpos/components/src/text';
import { VStack } from '@wcpos/components/src/vstack';

import { EditCartItemButton } from './edit-cart-item-button';
import { EditFeeLine } from './edit-fee-line';
import { useT } from '../../../../../contexts/translations';
import { EditableName } from '../../../components/editable-name';
import { useUpdateFeeLine } from '../../hooks/use-update-fee-line';

import type { CellContext } from '@tanstack/react-table';

type FeeLine = import('@wcpos/database').OrderDocument['fee_lines'][number];
interface Props {
	uuid: string;
	item: FeeLine;
	type: 'line_items';
}

/**
 *
 */
export const FeeName = ({ row }: CellContext<Props, 'name'>) => {
	const { item, uuid } = row.original;
	const { updateFeeLine } = useUpdateFeeLine();
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
					<EditableName value={item.name} onChangeText={(name) => updateFeeLine(uuid, { name })} />
				</View>
				<EditCartItemButton title={t('Edit {name}', { _tags: 'core', name: item.name })}>
					<EditFeeLine uuid={uuid} item={item} />
				</EditCartItemButton>
			</HStack>

			{metaData.length > 0 && (
				<Box className="grid gap-1 grid-cols-2">
					{metaData.map((meta) => {
						return (
							<React.Fragment key={meta.id || meta.display_key || meta.key}>
								<Text className="text-sm">{`${meta.key}:`}</Text>
								<Text className="text-sm">{meta.value}</Text>
							</React.Fragment>
						);
					})}
				</Box>
			)}
		</VStack>
	);
};

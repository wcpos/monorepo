import * as React from 'react';
import { View } from 'react-native';

import find from 'lodash/find';

import { Box } from '@wcpos/tailwind/src/box';
import { Button, ButtonText } from '@wcpos/tailwind/src/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@wcpos/tailwind/src/dialog';
import { HStack } from '@wcpos/tailwind/src/hstack';
import { IconButton } from '@wcpos/tailwind/src/icon-button';
import { Text } from '@wcpos/tailwind/src/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/tailwind/src/tooltip';
import { VStack } from '@wcpos/tailwind/src/vstack';

import { EditLineItem } from './edit-line-item';
import { useT } from '../../../../../contexts/translations';
import { useUpdateLineItem } from '../../hooks/use-update-line-item';

type LineItem = import('@wcpos/database').OrderDocument['line_items'][number];
interface Props {
	uuid: string;
	item: LineItem;
	column: import('@wcpos/tailwind/src/table').ColumnProps<LineItem>;
}

/**
 *
 */
export const ProductName = ({ uuid, item, column }: Props) => {
	const { display } = column;
	const { updateLineItem } = useUpdateLineItem();
	const t = useT();
	const [openEditDialog, setOpenEditDialog] = React.useState(false);

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
		<>
			<VStack>
				<HStack className="w-full">
					<View className="flex-row flex-1 w-full">
						<Button
							variant="outline"
							className="max-w-full items-start"
							//onChange={(name) => updateLineItem(uuid, { name })}
						>
							<ButtonText className="font-bold" numberOfLines={1}>
								{item.name}
							</ButtonText>
						</Button>
					</View>
					<Tooltip delayDuration={150}>
						<TooltipTrigger asChild>
							<IconButton name="ellipsisVertical" onPress={() => setOpenEditDialog(true)} />
						</TooltipTrigger>
						<TooltipContent>
							<Text>{t('Edit {name}', { _tags: 'core', name: item.name })}</Text>
						</TooltipContent>
					</Tooltip>
				</HStack>

				{show('sku') && <Text className="text-sm">{item.sku}</Text>}

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

			<Dialog open={openEditDialog} onOpenChange={setOpenEditDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('Edit {name}', { _tags: 'core', name: item.name })}</DialogTitle>
					</DialogHeader>
					<EditLineItem uuid={uuid} item={item} />
				</DialogContent>
			</Dialog>
		</>
	);
};

import * as React from 'react';
import { View } from 'react-native';

import { Button, ButtonText } from '@wcpos/tailwind/src/button';
import { Dialog, DialogContent, DialogTrigger } from '@wcpos/tailwind/src/dialog';
import { HStack } from '@wcpos/tailwind/src/hstack';
import { IconButton } from '@wcpos/tailwind/src/icon-button';
import { Text } from '@wcpos/tailwind/src/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/tailwind/src/tooltip';

import { EditShippingLine } from './edit-shipping-line';
import { useT } from '../../../../../contexts/translations';
import { useUpdateShippingLine } from '../../hooks/use-update-shipping-line';

type ShippingLine = import('@wcpos/database').OrderDocument['shipping_lines'][number];
interface Props {
	uuid: string;
	item: ShippingLine;
	column: import('@wcpos/tailwind/src/table').ColumnProps<ShippingLine>;
}

/**
 *
 */
export const ShippingTitle = ({ uuid, item }: Props) => {
	const { updateShippingLine } = useUpdateShippingLine();
	const t = useT();

	return (
		<HStack>
			<View className="flex-1">
				<Button variant="outline">
					<ButtonText className="font-bold">{item.method_title}</ButtonText>
				</Button>
			</View>
			<Tooltip delayDuration={150}>
				<TooltipTrigger asChild>
					<Dialog>
						<DialogTrigger asChild>
							<IconButton name="ellipsisVertical" />
						</DialogTrigger>
						<DialogContent>
							<EditShippingLine uuid={uuid} item={item} />
						</DialogContent>
					</Dialog>
				</TooltipTrigger>
				<TooltipContent>
					<Text>{t('Edit {name}', { _tags: 'core', name: item.method_title })}</Text>
				</TooltipContent>
			</Tooltip>
		</HStack>
	);
};

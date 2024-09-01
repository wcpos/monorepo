import * as React from 'react';
import { View } from 'react-native';

import { Button, ButtonText } from '@wcpos/components/src/button';
import { HStack } from '@wcpos/components/src/hstack';

import { EditCartItemButton } from './edit-cart-item-button';
import { EditShippingLine } from './edit-shipping-line';
import { useT } from '../../../../../contexts/translations';
import { useUpdateShippingLine } from '../../hooks/use-update-shipping-line';

import type { CellContext } from '@tanstack/react-table';

type ShippingLine = import('@wcpos/database').OrderDocument['shipping_lines'][number];
interface Props {
	uuid: string;
	item: ShippingLine;
	type: 'line_items';
}

/**
 *
 */
export const ShippingTitle = ({ row }: CellContext<Props, 'name'>) => {
	const { item, uuid } = row.original;
	const { updateShippingLine } = useUpdateShippingLine();
	const t = useT();

	return (
		<HStack>
			<View className="flex-1">
				<Button variant="outline">
					<ButtonText className="font-bold">{item.method_title}</ButtonText>
				</Button>
			</View>
			<EditCartItemButton title={t('Edit {name}', { _tags: 'core', name: item.method_title })}>
				<EditShippingLine uuid={uuid} item={item} />
			</EditCartItemButton>
		</HStack>
	);
};

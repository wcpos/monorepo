import * as React from 'react';
import { View } from 'react-native';

import { HStack } from '@wcpos/components/hstack';

import { EditCartItemButton } from './edit-cart-item-button';
import { EditShippingLine } from './edit-shipping-line';
import { useT } from '../../../../../contexts/translations';
import { EditableName } from '../../../components/editable-name';
import { useUpdateShippingLine } from '../../hooks/use-update-shipping-line';

import type { CellContext } from '@tanstack/react-table';

type ShippingLine = NonNullable<import('@wcpos/database').OrderDocument['shipping_lines']>[number];
interface Props {
	uuid: string;
	item: ShippingLine;
	type: 'line_items';
}

/**
 *
 */
export function ShippingTitle({ row }: CellContext<Props, 'name'>) {
	const { item, uuid } = row.original;
	const { updateShippingLine } = useUpdateShippingLine();
	const t = useT();

	return (
		<HStack className="w-full gap-0">
			<View className="flex-1">
				<EditableName
					value={item.method_title}
					onChangeText={(method_title) => updateShippingLine(uuid, { method_title })}
				/>
			</View>
			<EditCartItemButton title={t('common.edit_2', { name: item.method_title })}>
				<EditShippingLine uuid={uuid} item={item} />
			</EditCartItemButton>
		</HStack>
	);
}

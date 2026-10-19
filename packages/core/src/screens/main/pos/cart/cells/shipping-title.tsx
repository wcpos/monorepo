import * as React from 'react';
import { View } from 'react-native';

import { Text } from '@wcpos/components/text';
import type { CellContext } from '@wcpos/core/table-types';

import { EditableField } from '../../../components/editable-field';
import { useUpdateCartLine } from '../../hooks/use-update-cart-line';
import { useCartTableReadOnly } from './read-only';

type ShippingLine = import('@wcpos/query').OrderShippingLine;
interface Props {
	uuid: string;
	item: ShippingLine;
	type: 'line_items';
}

/** The v2 cart's shipping title: the old cell without the edit icon (the strip's Edit owns it). */
export function ShippingTitle({ row }: CellContext<Props, 'name'>) {
	const { item, uuid } = row.original;
	const { updateCartLine } = useUpdateCartLine();
	const readOnly = useCartTableReadOnly();

	return (
		// No edit icon here: the line strip's Edit owns the dialog (Paul, 2026-09-29).
		<View className="w-full">
			{readOnly ? (
				<Text className="py-1.5" numberOfLines={2} decodeHtml>
					{item.method_title ?? ''}
				</Text>
			) : (
				<EditableField
					variant="ghost"
					bold={false}
					numberOfLines={2}
					value={item.method_title}
					onChangeText={(method_title) => updateCartLine('shipping_lines', uuid, { method_title })}
				/>
			)}
		</View>
	);
}

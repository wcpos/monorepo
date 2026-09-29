import * as React from 'react';
import { View } from 'react-native';

import type { CellContext } from '@wcpos/core/table-types';

import { EditableField } from '../../../../components/editable-field';
import { useUpdateShippingLine } from '../../../hooks/use-update-shipping-line';

type ShippingLine = NonNullable<import('@wcpos/database').OrderDocument['shipping_lines']>[number];
interface Props {
	uuid: string;
	item: ShippingLine;
	type: 'line_items';
}

/** The v2 cart's shipping title: the old cell without the edit icon (the strip's Edit owns it). */
export function ShippingTitle({ row }: CellContext<Props, 'name'>) {
	const { item, uuid } = row.original;
	const { updateShippingLine } = useUpdateShippingLine();

	return (
		// No edit icon here: the line strip's Edit owns the dialog (Paul, 2026-09-29).
		<View className="w-full">
			<EditableField
				variant="ghost"
				bold={false}
				value={item.method_title}
				onChangeText={(method_title) => updateShippingLine(uuid, { method_title })}
			/>
		</View>
	);
}

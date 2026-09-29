import * as React from 'react';
import { Pressable } from 'react-native';

import { Icon } from '@wcpos/components/icon';
import { type EngineRecord, useDocField } from '@wcpos/query';

import { DataTableRow } from '../../../../components/data-table/v2/rows';
import { VariableProductRow as InlineRow } from '../../../../components/product/variable-product-row';
export function VariableProductRow({
	variationsStyle,
	onDrill,
	...props
}: React.ComponentProps<typeof InlineRow> & {
	variationsStyle: string;
	onDrill: (record: EngineRecord<'products'>) => void;
}) {
	const name = useDocField(props.item.original.record, (value) => value.payload.name) as string;
	if (variationsStyle === 'inline') return <InlineRow {...props} />;
	return (
		<DataTableRow
			item={props.item}
			onPress={() => onDrill(props.item.original.record)}
			trailing={
				// The chevron drills in too: it is the row's named control, beside the pressable.
				<Pressable
					testID="variable-product-drill"
					accessibilityRole="button"
					accessibilityLabel={name}
					onPress={() => onDrill(props.item.original.record)}
					className="min-h-row justify-center"
				>
					<Icon name="chevronRight" />
				</Pressable>
			}
		/>
	);
}

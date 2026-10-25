import * as React from 'react';

import { useRouter } from 'expo-router';

import { Button } from '@wcpos/components/button';
import { Text, TextClassContext } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { EditableField } from '../../components/editable-field';
import { CapabilityTooltip } from '../../components/capability-tooltip';
import { PlainAttributes, ProductAttributes } from '../../components/product/attributes';
import { GroupedNames } from '../../components/product/grouped-names';
import { useProAccess } from '../../contexts/pro-access';
import { useUserCapabilities } from '../../hooks/use-user-capabilities';

/**
 *
 */
export function ProductName(props: CellContext<{ record: EngineRecord<'products'> }, 'name'>) {
	const record = props.row.original.record;
	const show = props.column.columnDef.meta?.show;
	const fields = useRecordField(record, ({ payload }) => ({
		name: payload.name,
		sku: payload.sku,
		barcode: payload.barcode,
		type: payload.type,
	}));
	const { readOnly } = useProAccess();
	const { caps } = useUserCapabilities();
	const canEdit = caps.canEditProducts;
	const editable = !readOnly && canEdit;
	const router = useRouter();
	const meta = props.table.options.meta as unknown as {
		onChange: (arg: {
			document: EngineRecord<'products'>;
			changes: Record<string, unknown>;
		}) => void;
	};

	/**
	 *
	 */
	return (
		<VStack space="xs" className="w-full">
			<CapabilityTooltip show={!readOnly && !canEdit} hint="editProducts">
				{fields.type === 'variable' ? (
					// A variable row's press and caret toggle its variations, so its name opens the
					// product (one "open this product" action, the simple caret's testID). A control
					// inside the row: the row's press guard leaves it alone.
					<Button
						testID="product-open-button"
						variant="ghost"
						// No label: the button's name is the product's name, so each opener is told apart.
						className="justify-start px-0"
						disabled={!editable}
						onPress={
							editable
								? () =>
										router.push({
											pathname: '/(app)/(drawer)/products/(modals)/edit/product/[productId]',
											params: { productId: record.uuid },
										})
								: undefined
						}
					>
						<TextClassContext.Provider value={undefined}>
							<Text className="text-foreground font-medium" numberOfLines={1} decodeHtml>
								{fields.name}
							</Text>
						</TextClassContext.Provider>
					</Button>
				) : (
					<EditableField
						value={fields.name}
						onChangeText={
							readOnly || !canEdit
								? undefined
								: (name) => meta.onChange({ document: record, changes: { name } })
						}
						editable={editable}
					/>
				)}
			</CapabilityTooltip>
			{show?.('sku') && <Text className="text-sm">{fields.sku}</Text>}
			{show?.('barcode') && <Text className="text-sm">{fields.barcode}</Text>}
			{show?.('attributes') && <PlainAttributes {...props} />}
			{fields.type === 'variable' && <ProductAttributes {...props} />}
			{fields.type === 'grouped' && <GroupedNames {...props} />}
		</VStack>
	);
}

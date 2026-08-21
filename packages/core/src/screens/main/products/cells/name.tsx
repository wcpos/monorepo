import * as React from 'react';

import { Text } from '@wcpos/components/text';
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
				<EditableField
					value={fields.name}
					onChangeText={
						readOnly || !canEdit
							? undefined
							: (name) => meta.onChange({ document: record, changes: { name } })
					}
					editable={!readOnly && canEdit}
				/>
			</CapabilityTooltip>
			{show?.('sku') && <Text className="text-sm">{fields.sku}</Text>}
			{show?.('barcode') && <Text className="text-sm">{fields.barcode}</Text>}
			{show?.('attributes') && <PlainAttributes {...props} />}
			{fields.type === 'variable' && <ProductAttributes {...props} />}
			{fields.type === 'grouped' && <GroupedNames {...props} />}
		</VStack>
	);
}

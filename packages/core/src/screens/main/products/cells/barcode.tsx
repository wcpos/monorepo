import * as React from 'react';

import type { CellContext } from '@wcpos/core/table-types';
import { Input } from '@wcpos/components/input';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { CapabilityTooltip } from '../../components/capability-tooltip';
import { useProAccess } from '../../contexts/pro-access';
import { useUserCapabilities } from '../../hooks/use-user-capabilities';

/**
 *
 */
export function Barcode({
	row,
	table,
}: CellContext<
	{
		record: EngineRecord<'products'> | EngineRecord<'variations'>;
	},
	'name'
>) {
	const product = row.original.record;
	const barcode = useRecordField(row.original.record, (record) => record.payload.barcode);
	const type = useRecordField(row.original.record, (record) => record.payload.type);
	const [value, setValue] = React.useState(barcode);
	const { readOnly } = useProAccess();
	const { caps } = useUserCapabilities();
	const canEdit = type === 'variation' ? caps.canEditVariations : caps.canEditProducts;
	const disabled = readOnly || !canEdit;
	const meta = table.options.meta as unknown as {
		onChange: (arg: {
			document: EngineRecord<'products'> | EngineRecord<'variations'>;
			changes: Record<string, unknown>;
		}) => void;
	};

	// Update value if the underlying barcode changes. Implemented as the React
	// "adjust state during render" pattern (tracking the previous barcode) rather
	// than an effect, so it never sets state inside useEffect.
	const [prevBarcode, setPrevBarcode] = React.useState(barcode);
	if (barcode !== prevBarcode) {
		setPrevBarcode(barcode);
		setValue(barcode);
	}

	/**
	 *
	 */
	const handleSubmit = React.useCallback(() => {
		if (disabled) return;
		meta.onChange({ document: product, changes: { barcode: value } });
	}, [product, meta, value, disabled]);

	/**
	 *
	 */
	return (
		<CapabilityTooltip show={!readOnly && !canEdit} hint="editProducts">
			<Input
				value={value}
				onChangeText={disabled ? undefined : setValue}
				onBlur={handleSubmit}
				onSubmitEditing={handleSubmit}
				blurOnSubmit
				editable={!disabled}
			/>
		</CapabilityTooltip>
	);
}

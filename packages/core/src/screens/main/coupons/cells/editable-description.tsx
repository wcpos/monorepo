import * as React from 'react';

import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { EditableField } from '../../components/editable-field';
import { CapabilityTooltip } from '../../components/capability-tooltip';
import { useProAccess } from '../../contexts/pro-access';
import { useUserCapabilities } from '../../hooks/use-user-capabilities';

export function EditableDescription({
	row,
	table,
}: CellContext<{ record: EngineRecord<'coupons'> }, string>) {
	const item = row.original.record;
	const description = useRecordField(row.original.record, ({ payload }) => payload.description);
	const meta = table.options.meta as unknown as {
		onChange: (arg: {
			document: EngineRecord<'coupons'>;
			changes: Record<string, unknown>;
		}) => void;
	};
	const { readOnly } = useProAccess();
	const { caps } = useUserCapabilities();

	return (
		<CapabilityTooltip show={!readOnly && !caps.canEditCoupons} hint="editCoupons">
			<EditableField
				value={description}
				onChangeText={(val) => meta.onChange({ document: item, changes: { description: val } })}
				editable={!readOnly && caps.canEditCoupons}
				bold={false}
			/>
		</CapabilityTooltip>
	);
}

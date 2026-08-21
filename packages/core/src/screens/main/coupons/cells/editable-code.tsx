import * as React from 'react';

import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { EditableField } from '../../components/editable-field';
import { CapabilityTooltip } from '../../components/capability-tooltip';
import { useProAccess } from '../../contexts/pro-access';
import { useUserCapabilities } from '../../hooks/use-user-capabilities';

export function EditableCode({
	row,
	table,
}: CellContext<{ record: EngineRecord<'coupons'> }, string>) {
	const item = row.original.record;
	const code = useRecordField(row.original.record, ({ payload }) => payload.code);
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
				value={code}
				onChangeText={(val) => meta.onChange({ document: item, changes: { code: val } })}
				editable={!readOnly && caps.canEditCoupons}
			/>
		</CapabilityTooltip>
	);
}

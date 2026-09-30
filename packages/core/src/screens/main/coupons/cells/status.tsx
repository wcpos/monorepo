import { Pressable } from 'react-native';

import { StatusBadge } from '@wcpos/components/status-badge';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { useT } from '../../../../contexts/translations';

import type { QueryStateActions } from '../../../../query';

const labelMap: Record<string, string> = {
	publish: 'coupons.publish',
	draft: 'coupons.draft',
	pending: 'coupons.pending',
};

export function Status({ row, table }: CellContext<{ record: EngineRecord<'coupons'> }, 'status'>) {
	const status = useRecordField(row.original.record, ({ payload }) => payload.status) ?? '';
	const t = useT();
	const actions = (
		table.options.meta as {
			actions?: Pick<QueryStateActions<'coupons'>, 'setFilter'>;
		}
	)?.actions;

	const label = labelMap[status] ? t(labelMap[status]) : status;

	return (
		<Pressable
			testID={`coupon-status-${row.original.record.uuid}`}
			accessibilityRole="button"
			className="min-h-11 justify-center"
			onPress={() => status && actions?.setFilter('status', status)}
		>
			<StatusBadge
				label={label}
				variant={
					status === 'publish'
						? 'success'
						: status === 'draft'
							? 'muted'
							: status === 'pending'
								? 'warning'
								: 'default'
				}
			/>
		</Pressable>
	);
}

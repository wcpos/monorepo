import { ButtonPill, ButtonText } from '@wcpos/components/button';
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
		<ButtonPill
			variant="ghost-primary"
			size="xs"
			onPress={() => status && actions?.setFilter('status', status)}
		>
			<ButtonText numberOfLines={1}>{label}</ButtonText>
		</ButtonPill>
	);
}

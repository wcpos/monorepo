import { StatusBadge } from '@wcpos/components/status-badge';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { useT } from '../../../../contexts/translations';
import { convertUTCStringToLocalDate } from '../../../../hooks/use-local-date';

export function Active({ row }: CellContext<{ record: EngineRecord<'coupons'> }, string>) {
	const fields = useRecordField(row.original.record, ({ payload }) => ({
		status: payload.status,
		dateExpiresGmt: payload.date_expires_gmt,
	}));

	return <ActiveBadge {...fields} />;
}

export function ActiveBadge({
	status,
	dateExpiresGmt,
}: {
	status?: string;
	dateExpiresGmt?: string | null;
}) {
	const t = useT();
	const isExpired = dateExpiresGmt
		? convertUTCStringToLocalDate(dateExpiresGmt) < new Date()
		: false;
	const isActive = status === 'publish' && !isExpired;

	return (
		<StatusBadge
			variant={isActive ? 'success' : 'muted'}
			label={t(isActive ? 'coupons.active' : 'coupons.inactive')}
		/>
	);
}

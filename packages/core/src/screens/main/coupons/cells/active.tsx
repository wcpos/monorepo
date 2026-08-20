import { Icon } from '@wcpos/components/icon';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { convertUTCStringToLocalDate } from '../../../../hooks/use-local-date';

export function Active({ row }: CellContext<{ record: EngineRecord<'coupons'> }, string>) {
	const fields = useRecordField(row.original.record, ({ payload }) => ({
		status: payload.status,
		dateExpiresGmt: payload.date_expires_gmt,
	}));

	const isExpired = fields.dateExpiresGmt
		? convertUTCStringToLocalDate(fields.dateExpiresGmt) < new Date()
		: false;
	const isActive = fields.status === 'publish' && !isExpired;

	if (!isActive) return null;

	return <Icon name="circleCheck" className="text-success" />;
}

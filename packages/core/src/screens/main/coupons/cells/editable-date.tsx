import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { DatePickerInput } from '../../components/coupon/date-picker-input';
import { useProAccess } from '../../contexts/pro-access';

import type { CellContext } from '@tanstack/react-table';

type CouponDocument = import('@wcpos/database').CouponDocument;

export function EditableDate({ row, table }: CellContext<{ document: CouponDocument }, string>) {
	const item = row.original.document;
	const dateExpiresGmt = useObservableEagerState(
		(item as unknown as Record<string, unknown>).date_expires_gmt$ as import('rxjs').Observable<
			string | null | undefined
		>
	) as string | null;
	const meta = table.options.meta as unknown as {
		onChange: (arg: { document: CouponDocument; changes: Record<string, unknown> }) => void;
	};
	const { readOnly } = useProAccess();

	return (
		<DatePickerInput
			value={dateExpiresGmt}
			onChange={(val) => meta.onChange({ document: item, changes: { date_expires_gmt: val } })}
			disabled={readOnly}
		/>
	);
}

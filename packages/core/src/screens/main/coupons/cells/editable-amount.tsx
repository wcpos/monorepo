import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { CurrencyInput } from '../../components/currency-input';
import { useProAccess } from '../../contexts/pro-access';

import type { CellContext } from '@tanstack/react-table';

type CouponDocument = import('@wcpos/database').CouponDocument;

export function EditableAmount({
	row,
	column,
	table,
}: CellContext<{ document: CouponDocument }, string>) {
	const item = row.original.document;
	const amount = useObservableEagerState(
		(item as unknown as Record<string, unknown>)[`${column.id}$`] as import('rxjs').Observable<
			string | undefined
		>
	) as string;
	const meta = table.options.meta as unknown as {
		onChange: (arg: { document: CouponDocument; changes: Record<string, unknown> }) => void;
	};
	const { readOnly } = useProAccess();

	return (
		<CurrencyInput
			value={amount}
			onChangeText={(val) =>
				meta.onChange({ document: item, changes: { [column.id]: String(val) } })
			}
			disabled={readOnly}
		/>
	);
}

import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { EditableField } from '../../components/editable-field';
import { useProAccess } from '../../contexts/pro-access';

import type { CellContext } from '@tanstack/react-table';

type CouponDocument = import('@wcpos/database').CouponDocument;

export function EditableCode({ row, table }: CellContext<{ document: CouponDocument }, string>) {
	const item = row.original.document;
	const code = useObservableEagerState(
		(item as unknown as Record<string, unknown>).code$ as import('rxjs').Observable<
			string | undefined
		>
	) as string;
	const meta = table.options.meta as unknown as {
		onChange: (arg: { document: CouponDocument; changes: Record<string, unknown> }) => void;
	};
	const { readOnly } = useProAccess();

	return (
		<EditableField
			value={code}
			onChangeText={(val) => meta.onChange({ document: item, changes: { code: val } })}
			editable={!readOnly}
		/>
	);
}

import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { EditableField } from '../../components/editable-field';
import { useProAccess } from '../../contexts/pro-access';

import type { CellContext } from '@tanstack/react-table';

type CouponDocument = import('@wcpos/database').CouponDocument;

export function EditableDescription({
	row,
	table,
}: CellContext<{ document: CouponDocument }, string>) {
	const item = row.original.document;
	const description = useObservableEagerState(
		(item as unknown as Record<string, unknown>).description$ as import('rxjs').Observable<
			string | undefined
		>
	) as string;
	const meta = table.options.meta as unknown as {
		onChange: (arg: { document: CouponDocument; changes: Record<string, unknown> }) => void;
	};
	const { readOnly } = useProAccess();

	return (
		<EditableField
			value={description}
			onChangeText={(val) => meta.onChange({ document: item, changes: { description: val } })}
			editable={!readOnly}
		/>
	);
}

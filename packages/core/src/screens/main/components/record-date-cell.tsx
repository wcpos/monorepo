import * as React from 'react';

import { Text } from '@wcpos/components/text';
import { type EngineRecord, type EngineRecordCollectionName, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { useDateFormat } from '../hooks/use-date-format';

export function RecordDateCell<
	C extends EngineRecordCollectionName,
	TData extends { record: EngineRecord<C> },
>({ row, column }: CellContext<TData, string>) {
	const key = column.id.endsWith('_gmt') ? column.id : `${column.id}_gmt`;
	const dateGmt = useRecordField(
		row.original.record,
		({ payload }) => (payload as Record<string, unknown>)[key]
	);
	const dateFormatted = useDateFormat(dateGmt as string | undefined);

	return <Text>{dateFormatted}</Text>;
}

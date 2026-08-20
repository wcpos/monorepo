import * as React from 'react';

import { Text } from '@wcpos/components/text';
import { type EngineRecord, type EngineRecordCollectionName, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import type { TableFeatures } from '@tanstack/react-table';

export function RecordTextCell<
	C extends EngineRecordCollectionName,
	TFeatures extends TableFeatures,
	TData extends { record: EngineRecord<C> },
>({ row, column }: CellContext<TData, string, TFeatures>) {
	const value = useRecordField(
		row.original.record,
		({ payload }) => (payload as Record<string, unknown>)[column.id]
	);

	return <Text>{value == null ? '' : String(value)}</Text>;
}

import * as React from 'react';

import { Text } from '@wcpos/components/text';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { useStoreDayLabel } from '../../../../hooks/use-store-day-label';

export function DateCell({
	row,
	column,
}: CellContext<{ record: EngineRecord<'coupons'> }, string>) {
	const value = useRecordField(
		row.original.record,
		({ payload }) => payload[column.id as keyof typeof payload]
	);
	const { day } = useStoreDayLabel();
	return <Text>{typeof value === 'string' && value ? day(value) : ''}</Text>;
}

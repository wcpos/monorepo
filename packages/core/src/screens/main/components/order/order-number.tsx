import * as React from 'react';

import { Text } from '@wcpos/components/text';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

/**
 *
 */
export function OrderNumber({ row }: CellContext<{ record: EngineRecord<'orders'> }, 'number'>) {
	const number = useRecordField(row.original.record, ({ payload }) => payload.number);

	return number ? <Text>{number}</Text> : null;
}

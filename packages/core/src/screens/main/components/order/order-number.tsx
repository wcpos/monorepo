import * as React from 'react';

import { Text } from '@wcpos/components/text';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

/**
 *
 */
export function OrderNumber({ row }: CellContext<{ record: EngineRecord<'orders'> }, 'number'>) {
	const number = useRecordField(row.original.record, ({ payload }) => payload.number);

	// The one value-bearing anchor E2E has for a row whose testID is a client uuid
	// it cannot know in advance (server-created orders arrive with no push envelope).
	return number ? <Text testID="order-number">{number}</Text> : null;
}

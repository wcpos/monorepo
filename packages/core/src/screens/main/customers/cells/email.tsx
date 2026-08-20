import * as React from 'react';

import { Text } from '@wcpos/components/text';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

/**
 *
 */
export function CustomerEmail({
	row,
}: CellContext<{ record: EngineRecord<'customers'> }, 'email'>) {
	const email = useRecordField(row.original.record, ({ payload }) => payload.email);

	return <Text numberOfLines={1}>{email}</Text>;
}

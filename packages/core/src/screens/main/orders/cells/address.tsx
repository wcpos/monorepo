import * as React from 'react';

import { FormatAddress } from '@wcpos/components/format';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

/**
 *
 */
export function Address({
	row,
	column,
}: CellContext<{ record: EngineRecord<'orders'> }, 'billing' | 'shipping'>) {
	const key = column.id as 'billing' | 'shipping';
	const address = useRecordField(row.original.record, ({ payload }) => payload[key]) as
		Record<string, string> | undefined;

	return address ? <FormatAddress address={address} showName={false} /> : null;
}

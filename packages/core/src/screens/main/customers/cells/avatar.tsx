import * as React from 'react';

import { type ReadonlyEngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { RecordAvatar } from '../../components/user-avatar';
import { getCustomerAvatarName } from '../../components/user-avatar/customer-avatar';

/**
 * The customers table's avatar cell: the customer's picture, else their initials on the primary.
 */
export function Avatar({
	row,
}: CellContext<{ record: ReadonlyEngineRecord<'customers'> }, 'avatar_url'>) {
	const record = row.original.record;
	const customer = useRecordField(record, ({ payload }) => payload);

	return (
		<RecordAvatar
			record={record}
			avatarUrl={customer.avatar_url}
			name={getCustomerAvatarName(customer)}
			size="lg"
			recyclingKey={record.uuid}
		/>
	);
}

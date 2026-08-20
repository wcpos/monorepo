import * as React from 'react';

import { FormatAddress } from '@wcpos/components/format';
import type { FormatAddressProps } from '@wcpos/components/format/address';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

type AddressData = FormatAddressProps['address'];

export function Address({
	row,
	column,
}: CellContext<{ record: EngineRecord<'customers'> }, 'billing' | 'shipping'>) {
	const key = column.id as 'billing' | 'shipping';
	const address = useRecordField(row.original.record, ({ payload }) => payload[key]) as
		AddressData | undefined;

	return <FormatAddress address={address ?? {}} showName={true} />;
}

import * as React from 'react';

import { Chip } from '@wcpos/components/chip';
import { FormatAddress } from '@wcpos/components/format';
import { VStack } from '@wcpos/components/vstack';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { useCustomerNameFormat } from '../../hooks/use-customer-name-format';

import type { CustomerData } from '../../hooks/use-customer-name-format/helpers';

/**
 *
 */
export function Customer({
	table,
	row,
	column,
}: CellContext<{ record: EngineRecord<'orders'> }, 'customer_id'>) {
	const actions = table.options.meta?.actions;
	const { format } = useCustomerNameFormat();
	const { customerID, billing, shipping } = useRecordField(row.original.record, ({ payload }) => ({
		customerID: payload.customer_id,
		billing: payload.billing,
		shipping: payload.shipping,
	}));
	const show = column.columnDef.meta?.show;

	return (
		<VStack className="max-w-full">
			<Chip
				size="sm"
				label={format({
					billing,
					shipping,
					id: customerID,
				} as unknown as CustomerData)}
				onPress={() => actions?.setFilter('customer_id', customerID)}
			/>
			{show?.('billing') && (
				<FormatAddress
					address={billing as React.ComponentProps<typeof FormatAddress>['address']}
					showName={false}
				/>
			)}
			{show?.('shipping') && (
				<FormatAddress
					address={shipping as React.ComponentProps<typeof FormatAddress>['address']}
					showName={false}
				/>
			)}
		</VStack>
	);
}

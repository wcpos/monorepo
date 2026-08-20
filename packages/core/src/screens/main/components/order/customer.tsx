import * as React from 'react';

import { ButtonPill } from '@wcpos/components/button';
import { FormatAddress } from '@wcpos/components/format';
import { VStack } from '@wcpos/components/vstack';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { useCustomerNameFormat } from '../../hooks/use-customer-name-format';

import type { QueryStateActions } from '../../../../query';

type OrderDocument = import('@wcpos/database').OrderDocument;
type CustomerDocument = import('@wcpos/database').CustomerDocument;

/**
 *
 */
export function Customer({
	table,
	row,
	column,
}: CellContext<{ document: OrderDocument; record: EngineRecord<'orders'> }, 'customer_id'>) {
	const actions = (
		table.options.meta as {
			actions?: Pick<QueryStateActions<'orders'>, 'setFilter'>;
		}
	)?.actions;
	const { format } = useCustomerNameFormat();
	const { customerID, billing, shipping } = useRecordField(row.original.record, ({ payload }) => ({
		customerID: payload.customer_id,
		billing: payload.billing,
		shipping: payload.shipping,
	}));
	const show = (column.columnDef.meta as { show?: (key: string) => boolean } | undefined)?.show;

	return (
		<VStack className="max-w-full">
			<ButtonPill
				variant="ghost-primary"
				size="xs"
				onPress={() => actions?.setFilter('customer_id', customerID)}
			>
				{format({
					billing,
					shipping,
					id: customerID,
				} as unknown as CustomerDocument)}
			</ButtonPill>
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

import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { ButtonPill } from '@wcpos/components/button';
import { FormatAddress } from '@wcpos/components/format';
import { VStack } from '@wcpos/components/vstack';
import type { CustomerDocument, OrderCollection, OrderDocument } from '@wcpos/database';
import type { Query } from '@wcpos/query';

import { useCustomerNameFormat } from '../../hooks/use-customer-name-format';

import type { CellContext } from '@tanstack/react-table';

/**
 * Legacy reports cell. Delete when reports/orders migrates to query-state bindings.
 */
export function Customer({
	table,
	row,
	column,
}: CellContext<{ document: OrderDocument }, 'customer_id'>) {
	const order = row.original.document;
	const query = (table.options.meta as { query?: Query<OrderCollection> } | undefined)?.query;
	const { format } = useCustomerNameFormat();
	const customerID = useObservableEagerState(order.customer_id$!);
	const billing = useObservableEagerState(order.billing$!);
	const shipping = useObservableEagerState(order.shipping$!);
	const show = (column.columnDef.meta as { show?: (key: string) => boolean } | undefined)?.show;

	return (
		<VStack className="max-w-full">
			<ButtonPill
				variant="ghost-primary"
				size="xs"
				onPress={() => query?.where('customer_id').equals(customerID).exec()}
			>
				{format({ billing, shipping, id: customerID } as unknown as CustomerDocument)}
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

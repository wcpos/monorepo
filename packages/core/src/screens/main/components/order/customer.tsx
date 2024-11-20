import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { ButtonPill } from '@wcpos/components/src/button';
import { useDataTable } from '@wcpos/components/src/data-table';
import { FormatAddress } from '@wcpos/components/src/format';
import { VStack } from '@wcpos/components/src/vstack';

import useCustomerNameFormat from '../../hooks/use-customer-name-format';

import type { CellContext } from '@tanstack/react-table';

type OrderDocument = import('@wcpos/database').OrderDocument;

/**
 *
 */
export const Customer = ({
	row,
	column,
}: CellContext<{ document: OrderDocument }, 'customer_id'>) => {
	const order = row.original.document;
	const { query } = useDataTable();
	const { format } = useCustomerNameFormat();
	const customerID = useObservableEagerState(order.customer_id$);
	const billing = useObservableEagerState(order.billing$);
	const shipping = useObservableEagerState(order.shipping$);
	const { show } = column.columnDef.meta;

	return (
		<VStack className="max-w-full">
			<ButtonPill
				variant="ghost-primary"
				size="xs"
				onPress={() => query.where('customer_id').equals(customerID).exec()}
			>
				{format({ billing, shipping, id: customerID })}
			</ButtonPill>
			{show('billing') && <FormatAddress address={billing} showName={false} />}
			{show('shipping') && <FormatAddress address={shipping} showName={false} />}
		</VStack>
	);
};

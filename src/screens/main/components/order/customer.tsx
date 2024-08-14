import * as React from 'react';

import find from 'lodash/find';
import { useObservableEagerState } from 'observable-hooks';

import { useQueryManager } from '@wcpos/query';
import { ButtonPill, ButtonText } from '@wcpos/tailwind/src/button';
import type { CellContext } from '@wcpos/tailwind/src/data-table';
import { FormatAddress } from '@wcpos/tailwind/src/format';
import { VStack } from '@wcpos/tailwind/src/vstack';

import useCustomerNameFormat from '../../hooks/use-customer-name-format';

type OrderDocument = import('@wcpos/database').OrderDocument;

/**
 *
 */
export const Customer = ({ row, column }: CellContext<OrderDocument, 'customer_id'>) => {
	const order = row.original;
	const manager = useQueryManager();
	const query = manager.getQuery(['orders']);
	const { format } = useCustomerNameFormat();
	const customerID = useObservableEagerState(order.customer_id$);
	const billing = useObservableEagerState(order.billing$);
	const shipping = useObservableEagerState(order.shipping$);

	/**
	 *
	 */
	const show = React.useCallback(
		(key: string): boolean => {
			const d = find(column.display, { key });
			return !!(d && d.show);
		},
		[column.display]
	);

	return (
		<VStack>
			<ButtonPill size="xs" onPress={() => query.where('customer_id', customerID)}>
				<ButtonText>{format({ billing, shipping, id: customerID })}</ButtonText>
			</ButtonPill>
			{show('billing') && <FormatAddress address={billing} showName={false} />}
			{show('shipping') && <FormatAddress address={shipping} showName={false} />}
		</VStack>
	);
};

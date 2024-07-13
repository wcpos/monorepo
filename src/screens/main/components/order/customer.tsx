import * as React from 'react';

import find from 'lodash/find';
import { useObservableEagerState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Format from '@wcpos/components/src/format';
import Pill from '@wcpos/components/src/pill';
import Text from '@wcpos/components/src/text';
import { useQueryManager } from '@wcpos/query';

import useCustomerNameFormat from '../../hooks/use-customer-name-format';

type Props = {
	item: import('@wcpos/database').OrderDocument;
	column: any;
};

const Customer = ({ item: order, column }: Props) => {
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
		<Box space="small">
			<Pill onPress={() => query.where('customer_id', customerID)}>
				{format({ billing, shipping, id: customerID })}
			</Pill>
			{show('billing') && <Format.Address address={billing} showName={false} />}
			{show('shipping') && <Format.Address address={shipping} showName={false} />}
		</Box>
	);
};

export default Customer;

import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { Text } from '@wcpos/tailwind/src/text';

import { useCollection } from '../../hooks/use-collection';
import useCustomerNameFormat from '../../hooks/use-customer-name-format';

import type { CellContext } from '@tanstack/react-table';

type OrderDocument = import('@wcpos/database').OrderDocument;

/**
 *
 */
export const Cashier = ({ row }: CellContext<OrderDocument, 'cashier'>) => {
	const order = row.original;
	const { collection } = useCollection('customers');
	const cashierID = useObservableEagerState(
		order.meta_data$.pipe(
			map((meta) => meta.find((m) => m.key === '_pos_user')),
			map((m) => m?.value)
		)
	);
	const [cashierName, setCashierName] = React.useState('');
	const { format } = useCustomerNameFormat();

	/**
	 * @TODO - it would be good to have a replication query which gets the cashier roles
	 * But we'll just hack it for the moment
	 */
	React.useEffect(() => {
		async function fetchUser(id) {
			const user = await collection.findOne({ selector: { id } }).exec();
			if (user) {
				setCashierName(format(user));
			} else {
				setCashierName('ID: ' + id);
			}
		}
		if (cashierID) {
			fetchUser(parseInt(cashierID, 10));
		}
	}, [cashierID, collection, format]);

	return <Text>{cashierName}</Text>;
};

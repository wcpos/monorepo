import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { ButtonPill } from '@wcpos/components/src/button';
import { useDataTable } from '@wcpos/components/src/data-table';

import { useCollection } from '../../hooks/use-collection';
import useCustomerNameFormat from '../../hooks/use-customer-name-format';

import type { CellContext } from '@tanstack/react-table';

type OrderDocument = import('@wcpos/database').OrderDocument;

/**
 *
 */
export const Cashier = ({ row }: CellContext<{ document: OrderDocument }, 'cashier'>) => {
	const order = row.original.document;
	const { collection } = useCollection('customers');
	const cashierID = useObservableEagerState(
		order.meta_data$.pipe(
			map((meta) => meta.find((m) => m.key === '_pos_user')),
			map((m) => m?.value)
		)
	);
	const [cashierName, setCashierName] = React.useState('');
	const { format } = useCustomerNameFormat();
	const { query } = useDataTable();

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

	/**
	 * It's possible the order doesn't have a cashier, eg: web or admin orders
	 */
	if (!cashierID) {
		return null;
	}

	return (
		<ButtonPill
			variant="ghost-secondary"
			size="xs"
			onPress={() =>
				query
					.where('meta_data')
					.multipleElemMatch({ key: '_pos_user', value: String(cashierID) })
					.exec()
			}
		>
			{cashierName}
		</ButtonPill>
	);
};

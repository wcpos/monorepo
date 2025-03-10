import React from 'react';

import { useLocalSearchParams } from 'expo-router';
import { useObservableEagerState, ObservableResource } from 'observable-hooks';
import { map, distinctUntilChanged } from 'rxjs/operators';

import { Suspense } from '@wcpos/components/suspense';
import type { OrderDocument } from '@wcpos/database';

import { useAppState } from '../../../contexts/app-state';
import { useCollection } from '../hooks/use-collection';
import { CurrentOrderProvider } from './contexts/current-order';
import { POS } from './pos';

export const POSScreen = () => {
	const { wpCredentials, store } = useAppState();
	const cashierID = useObservableEagerState(wpCredentials.id$);
	const storeID = useObservableEagerState(store.id$);
	const { collection: ordersCollection } = useCollection('orders');
	const { orderId } = useLocalSearchParams<{ orderId: string }>();

	/**
	 * We then need to filter the open orders to limit by cashier and store
	 *
	 * @TODO - it would be nice to be able to query ($elemMatch) by cashier and store, but
	 * there are too many edge cases, ie: cashier is not set, store is not set, etc.
	 * For now, we'll just filter the results.
	 */
	const resource = React.useMemo(
		() =>
			new ObservableResource(
				ordersCollection.find({ selector: { status: 'pos-open' } }).$.pipe(
					map((docs: OrderDocument[]) => {
						const filteredDocs = docs.filter((doc) => {
							const metaData = doc.meta_data;
							const _pos_user = metaData.find((item) => item.key === '_pos_user')?.value;
							const _pos_store = metaData.find((item) => item.key === '_pos_store')?.value;
							if (storeID === 0) {
								return _pos_user === String(cashierID);
							}
							return _pos_user === String(cashierID) && _pos_store === String(storeID);
						});
						const filteredAndSortedDocs = filteredDocs.sort((a, b) =>
							a.date_created_gmt.localeCompare(b.date_created_gmt)
						);
						return filteredAndSortedDocs.map((doc) => ({ id: doc.uuid, document: doc }));
					}),
					distinctUntilChanged((prev, next) => prev.length === next.length)
				)
			),
		[cashierID, ordersCollection, storeID]
	);

	return (
		<Suspense>
			<CurrentOrderProvider resource={resource} currentOrderUUID={orderId}>
				<Suspense>
					<POS />
				</Suspense>
			</CurrentOrderProvider>
		</Suspense>
	);
};

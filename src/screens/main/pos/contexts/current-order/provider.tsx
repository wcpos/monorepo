import * as React from 'react';

import {
	ObservableResource,
	useObservable,
	useObservableSuspense,
	useObservableState,
	useObservableRef,
} from 'observable-hooks';
import { switchMap } from 'rxjs/operators';

import { useCartHelpers } from './use-cart-helpers';
import { useAppState } from '../../../../../contexts/app-state';
import { useQuery } from '../../../../../contexts/store-state-manager';
import useCollection from '../../../hooks/use-collection';
import { useNewOrder } from '../../use-new-order';

type OrderDocument = import('@wcpos/database').OrderDocument;

interface CurrentOrderContextProps {
	currentOrder: OrderDocument;
}

export const CurrentOrderContext = React.createContext<CurrentOrderContextProps>(null);

interface CurrentOrderContextProviderProps {
	children: React.ReactNode;
	orderID?: string;
}

/**
 * Provider the active order by uuid, or a new order
 */
const CurrentOrderProvider = ({
	children,
	// openOrdersQuery,
	orderID,
}: CurrentOrderContextProviderProps) => {
	const [orderIDRef, orderID$] = useObservableRef(orderID);
	const newOrder = useNewOrder();
	const { isWebApp, initialProps } = useAppState();
	const { collection } = useCollection('orders');

	const openOrdersQuery = useQuery({
		queryKeys: ['orders', { status: 'pos-open' }],
		collectionName: 'orders',
		initialQuery: {
			selector: { status: 'pos-open' },
			sortBy: 'date_created_gmt',
			sortDirection: 'asc',
		},
	});

	/**
	 *
	 */
	const taxQuery = useQuery({
		queryKeys: ['tax-rates', 'pos'],
		collectionName: 'taxes',
		initialQuery: {
			search: {},
		},
	});

	/**
	 *
	 */
	const currentOrder$ = useObservable(
		() =>
			orderID$.pipe(
				switchMap(async (uuid) => {
					const order = await collection.findOneFix(uuid).exec();
					return order ?? newOrder;
				})
			),
		[]
	);

	/**
	 *
	 */
	const currentOrder = useObservableState(currentOrder$, newOrder);

	/**
	 * NOTE: navigation.setParams({ orderID }); causes a re-render and is too slow
	 */
	const setCurrentOrderID = React.useCallback(
		(id: string) => {
			orderIDRef.current = id;

			// keep web app url in sync
			if (isWebApp) {
				history.pushState({}, '', `${initialProps.homepage}cart/${id}`);
			}
		},
		[initialProps.homepage, isWebApp, orderIDRef]
	);

	/**
	 *
	 */
	return (
		<CurrentOrderContext.Provider
			value={{
				currentOrder,
				setCurrentOrderID,
				...useCartHelpers(currentOrder, setCurrentOrderID),
			}}
		>
			{children}
		</CurrentOrderContext.Provider>
	);
};

export default CurrentOrderProvider;

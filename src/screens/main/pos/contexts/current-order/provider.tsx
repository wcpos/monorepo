import * as React from 'react';

import {
	ObservableResource,
	useObservable,
	useObservableSuspense,
	useObservableState,
	useObservableRef,
} from 'observable-hooks';
import { switchMap } from 'rxjs/operators';

import { useAppState } from '../../../../../contexts/app-state';
import { useQuery } from '../../../../../contexts/store-state-manager';
import useCollection from '../../../hooks/use-collection';
import { useNewOrder } from '../../use-new-order';
import useTaxLocation from '../../use-tax-location';

type OrderDocument = import('@wcpos/database').OrderDocument;

interface CurrentOrderContextProps {
	currentOrder: OrderDocument;
	setCurrentOrderID: (id: string) => void;
}

export const CurrentOrderContext = React.createContext<CurrentOrderContextProps>(null);

interface CurrentOrderContextProviderProps {
	children: React.ReactNode;
	orderID?: string;
}

/**
 * Provider the active order by uuid, or a new order
 */
export const CurrentOrderProvider = ({
	children,
	orderID,
	taxQuery,
}: CurrentOrderContextProviderProps) => {
	const [orderIDRef, orderID$] = useObservableRef(orderID);
	const newOrder = useNewOrder();
	const { isWebApp, initialProps } = useAppState();
	const { collection } = useCollection('orders');

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
	 * Update tax location based on settings
	 */
	const taxLocation = useTaxLocation(currentOrder);
	taxQuery.search(taxLocation); // I think this is going to trigger new cart helpers, which causes loop

	/**
	 *
	 */
	return (
		<CurrentOrderContext.Provider
			value={{
				currentOrder,
				setCurrentOrderID,
			}}
		>
			{children}
		</CurrentOrderContext.Provider>
	);
};

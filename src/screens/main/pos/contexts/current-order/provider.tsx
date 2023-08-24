import * as React from 'react';

import { useNavigation } from '@react-navigation/native';
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
	resource: ObservableResource<OrderDocument>;
	taxQuery: any;
}

/**
 * Provider the active order by uuid, or a new order
 */
export const CurrentOrderProvider = ({
	children,
	resource,
	taxQuery,
}: CurrentOrderContextProviderProps) => {
	const currentOrder = useObservableSuspense(resource);
	const navigation = useNavigation();
	const location = useTaxLocation(currentOrder);
	console.log(location);
	taxQuery.search(location);
	console.log('currentOrder', currentOrder);

	/**
	 * The tax rate can depend on the current order's location
	 * So we need to re-query the tax rate when the order changes
	 */
	React.useEffect(() => {
		taxQuery.search(location);
	}, [location, taxQuery]);

	/**
	 *
	 */
	const setCurrentOrderID = React.useCallback(
		(orderID: string) => {
			navigation.setParams({ orderID });
		},
		[navigation]
	);

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

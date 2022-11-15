import * as React from 'react';

import useStore from '../../../../../contexts/store';
import NewOrder from './new-order';

type OrderDocument = import('@wcpos/database').OrderDocument;

interface CurrentOrderContextProps {
	currentOrder?: OrderDocument;
	setCurrentOrder: React.Dispatch<React.SetStateAction<OrderDocument | undefined>>;
	newOrder: typeof NewOrder;
}

export const CurrentOrderContext = React.createContext<CurrentOrderContextProps>(null);

interface CurrentOrderContextProviderProps {
	children: React.ReactNode;
}

/**
 *
 */
const CurrentOrderProvider = ({ children }: CurrentOrderContextProviderProps) => {
	const { storeDB } = useStore();
	const collection = storeDB.collections.orders;
	const [currentOrder, setCurrentOrder] = React.useState<OrderDocument | undefined>();

	/**
	 *
	 */
	const newOrder = React.useMemo(() => new NewOrder({ collection, setCurrentOrder }), [collection]);

	/**
	 *
	 */
	const value = React.useMemo(() => {
		return {
			currentOrder,
			setCurrentOrder,
			newOrder,
		};
	}, [currentOrder, newOrder]);

	return <CurrentOrderContext.Provider value={value}>{children}</CurrentOrderContext.Provider>;
};

export default CurrentOrderProvider;

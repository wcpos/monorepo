import * as React from 'react';
import useOrders from '@wcpos/core/src/contexts/orders';
import useStore from '@wcpos/hooks/src/use-store';
import NewOrder from './new-order';

type OrderDocument = import('@wcpos/database').OrderDocument;

interface OpenOrdersContextProps {
	currentOrder?: OrderDocument;
	setCurrentOrder: React.Dispatch<React.SetStateAction<OrderDocument | undefined>>;
	orders: OrderDocument[];
}

export const OpenOrdersContext = React.createContext<OpenOrdersContextProps>(null);

interface OpenOrdersContextProviderProps {
	children: React.ReactNode;
}

/**
 *
 */
const OpenOrdersProvider = ({ children }: OpenOrdersContextProviderProps) => {
	const { storeDB } = useStore();
	const collection = storeDB.collections.orders;
	const [currentOrder, setCurrentOrder] = React.useState<OrderDocument | undefined>();
	const { data } = useOrders();

	/**
	 *
	 */
	const orders = React.useMemo(() => {
		const newOrder = new NewOrder({ collection, setCurrentOrder });
		return [...data, newOrder];
	}, [collection, data]);

	/**
	 *
	 */
	if (!currentOrder) {
		setCurrentOrder(orders[0]);
	}

	/**
	 *
	 */
	const value = React.useMemo(() => {
		return { currentOrder, setCurrentOrder, orders };
	}, [currentOrder, orders]);

	return <OpenOrdersContext.Provider value={value}>{children}</OpenOrdersContext.Provider>;
};

export default OpenOrdersProvider;

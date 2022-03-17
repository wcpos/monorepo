import * as React from 'react';

type OrderDocument = import('@wcpos/common/src/database').OrderDocument;
type CustomerDocument = import('@wcpos/common/src/database').CustomerDocument;

interface POSContextProps {
	currentOrder?: OrderDocument;
	setCurrentOrder: React.Dispatch<React.SetStateAction<OrderDocument | undefined>>;
	currentCustomer?: CustomerDocument;
	setCurrentCustomer: React.Dispatch<React.SetStateAction<CustomerDocument | undefined>>;
}

const POSContext = React.createContext<POSContextProps>(null);

interface POSContextProviderProps {
	children: React.ReactNode;
}

const POSContextProvider = ({ children }: POSContextProviderProps) => {
	const [currentOrder, setCurrentOrder] = React.useState<OrderDocument | undefined>();
	const [currentCustomer, setCurrentCustomer] = React.useState<CustomerDocument | undefined>();

	const value = React.useMemo(
		() => ({ currentOrder, setCurrentOrder, currentCustomer, setCurrentCustomer }),
		[currentCustomer, currentOrder]
	);

	return <POSContext.Provider value={value}>{children}</POSContext.Provider>;
};

export const usePOSContext = () => {
	if (POSContext === undefined) {
		throw new Error(`usePOSContext must be called within POSContextProvider`);
	}
	return React.useContext(POSContext);
};

export default POSContextProvider;

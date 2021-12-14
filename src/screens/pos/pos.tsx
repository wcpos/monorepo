import * as React from 'react';
import { useWindowDimensions } from 'react-native';
import { useTheme } from 'styled-components/native';
import { useObservableSuspense } from 'observable-hooks';
import useUIResource from '@wcpos/common/src/hooks/use-ui-resource';
import { QueryProvider } from '@wcpos/common/src/hooks/use-query';
import ErrorBoundary from '@wcpos/common/src/components/error-boundary';
import Box from '@wcpos/common/src/components/box';
import CartTabs from './cart/tabs';
import Products from './products';
import ResizeableColumns from './resizable-columns';
import POSTabs from './tabs';

type OrderDocument = import('@wcpos/common/src/database').OrderDocument;
type CustomerDocument = import('@wcpos/common/src/database').CustomerDocument;
type StoreDatabase = import('@wcpos/common/src/database').StoreDatabase;

interface POSContextProps {
	currentOrder?: OrderDocument;
	setCurrentOrder: React.Dispatch<React.SetStateAction<OrderDocument | undefined>>;
	currentCustomer?: CustomerDocument;
	setCurrentCustomer: React.Dispatch<React.SetStateAction<CustomerDocument | undefined>>;
}

export const POSContext = React.createContext<POSContextProps>({
	currentOrder: undefined,
	// @ts-ignore
	setCurrentOrder: undefined,
	currentCustomer: undefined,
	// @ts-ignore
	setCurrentCustomer: undefined,
});

/**
 *
 */
const POS = () => {
	const productsUI = useObservableSuspense(useUIResource('pos.products'));
	const [currentOrder, setCurrentOrder] = React.useState<OrderDocument | undefined>();
	const [currentCustomer, setCurrentCustomer] = React.useState<CustomerDocument | undefined>();
	const theme = useTheme();
	const dimensions = useWindowDimensions();

	const context = React.useMemo(
		() => ({ currentOrder, setCurrentOrder, currentCustomer, setCurrentCustomer }),
		[currentCustomer, currentOrder]
	);

	const leftComponent = (
		<ErrorBoundary>
			<QueryProvider initialQuery={{ sortBy: 'name', sortDirection: 'asc' }}>
				<Products ui={productsUI} />
			</QueryProvider>
		</ErrorBoundary>
	);

	const rightComponent = (
		<ErrorBoundary>
			<CartTabs />
		</ErrorBoundary>
	);

	return (
		<POSContext.Provider value={context}>
			{dimensions.width >= theme.screens.small ? (
				<ResizeableColumns
					ui={productsUI}
					leftComponent={leftComponent}
					rightComponent={rightComponent}
				/>
			) : (
				<POSTabs leftComponent={leftComponent} rightComponent={rightComponent} />
			)}
		</POSContext.Provider>
	);
};

export default POS;

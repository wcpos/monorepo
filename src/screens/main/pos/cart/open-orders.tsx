import * as React from 'react';
import { OrdersProvider } from '@wcpos/core/src/contexts/orders';
import Text from '@wcpos/components/src/text';
import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Cart from './cart';
import EmptyCart from './empty-cart';
import Tabs from './tabs';
// import { usePOSContext } from '../context';

const OpenOrders = ({ isColumn = false }) => {
	// const { currentOrder, setCurrentOrder } = usePOSContext();

	/**
	 *
	 */
	const initialQuery = React.useMemo(
		() => ({
			sortBy: 'date_created_gmt',
			sortDirection: 'desc',
			filters: { status: 'pos-open' },
		}),
		[]
	);

	/**
	 *
	 */
	// const cart = React.useMemo(() => {
	// 	if (!currentOrder) {
	// 		return null;
	// 	}
	// 	if (currentOrder.isCartEmpty()) {
	// 		return (
	// 			<React.Suspense fallback={<Text>Loading Empty Cart</Text>}>
	// 				<EmptyCart order={currentOrder} />
	// 			</React.Suspense>
	// 		);
	// 	}
	// 	return (
	// 		<React.Suspense fallback={<Text>Loading Cart</Text>}>
	// 			<Cart order={currentOrder} />
	// 		</React.Suspense>
	// 	);
	// }, [currentOrder]);

	/**
	 *
	 */
	return (
		<Box padding="small" paddingLeft={isColumn ? 'none' : 'small'} style={{ height: '100%' }}>
			<Box style={{ flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}>
				<ErrorBoundary>
					<React.Suspense fallback={<Text>Loading Cart</Text>}>
						<Cart />
					</React.Suspense>
				</ErrorBoundary>
			</Box>
			<OrdersProvider initialQuery={initialQuery}>
				<ErrorBoundary>
					<React.Suspense fallback={<Text>Loading Cart Tabs</Text>}>
						<Tabs />
					</React.Suspense>
				</ErrorBoundary>
			</OrdersProvider>
		</Box>
	);
};

export default OpenOrders;

import * as React from 'react';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Text from '@wcpos/components/src/text';

import Cart from './cart';
import Tabs from './tabs';
import { OrdersProvider } from '../../contexts/orders';
import useCurrentOrder from '../contexts/current-order';

const OpenOrders = ({ isColumn = false }) => {
	const { currentOrder } = useCurrentOrder();

	/**
	 *
	 */
	const initialQuery = React.useMemo(
		() => ({
			sortBy: 'date_created_gmt',
			sortDirection: 'desc',
			selector: { status: 'pos-open' },
		}),
		[]
	);

	/**
	 *
	 */
	return (
		<Box padding="small" paddingLeft={isColumn ? 'none' : 'small'} style={{ height: '100%' }}>
			<Box style={{ flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}>
				<ErrorBoundary>
					<React.Suspense fallback={<Text>Loading Cart</Text>}>
						<Cart currentOrder={currentOrder} />
					</React.Suspense>
				</ErrorBoundary>
			</Box>
			<ErrorBoundary>
				<OrdersProvider initialQuery={initialQuery}>
					<React.Suspense fallback={<Text>Loading Cart Tabs</Text>}>
						<Tabs currentOrder={currentOrder} />
					</React.Suspense>
				</OrdersProvider>
			</ErrorBoundary>
		</Box>
	);
};

export default OpenOrders;

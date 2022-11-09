import * as React from 'react';
import Text from '@wcpos/components/src/text';
import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import { OrdersProvider } from '@wcpos/core/src/contexts/orders';
import Cart from './cart';
import Tabs from './tabs';

const OpenOrders = ({ isColumn = false }) => {
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
	return (
		<Box padding="small" paddingLeft={isColumn ? 'none' : 'small'} style={{ height: '100%' }}>
			<Box style={{ flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}>
				<ErrorBoundary>
					<React.Suspense fallback={<Text>Loading Cart</Text>}>
						<Cart />
					</React.Suspense>
				</ErrorBoundary>
			</Box>
			<ErrorBoundary>
				<React.Suspense fallback={<Text>Loading Cart Tabs</Text>}>
					<OrdersProvider initialQuery={initialQuery}>
						<Tabs />
					</OrdersProvider>
				</React.Suspense>
			</ErrorBoundary>
		</Box>
	);
};

export default OpenOrders;

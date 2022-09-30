import * as React from 'react';
import { OrdersProvider } from '@wcpos/core/src/contexts/orders';
import Text from '@wcpos/components/src/text';
import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import CartTabs from './tabs';

const OpenOrders = ({ isColumn = false }) => {
	const initialQuery = React.useMemo(
		() => ({
			sortBy: 'date_created_gmt',
			sortDirection: 'desc',
			filters: { status: 'pos-open' },
		}),
		[]
	);

	return (
		<OrdersProvider initialQuery={initialQuery}>
			<ErrorBoundary>
				<React.Suspense fallback={<Text>Loading Open Orders</Text>}>
					<Box padding="small" paddingLeft={isColumn ? 'none' : 'small'} style={{ height: '100%' }}>
						<CartTabs />
					</Box>
				</React.Suspense>
			</ErrorBoundary>
		</OrdersProvider>
	);
};

export default OpenOrders;

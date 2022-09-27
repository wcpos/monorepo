import * as React from 'react';
import { OrdersProvider } from '@wcpos/hooks/src/use-orders';
import Text from '@wcpos/components/src/text';
import Box from '@wcpos/components/src/box';
import CartTabs from './tabs';

const OpenOrders = () => {
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
			<React.Suspense fallback={<Text>Loading Open Orders</Text>}>
				<Box padding="small" style={{ height: '100%' }}>
					<CartTabs />
				</Box>
			</React.Suspense>
		</OrdersProvider>
	);
};

export default OpenOrders;

import * as React from 'react';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Icon from '@wcpos/components/src/icon';
import Suspense from '@wcpos/components/src/suspense';
import Tabs from '@wcpos/components/src/tabs';
import { useQuery } from '@wcpos/query';

import Cart from './cart';
import EmptyCart from './empty-cart';
import OpenOrderTabs from './tabs';
import { useCurrentOrder } from '../contexts/current-order';

const OpenOrders = ({ isColumn = false }) => {
	const { currentOrder } = useCurrentOrder();

	if (!currentOrder) {
		throw new Error('Current order is not defined');
	}

	/**
	 *
	 */
	const query = useQuery({
		queryKeys: ['orders', { status: 'pos-open' }],
		collectionName: 'orders',
		initialParams: {
			sortBy: 'date_created_gmt',
			sortDirection: 'desc',
			selector: { status: 'pos-open' },
		},
	});

	/**
	 *
	 */
	return (
		<Box padding="small" paddingLeft={isColumn ? 'none' : 'small'} style={{ height: '100%' }}>
			<Box style={{ flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}>
				<ErrorBoundary>
					{currentOrder.isNew ? (
						<EmptyCart currentOrder={currentOrder} />
					) : (
						<Cart currentOrder={currentOrder} />
					)}
				</ErrorBoundary>
			</Box>
			<ErrorBoundary>
				<Suspense
					fallback={
						// Fallback is the 'new cart' button
						<Tabs.TabBarSkeleton
							numberOfTabs={1}
							paddingLeft="none"
							paddingBottom="none"
							buttonText={<Icon name="plus" type="inverse" />}
						/>
					}
				>
					<OpenOrderTabs query={query} />
				</Suspense>
			</ErrorBoundary>
		</Box>
	);
};

export default OpenOrders;

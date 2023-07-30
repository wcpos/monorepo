import * as React from 'react';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Icon from '@wcpos/components/src/icon';
import Suspense from '@wcpos/components/src/suspense';
import Tabs from '@wcpos/components/src/tabs';

import Cart from './cart';
import EmptyCart from './empty-cart';
import OpenOrderTabs from './tabs';
import { useQuery } from '../../../../contexts/store-state-manager';
import useCurrentOrder from '../contexts/current-order';

const OpenOrders = ({ isColumn = false }) => {
	const { currentOrder } = useCurrentOrder();

	/**
	 *
	 */
	const query = useQuery({
		queryKeys: ['orders', { status: 'pos-open' }],
		collectionName: 'orders',
		initialQuery: {
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
					<Suspense>
						{currentOrder.isNew ? (
							<EmptyCart currentOrder={currentOrder} />
						) : (
							<Cart currentOrder={currentOrder} />
						)}
					</Suspense>
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

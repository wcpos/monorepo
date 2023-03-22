import * as React from 'react';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Icon from '@wcpos/components/src/icon';
import Tabs from '@wcpos/components/src/tabs';
import Text from '@wcpos/components/src/text';

import Cart from './cart';
import OpenOrderTabs from './tabs';
import useCurrentOrder from '../contexts/current-order';

const OpenOrders = ({ isColumn = false }) => {
	const { currentOrder } = useCurrentOrder();

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
				<React.Suspense
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
					<OpenOrderTabs currentOrder={currentOrder} />
				</React.Suspense>
			</ErrorBoundary>
		</Box>
	);
};

export default OpenOrders;

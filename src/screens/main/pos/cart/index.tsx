import * as React from 'react';

import Icon from '@wcpos/components/src/icon';
import { Suspense } from '@wcpos/tailwind/src/suspense';
import Tabs from '@wcpos/components/src/tabs';
import { Box } from '@wcpos/tailwind/src/box';
import { ErrorBoundary } from '@wcpos/tailwind/src/error-boundary';
import { VStack } from '@wcpos/tailwind/src/vstack';

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
	return (
		<VStack className={`gap-0 p-2 h-full ${isColumn && 'pl-0'}`}>
			<ErrorBoundary>
				{currentOrder.isNew ? (
					<EmptyCart currentOrder={currentOrder} />
				) : (
					<Cart currentOrder={currentOrder} />
				)}
			</ErrorBoundary>
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
					<OpenOrderTabs />
				</Suspense>
			</ErrorBoundary>
		</VStack>
	);
};

export default OpenOrders;

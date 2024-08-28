import * as React from 'react';

import { Button } from '@wcpos/components/src/button';
import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { Icon } from '@wcpos/components/src/icon';
import { Suspense } from '@wcpos/components/src/suspense';
import { VStack } from '@wcpos/components/src/vstack';

import { Cart } from './cart';
import { EmptyCart } from './empty-cart';
import { OpenOrderTabs } from './tabs';
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
		<VStack className={`gap-1 p-2 h-full ${isColumn && 'pl-0'}`}>
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
						<Button disabled>
							<Icon name="plus" />
						</Button>
					}
				>
					<OpenOrderTabs />
				</Suspense>
			</ErrorBoundary>
		</VStack>
	);
};

export default OpenOrders;

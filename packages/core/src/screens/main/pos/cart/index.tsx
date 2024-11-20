import * as React from 'react';
import { View } from 'react-native';

import { Button, ButtonGroupSeparator, ButtonGroup } from '@wcpos/components/src/button';
import { Card, CardContent, CardHeader } from '@wcpos/components/src/card';
import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { HStack } from '@wcpos/components/src/hstack';
import { Icon } from '@wcpos/components/src/icon';
import { Suspense } from '@wcpos/components/src/suspense';
import { VStack } from '@wcpos/components/src/vstack';

import { AddCartItemButtons } from './add-cart-item-buttons';
import { AddNoteButton } from './buttons/add-note';
import { OrderMetaButton } from './buttons/order-meta';
import { PayButton } from './buttons/pay';
import { SaveButton } from './buttons/save-order';
import { VoidButton } from './buttons/void';
import { CartHeader } from './cart-header';
import { CartTable } from './table';
import { OpenOrderTabs } from './tabs';
import { Totals } from './totals';
import { useCurrentOrder } from '../contexts/current-order';

/**
 *

 */
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
					<Card className="flex-1">
						<CardHeader className="p-2 bg-input">
							<ErrorBoundary>
								<CartHeader />
							</ErrorBoundary>
						</CardHeader>
						<CardContent className="flex-1 p-0">
							<AddCartItemButtons />
						</CardContent>
					</Card>
				) : (
					<Card className="flex-1">
						<CardHeader className="p-2 bg-input">
							<ErrorBoundary>
								<CartHeader />
							</ErrorBoundary>
						</CardHeader>
						<CardContent className="flex-1 p-0">
							<View className="flex-1">
								<ErrorBoundary>
									<CartTable />
								</ErrorBoundary>
							</View>
							<AddCartItemButtons />
							<ErrorBoundary>
								<Totals />
							</ErrorBoundary>
							<HStack className="p-2 bg-muted [&>*]:flex-1">
								<ErrorBoundary>
									<AddNoteButton />
									<OrderMetaButton />
									<SaveButton />
								</ErrorBoundary>
							</HStack>
							<HStack className="gap-0 w-full">
								<ErrorBoundary>
									<VoidButton />
									<ButtonGroupSeparator className="bg-input" />
									<PayButton />
								</ErrorBoundary>
							</HStack>
						</CardContent>
					</Card>
				)}
			</ErrorBoundary>
			<ErrorBoundary>
				<Suspense>
					<OpenOrderTabs />
				</Suspense>
			</ErrorBoundary>
		</VStack>
	);
};

export default OpenOrders;

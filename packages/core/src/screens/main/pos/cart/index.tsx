import * as React from 'react';
import { View } from 'react-native';

import { Button, ButtonGroup, ButtonGroupSeparator } from '@wcpos/components/button';
import { Card, CardContent, CardHeader } from '@wcpos/components/card';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { Suspense } from '@wcpos/components/suspense';
import { VStack } from '@wcpos/components/vstack';

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
export const OpenOrders = ({ isColumn = false }) => {
	const { currentOrder } = useCurrentOrder();

	if (!currentOrder) {
		throw new Error('Current order is not defined');
	}

	/**
	 *
	 */
	return (
		<VStack className={`h-full gap-1 p-2 ${isColumn && 'pl-0'}`}>
			<ErrorBoundary>
				{currentOrder.isNew ? (
					<Card className="flex-1">
						<CardHeader className="bg-card-header p-2">
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
						<CardHeader className="bg-card-header p-2">
							<ErrorBoundary>
								<CartHeader />
							</ErrorBoundary>
						</CardHeader>
						<CardContent className="border-border flex-1 border-t p-0">
							<View className="flex-1">
								<ErrorBoundary>
									<CartTable />
								</ErrorBoundary>
							</View>
							<AddCartItemButtons />
							<ErrorBoundary>
								<Totals />
							</ErrorBoundary>
							<HStack className="bg-footer p-2">
								<View className="flex-1">
									<AddNoteButton />
								</View>
								<View className="flex-1">
									<OrderMetaButton />
								</View>
								<View className="flex-1">
									<SaveButton />
								</View>
							</HStack>
							<HStack className="w-full gap-0">
								<ErrorBoundary>
									<VoidButton />
									<ButtonGroupSeparator className="bg-card-header" />
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

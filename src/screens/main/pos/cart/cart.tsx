import * as React from 'react';
import { View } from 'react-native';

import { ButtonGroupSeparator, ButtonGroup } from '@wcpos/tailwind/src/button';
import { Card, CardContent, CardHeader } from '@wcpos/tailwind/src/card';
import { ErrorBoundary } from '@wcpos/tailwind/src/error-boundary';
import { HStack } from '@wcpos/tailwind/src/hstack';

import { AddCartItemButtons } from './add-cart-item-buttons';
import { AddNoteButton } from './buttons/add-note';
import { OrderMetaButton } from './buttons/order-meta';
import { PayButton } from './buttons/pay';
import { SaveButton } from './buttons/save-order';
import { VoidButton } from './buttons/void';
import { CartHeader } from './cart-header';
import { CartTable } from './table';
import { Totals } from './totals';

/**
 *
 */
export const Cart = () => {
	return (
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
				<HStack className="p-2 bg-input [&>*]:flex-grow">
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
	);
};

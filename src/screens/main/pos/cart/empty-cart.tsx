import * as React from 'react';

import { Card, CardContent, CardHeader } from '@wcpos/tailwind/src/card';
import { ErrorBoundary } from '@wcpos/tailwind/src/error-boundary';

import { AddCartItemButtons } from './add-cart-item-buttons';
import { CartHeader } from './cart-header';

export interface CartProps {
	currentOrder: import('@wcpos/database').OrderDocument;
}

/**
 *
 */
export const EmptyCart = ({ currentOrder }: CartProps) => {
	return (
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
	);
};

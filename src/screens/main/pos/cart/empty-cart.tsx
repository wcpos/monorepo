import * as React from 'react';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';

import { AddCartItemButtons } from './add-cart-item-buttons';
import CartHeader from './cart-header';

export interface CartProps {
	currentOrder: import('@wcpos/database').OrderDocument;
}

const EmptyCart = ({ currentOrder }: CartProps) => {
	return (
		<Box
			raised
			rounding="medium"
			// style={{ backgroundColor: 'white' }}
			style={{ backgroundColor: 'white', flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}
		>
			<ErrorBoundary>
				<CartHeader />
			</ErrorBoundary>
			<AddCartItemButtons />
		</Box>
	);
};

export default EmptyCart;

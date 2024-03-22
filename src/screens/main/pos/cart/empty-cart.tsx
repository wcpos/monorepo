import * as React from 'react';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';

import AddFee from './add-fee';
import { AddMiscProduct } from './add-misc-product';
import AddShipping from './add-shipping';
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

			<Box>
				<ErrorBoundary>
					<AddMiscProduct />
				</ErrorBoundary>
			</Box>
			<Box>
				<ErrorBoundary>
					<AddFee />
				</ErrorBoundary>
			</Box>
			<Box>
				<ErrorBoundary>
					<AddShipping />
				</ErrorBoundary>
			</Box>
		</Box>
	);
};

export default EmptyCart;

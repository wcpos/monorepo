import * as React from 'react';
import { useObservableSuspense } from 'observable-hooks';
import Box from '@wcpos/components/src/box';
import useStore from '@wcpos/hooks/src/use-store';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import CartHeader from './cart-header';
import AddFee from './add-fee';
import AddShipping from './add-shipping';

type OrderDocument = import('@wcpos/database').OrderDocument;

interface EmptyCartProps {
	order: OrderDocument;
	// ui: any;
}

const EmptyCart = ({ order }: EmptyCartProps) => {
	// @TODO - remove ui settings from empty cart?
	const { uiResources } = useStore();
	const ui = useObservableSuspense(uiResources['pos.cart']);

	return (
		<Box raised rounding="medium" style={{ height: '100%', backgroundColor: 'white' }}>
			<ErrorBoundary>
				<CartHeader order={order} ui={ui} />
			</ErrorBoundary>
			<Box>
				<AddFee order={order} />
			</Box>
			<Box>
				<AddShipping order={order} />
			</Box>
		</Box>
	);
};

export default EmptyCart;

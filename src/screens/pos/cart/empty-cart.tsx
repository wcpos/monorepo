import * as React from 'react';
import { useObservableSuspense } from 'observable-hooks';
import Box from '@wcpos/components/src/box';
import useUIResource from '@wcpos/hooks/src/use-ui-resource';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import CartHeader from './cart-header';
import AddFee from './add-fee';
import AddShipping from './add-shipping';

type OrderDocument = import('@wcpos/database').OrderDocument;

interface EmptyCartProps {
	order: OrderDocument;
	// ui: any;
}

const EmptyCart = ({ order }: EmptyCartProps) => {
	const ui = useObservableSuspense(useUIResource('pos.cart')); // @TODO - remove ui settings from empty cart?

	return (
		<Box raised rounding="medium" style={{ height: '100%', backgroundColor: 'white' }}>
			<CartHeader order={order} ui={ui} />
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

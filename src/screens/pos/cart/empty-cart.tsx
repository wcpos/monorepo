import * as React from 'react';
import Box from '@wcpos/common/src/components/box';
import useWhyDidYouUpdate from '@wcpos/common/src/hooks/use-why-did-you-update';
import CartHeader from './cart-header';
import AddFee from './add-fee';
import AddShipping from './add-shipping';

type OrderDocument = import('@wcpos/common/src/database').OrderDocument;

interface EmptyCartProps {
	order: OrderDocument;
	ui: any;
}

const EmptyCart = ({ order, ui }: EmptyCartProps) => {
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

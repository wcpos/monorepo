import * as React from 'react';
import Button from '@wcpos/common/src/components/button';
import Popover from '@wcpos/common/src/components/popover';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import Variations from './variations';
import { POSContext } from '../../../../pos';

interface Props {
	product: any;
}

const Actions = ({ product }: Props) => {
	const { currentOrder } = React.useContext(POSContext);
	const { storeDB } = useAppState();

	const addToCart = async () => {
		if (currentOrder) {
			return currentOrder.addOrUpdateLineItem(product);
		}
		// @ts-ignore
		return storeDB?.collections.orders.createNewOrderWithProduct(product);
	};

	if (product.isVariable()) {
		return (
			<Popover content={<Variations product={product} />}>
				<Button title="->" />
			</Popover>
		);
	}

	return (
		<Button
			title="+"
			onPress={() => {
				addToCart();
			}}
		/>
	);
};

export default Actions;

import * as React from 'react';
import Button from '../../../../../../components/button';
import Popover from '../../../../../../components/popover';
import Variations from './variations';
import useAppState from '../../../../../../hooks/use-app-state';

interface Props {
	product: any;
}

const Actions: React.FC<Props> = ({ product }) => {
	const [{ currentOrder, storeDB }] = useAppState();

	const addToCart = async () => {
		if (currentOrder) {
			return currentOrder.addOrUpdateLineItem(product);
		}
		return storeDB.collections.orders.createNewOrder(product);
	};

	if (product.isVariable()) {
		return (
			<Popover content={<Variations product={product} addToCart={addToCart} />}>
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

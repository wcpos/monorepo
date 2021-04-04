import * as React from 'react';
import Button from '@wcpos/common/src/components/button';
import Popover from '@wcpos/common/src/components/popover';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import Variations from './variations';

interface Props {
	product: any;
}

const Actions: React.FC<Props> = ({ product }) => {
	const currentOrder = undefined;
	const { storeDB } = useAppState();

	const addToCart = async () => {
		// if (currentOrder) {
		// 	return currentOrder.addOrUpdateLineItem(product);
		// }
		// return storeDB.collections.orders.createNewOrder(product);
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

import * as React from 'react';
import Icon from '@wcpos/common/src/components/icon';
import Button from '@wcpos/common/src/components/button';
import Popover from '@wcpos/common/src/components/popover';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import Variations from './variations';
import { POSContext } from '../../../../pos';

interface Props {
	product: any;
}

const Actions = ({ product }: Props) => {
	const { currentOrder, setCurrentOrder } = React.useContext(POSContext);
	const { storeDB } = useAppState();
	const [visible, setVisible] = React.useState(false);

	const addToCart = async () => {
		if (currentOrder) {
			return currentOrder.addOrUpdateLineItem(product);
		}
		// @ts-ignore
		const newOrder = await storeDB?.collections.orders.createNewOrderWithProduct(product);
		setCurrentOrder(newOrder);
		return newOrder;
	};

	if (product.isVariable()) {
		return (
			<Popover
				open={visible}
				onRequestClose={() => setVisible(false)}
				activator={<Button title="->" onPress={() => setVisible(true)} />}
			>
				<Variations product={product} />
			</Popover>
		);
	}

	return (
		<Icon
			name="addCircle"
			size="large"
			onPress={() => {
				addToCart();
			}}
		/>
	);
};

export default Actions;

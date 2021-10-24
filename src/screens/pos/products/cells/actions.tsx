import * as React from 'react';
import { useObservableSuspense } from 'observable-hooks';
import Icon from '@wcpos/common/src/components/icon';
import Button from '@wcpos/common/src/components/button';
import Popover from '@wcpos/common/src/components/popover';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import Variations from './variations';
import { POSContext } from '../../pos';

interface Props {
	item: import('@wcpos/common/src/database').ProductDocument;
}

const Actions = ({ item: product }: Props) => {
	const { currentOrder, setCurrentOrder } = React.useContext(POSContext);
	const { storeDB } = useAppState();
	const [visible, setVisible] = React.useState(false);

	const addToCart = React.useCallback(async () => {
		if (currentOrder) {
			currentOrder.addOrUpdateLineItem(product);
		} else {
			// @ts-ignore
			const newOrder = await storeDB?.collections.orders.createNewOrderWithProduct(product);
			setCurrentOrder(newOrder);
		}
	}, [currentOrder, product, setCurrentOrder, storeDB?.collections.orders]);

	if (!product.isSynced()) {
		return <Icon.Skeleton size="x-large" />;
	}

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

	return <Icon name="addCircle" size="x-large" backgroundStyle="none" onPress={addToCart} />;
};

export default Actions;

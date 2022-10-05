import * as React from 'react';
import Icon from '@wcpos/components/src/icon';
import useOpenOrders from '../../contexts/open-orders';

interface Props {
	item: import('@wcpos/database').ProductDocument;
}

/**
 *
 */
export const Actions = ({ item: product }: Props) => {
	const { currentOrder } = useOpenOrders();

	/**
	 *
	 */
	const addToCart = React.useCallback(async () => {
		if (currentOrder) {
			currentOrder.addOrUpdateProduct(product);
		} else {
			console.log('No order found');
		}
	}, [currentOrder, product]);

	/**
	 *
	 */
	if (!product.isSynced()) {
		return <Icon.Skeleton size="xLarge" />;
	}

	/**
	 *
	 */
	return <Icon name="circlePlus" size="xLarge" onPress={addToCart} type="success" />;
};

export default Actions;

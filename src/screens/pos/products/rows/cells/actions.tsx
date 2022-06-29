import * as React from 'react';
import Icon from '@wcpos/components/src/icon';
import { usePOSContext } from '../../../context';

interface Props {
	item: import('@wcpos/database').ProductDocument;
}

/**
 *
 */
const Actions = ({ item: product }: Props) => {
	const { currentOrder } = usePOSContext();

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

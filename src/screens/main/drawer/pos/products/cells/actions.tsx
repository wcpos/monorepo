import * as React from 'react';
import { View } from 'react-native';

import { useObservableState } from 'observable-hooks';

import Icon from '@wcpos/components/src/icon';
import log from '@wcpos/utils/src/logger';

import useCurrentOrder from '../../contexts/current-order';

interface Props {
	item: import('@wcpos/database').ProductDocument;
}

/**
 *
 */
export const Actions = ({ item: product }: Props) => {
	const render = useObservableState(product.date_modified_gmt$, product.date_modified_gmt);
	const { currentOrder } = useCurrentOrder();

	/**
	 *
	 */
	const addToCart = React.useCallback(async () => {
		if (currentOrder) {
			currentOrder.addOrUpdateProduct(product);
		} else {
			log.error('No order found');
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
	return (
		<View style={{ position: 'relative', zIndex: 1000 }}>
			<Icon name="circlePlus" size="xLarge" onPress={addToCart} type="success" />
		</View>
	);
};

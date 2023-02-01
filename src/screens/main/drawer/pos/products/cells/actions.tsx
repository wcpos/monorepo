import * as React from 'react';
import { View } from 'react-native';

import { useNavigation } from '@react-navigation/native';
import { useObservableSuspense } from 'observable-hooks';

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
	const { currentOrderResource } = useCurrentOrder();
	const currentOrder = useObservableSuspense(currentOrderResource);
	const navigation = useNavigation();

	/**
	 *
	 */
	const addToCart = React.useCallback(async () => {
		const updatedOrder = await currentOrder.addOrUpdateProduct(product);
		if (updatedOrder.uuid !== currentOrder.uuid) {
			navigation.setParams({ orderID: updatedOrder.uuid });
		}
	}, [currentOrder, navigation, product]);

	/**
	 *
	 */
	return (
		<View style={{ position: 'relative', zIndex: 1000 }}>
			<Icon name="circlePlus" size="xLarge" onPress={addToCart} type="success" />
		</View>
	);
};

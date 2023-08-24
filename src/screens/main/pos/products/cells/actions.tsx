import * as React from 'react';
import { View } from 'react-native';

import Icon from '@wcpos/components/src/icon';

import { useAddProduct } from '../../hooks/use-add-product';

interface Props {
	item: import('@wcpos/database').ProductDocument;
}

/**
 *
 */
export const Actions = ({ item: product }: Props) => {
	const { addProduct } = useAddProduct();

	/**
	 *
	 */
	return (
		<View style={{ position: 'relative', zIndex: 1000 }}>
			<Icon name="circlePlus" size="xxLarge" onPress={() => addProduct(product)} type="success" />
		</View>
	);
};

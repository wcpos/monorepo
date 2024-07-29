import * as React from 'react';
import { View } from 'react-native';

import { Button } from '@wcpos/tailwind/src/button';
import { Icon } from '@wcpos/tailwind/src/icon';

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
		<Button variant="ghost" size="lg" className="rounded-full" onPress={() => addProduct(product)}>
			<Icon name="circlePlus" className="fill-success w-7 h-7" />
		</Button>
	);
};

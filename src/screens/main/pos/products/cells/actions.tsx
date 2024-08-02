import * as React from 'react';

import { IconButton } from '@wcpos/tailwind/src/icon-button';

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
		<IconButton name="circlePlus" variant="success" size="xl" onPress={() => addProduct(product)} />
	);
};

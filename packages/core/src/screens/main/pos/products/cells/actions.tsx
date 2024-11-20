import * as React from 'react';

import { CellContext } from '@tanstack/react-table';

import { IconButton } from '@wcpos/components/src/icon-button';

import { useAddProduct } from '../../hooks/use-add-product';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export const Actions = ({ row }: CellContext<{ document: ProductDocument }, 'actions'>) => {
	const { addProduct } = useAddProduct();

	/**
	 *
	 */
	return (
		<IconButton
			name="circlePlus"
			variant="success"
			size="4xl"
			onPress={() => addProduct(row.original.document)}
		/>
	);
};

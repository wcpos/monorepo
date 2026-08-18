import * as React from 'react';

import type { CellContext } from '@wcpos/core/table-types';
import { IconButton } from '@wcpos/components/icon-button';
import type { EngineRecord } from '@wcpos/query';

import { useAddProduct } from '../../hooks/use-add-product';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export function Actions({
	row,
}: CellContext<{ document: ProductDocument; record: EngineRecord<'products'> }, 'actions'>) {
	const { addProduct } = useAddProduct();

	/**
	 *
	 */
	return (
		<IconButton
			testID="add-to-cart-button"
			name="circlePlus"
			variant="success"
			size="4xl"
			onPress={() => addProduct(row.original.record)}
		/>
	);
}

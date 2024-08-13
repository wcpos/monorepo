import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { Button, ButtonText } from '@wcpos/tailwind/src/button';
import { useDataTable, CellContext } from '@wcpos/tailwind/src/data-table';
import { HStack } from '@wcpos/tailwind/src/hstack';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export const ProductCategories = ({ row }: CellContext<ProductDocument, 'categories'>) => {
	const product = row.original;
	const categories = useObservableEagerState(product.categories$);
	const { query } = useDataTable();

	/**
	 *
	 */
	return (
		<HStack>
			{(categories || []).map((cat) => (
				<Button
					size="xs"
					className="rounded-full"
					key={cat.id}
					onPress={() => query.where('categories', { $elemMatch: { id: cat.id } })}
				>
					<ButtonText>{cat.name}</ButtonText>
				</Button>
			))}
		</HStack>
	);
};

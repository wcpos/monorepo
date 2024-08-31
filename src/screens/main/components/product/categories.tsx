import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { Button, ButtonPill, ButtonText } from '@wcpos/components/src/button';
import { useDataTable } from '@wcpos/components/src/data-table';
import { HStack } from '@wcpos/components/src/hstack';

import type { CellContext } from '@tanstack/react-table';

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
				<ButtonPill
					variant="ghost-primary"
					size="xs"
					key={cat.id}
					onPress={() => query.where('categories', { $elemMatch: { id: cat.id } })}
				>
					<ButtonText>{cat.name}</ButtonText>
				</ButtonPill>
			))}
		</HStack>
	);
};

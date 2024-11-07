import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { ButtonPill, ButtonText } from '@wcpos/components/src/button';
import { useDataTable } from '@wcpos/components/src/data-table';
import { HStack } from '@wcpos/components/src/hstack';

import type { CellContext } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export const ProductCategories = ({
	row,
}: CellContext<{ document: ProductDocument }, 'categories'>) => {
	const product = row.original.document;
	const categories = useObservableEagerState(product.categories$) || [];
	const { query } = useDataTable();

	if (categories.length === 0) {
		return null;
	}

	/**
	 * @NOTE - Don't use a unique key here, index is sufficient
	 */
	return (
		<HStack className="flex-wrap gap-1 w-full">
			{(categories || []).map((cat, index) => (
				<ButtonPill
					variant="ghost-primary"
					size="xs"
					key={index}
					onPress={() => query.where('categories').elemMatch({ id: cat.id }).exec()}
				>
					{cat.name}
				</ButtonPill>
			))}
		</HStack>
	);
};

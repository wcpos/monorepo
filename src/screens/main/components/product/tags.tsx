import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { ButtonPill, ButtonText } from '@wcpos/components/src/button';
import { useDataTable } from '@wcpos/components/src/data-table';

import type { CellContext } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export const ProductTags = ({ row }: CellContext<ProductDocument, 'tags'>) => {
	const product = row.original;
	const tags = useObservableEagerState(product.tags$);
	const query = useDataTable();

	/**
	 *
	 */
	return tags.map((tag: any) => {
		return (
			<ButtonPill
				key={tag.id}
				size="xs"
				onPress={() => query.where('tags', { $elemMatch: { id: tag.id } })}
			>
				<ButtonText>{tag.name}</ButtonText>
			</ButtonPill>
		);
	});
};

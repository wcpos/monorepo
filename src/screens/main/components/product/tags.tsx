import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { ButtonPill } from '@wcpos/components/src/button';
import { useDataTable } from '@wcpos/components/src/data-table';
import { HStack } from '@wcpos/components/src/hstack';

import type { CellContext } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export const ProductTags = ({ row }: CellContext<{ document: ProductDocument }, 'tags'>) => {
	const product = row.original.document;
	const tags = useObservableEagerState(product.tags$) || [];
	const query = useDataTable();

	if (tags.length === 0) {
		return null;
	}

	/**
	 *
	 */
	return (
		<HStack className="flex-wrap gap-1 w-full">
			{tags.map((tag: any) => {
				return (
					<ButtonPill
						key={tag.id}
						size="xs"
						variant="ghost-secondary"
						onPress={() => query.where('tags', { $elemMatch: { id: tag.id } })}
					>
						{tag.name}
					</ButtonPill>
				);
			})}
		</HStack>
	);
};
